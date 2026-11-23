// @ts-check
/**
 * Playwright config for the portfolio monorepo.
 *
 *   npm run test:e2e                          -> E2E suites (tests/e2e) at 3 viewports
 *   npx playwright test tests/visual          -> visual regression only (tests/visual)
 *   PW_VISUAL=1 npx playwright test           -> same, via env
 *   BASE_URL=https://staging.example.com npm run test:e2e   -> run against a deployed site (no local server)
 *
 * Servers (started automatically, reused locally if already running):
 *   web      : builds + serves apps/web on PW_WEB_PORT (default 4400)
 *   web-api  : copy of apps/web built with PUBLIC_API_URL=/api on PW_API_WEB_PORT (default 4402),
 *              used by tests/e2e/api-mode.spec.js and the API-mode visual test.
 *   admin    : apps/admin built + served at /admin/ on PW_ADMIN_PORT (default 4403) — only if apps/admin exists.
 * Visual baselines come from the ORIGINAL reference build: see docs/AGENT_REPORTS/05-qa.md.
 */
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const CI = !!process.env.CI;
const WEB_PORT = Number(process.env.PW_WEB_PORT) || 4400;
const API_WEB_PORT = Number(process.env.PW_API_WEB_PORT) || 4402;
const ADMIN_PORT = Number(process.env.PW_ADMIN_PORT) || 4403;
const BASE_URL = process.env.BASE_URL || `http://localhost:${WEB_PORT}`;

process.env.PW_API_WEB_URL ||= `http://localhost:${API_WEB_PORT}`;
process.env.PW_ADMIN_URL ||= `http://localhost:${ADMIN_PORT}`;

// Visual projects are opt-in so `npm run test:e2e` stays functional-only.
const VISUAL =
  process.env.PW_VISUAL === '1' || process.argv.some((a) => /tests[\\/]visual|visual-(desktop|tablet|mobile)/.test(a));
// Workers re-evaluate this file with a different argv: hand the decision on through the env.
if (VISUAL) process.env.PW_VISUAL = '1';

const viewports = {
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  // iPad-ish portrait, rendered by Chromium (WebKit is optional; see report).
  tablet: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  // iPhone/Pixel-ish, Chromium.
  mobile: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 },
};

const e2eProjects = Object.entries(viewports).map(([name, use]) => ({
  name: `e2e-${name}`,
  testDir: './tests/e2e',
  use,
}));

const visualProjects = Object.entries(viewports).map(([name, use]) => ({
  name: `visual-${name}`,
  testDir: './tests/visual',
  // reducedMotion: home.js skips its entrance/sway, reveals render in their final state.
  use: {
    ...use,
    reducedMotion: /** @type {'reduce'} */ ('reduce'),
    deviceScaleFactor: 1,
    // Desktop-UA + isMobile at 768px produced sub-pixel text offsets that changed run to run in
    // full-page captures (see report); the visual tablet project therefore renders without mobile emulation.
    ...(name === 'tablet' ? { isMobile: false } : {}),
    // Deterministic rasterisation: CPU raster, greyscale AA, fixed colour profile.
    launchOptions: { args: ['--disable-gpu', '--disable-lcd-text', '--font-render-hinting=none', '--force-color-profile=srgb', '--disable-partial-raster'] },
  },
}));

/** @type {import('@playwright/test').PlaywrightTestConfig['webServer']} */
const webServer = [];
if (!process.env.BASE_URL) {
  webServer.push({
    name: 'web',
    command: 'npm run preview -w @portfolio/web',
    url: `http://localhost:${WEB_PORT}/`,
    env: { PORT: String(WEB_PORT) },
    reuseExistingServer: !CI,
    timeout: 120_000,
  });
}
if (!process.env.PW_SKIP_API_WEB) {
  webServer.push({
    name: 'web-api',
    command: 'node tests/e2e/support/serve-api-mode.mjs',
    url: `http://localhost:${API_WEB_PORT}/`,
    env: { PORT: String(API_WEB_PORT), PUBLIC_API_URL: '/api' },
    reuseExistingServer: !CI,
    timeout: 120_000,
  });
}
const ADMIN_BUILD = existsSync('apps/admin/scripts/build.mjs');
if (ADMIN_BUILD || existsSync('apps/admin/dist/index.html')) {
  webServer.push({
    name: 'admin',
    command: `${ADMIN_BUILD ? 'node apps/admin/scripts/build.mjs && ' : ''}node tests/e2e/support/serve-static.mjs apps/admin/dist /admin/ apps/web/dist`,
    url: `http://localhost:${ADMIN_PORT}/admin/`,
    env: { PORT: String(ADMIN_PORT) },
    reuseExistingServer: !CI,
    timeout: 60_000,
  });
}

export default defineConfig({
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 7_000,
    toHaveScreenshot: {
      // Release gate: at most 0.1 % of pixels may differ (per-pixel YIQ threshold 0.2 = Playwright default).
      maxDiffPixelRatio: process.env.PW_MAX_DIFF_RATIO !== undefined ? Number(process.env.PW_MAX_DIFF_RATIO) : 0.001,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  // Baselines are platform-specific (font rasterisation); one folder per OS.
  snapshotPathTemplate: 'tests/visual/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: VISUAL ? visualProjects : e2eProjects,
  webServer,
});
