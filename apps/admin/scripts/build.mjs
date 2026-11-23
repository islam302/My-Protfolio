#!/usr/bin/env node
/**
 * Admin panel build. No dependencies: copies src/ to dist/ and adds the shared
 * constants from packages/validation so the status / project-type lists are the
 * same ones the API validates against.
 *
 *   npm run build -w @portfolio/admin
 *   ADMIN_API_BASE=/api npm run build -w @portfolio/admin   (default "/api")
 *
 * dist/ is served by nginx at /admin/, same origin as the site (for /css/site.css
 * and the fonts) and the API (session cookie + CSRF).
 */
import { rm, mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const CONSTANTS = join(ROOT, '..', '..', 'packages', 'validation', 'src', 'constants.js');

/** Same rule as apps/web/src/lib/api.js: a same-origin path or an http(s) URL. */
function apiBase(value = process.env.ADMIN_API_BASE) {
  const v = (value ?? '').trim().replace(/\/+$/, '');
  if (!v) return '/api';
  if (/^\/(?!\/)[\w\-./~%]+$/.test(v) || /^https?:\/\/[\w\-.]+(?::\d+)?(?:\/[\w\-./~%]*)?$/.test(v)) return v;
  throw new Error(`ADMIN_API_BASE must be a path like "/api" or an http(s) URL, got ${JSON.stringify(value)}`);
}

export async function build({ quiet = false } = {}) {
  const t0 = Date.now();
  if (!existsSync(CONSTANTS)) throw new Error(`Shared constants not found at ${CONSTANTS}`);
  const base = apiBase();

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(SRC, DIST, { recursive: true });
  await cp(CONSTANTS, join(DIST, 'constants.js'));

  // Bake the API base into config.js (the source default is "/api").
  const cfgPath = join(DIST, 'config.js');
  const cfg = await readFile(cfgPath, 'utf8');
  const next = cfg.replace(/apiBase: '[^']*'/, `apiBase: ${JSON.stringify(base).replace(/"/g, "'")}`);
  if (next === cfg && base !== '/api') throw new Error('config.js: apiBase line not found');
  await writeFile(cfgPath, next);

  const files = await readdir(DIST);
  if (!quiet) console.log(`Built admin (${files.length} files) in ${Date.now() - t0}ms → dist/  (API base ${base})`);
  return { files, base };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
