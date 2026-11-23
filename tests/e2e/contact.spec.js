// @ts-check
/** /contact/ brief form: validation messages, WhatsApp hand-off, email hand-off, ?type= preselect. */
import { test, expect } from './support/helpers.js';

/** Replace window.open with a recorder. `ret` = 'window' (normal) or 'null' (popup blocked). */
const stubOpen = (page, ret = 'window') =>
  page.addInitScript((r) => {
    // @ts-ignore
    window.__opened = [];
    window.open = (url, target, features) => {
      // @ts-ignore
      window.__opened.push({ url: String(url), target, features });
      return r === 'null' ? null : /** @type {any} */ ({ opener: 'stub', closed: false, focus() {} });
    };
  }, ret);

const opened = (page) => page.evaluate(() => /** @type {any} */ (window).__opened);

async function fillValid(page, { type = 'mobile', budget = true } = {}) {
  await page.locator('#f-name').fill('  Sara Ahmed ');
  await page.locator('#f-type').selectOption(type);
  if (budget) {
    await page.locator('#f-budget').selectOption({ index: 2 });
    await page.locator('#f-timeline').selectOption({ index: 1 });
  }
  await page.locator('#f-message').fill('We need an app for booking & payments — Arabic + English. 100% offline?');
}

test.describe('contact form validation', () => {
  test('empty submit shows a message per required field and focuses the first', async ({ page }) => {
    await stubOpen(page);
    await page.goto('/contact/');
    const wa = page.getByRole('button', { name: /Send on WhatsApp/ });
    await expect(wa).toBeVisible(); // revealed by JS
    await wa.click();
    await expect(page.locator('#f-name-err')).toHaveText('Please add your name.');
    await expect(page.locator('#f-type-err')).toHaveText('Please choose a project type.');
    await expect(page.locator('#f-message-err')).toHaveText('Please add a few words about the project.');
    await expect(page.locator('#f-budget-err')).toBeHidden();
    await expect(page.locator('.pg-form__status')).toHaveText('Please check 3 fields above.');
    await expect(page.locator('#f-name')).toBeFocused();
    for (const id of ['f-name', 'f-type', 'f-message']) await expect(page.locator(`#${id}`)).toHaveAttribute('aria-invalid', 'true');
    expect(await opened(page)).toEqual([]);
  });

  test('too-short message reports the character count; fixing it clears the error live', async ({ page }) => {
    await stubOpen(page);
    await page.goto('/contact/');
    await page.locator('#f-name').fill('Sara');
    await page.locator('#f-type').selectOption('web');
    await page.locator('#f-message').fill('Hi there');
    // Blur first: see the known-bug test below (blur-time error shifts the button under the pointer).
    await page.locator('#f-message').blur();
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
    await expect(page.locator('#f-message-err')).toHaveText('A little more detail helps: at least 20 characters (you have 8).');
    await expect(page.locator('.pg-form__status')).toHaveText('Please check one field above.');
    await expect(page.locator('#f-message')).toBeFocused();
    await page.locator('#f-message').pressSequentially(' — a longer brief now');
    await expect(page.locator('#f-message-err')).toBeHidden();
    await expect(page.locator('#f-message')).toHaveAttribute('aria-invalid', 'false');
    expect(await opened(page)).toEqual([]);
  });

  test('KNOWN BUG QA-01: first click on Send while the textarea is focused and invalid is swallowed', async ({ page }) => {
    test.info().annotations.push({ type: 'issue', description: 'QA-01 (pre-existing in original): blur shows the inline error, the layout shifts, mouseup lands outside the button, so no submit/status/focus. Remove test.fail() once fixed.' });
    test.fail();
    await stubOpen(page);
    await page.goto('/contact/');
    await page.locator('#f-name').fill('Sara');
    await page.locator('#f-type').selectOption('web');
    await page.locator('#f-message').fill('Hi there'); // focus stays in the textarea
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
    await expect(page.locator('.pg-form__status')).toHaveText('Please check one field above.', { timeout: 2_000 });
  });

  test('project type select is required on its own', async ({ page }) => {
    await stubOpen(page);
    await page.goto('/contact/');
    await page.locator('#f-name').fill('Sara');
    await page.locator('#f-message').fill('A sufficiently long project description.');
    await page.getByRole('button', { name: 'Send by email' }).click();
    await expect(page.locator('#f-type-err')).toHaveText('Please choose a project type.');
    await expect(page.locator('#f-type')).toBeFocused();
    await expect(page.locator('#f-name-err')).toBeHidden();
  });

  test('error descriptions are wired to the fields (aria-describedby)', async ({ page }) => {
    await page.goto('/contact/');
    for (const id of ['f-name', 'f-type', 'f-message']) {
      await expect(page.locator(`#${id}`)).toHaveAttribute('aria-describedby', new RegExp(`${id}-err`));
    }
    await expect(page.locator('.pg-form__status')).toHaveAttribute('role', 'status');
  });
});

