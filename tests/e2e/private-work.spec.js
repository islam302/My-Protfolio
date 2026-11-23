// @ts-check
/** /work/ "Client & private work" section: text-only cards below the case-study grid, untouched by the filter. */
import { test, expect } from './support/helpers.js';

const section = (/** @type {import('@playwright/test').Page} */ page) => page.locator('section.work-private');
const cards = (/** @type {import('@playwright/test').Page} */ page) => section(page).locator('.work-private__grid > li');

test.describe('/work/ client & private work', () => {
  test('sits below the case-study grid, with 6–7 text-only cards', async ({ page, pageErrors }) => {
    await page.goto('/work/');
    const s = section(page);
    await s.scrollIntoViewIfNeeded();
    await expect(s).toBeVisible();
    await expect(s.getByRole('heading', { level: 2 })).toBeVisible();

    const n = await cards(page).count();
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThanOrEqual(7);
    // Each entry is a list item with an h3 title, a status and a stack list.
    for (const card of await cards(page).all()) {
      await expect(card.getByRole('heading', { level: 3 })).toHaveCount(1);
      await expect(card.locator('.work-private__status')).not.toBeEmpty();
      expect(await card.locator('.work-private__stack > li').count()).toBeGreaterThan(0);
    }
    // No links and no images: these products have no public pages.
    await expect(s.locator('a')).toHaveCount(0);
    await expect(s.locator('img')).toHaveCount(0);

    // Below the grid in document order and on screen.
    const gridBox = await page.locator('.work-grid').boundingBox();
    const sBox = await s.boundingBox();
    expect(gridBox && sBox && sBox.y >= gridBox.y + gridBox.height).toBeTruthy();

    // Reveal-on-scroll: scrolled-in cards actually show.
    await cards(page).last().scrollIntoViewIfNeeded();
    await expect(cards(page).last()).toBeVisible();

    // No horizontal overflow at this viewport.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    pageErrors.assertClean();
  });

  test('is not affected by the category filter', async ({ page }) => {
    await page.goto('/work/');
    const n = await cards(page).count();
    await page.locator('.work-filter a[data-filter="education"]').click();
    await expect(page.locator('#work-status')).toHaveText(/^Showing \d+ projects?$/);
    await expect(cards(page)).toHaveCount(n);
    await expect(section(page)).toBeVisible();
    await expect(section(page).locator('.work-private__grid > li[hidden]')).toHaveCount(0);
  });

  test('renders without JavaScript, and the :target filter leaves it alone', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await ctx.newPage();
    await page.goto('/work/#filter-ai');
    await expect(cards(page).first()).toBeVisible();
    await expect(cards(page).last()).toBeVisible();
    await ctx.close();
  });
});
