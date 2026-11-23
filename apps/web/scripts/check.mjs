#!/usr/bin/env node
/**
 * Post-build checks over dist/: broken internal links and assets, and basic
 * on-page SEO / accessibility rules. Exits 1 on errors.
 *   npm run build && npm run check
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const exists = (urlPath) => {
  const p = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  if (!p) return true;
  const f = join(DIST, p);
  return existsSync(f) && (!p.endsWith('/') || existsSync(join(f, 'index.html'))) || existsSync(join(f, 'index.html'));
};

const errors = [];
const warns = [];
const titles = new Map();
const descs = new Map();
const files = (await walk(DIST)).filter((f) => f.endsWith('.html'));

for (const file of files) {
  const page = '/' + relative(DIST, file).replace(/index\.html$/, '');
  const s = await readFile(file, 'utf8');
  const err = (m) => errors.push(`${page}: ${m}`);
  const warn = (m) => warns.push(`${page}: ${m}`);

  const title = s.match(/<title>([^<]*)<\/title>/)?.[1];
  const desc = s.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!title) err('missing <title>');
  if (!desc) err('missing meta description');
  if (title) titles.set(title, [...(titles.get(title) || []), page]);
  if (desc) descs.set(desc, [...(descs.get(desc) || []), page]);
  if (!/<link rel="canonical"/.test(s)) err('missing canonical');

  const h1 = (s.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) err(`has ${h1} <h1> elements (want exactly 1)`);

  for (const m of s.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="/.test(m[0])) err(`<img> without alt: ${m[0].slice(0, 90)}`);
    if (!/\bwidth="/.test(m[0]) && !/\bdata-dyn\b/.test(m[0])) warn(`<img> without width/height (CLS): ${m[0].slice(0, 90)}`);
  }

  for (const m of s.matchAll(/\b(?:href|src|srcset|poster)="([^"]+)"/g)) {
    for (const part of m[1].split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (!url.startsWith('/') || url.startsWith('//')) continue;
      if (!exists(url)) err(`broken link/asset ${url}`);
    }
  }
  for (const m of s.matchAll(/url\((["']?)(\/[^)"']+)\1\)/g)) if (!exists(m[2])) err(`broken css url ${m[2]}`);
  for (const m of s.matchAll(/href="#([^"]+)"/g)) {
    if (!new RegExp(`id="${m[1]}"`).test(s)) err(`in-page anchor #${m[1]} has no target`);
  }
}

for (const [t, pages] of titles) if (pages.length > 1) errors.push(`duplicate <title> "${t}" on ${pages.join(', ')}`);
for (const pages of descs.values()) if (pages.length > 1) errors.push(`duplicate description on ${pages.join(', ')}`);

// CSS files: referenced assets exist
for (const f of (await walk(join(DIST, 'css'))).filter((f) => f.endsWith('.css'))) {
  const s = await readFile(f, 'utf8');
  for (const m of s.matchAll(/url\((["']?)(\/[^)"']+)\1\)/g)) if (!exists(m[2])) errors.push(`${relative(DIST, f)}: broken url ${m[2]}`);
}

console.log(`Checked ${files.length} HTML files.`);
warns.forEach((w) => console.warn('  ⚠ ' + w));
errors.forEach((e) => console.error('  ✗ ' + e));
if (errors.length) process.exit(1);
console.log('  ✓ no errors');
