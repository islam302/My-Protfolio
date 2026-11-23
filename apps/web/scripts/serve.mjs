#!/usr/bin/env node
/**
 * Local static server for dist/.
 *   npm run preview      -> build once, serve
 *   npm run dev          -> build, serve, rebuild on changes in src/ or public/ (refresh the browser)
 * PORT env var overrides the default 4321.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4321;
// Loopback only by default (SEC-04); WEB_HOST=0.0.0.0 opts in to LAN access, e.g. to test on a phone.
const HOST = process.env.WEB_HOST || '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4',
};

await build();

if (process.argv.includes('--watch')) {
  let timer;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 120);
  };
  for (const d of ['src', 'public']) watch(join(ROOT, d), { recursive: true }, rebuild);
}

async function resolve(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null; // malformed percent-encoding (e.g. /%E0%A4%A): 404, not an unhandled rejection (SEC-02)
  }
  const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, clean);
  if (!file.startsWith(DIST)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  // Directory URLs without a trailing slash redirect, like most static hosts. Only a plain
  // same-origin path may be echoed into Location: "//host/…" or "/\host/…" would leave the site (SEC-03).
  if (!extname(path) && !path.endsWith('/') && /^\/(?![/\\])/.test(path) && !path.includes('\\')) {
    const dir = await resolve(path + '/');
    if (dir) { res.writeHead(301, { Location: path + '/' }); return res.end(); }
  }
  const file = await resolve(path);
  if (!file) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return res.end(await readFile(join(DIST, '404.html')).catch(() => 'Not found'));
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(await readFile(file));
}).listen(PORT, HOST, () => console.log(`Serving dist/ at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
