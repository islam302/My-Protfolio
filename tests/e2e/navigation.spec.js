// @ts-check
/** Primary navigation (desktop + collapsed mobile menu), skip link, keyboard basics. */
import { test, expect, PRIMARY_NAV, isCollapsedNav } from './support/helpers.js';

test.describe('header navigation', () => {
  test('reaches every page through the primary nav', async ({ page }) => {
    await page.goto('/about/');
    const toggle = page.locator('.nav-toggle');
    const nav = page.locator('#site-nav');
    for (const item of PRIMARY_NAV) {
      if (isCollapsedNav(page)) await toggle.click();
      await nav.getByRole('link', { name: item.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${item.path}$`));
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator(`#site-nav a[href="${item.path}"]`)).toHaveAttribute('aria-current', 'page');
    }
    // Brand goes home.
    await page.locator('.site-header .brand').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('body')).toHaveClass(/page-home/);
  });

  test('"discuss a project" opens WhatsApp in a new tab', async ({ page }) => {
    await page.goto('/services/');
    if (isCollapsedNav(page)) await page.locator('.nav-toggle').click();
    const link = page.locator('#site-nav a.tag--accent');
    await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/201013919821\?text=/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('footer links reach every page', async ({ page }) => {
    await page.goto('/contact/');
    for (const item of PRIMARY_NAV) {
      await expect(page.locator(`.site-footer a[href="${item.path}"]`)).toHaveCount(1);
    }
    await page.locator('.site-footer a[href="/work/"]').click();
    await expect(page).toHaveURL(/\/work\/$/);
  });
});

test.describe('mobile menu', () => {
  test.beforeEach(({ page }) => {
    test.skip(!isCollapsedNav(page), 'menu toggle only exists below 861px (tablet/mobile projects)');
  });

  test('opens, closes, Escape closes, aria-expanded tracks state', async ({ page }) => {
    await page.goto('/work/');
    const toggle = page.locator('.nav-toggle');
    const nav = page.locator('#site-nav');
    const firstLink = nav.getByRole('link', { name: 'about', exact: true });

    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'site-nav');
    await expect(firstLink).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).toHaveClass(/is-open/);
    await expect(firstLink).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(firstLink).toBeHidden();

    await toggle.click();
    await expect(firstLink).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).not.toHaveClass(/is-open/);
    await expect(firstLink).toBeHidden();
  });

  test('keyboard: toggle with Enter, Tab into the menu, Escape closes', async ({ page }) => {
    await page.goto('/services/');
    const toggle = page.locator('.nav-toggle');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // The menu fades in over .25s (visibility transition); links are not focusable until it starts.
    await expect(page.locator('#site-nav a').first()).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#site-nav a').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Focus must not be stranded on a now-hidden link.
    const focusedHidden = await page.evaluate(() => {
      const a = document.activeElement;
      return !!a && a.closest('#site-nav') !== null && !(/** @type {HTMLElement} */ (a).offsetParent);
    });
    expect(focusedHidden, 'focus left on a hidden menu link after Escape').toBe(false);
  });

  test('choosing a link closes the menu and navigates', async ({ page }) => {
    await page.goto('/about/');
    await page.locator('.nav-toggle').click();
    await page.locator('#site-nav').getByRole('link', { name: 'contact', exact: true }).click();
    await expect(page).toHaveURL(/\/contact\/$/);
    await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('home page navigation', () => {
  test('tags lead to about / services, "say hello" to contact', async ({ page }) => {
    await page.goto('/');
    const tags = page.locator('.home-ui nav');
    await expect(tags.getByRole('link', { name: 'about' })).toBeVisible({ timeout: 8_000 });
    await tags.getByRole('link', { name: 'about' }).click();
    await expect(page).toHaveURL(/\/about\/$/);
    await page.goBack();
    await expect(tags.getByRole('link', { name: 'services' })).toBeVisible({ timeout: 8_000 });
    await tags.getByRole('link', { name: 'services' }).click();
    await expect(page).toHaveURL(/\/services\/$/);
    await page.goBack();
    await expect(page.locator('#hello')).toBeVisible({ timeout: 8_000 });
    await page.locator('#hello').click();
    await expect(page).toHaveURL(/\/contact\/$/);
  });

  test('"work" tag dives into the project reel instead of navigating; reel links to case studies', async ({ page }) => {
    await page.goto('/');
    const work = page.locator('#tWork');
    await expect(work).toBeVisible({ timeout: 8_000 });
    await expect(work).toHaveAttribute('href', '/work/');
    await work.click();
    await expect(page.locator('body')).toHaveClass(/is-case/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#tTitle')).toHaveText('Agentopia');
    await expect(page.locator('#dLink')).toHaveAttribute('href', '/work/agentopia/');
    // next case
    await expect(page.locator('body')).not.toHaveClass(/\bbusy\b/, { timeout: 5_000 });
    await page.locator('#next').click();
    await expect(page.locator('#tTitle')).toHaveText('Etqan Tutor', { timeout: 5_000 });
    await expect(page.locator('#dNum')).toHaveText('02 / 08');
    await page.locator('#dLink').click();
    await expect(page).toHaveURL(/\/work\/etqan-tutor\/$/);
  });
});

test.describe('keyboard & skip link', () => {
  test('skip link is the first tab stop and moves focus to <main>', async ({ page }) => {
    await page.goto('/about/');
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    // Next Tab lands inside main, not back in the header.
    await page.keyboard.press('Tab');
    const inMain = await page.evaluate(() => !!document.activeElement?.closest('main'));
    expect(inMain).toBe(true);
  });

  test('header links are reachable by keyboard in order', async ({ page }) => {
    test.skip(isCollapsedNav(page), 'collapsed menu covered by the mobile-menu keyboard test');
    await page.goto('/work/');
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // brand
    await expect(page.locator('.site-header .brand')).toBeFocused();
    const labels = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      labels.push(await page.evaluate(() => document.activeElement?.textContent?.trim()));
    }
    expect(labels).toEqual(['about', 'work', 'services', 'contact', 'discuss a project']);
    // Focus is visibly indicated.
    const outline = await page.evaluate(() => getComputedStyle(/** @type {Element} */ (document.activeElement)).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('home: ArrowDown dives into the reel, arrows switch case, Escape returns to hero', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // instant transitions
    await page.goto('/');
    // Input is deliberately ignored while a transition is "busy" (released by a 0 ms timer under
    // reduced motion), so each key is retried until the state changes.
    const pressUntil = async (key, check) => expect(async () => { await page.keyboard.press(key); await check(); }).toPass({ timeout: 5_000 });
    const body = page.locator('body');
    await pressUntil('ArrowDown', () => expect(body).toHaveClass(/is-case/, { timeout: 300 }));
    await pressUntil('ArrowRight', () => expect(page.locator('#dNum')).toHaveText('02 / 08', { timeout: 300 }));
    await pressUntil('ArrowLeft', () => expect(page.locator('#dNum')).toHaveText('01 / 08', { timeout: 300 }));
    await pressUntil('Escape', () => expect(body).not.toHaveClass(/is-case/, { timeout: 300 }));
  });
});
