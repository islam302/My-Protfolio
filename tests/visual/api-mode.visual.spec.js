// @ts-check
/**
 * API mode must not change the design: the honeypot is visually hidden and out of the layout flow.
 * Compares the API-mode build (web-api server) against the NON-API baselines captured from the
 * original site by pages.visual.spec.js ('contact-form.png', 'contact-intro-masked.png').
 */
import { existsSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { prepare, STYLE_PATH } from './support/prepare.js';

const API_WEB = /** @type {string} */ (process.env.PW_API_WEB_URL);

test.beforeEach(async ({ request }, testInfo) => {
  test.skip(testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed', 'never write baselines from the API-mode build');
  test.skip(!existsSync(testInfo.snapshotPath('contact-form.png')), 'non-API baseline missing: capture baselines from the original build first');
  const html = await request.get(`${API_WEB}/contact/`).then((r) => r.text()).catch(() => '');
  test.skip(!/data-api="\/api"/.test(html), 'API-mode build not available (no data-api in /contact/)');
});

test('API-mode /contact/: form identical to the non-API baseline (honeypot invisible)', async ({ page }) => {
  await page.goto(`${API_WEB}/contact/`);
  await prepare(page);
  await expect(page.locator('#brief-form input[name="website"]')).toHaveCount(1);
  await expect(page.locator('#brief-form')).toHaveScreenshot('contact-form.png', { stylePath: STYLE_PATH });
});

test('API-mode /contact/: full page identical apart from the reworded intro sentence', async ({ page }) => {
  await page.goto(`${API_WEB}/contact/`);
  await prepare(page);
  await expect(page).toHaveScreenshot('contact-intro-masked.png', {
    fullPage: true,
    stylePath: STYLE_PATH,
    mask: [page.locator('.pg-brief-intro > p.muted').first()],
  });
});
