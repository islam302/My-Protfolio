#!/usr/bin/env node
/**
 * Serves a second instance of apps/web built with PUBLIC_API_URL (default "/api").
 *
 * apps/web/scripts/build.mjs always writes to its own dist/, so to avoid clobbering the
 * normal build (served on another port at the same time) we copy the app to
 * tests/.cache/web-api/ (gitignored via `.cache/`) and build + serve the copy.
 * The copy lives inside the repo so `@portfolio/validation` still resolves from the
 * root node_modules.
 *
 *   PORT=4402 PUBLIC_API_URL=/api node tests/e2e/support/serve-api-mode.mjs
 */
import { cp, rm, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC_APP = join(REPO, 'apps', 'web');
const COPY = join(REPO, 'tests', '.cache', 'web-api');

process.env.PUBLIC_API_URL ||= '/api';
process.env.PORT ||= '4402';

await rm(COPY, { recursive: true, force: true });
await mkdir(COPY, { recursive: true });
for (const part of ['src', 'public', 'scripts', 'package.json']) {
  await cp(join(SRC_APP, part), join(COPY, part), { recursive: true });
}
console.log(`[web-api] copied apps/web -> ${COPY}; PUBLIC_API_URL=${process.env.PUBLIC_API_URL}`);
// serve.mjs builds on import, then listens on PORT.
await import(pathToFileURL(join(COPY, 'scripts', 'serve.mjs')).href);
