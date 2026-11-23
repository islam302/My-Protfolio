// @ts-check
/** /work/ grid, category filter (click + hash deep link + live status) and every case-study page. */
import { test, expect, PROJECTS } from './support/helpers.js';

const count = (cat) => PROJECTS.filter((p) => p.cat === cat).length;
const visibleCards = (/** @type {import('@playwright/test').Page} */ page) => page.locator('.work-grid > li:not([hidden])');

test.describe('/work/ grid', () => {
  test('lists all 7 case studies, each card links to its page', async ({ page }) => {
    await page.goto('/work/');
    await expect(page.locator('.work-grid > li')).toHaveCount(PROJECTS.length);
    const hrefs = await page.locator('.work-card__link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(PROJECTS.map((p) => `/work/${p.slug}/`));
    await expect(page.locator('.work-hero__stats')).toContainText(`${PROJECTS.length} case studies`);
  });

  for (const p of PROJECTS) {
    test(`card → /work/${p.slug}/`, async ({ page }) => {
      await page.goto('/work/');
      const link = page.locator(`.work-card__link[href="/work/${p.slug}/"]`);
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/work/${p.slug}/$`));
      await expect(page.locator('h1')).toHaveText(p.title);
    });
  }
});

test.describe('/work/ filter', () => {
  test('chips filter the grid, update aria-current, the hash and the live status', async ({ page }) => {
    await page.goto('/work/');
    const chip = (f) => page.locator(`.work-filter a[data-filter="${f}"]`);
    const status = page.locator('#work-status');
    await expect(chip('all')).toHaveAttribute('aria-current', 'true');

    for (const cat of ['ai', 'education', 'e-commerce', 'web']) {
      await chip(cat).click();
      await expect(visibleCards(page)).toHaveCount(count(cat));
      await expect(page.locator(`.work-grid > li:not([hidden]):not([data-cat="${cat}"])`)).toHaveCount(0);
      await expect(chip(cat)).toHaveAttribute('aria-current', 'true');
      await expect(chip('all')).not.toHaveAttribute('aria-current', /.*/);
      await expect(page).toHaveURL(new RegExp(`#filter-${cat}$`));
      const n = count(cat);
      await expect(status).toHaveText(`Showing ${n} project${n === 1 ? '' : 's'}`);
      await expect(chip(cat).locator('.work-filter__n')).toHaveText(String(n));
      // Visible cards are actually shown (reveal forced in), not just un-hidden.
      await expect(visibleCards(page).first()).toBeVisible();
    }

    await chip('all').click();
    await expect(visibleCards(page)).toHaveCount(PROJECTS.length);
    await expect(status).toHaveText(`Showing ${PROJECTS.length} projects`);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('hash deep link #filter-education applies on load', async ({ page }) => {
    await page.goto('/work/#filter-education');
    await expect(visibleCards(page)).toHaveCount(count('education'));
    await expect(page.locator('.work-filter a[data-filter="education"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#work-status')).toHaveText(`Showing ${count('education')} projects`);
  });

  test('unknown filter hash falls back to all', async ({ page }) => {
    await page.goto('/work/#filter-nope');
    await expect(visibleCards(page)).toHaveCount(PROJECTS.length);
    await expect(page.locator('.work-filter a[data-filter="all"]')).toHaveAttribute('aria-current', 'true');
  });

  test('without JavaScript the :target CSS filter still works', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await ctx.newPage();
    await page.goto('/work/#filter-ai');
    await expect(page.locator('.work-grid > li[data-cat="ai"]').first()).toBeVisible();
    await expect(page.locator('.work-grid > li[data-cat="education"]').first()).toBeHidden();
    await ctx.close();
  });
});

test.describe('case-study pages', () => {
  for (const p of PROJECTS) {
    test(`/work/${p.slug}/ content`, async ({ page, pageErrors }) => {
      await page.goto(`/work/${p.slug}/`);
      await expect(page.locator('h1')).toHaveText(p.title);
      await expect(page.locator('.case-hero')).toBeVisible();
      await expect(page.locator('.case-hero__summary')).not.toBeEmpty();
      // Breadcrumb trail Home › Work › Title
      const crumbs = page.locator('nav[aria-label="Breadcrumb"], .crumbs').first();
      await expect(crumbs).toContainText('Work');
      // Features are reveal-on-scroll: scroll them in, then they must become visible.
      await page.locator('.case-features').scrollIntoViewIfNeeded();
      await expect(page.locator('.case-features .case-feature__title').first()).toBeVisible();
      expect(await page.locator('.case-feature__title').count()).toBeGreaterThan(0);
      // Pager: previous/next case study links point at real neighbours.
      const pager = await page.locator('.case-pager a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(pager.length).toBeGreaterThan(0);
      for (const h of pager) expect(PROJECTS.map((x) => `/work/${x.slug}/`)).toContain(h);
      expect(pager).not.toContain(`/work/${p.slug}/`);
      // Related work never links to itself.
      const related = await page.locator('.case-related a.work-card__link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(related).not.toContain(`/work/${p.slug}/`);
      // JSON-LD names this project.
      const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join('');
      expect(ld).toContain(p.title);
      // External links open safely.
      for (const rel of await page.locator('a[target="_blank"]').evaluateAll((as) => as.map((a) => a.getAttribute('rel') || ''))) {
        expect(rel).toContain('noopener');
      }
      await page.waitForLoadState('networkidle');
      pageErrors.assertClean();
    });
  }
});
