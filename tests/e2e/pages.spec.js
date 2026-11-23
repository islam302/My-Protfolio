// @ts-check
/** Every route: status, SEO head, one <h1>, structured data, images, and the 404 page. */
import { test, expect, ROUTES, loadAllImages, brokenImages } from './support/helpers.js';

test.describe('homepage', () => {
  test('loads cleanly: hero visible, h1 present, no console errors or failed requests', async ({ page, pageErrors }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('Islam Badran');
    await expect(page.locator('#stage')).toBeVisible();
    await expect(page.locator('#plate')).toBeVisible();
    // The plate photo actually decoded.
    await expect.poll(() => page.locator('#plate').evaluate((/** @type {HTMLImageElement} */ i) => i.naturalWidth)).toBeGreaterThan(0);
    // Entrance finishes: the primary tags lose .pre (opacity 0) within the 4 s safety timeout.
    await expect(page.locator('.home-ui nav .tag').first()).not.toHaveClass(/\bpre\b/, { timeout: 8_000 });
    await expect(page.locator('.home-ui nav .tag').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    pageErrors.assertClean();
  });
});

test.describe('every route', () => {
  for (const r of ROUTES) {
    test(`${r.path} → 200, title/description/canonical, one h1, OG + JSON-LD`, async ({ page, pageErrors, baseURL }) => {
      const res = await page.goto(r.path);
      expect(res?.status(), 'HTTP status').toBe(200);
      expect(res?.headers()['content-type']).toContain('text/html');

      await expect(page).toHaveTitle(/\S/);
      const title = await page.title();
      expect(title).toContain('Islam Badran');

      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc?.length, 'description length').toBeGreaterThanOrEqual(70);
      expect(desc?.length, 'description length').toBeLessThanOrEqual(170);

      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toMatch(/^https:\/\/[^/]+\//);
      expect(new URL(/** @type {string} */ (canonical)).pathname).toBe(r.path);

      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(r.h1);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');

      // Open Graph / Twitter
      for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name']) {
        await expect(page.locator(`meta[property="${p}"]`), p).toHaveAttribute('content', /\S/);
      }
      expect(await page.locator('meta[property="og:url"]').getAttribute('content')).toBe(canonical);
      expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/^https:\/\//);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

      // JSON-LD: every block parses, uses schema.org, contains Person + WebSite.
      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(blocks.length).toBeGreaterThan(0);
      const types = [];
      for (const b of blocks) {
        const data = JSON.parse(b);
        expect(data['@context']).toBe('https://schema.org');
        for (const node of data['@graph'] || [data]) types.push(node['@type']);
      }
      expect(types).toEqual(expect.arrayContaining(['Person', 'WebSite']));

      // og:image itself is served by this site (fetch the same path from baseURL).
      const ogPath = new URL(/** @type {string} */ (await page.locator('meta[property="og:image"]').getAttribute('content'))).pathname;
      const img = await page.request.get(new URL(ogPath, baseURL).href);
      expect(img.status(), `og:image ${ogPath}`).toBe(200);

      await page.waitForLoadState('networkidle');
      pageErrors.assertClean();
    });

    test(`${r.path} has no broken images`, async ({ page }) => {
      await page.goto(r.path);
      await loadAllImages(page);
      expect(await brokenImages(page)).toEqual([]);
      // Every content image has an alt attribute (decorative ones use alt="").
      expect(await page.locator('img:not([alt])').count()).toBe(0);
    });
  }
});

test.describe('404', () => {
  test('unknown URL returns 404 with the custom page', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist/');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Lost the signal');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    // Recovery links work.
    await page.locator('.pg-404__links a', { hasText: 'work' }).click();
    await expect(page).toHaveURL(/\/work\/$/);
  });

  test('/404.html itself renders', async ({ page }) => {
    const res = await page.goto('/404.html');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('directory URL without trailing slash redirects', async ({ request }) => {
    const res = await request.get('/work', { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toBe('/work/');
  });
});

test('sitemap.xml lists every indexable route', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const xml = await res.text();
  for (const r of ROUTES) expect(xml, r.path).toContain(`${r.path}</loc>`);
  expect(xml).not.toContain('404');
});
