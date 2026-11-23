#!/usr/bin/env node
// Stored-XSS PoC: public inquiry form -> API -> admin panel. LOCALHOST ONLY.
//
// 1. Starts the real API (buildApp + in-memory PGlite) on 127.0.0.1:<random>.
// 2. Serves apps/admin/src (+ the shared constants.js, as the admin build does) on another
//    127.0.0.1 port and reverse-proxies /api/* to the API, so the panel is same-origin like
//    production behind nginx. No CSP is sent on purpose: this tests the rendering sinks
//    themselves, not the CSP safety net.
// 3. Submits inquiries whose name/message carry XSS payloads through the PUBLIC endpoint,
//    then logs in through the admin UI (headless Chromium), opens the list and every detail
//    dialog, saves a malicious note, and checks that no payload executed and no injected
//    element exists in the DOM.
//
//   node tests/security/poc-admin-xss.mjs
/* global window, document */ // used inside page.evaluate() callbacks
import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createTestDb, testConfig, createAdmin, validInquiry, ADMIN_EMAIL, ADMIN_PASSWORD } from '../../apps/api/test/helpers/setup.js';
import { buildApp } from '../../apps/api/src/app.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADMIN_SRC = join(ROOT, 'apps', 'admin', 'src');
const CONSTANTS = join(ROOT, 'packages', 'validation', 'src', 'constants.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

// Static admin + /api proxy, bound to loopback only.
let apiPort = 0;
const front = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    const p = httpRequest({ host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    p.on('error', () => res.writeHead(502).end());
    return req.pipe(p);
  }
  if (url.pathname === '/admin') return res.writeHead(301, { location: '/admin/' }).end();
  if (!url.pathname.startsWith('/admin/')) return res.writeHead(404).end();
  const rel = url.pathname.slice('/admin/'.length) || 'index.html';
  const file = rel === 'constants.js' ? CONSTANTS : join(ADMIN_SRC, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ADMIN_SRC) && file !== CONSTANTS) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => front.listen(0, '127.0.0.1', r));
const frontPort = /** @type {import('node:net').AddressInfo} */ (front.address()).port;
const ORIGIN = `http://127.0.0.1:${frontPort}`;

const db = await createTestDb();
await createAdmin(db);
const api = await buildApp({ config: testConfig({ publicOrigin: ORIGIN }), db, logger: false });
await api.listen({ host: '127.0.0.1', port: 0 });
apiPort = /** @type {import('node:net').AddressInfo} */ (api.server.address()).port;

// --- plant payloads through the public endpoint
const NAME_PAYLOADS = ['<img src=x onerror="window.__xss=(window.__xss||0)+1">', '"><svg onload=window.__xss=2>', "javascript:window.__xss=3//"];
const MESSAGE = [
  '<script>window.__xss=4</script>',
  '<iframe srcdoc="<script>parent.__xss=5</script>"></iframe>',
  '<a href="javascript:window.__xss=6">click</a>',
  '{{constructor.constructor("window.__xss=7")()}}',
  '<style>body{background:url(//127.0.0.1:9/x)}</style>',
  '‮evil-bidi-override',
].join('\n');
for (const name of NAME_PAYLOADS) {
  const r = await fetch(`http://127.0.0.1:${apiPort}/api/v1/inquiries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validInquiry({ name, message: MESSAGE })),
  });
  if (r.status !== 201) throw new Error(`plant failed: ${r.status} ${await r.text()}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const dialogs = [];
const blockedExternal = [];
page.on('dialog', (d) => {
  dialogs.push(d.message());
  void d.dismiss();
});
// Belt and braces: nothing may leave loopback during the PoC.
await page.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1' && Number(u.port) === frontPort) return route.continue();
  blockedExternal.push(route.request().url());
  return route.abort();
});

let ok = true;
const line = (tag, msg) => {
  if (tag === 'VULN') ok = false;
  console.log(`[${tag}] ${msg}`);
};
try {
  await page.goto(`${ORIGIN}/admin/`);
  await page.locator('#login-email').waitFor({ state: 'visible' });
  await page.fill('#login-email', ADMIN_EMAIL);
  await page.fill('#login-password', ADMIN_PASSWORD);
  await page.click('#login-submit');
  await page.locator('#rows tr').first().waitFor();
  const rowCount = await page.locator('#rows tr').count();
  const names = await page.locator('#rows .adm-link').allTextContents();
  line('INFO', `list rendered ${rowCount} rows; names shown literally: ${JSON.stringify(names)}`);

  for (let i = 0; i < rowCount; i++) {
    await page.locator('#rows .adm-link').nth(i).click();
    await page.locator('#detail-body').waitFor({ state: 'visible' });
    const msg = await page.locator('#detail-message').textContent();
    if (!msg?.includes('<script>window.__xss=4</script>')) line('VULN', `detail ${i}: message not rendered literally`);
    if (i === 0) {
      await page.fill('#d-notes', '<img src=x onerror=window.__xss=8>');
      await page.click('#detail-save');
      await page.locator('#detail-status', { hasText: 'Saved' }).waitFor();
    }
    await page.click('#detail-close');
  }
  // Re-open the first one so the saved note is rendered from the API response.
  await page.click('#refresh');
  await page.locator('#rows .adm-link').first().click();
  await page.locator('#detail-body').waitFor({ state: 'visible' });
  const note = await page.inputValue('#d-notes');
  await page.waitForTimeout(300);

  const xss = await page.evaluate(() => /** @type {any} */ (window).__xss);
  const injected = await page.evaluate(
    () => document.querySelectorAll('#rows img, #rows svg, #rows script, #rows iframe, #detail img, #detail svg, #detail script, #detail iframe, #detail style, #detail a[href^="javascript"]').length,
  );
  line(xss === undefined && dialogs.length === 0 ? 'PASS' : 'VULN', `payload execution: window.__xss=${xss}, dialogs=${dialogs.length}`);
  line(injected === 0 ? 'PASS' : 'VULN', `injected elements in list/detail DOM: ${injected}`);
  line(note.includes('<img') ? 'PASS' : 'VULN', `saved note round-trips as plain text in <textarea>: ${JSON.stringify(note)}`);
  line(blockedExternal.length === 0 ? 'PASS' : 'INFO', `requests to non-loopback/other origins: ${blockedExternal.length ? blockedExternal.join(', ') : 'none'}`);
} catch (err) {
  line('VULN', `PoC error (treat as inconclusive): ${err instanceof Error ? err.message : err}`);
} finally {
  await browser.close();
  await api.close();
  await db.close();
  front.close();
}
console.log(ok ? '\nSummary: admin UI renders stored payloads inertly (textContent / value only)' : '\nSummary: see VULN lines');
