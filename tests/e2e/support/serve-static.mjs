#!/usr/bin/env node
/**
 * Minimal static server for an SPA build mounted under a prefix (used for apps/admin/dist at /admin/).
 * Unknown paths under the prefix fall back to index.html. /api/* is NOT proxied: tests mock it
 * with page.route, so an unmocked call gets a JSON 503 instead of silently hitting something real.
 *
 * Paths outside the prefix are served from an optional fallback root (the built site, so the
 * admin's /css/site.css, fonts and favicon resolve as they do behind nginx).
 *
 *   PORT=4403 node tests/e2e/support/serve-static.mjs apps/admin/dist /admin/ apps/web/dist
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] || 'apps/admin/dist');
const PREFIX = process.argv[3] || '/admin/';
const FALLBACK = process.argv[4] ? resolve(process.argv[4]) : null;
const PORT = Number(process.env.PORT) || 4403;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp', '.map': 'application/json',
};

async function fileFor(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath.slice(PREFIX.length))).replace(/^(\.\.[/\\])+/, '');
  const f = join(ROOT, rel);
  if (!f.startsWith(ROOT)) return null;
  try {
    const s = await stat(f);
    return s.isDirectory() ? join(f, 'index.html') : f;
  } catch {
    return extname(f) ? null : join(ROOT, 'index.html'); // SPA fallback
  }
}

createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'API not available in static test server (mock it)' } }));
  }
  if (path === PREFIX.replace(/\/$/, '') || path === '/') {
    res.writeHead(302, { Location: PREFIX });
    return res.end();
  }
  if (!path.startsWith(PREFIX)) {
    const rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
    const f = FALLBACK && join(FALLBACK, rel);
    if (f && f.startsWith(FALLBACK) && extname(f)) {
      try {
        const body = await readFile(f);
        res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
        return res.end(body);
      } catch { /* fall through */ }
    }
    res.writeHead(404);
    return res.end('not found');
  }
  const f = await fileFor(path);
  try {
    const body = await readFile(/** @type {string} */ (f));
    res.writeHead(200, { 'Content-Type': TYPES[extname(/** @type {string} */ (f))] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, () => console.log(`[admin] serving ${ROOT} at http://localhost:${PORT}${PREFIX}`));