test.describe('contact hand-off', () => {
  test('WhatsApp: opens wa.me with the encoded brief', async ({ page, pageErrors }) => {
    await stubOpen(page);
    await page.goto('/contact/');
    await fillValid(page);
    const typeText = await page.locator('#f-type option:checked').textContent();
    const budgetText = await page.locator('#f-budget option:checked').textContent();
    const timelineText = await page.locator('#f-timeline option:checked').textContent();
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();

    const calls = await opened(page);
    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBe('_blank');
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe('https://wa.me/201013919821');
    const text = /** @type {string} */ (url.searchParams.get('text'));
    expect(text).toBe(
      [
        'Hi Islam, I’d like to discuss a project.',
        '',
        'Name: Sara Ahmed',
        `Project type: ${typeText}`,
        `Budget: ${budgetText}`,
        `Timeline: ${timelineText}`,
        '',
        'We need an app for booking & payments — Arabic + English. 100% offline?',
      ].join('\n'),
    );
    // Raw query is percent-encoded (no bare &, +, %, newlines).
    const raw = calls[0].url.split('?text=')[1];
    expect(raw).not.toMatch(/[\n &+]/);
    expect(raw).toContain('%0A');
    expect(raw).toContain('%26');

    const status = page.locator('.pg-form__status');
    await expect(status).toContainText('Opening WhatsApp with your brief.');
    await expect(status.locator('a')).toHaveAttribute('href', calls[0].url);
    await expect(status.locator('a')).toHaveAttribute('target', '_blank');
    pageErrors.assertClean();
  });

  test('WhatsApp popup blocked: status offers a direct link', async ({ page }) => {
    await stubOpen(page, 'null');
    await page.goto('/contact/');
    await fillValid(page, { budget: false });
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
    const status = page.locator('.pg-form__status');
    await expect(status).toContainText('Your browser blocked the new tab.');
    await expect(status.getByRole('link', { name: 'Open WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/201013919821\?text=/);
    const href = await status.locator('a').getAttribute('href');
    const text = new URL(/** @type {string} */ (href)).searchParams.get('text');
    expect(text).not.toContain('Budget:');
    expect(text).not.toContain('Timeline:');
  });

  test('email: navigates to mailto: with subject + body', async ({ page }) => {
    await stubOpen(page);
    await page.goto('/contact/');
    await fillValid(page);
    const typeText = await page.locator('#f-type option:checked').textContent();
    // Capture the mailto: navigation (Chromium hands external protocols to the OS; we record the assignment).
    const mailto = page.waitForRequest((r) => r.url().startsWith('mailto:'), { timeout: 3_000 }).then((r) => r.url()).catch(() => null);
    await page.getByRole('button', { name: 'Send by email' }).click();
    const status = page.locator('.pg-form__status');
    await expect(status).toContainText('Opening your email app with the brief filled in.');
    const href = /** @type {string} */ (await status.getByRole('link', { name: 'Try this link' }).getAttribute('href'));
    const navUrl = await mailto;
    if (navUrl) expect(navUrl).toBe(href);
    expect(href.startsWith('mailto:admin@etqanpp.com?')).toBe(true);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('subject')).toBe(`Project brief: ${typeText}`);
    expect(params.get('body')).toContain('Name: Sara Ahmed');
    expect(params.get('body')).toContain('booking & payments');
    expect(href).not.toContain('+'); // encodeURIComponent, spaces as %20 for mail clients
    expect(await opened(page)).toEqual([]);
    await expect(page).toHaveURL(/\/contact\/$/); // page stays put
  });

  test('?type=mobile preselects the project type; unknown types are ignored', async ({ page }) => {
    await page.goto('/contact/?type=mobile#brief');
    await expect(page.locator('#f-type')).toHaveValue('mobile');
    await page.goto('/contact/?type=%3Cscript%3E');
    await expect(page.locator('#f-type')).toHaveValue('');
  });

  test('services page "start" links preselect their type', async ({ page }) => {
    await page.goto('/services/');
    const link = page.locator('a[href="/contact/?type=ai#brief"]').first();
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page).toHaveURL(/\/contact\/\?type=ai#brief$/);
    await expect(page.locator('#f-type')).toHaveValue('ai');
  });

  test('channel cards link to WhatsApp, email, Instagram, LinkedIn and Facebook', async ({ page }) => {
    await page.goto('/contact/');
    await expect(page.locator('.pg-channel--whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/201013919821/);
    await expect(page.locator('.pg-channel--whatsapp .pg-channel__num')).toHaveText(['+20 101 391 9821', '+20 150 585 8198']);
    await expect(page.locator('.pg-channel--email')).toHaveAttribute('href', /^mailto:admin@etqanpp\.com\?subject=Project%20enquiry$/);
    await expect(page.locator('.pg-channel--instagram')).toHaveAttribute('href', 'https://www.instagram.com/islam__badran/');
    await expect(page.locator('.pg-channel--linkedin')).toHaveAttribute('href', 'https://www.linkedin.com/in/islam-badran-39a577225/');
    await expect(page.locator('.pg-channel--facebook')).toHaveAttribute('href', 'https://www.facebook.com/profile.php?id=61591731281871');
    for (const c of ['linkedin', 'facebook']) {
      await expect(page.locator(`.pg-channel--${c}`)).toHaveAttribute('rel', 'noopener');
      await expect(page.locator(`.site-footer a[href*="${c}.com"]`)).toHaveCount(1);
    }
  });

  test('without JavaScript the form falls back to its mailto: action', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await ctx.newPage();
    await page.goto('/contact/');
    await expect(page.locator('#brief-form')).toHaveAttribute('action', /^mailto:admin@etqanpp\.com/);
    await expect(page.getByRole('button', { name: /Send on WhatsApp/ })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Send by email' })).toBeVisible();
    await ctx.close();
  });
});

test('default build (no PUBLIC_API_URL) has no API wiring and never calls /api', async ({ page }) => {
  await stubOpen(page);
  /** @type {string[]} */ const api = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api')) api.push(r.url()); });
  await page.goto('/contact/');
  await expect(page.locator('#brief-form')).not.toHaveAttribute('data-api', /.*/);
  await expect(page.locator('input[name="website"]')).toHaveCount(0);
  await expect(page.locator('.pg-brief-intro')).toContainText('The form doesn’t store anything');
  await fillValid(page);
  await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
  await expect(page.locator('.pg-form__status')).toContainText('Opening WhatsApp');
  expect(api).toEqual([]);
});
