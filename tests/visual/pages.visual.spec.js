// @ts-check
/**
 * Visual regression: full-page screenshots of every route at 3 viewports.
 * Baselines are captured from the ORIGINAL reference build (see docs/AGENT_REPORTS/05-qa.md):
 *   BASE_URL=http://localhost:4401 npx playwright test tests/visual --update-snapshots
 * then compared against the rebuilt apps/web:
 *   npx playwright test tests/visual
 */
import { test, expect } from '@playwright/test';
import { ROUTES } from '../e2e/support/helpers.js';
import { prepare, resetScroll, shotName, STYLE_PATH } from './support/prepare.js';

const PAGES = [...ROUTES.map((r) => r.path), '/404.html'];

for (const path of PAGES) {
  test(`visual ${path}`, async ({ page }) => {
    await page.goto(path);
    await prepare(page);
    await expect(page).toHaveScreenshot(`${shotName(path)}.png`, { fullPage: true, stylePath: STYLE_PATH });
  });
}

test('visual /contact/ form + intro-masked page (baselines for the API-mode comparison)', async ({ page }) => {
  await page.goto('/contact/');
  await prepare(page);
  await expect(page.locator('#brief-form')).toHaveScreenshot('contact-form.png', { stylePath: STYLE_PATH });
  await resetScroll(page); // the element shot scrolled the page
  // The API build legitimately rewords one intro sentence (docs/API_CONTRACT.md); mask just that paragraph.
  await expect(page).toHaveScreenshot('contact-intro-masked.png', {
    fullPage: true,
    stylePath: STYLE_PATH,
    mask: [page.locator('.pg-brief-intro > p.muted').first()],
  });
});

test('visual: unknown URL serves the 404 page', async ({ page }) => {
  await page.goto('/no-such-page/');
  await prepare(page);
  await expect(page).toHaveScreenshot('404-unknown-url.png', { fullPage: true, stylePath: STYLE_PATH });
});
