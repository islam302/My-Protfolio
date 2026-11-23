#!/usr/bin/env node
// PoCs for the local static dev server apps/web/scripts/serve.mjs. LOCALHOST ONLY.
// serve.mjs listens on all interfaces; it is started here with the force-loopback preload so it is
// reachable on 127.0.0.1 only. Requests are sent with raw sockets so the paths reach the server
// exactly as written (no client-side dot-segment normalisation).
//
//   node tests/security/poc-serve.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVE = process.env.POC_SERVE_FILE || join(ROOT, 'apps', 'web', 'scripts', 'serve.mjs');
const PRELOAD = pathToFileURL(join(ROOT, 'tests', 'security', 'force-loopback.mjs')).href;
const PORT = Number(process.env.POC_SERVE_PORT) || 4499;

// Static check: does the source bind a host?
const src = readFileSync(SERVE, 'utf8');
const listenLine = src.split('\n').find((l) => l.includes('.listen('))?.trim() ?? '';
const loopback = /listen\(PORT,\s*['"]127\.0\.0\.1['"]/.test(listenLine) || (/listen\(PORT,\s*HOST\b/.test(listenLine) && /HOST\s*=\s*process\.env\.(?:WEB_)?HOST\s*\|\|\s*['"]127\.0\.0\.1['"]/.test(src));
console.log(`[${loopback ? 'PASS' : 'VULN'}] SERVE-bind: ${listenLine}`);

const start = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', PRELOAD, SERVE], { cwd: join(ROOT, 'apps', 'web'), env: { ...process.env, PORT: String(PORT), PUBLIC_API_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const onData = (d) => {
      log += d;
      if (log.includes('Serving dist/')) resolve(child);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => (log += d));
    child.on('exit', (code) => reject(new Error(`serve.mjs exited ${code}: ${log.slice(-400)}`)));
    setTimeout(() => reject(new Error('timeout starting serve.mjs')), 60_000).unref();
  });

const raw = (path) =>
  new Promise((resolve) => {
    const s = net.connect(PORT, '127.0.0.1', () => s.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`));
    let buf = '';
    s.on('data', (d) => (buf += d.toString('latin1')));
    s.on('end', () => resolve(buf));
    s.on('error', (e) => resolve(`ERROR ${e.code}`));
    s.setTimeout(5000, () => {
      s.destroy();
      resolve('TIMEOUT');
    });
  });
const status = (r) => r.split('\r\n')[0];
const header = (r, h) => r.split('\r\n').find((l) => l.toLowerCase().startsWith(`${h}:`))?.slice(h.length + 1).trim();

let child = await start();
const results = [];
const out = (tag, id, msg) => {
  results.push(tag);
  console.log(`[${tag}] ${id}: ${msg}`);
};

// Path traversal: every variant must stay inside dist/ (404, never a file from outside).
const marker = /"name":\s*"islam-badran-portfolio"|\[core\]|for 16-bit app support|"@portfolio\/web"/;
const traversal = [
  '/../../package.json',
  '/..%2f..%2fpackage.json',
  '/%2e%2e/%2e%2e/package.json',
  '/..%5c..%5cpackage.json',
  '/%2e%2e%5c%2e%2e%5cpackage.json',
  '/....//....//package.json',
  '/%252e%252e/%252e%252e/package.json',
  '//../../package.json',
  '/C:/Windows/win.ini',
  '/..%2f..%2f..%2f.git/config',
  '/../dist-evil/x',
];
const leaked = [];
const notHttp = [];
for (const p of traversal) {
  const r = await raw(p);
  if (!r.startsWith('HTTP')) notHttp.push(p);
  if (marker.test(r)) leaked.push(p);
}
if (notHttp.length) throw new Error(`server not answering for ${notHttp.join(' ')} - results would be invalid`);
out(leaked.length ? 'VULN' : 'PASS', 'SERVE-traversal', leaked.length ? `files outside dist/ served for ${leaked.join(' ')}` : `${traversal.length} traversal variants (dot-dot, %2f, %5c, double-encoding, drive letter, .git) -> none escaped dist/`);

// Open redirect via the "directory without trailing slash" 301.
const redirPaths = ['//evil.example/%2E%2E%2Fwork', '/%2F%2Fevil.example%2F..%2Fwork', '//evil.example/..%2Fwork', '/\\evil.example/%2E%2E%2Fwork'];
const redirs = [];
for (const p of redirPaths) {
  const r = await raw(p);
  const loc = header(r, 'location');
  if (loc) {
    const target = new URL(loc, `http://127.0.0.1:${PORT}`);
    redirs.push(`${p} -> ${status(r).split(' ')[1]} Location: ${loc} (browser goes to host "${target.host}")`);
    if (target.host !== `127.0.0.1:${PORT}`) leaked.push('redirect');
  }
}
const offsite = redirs.filter((r) => !r.includes(`host "127.0.0.1:${PORT}"`));
out(offsite.length ? 'VULN' : 'PASS', 'SERVE-open-redirect', offsite.length ? offsite.join(' | ') : `no off-site Location for ${redirPaths.length} protocol-relative probes${redirs.length ? ` (${redirs.join(' | ')})` : ''}`);

// Malformed percent-encoding: decodeURIComponent throws inside the async request handler.
const pre = await raw('/');
if (!pre.startsWith('HTTP')) throw new Error('server not alive before the malformed-URI probe');
const bad = await raw('/%E0%A4%A');
await new Promise((r) => setTimeout(r, 500));
const alive = await raw('/');
const crashed = alive.startsWith('ERROR') || alive === 'TIMEOUT';
out(crashed ? 'VULN' : 'PASS', 'SERVE-malformed-uri', `GET /%E0%A4%A -> ${bad.startsWith('HTTP') ? status(bad) : bad}; follow-up GET / -> ${alive.startsWith('HTTP') ? status(alive) : alive}${crashed ? ' (process died: unhandled rejection = one-request DoS of the dev server)' : ''}`);
if (crashed) child = await start();

const h = await raw('/');
out('INFO', 'SERVE-headers', `dev server sends no security headers (CSP/XFO/nosniff present: ${['content-security-policy', 'x-frame-options', 'x-content-type-options'].map((k) => Boolean(header(h, k))).join('/')}); production headers come from nginx`);

child.kill();
console.log(`\nSummary: ${results.filter((t) => t === 'VULN').length} vuln, ${results.filter((t) => t === 'PASS').length} pass`);
