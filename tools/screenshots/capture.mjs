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
 * Projects with a public live site. Width/height reproduce the original screenshot's window (same aspect); scrollY its scroll offset.
 * @type {{ slug: string, name: string, url: string, width: number, height: number, settle?: number, scrollY?: number, waitUntil?: 'domcontentloaded' | 'load' | 'networkidle', colorScheme?: 'light' | 'dark', prepare?: (page: import('@playwright/test').Page) => Promise<void> }[]}
 */
export const SHOTS = [
  { slug: 'etqan', name: 'cover', url: 'https://www.etqanpp.com/', width: 1600, height: 871, settle: 2500, scrollY: 150 },
  { slug: 'agentopia', name: 'cover', url: 'https://agentopia-ai.vercel.app/', width: 1728, height: 962, settle: 2500 },
  { slug: 'etqan-tutor', name: 'cover', url: 'https://tutor.etqanpp.com/', width: 1728, height: 964, settle: 2500 },
  // Dark theme (the site's own toggle) + the first carousel slide (welcome banner with the
  // mascot), as in the original screenshot.
  {
    slug: 'original-software', name: 'cover', url: 'https://original-software.com/', width: 1728, height: 962,
    settle: 0, waitUntil: 'domcontentloaded',
    prepare: async (page) => {
      // The site keeps its theme in localStorage; set it and reload so the page renders dark.
      await page.evaluate(() => localStorage.setItem('preferred-theme', 'dark'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000); // hero slides load (some below-the-fold images never finish)
      await page.getByRole('button', { name: 'انتقل إلى الشريحة 1', exact: true }).click();
      await page.waitForTimeout(6500); // slide transition + text/mascot entrance animation
    },
  },
  { slug: 'teslla-study', name: 'cover', url: 'https://tesllastudy.com/', width: 1728, height: 965, settle: 2500 },
  // A first-order discount popup opens a moment after load; close it with its own "not now" link.
  {
    slug: 'alreef', name: 'cover', url: 'https://www.alref.net/', width: 1728, height: 962, settle: 2500,
    prepare: async (page) => {
      const notNow = page.getByRole('button', { name: 'مش دلوقتي' }).or(page.getByRole('link', { name: 'مش دلوقتي' })).first();
      try {
        await notNow.click({ timeout: 10_000 });
      } catch {
        // No popup this time (already dismissed or not shown): nothing to close.
      }
      await page.waitForTimeout(800); // popup exit animation
      // Closing it leaves a small reminder pill in the corner; hide that too (its own close button).
      try {
        await page.locator('.welcome-pill__close').click({ timeout: 5_000 });
      } catch {
        // Pill not shown: nothing to hide.
      }
      await page.waitForTimeout(600);
    },
  },
];

const only = process.argv[2];
const browser = await chromium.launch();
try {
  for (const s of SHOTS.filter((x) => !only || x.slug === only)) {
    const context = await browser.newContext({
      viewport: { width: s.width, height: s.height },
      deviceScaleFactor: 2,
      colorScheme: s.colorScheme ?? 'light',
      locale: 'en-US',
    });
    const page = await context.newPage();
    // Some sites keep connections open (analytics, sockets): those wait for 'load' + settle.
    await page.goto(s.url, { waitUntil: s.waitUntil ?? 'networkidle', timeout: 60_000 });
    await page.evaluate(() => document.fonts?.ready);
    if (s.prepare) await s.prepare(page);
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
