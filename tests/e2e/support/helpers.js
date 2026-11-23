// @ts-check
/** Shared test data + helpers for the apps/web E2E suites. */
import { test as base, expect } from '@playwright/test';

/** The 8 case studies, in the order of apps/web/src/data/projects.js. */
export const PROJECTS = [
  { slug: 'agentopia', title: 'Agentopia', cat: 'ai' },
  { slug: 'etqan-tutor', title: 'Etqan Tutor', cat: 'education' },
  { slug: 'original-software', title: 'Original Software', cat: 'e-commerce' },
  { slug: 'lmfoundry', title: 'LMFoundry', cat: 'ai' },
  { slug: 'qalamy-academy', title: 'Qalamy Academy', cat: 'education' },
  { slug: 'teslla-study', title: 'Teslla Study', cat: 'education' },
  { slug: 'alreef', title: 'Alreef E-commerce', cat: 'e-commerce' },
  { slug: 'etqan', title: 'ETQAN', cat: 'web' },
];

/** Every page in the site (except 404.html, tested separately). */
export const ROUTES = [
  { path: '/', h1: /Islam Badran/ },
  { path: '/about/', h1: /Islam Badran/ },
  { path: '/work/', h1: /Things I’ve built/ },
  { path: '/services/', h1: /Software that works for your business/ },
  { path: '/contact/', h1: /Let’s build something/ },
  ...PROJECTS.map((p) => ({ path: `/work/${p.slug}/`, h1: new RegExp(`^${p.title}$`) })),
];

export const PRIMARY_NAV = [
  { label: 'about', path: '/about/' },
  { label: 'work', path: '/work/' },
  { label: 'services', path: '/services/' },
  { label: 'contact', path: '/contact/' },
];

/** True for the tablet/mobile projects, where the header nav collapses behind the toggle (<861px). */
export const isCollapsedNav = (/** @type {import('@playwright/test').Page} */ page) => (page.viewportSize()?.width ?? 1440) < 861;

/**
 * Fixture `pageErrors`: collects console errors, uncaught exceptions, failed requests and
 * same-origin HTTP >= 400 responses for the current page. Call `.assertClean()` at the end.
 */
export const test = base.extend({
  pageErrors: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL || 'http://localhost').origin;
    /** @type {string[]} */ const errors = [];
    /** @type {RegExp[]} */ const allow = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => {
      const f = r.failure()?.errorText || '';
      // Aborts caused by the test navigating away are not app failures.
      if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(f)) return;
      errors.push(`requestfailed: ${r.url()} ${f}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().startsWith(origin)) errors.push(`http ${r.status()}: ${r.url()}`);
    });
    await use({
      errors,
      allow: (/** @type {RegExp} */ re) => allow.push(re),
      assertClean: () => expect(errors.filter((e) => !allow.some((re) => re.test(e))), 'console/network errors').toEqual([]),
    });
  },
});
export { expect };

/**
 * Make every image load (lazy ones included) and every [data-reveal] visible, then wait for
 * images to finish. Used by broken-image checks and the visual suite.
 * @param {import('@playwright/test').Page} page
 */
export async function loadAllImages(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => { /** @type {HTMLImageElement} */ (img).loading = 'eager'; });
    const imgs = [...document.images].filter((i) => i.getAttribute('src'));
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))));
  });
}

/** List of <img src> that failed to decode (naturalWidth === 0). */
export async function brokenImages(/** @type {import('@playwright/test').Page} */ page) {
  return page.evaluate(() =>
    [...document.images].filter((i) => i.getAttribute('src') && (!i.complete || i.naturalWidth === 0)).map((i) => i.currentSrc || i.src),
  );
}
