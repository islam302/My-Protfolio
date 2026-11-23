// @ts-check
/**
 * Puts a page into a deterministic state for screenshots. Applied identically to the
 * reference (original) build and the rebuilt apps/web.
 */
import { fileURLToPath } from 'node:url';

export const STYLE_PATH = fileURLToPath(new URL('../screenshot.css', import.meta.url));

/** Route path → snapshot base name. */
export const shotName = (path) =>
  path === '/' ? 'home' : path.replace(/\.html$/, '').replace(/^\/|\/$/g, '').replace(/\//g, '-');

/** @param {import('@playwright/test').Page} page */
export async function prepare(page) {
  await page.waitForLoadState('load');
  // Reveal-on-scroll: under reducedMotion they already render in their final state; add .is-in anyway
  // so the result doesn't depend on the IntersectionObserver having fired.
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in')));
  // Load every image (lazy included) and wait until decoded.
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => { /** @type {HTMLImageElement} */ (img).loading = 'eager'; });
    const imgs = [...document.images].filter((i) => i.getAttribute('src'));
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
  });
  // Pause any video at frame 0.
  await page.evaluate(() => document.querySelectorAll('video').forEach((v) => { v.pause(); try { v.currentTime = 0; } catch { /* no source */ } }));
  await page.evaluate(() => document.fonts.ready);
  // Home: the entrance (skipped under reduced motion) must have removed every .pre.
  if (await page.locator('body.page-home').count()) {
    await page.waitForFunction(() => document.querySelectorAll('.pre').length === 0, null, { timeout: 8_000 });
  }
  await resetScroll(page);
  // Two frames so layout from the above settles.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Instant scroll back to the top (the site sets scroll-behavior: smooth, which would make shots drift). */
export async function resetScroll(/** @type {import('@playwright/test').Page} */ page) {
  await page.evaluate(() => new Promise((r) => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    requestAnimationFrame(() => requestAnimationFrame(r));
  }));
}
