#!/usr/bin/env node
/**
 * Static site build. No dependencies.
 *
 *   src/pages/*.js   -> each default-exports () => page | page[]  (see src/templates/layout.js)
 *   src/styles/*.css -> dist/css/
 *   src/scripts/*.js -> dist/js/
 *   public/**        -> dist/ (copied as-is)
 *   + sitemap.xml, robots.txt, site.webmanifest
 */
import { readdir, rm, mkdir, writeFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

export async function build({ quiet = false } = {}) {
  const t0 = Date.now();
  const bust = `?t=${t0}`; // re-import page modules on every rebuild in dev
  const { document } = await import(pathToFileURL(join(SRC, 'templates/layout.js')) + bust);
  const { site } = await import(pathToFileURL(join(SRC, 'data/site.js')) + bust);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(join(ROOT, 'public'), DIST, { recursive: true });
  await cp(join(SRC, 'styles'), join(DIST, 'css'), { recursive: true });
  await cp(join(SRC, 'scripts'), join(DIST, 'js'), { recursive: true });

  const pages = [];
  for (const file of (await readdir(join(SRC, 'pages'))).filter((f) => f.endsWith('.js')).sort()) {
    const mod = await import(pathToFileURL(join(SRC, 'pages', file)) + bust);
    const out = await mod.default();
    for (const p of [].concat(out)) pages.push({ ...p, _file: file });
  }

  const seen = new Set();
  const warnings = [];
  for (const p of pages) {
    if (!p.path || !(p.path.endsWith('/') || p.path.endsWith('.html'))) throw new Error(`${p._file}: bad path "${p.path}"`);
    if (seen.has(p.path)) throw new Error(`Duplicate page path ${p.path}`);
    seen.add(p.path);
    if (!p.title && p.path !== '/') warnings.push(`${p.path}: missing title`);
    const d = p.description || '';
    if (d.length < 70 || d.length > 170) warnings.push(`${p.path}: description is ${d.length} chars (aim for 120–160)`);
    if (p.styles) for (const s of p.styles) if (!existsSync(join(SRC, 'styles', s))) throw new Error(`${p.path}: missing style ${s}`);
    if (p.scripts) for (const s of p.scripts) if (!existsSync(join(SRC, 'scripts', s))) throw new Error(`${p.path}: missing script ${s}`);

    const target = p.path.endsWith('.html') ? join(DIST, p.path) : join(DIST, p.path, 'index.html');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, document(p));
  }

  /* sitemap + robots + manifest */
  const today = new Date().toISOString().slice(0, 10);
  const indexed = pages.filter((p) => !p.noindex && p.path.endsWith('/'));
  await writeFile(
    join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      indexed
        .map((p) => `  <url><loc>${site.url}${p.path}</loc><lastmod>${today}</lastmod><priority>${(p.priority ?? (p.path === '/' ? 1 : 0.7)).toFixed(1)}</priority></url>`)
        .join('\n') +
      `\n</urlset>\n`,
  );
  await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
  await writeFile(
    join(DIST, 'site.webmanifest'),
    JSON.stringify(
      {
        name: `${site.name} — ${site.role}`,
        short_name: site.shortName,
        start_url: '/',
        display: 'standalone',
        background_color: site.themeColor,
        theme_color: site.themeColor,
        icons: [
          { src: '/favicon.png', sizes: '128x128', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      null,
      2,
    ),
  );

  if (!quiet) {
    console.log(`Built ${pages.length} pages in ${Date.now() - t0}ms → dist/  (SITE_URL=${site.url})`);
    warnings.forEach((w) => console.warn('  ⚠ ' + w));
  }
  return { pages, warnings };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
