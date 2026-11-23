// @ts-check
/**
 * Home-page reel boundaries: the reel does not loop. Moving forward from the
 * last case leaves the full-screen showcase for /work/ (a normal scrolling page),
 * and a deliberate pull upward at the top of /work/ goes back to the home page.
 */
import { test, expect } from './support/helpers.js';
import { PROJECTS } from './support/helpers.js';

const LAST = PROJECTS.at(-1)?.title ?? '';

/** Dive into the reel and step to the last case with the given input. */
async function toLastCase(page, step) {
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('.hint')); // entrance has started
  await page.waitForTimeout(3200);
  await step();
  await expect(page.locator('body')).toHaveClass(/is-case/, { timeout: 12_000 });
  for (const p of PROJECTS.slice(1)) {
    await page.waitForTimeout(400);
    await expect(async () => {
      await step();
      await expect(page.locator('#tTitle')).toHaveText(p.title, { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
  }
  await expect(page.locator('#tTitle')).toHaveText(LAST);
}

test.describe('reel exit to /work/', () => {
  test.skip(({ isMobile }) => isMobile, 'touch path covered in the mobile test below');

  test('wheel: last case → /work/ (no loop), native scroll works, pull up at top → home', async ({ page, pageErrors }) => {
    await page.mouse.move(400, 400);
    await toLastCase(page, () => page.mouse.wheel(0, 300));

    await page.waitForTimeout(1000); // wheel lock
    await page.mouse.wheel(0, 300);
    await page.waitForURL('**/work/', { timeout: 10_000 });

    // /work/ is a normal page: the wheel scrolls it natively, and there is no horizontal overflow.
    await page.mouse.wheel(0, 800);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Scrolling back to the top alone must not leave the page…
    await page.mouse.wheel(0, -2000);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.waitForTimeout(600);
    expect(new URL(page.url()).pathname).toBe('/work/');

    // …a deliberate pull upward at the top returns to the home page.
    await page.mouse.wheel(0, -150);
    await page.mouse.wheel(0, -150);
    await page.waitForURL((u) => u.pathname === '/', { timeout: 10_000 });
    pageErrors.assertClean();
  });

  test('keyboard: ArrowDown on the last case goes to /work/', async ({ page }) => {
    await toLastCase(page, () => page.keyboard.press('ArrowDown'));
    await page.waitForTimeout(700);
    await page.keyboard.press('ArrowDown');
    await page.waitForURL('**/work/', { timeout: 10_000 });
  });

  test('direct visit to /work/: pulling up at the top stays on /work/', async ({ page }) => {
    await page.goto('/work/');
    await page.mouse.move(400, 400);
    await page.waitForTimeout(600);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -200);
    await page.waitForTimeout(800);
    expect(new URL(page.url()).pathname).toBe('/work/');
  });
});

test.describe('reel exit on touch devices', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile/touch project only');

  test('swipes: last case → /work/, page scrolls, pull-down at top → home', async ({ page }) => {
    const swipe = (/** @type {number} */ from, /** @type {number} */ to) =>
      page.evaluate(([a, b]) => {
        const t = (y) => new Touch({ identifier: 1, target: document.body, clientX: 180, clientY: y });
        const ev = (type, y, active) =>
          document.body.dispatchEvent(new TouchEvent(type, { touches: active ? [t(y)] : [], changedTouches: [t(y)], bubbles: true, cancelable: true }));
        ev('touchstart', a, true);
        ev('touchmove', b, true);
        ev('touchend', b, false);
      }, [from, to]);

    await toLastCase(page, () => swipe(600, 300));
    await page.waitForTimeout(700);
    await swipe(600, 300);
    await page.waitForURL('**/work/', { timeout: 10_000 });

    expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).toBe('auto');
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.evaluate(() => scrollTo(0, 600));
    await swipe(200, 500); // pull while scrolled: stays
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe('/work/');

    await page.evaluate(() => scrollTo(0, 0));
    await swipe(200, 400); // pull down at the top: back home
    await page.waitForURL((u) => u.pathname === '/', { timeout: 10_000 });
  });
});
