#!/usr/bin/env node
/**
 * Capture authentic, high-resolution project screenshots from the projects' LIVE sites.
 *
 *   node tools/screenshots/capture.mjs              # every project in SHOTS
 *   node tools/screenshots/capture.mjs etqan        # one project
 *
 * Writes lossless PNG masters (3200 px wide, device scale factor 2) to
 * assets/source/projects/<slug>/<name>@2x.png. Run tools/screenshots/encode.mjs
 * afterwards to produce the WebP files the site serves.
 *
 * The viewport matches the framing of the existing screenshots (a 1600×~880
 * browser window, top of the page), so the cards and the laptop screen keep
 * their composition. No upscaling, no AI: only what the live page renders.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Projects with a public live site. Height = 1600 / aspect of the current cover; scrollY reproduces its framing.
 * @type {{ slug: string, name: string, url: string, width: number, height: number, settle?: number, scrollY?: number }[]}
 */
export const SHOTS = [
  { slug: 'etqan', name: 'cover', url: 'https://www.etqanpp.com/', width: 1600, height: 871, settle: 2500, scrollY: 150 },
];

const only = process.argv[2];
const browser = await chromium.launch();
try {
  for (const s of SHOTS.filter((x) => !only || x.slug === only)) {
    const context = await browser.newContext({
      viewport: { width: s.width, height: s.height },
      deviceScaleFactor: 2,
      colorScheme: 'light',
      locale: 'en-US',
    });
    const page = await context.newPage();
    await page.goto(s.url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.evaluate(() => document.fonts?.ready);
    if (s.scrollY) {
      // Match the framing of the original screenshot (headline near the top).
      await page.evaluate((y) => window.scrollTo(0, y), s.scrollY);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(s.settle ?? 1500); // let entrance animations finish
    const out = join(ROOT, 'assets', 'source', 'projects', s.slug, `${s.name}@2x.png`);
    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out, type: 'png' });
    console.log(`${s.slug}: ${s.url} → ${out}`);
    await context.close();
  }
} finally {
  await browser.close();
}
