// @ts-check
/** Reduced motion, slow network, and no-JS fallbacks. */
import { test, expect, loadAllImages, brokenImages } from './support/helpers.js';

test.describe('reduced motion (home)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('entrance is skipped, nothing animates, the dive clip is not downloaded', async ({ page }) => {
    /** @type {string[]} */ const media = [];
    page.on('request', (r) => { if (r.url().includes('/media/')) media.push(r.url()); });
    await page.goto('/');
    // .pre (opacity 0) is removed immediately rather than after the 4 s entrance.
    await expect(page.locator('#stage .pre, .home-ui .pre')).toHaveCount(0, { timeout: 3_000 });
    await expect(page.locator('.home-ui nav .tag').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    expect(running, 'running animations under reduced motion').toBe(0);
    expect(media, 'hero-dive.mp4 should not be fetched under reduced motion').toEqual([]);
    await expect(page.locator('#trans')).not.toHaveAttribute('src', /.+/);
  });

  test('reveals are visible without scrolling on content pages', async ({ page }) => {
    await page.goto('/about/');
    const last = page.locator('[data-reveal]').last();
    // Not scrolled into view, not yet .is-in, but CSS shows it anyway.
    expect(await last.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });
});

test.describe('normal motion (home)', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('entrance runs and the lanyard sways', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.home-ui nav .tag.pre')).toHaveCount(0, { timeout: 8_000 });
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 8_000 }).toBeGreaterThan(0);
  });
});

test.describe('slow network', () => {
  test('pages still render with every request delayed 400 ms', async ({ page }) => {
    test.setTimeout(90_000);
    await page.route('**/*', async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    for (const path of ['/', '/work/', '/contact/']) {
      await page.goto(path, { timeout: 30_000 });
      await expect(page.locator('h1')).toHaveCount(1);
      await loadAllImages(page);
      expect(await brokenImages(page), path).toEqual([]);
    }
    // The home entrance must not hang waiting for slow fonts/images (2.5 s race + 4 s safety net).
    await page.goto('/');
    await expect(page.locator('.home-ui nav .tag').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Fast-3G-ish throttling (CDP): contact form usable', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP network emulation is Chromium-only');
    test.setTimeout(90_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await page.goto('/contact/', { timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Send on WhatsApp/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('h1')).toHaveText(/Let’s build something/);
  });

  test('hero still appears when the dive clip fails to load', async ({ page }) => {
    await page.route('**/media/**', (r) => r.abort());
    await page.goto('/');
    await expect(page.locator('#plate')).toBeVisible();
    await expect(page.locator('#tWork')).toBeVisible({ timeout: 8_000 });
    // Diving still works via the cross-fade fallback.
    await page.locator('#tWork').click();
    await expect(page.locator('body')).toHaveClass(/is-case/, { timeout: 10_000 });
  });
});

test.describe('no JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('home renders the plain index with links to every case study', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.home-index__cases a')).toHaveCount(8);
    await expect(page.locator('.home-index__cases a').first()).toBeVisible();
  });
});
