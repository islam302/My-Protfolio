// @ts-check
/**
 * Contact form in API mode (apps/web built with PUBLIC_API_URL=/api, served by the `web-api`
 * webServer from tests/e2e/support/serve-api-mode.mjs). The API itself is mocked with page.route:
 * these tests check the browser side of the contract in docs/API_CONTRACT.md.
 */
import { test, expect } from './support/helpers.js';
import { inquiryCreateSchema } from '@portfolio/validation';

const API_WEB = /** @type {string} */ (process.env.PW_API_WEB_URL);
test.use({ baseURL: API_WEB });

let apiModePresent = false;
test.beforeAll(async ({ request }) => {
  const html = await request.get(`${API_WEB}/contact/`).then((r) => r.text()).catch(() => '');
  apiModePresent = /<form[^>]+id="brief-form"[^>]+data-api="\/api"/.test(html);
});
test.beforeEach(() => {
  test.skip(!apiModePresent, 'apps/web API mode not present: built /contact/ has no data-api (frontend change not merged yet)');
});

/** Record window.open and every fetch() (url + init) before the page scripts run. */
async function instrument(page, { popup = 'window' } = {}) {
  await page.addInitScript((popupRet) => {
    const w = /** @type {any} */ (window);
    w.__log = [];
    w.open = (url, target) => { w.__log.push({ kind: 'open', url: String(url), target }); return popupRet === 'null' ? null : { opener: 'stub' }; };
    const realFetch = w.fetch.bind(w);
    w.fetch = (input, init = {}) => {
      w.__log.push({ kind: 'fetch', url: String(input), method: init.method, keepalive: init.keepalive, credentials: init.credentials, headers: init.headers });
      return realFetch(input, init);
    };
  }, popup);
}
const log = (page) => page.evaluate(() => /** @type {any} */ (window).__log);

/** Mock POST /api/v1/inquiries; returns the captured requests. */
async function mockInquiries(page, respond = (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: '00000000-0000-4000-8000-000000000001', createdAt: new Date().toISOString() } }) })) {
  /** @type {import('@playwright/test').Request[]} */ const reqs = [];
  await page.route('**/api/v1/inquiries', async (route) => {
    reqs.push(route.request());
    await respond(route);
  });
  return reqs;
}

async function fillValid(page) {
  await page.locator('#f-name').fill('  Sara Ahmed ');
  await page.locator('#f-type').selectOption('mobile');
  await page.locator('#f-budget').selectOption('$1,000 – $5,000');
  await page.locator('#f-timeline').selectOption('Within 1–3 months');
  await page.locator('#f-message').fill('An app for booking & payments, Arabic + English. <b>bold</b>');
}

const EXPECTED = {
  name: 'Sara Ahmed',
  type: 'mobile',
  budget: '$1,000 – $5,000',
  timeline: 'Within 1–3 months',
  message: 'An app for booking & payments, Arabic + English. <b>bold</b>',
  website: '',
};

test.describe('API mode: markup', () => {
  test('form carries data-api and a hidden, untabbable honeypot', async ({ page }) => {
    await page.goto('/contact/');
    await expect(page.locator('#brief-form')).toHaveAttribute('data-api', '/api');
    const hp = page.locator('#brief-form input[name="website"]');
    await expect(hp).toHaveCount(1);
    await expect(hp).toHaveValue('');
    await expect(hp).toHaveAttribute('tabindex', '-1');
    await expect(hp).toHaveAttribute('autocomplete', 'off');
    // Not perceivable: inside an aria-hidden wrapper, clipped to <=1px, no accessible role exposed.
    expect(await hp.evaluate((el) => !!el.closest('[aria-hidden="true"]'))).toBe(true);
    const box = await hp.evaluate((el) => { const r = el.closest('div').getBoundingClientRect(); return { w: r.width, h: r.height }; });
    expect(box.w).toBeLessThanOrEqual(1);
    expect(box.h).toBeLessThanOrEqual(1);
    await expect(page.getByRole('textbox', { name: 'Leave this empty' })).toHaveCount(0);
    // Keyboard users never land on it.
    await page.locator('#f-name').focus();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.getAttribute('name'))).not.toBe('website');
    }
  });

  test('intro copy no longer claims the form stores nothing', async ({ page }) => {
    await page.goto('/contact/');
    await expect(page.locator('.pg-brief-intro')).not.toContainText('doesn’t store anything');
  });
});

test.describe('API mode: submit', () => {
  test('WhatsApp: POSTs the brief as JSON (keepalive, not awaited) then hands off', async ({ page }) => {
    await instrument(page);
    const reqs = await mockInquiries(page);
    await page.goto('/contact/');
    await fillValid(page);
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();

    await expect.poll(() => reqs.length).toBe(1);
    const req = reqs[0];
    expect(req.method()).toBe('POST');
    expect(req.headers()['content-type']).toContain('application/json');
    expect(new URL(req.url()).pathname).toBe('/api/v1/inquiries');
    const body = req.postDataJSON();
    expect(body).toEqual({ ...EXPECTED, channel: 'whatsapp' });
    // The payload satisfies the shared server schema (strict: no extra keys).
    const parsed = inquiryCreateSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);

    const calls = await log(page);
    const fetchIdx = calls.findIndex((c) => c.kind === 'fetch' && c.url.endsWith('/v1/inquiries'));
    const openIdx = calls.findIndex((c) => c.kind === 'open');
    expect(fetchIdx, 'fetch was called').toBeGreaterThanOrEqual(0);
    expect(openIdx, 'window.open was called').toBeGreaterThan(fetchIdx);
    expect(calls[fetchIdx].keepalive).toBe(true);
    expect(calls[fetchIdx].credentials).toBe('same-origin');
    expect(calls[openIdx].url).toMatch(/^https:\/\/wa\.me\/201505858198\?text=/);
    await expect(page.locator('.pg-form__status')).toContainText('Opening WhatsApp');
  });

  test('email channel is reported as "email"', async ({ page }) => {
    await instrument(page);
    const reqs = await mockInquiries(page);
    await page.goto('/contact/');
    await fillValid(page);
    await page.getByRole('button', { name: 'Send by email' }).click();
    await expect.poll(() => reqs.length).toBe(1);
    expect(reqs[0].postDataJSON()).toEqual({ ...EXPECTED, channel: 'email' });
    await expect(page.locator('.pg-form__status')).toContainText('Opening your email app');
  });

  for (const [name, respond] of /** @type {const} */ ([
    ['500', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'x', requestId: 'r' } }) })],
    ['429', (route) => route.fulfill({ status: 429, headers: { 'Retry-After': '600' }, contentType: 'application/json', body: '{"error":{"code":"RATE_LIMITED","message":"slow down"}}' })],
    ['network abort', (route) => route.abort('failed')],
  ])) {
    test(`API ${name}: WhatsApp hand-off still happens, no error shown to the visitor`, async ({ page }) => {
      await instrument(page);
      const reqs = await mockInquiries(page, respond);
      await page.goto('/contact/');
      await fillValid(page);
      await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
      await expect.poll(() => reqs.length).toBe(1);
      const opens = (await log(page)).filter((c) => c.kind === 'open');
      expect(opens).toHaveLength(1);
      await expect(page.locator('.pg-form__status')).toHaveText(/Opening WhatsApp with your brief/);
      await expect(page.locator('.pg-form__status')).not.toContainText(/error|fail/i);
    });
  }

  test('API that never answers does not delay the hand-off', async ({ page }) => {
    await instrument(page);
    await mockInquiries(page, () => new Promise(() => {})); // hang forever
    await page.goto('/contact/');
    await fillValid(page);
    const t0 = Date.now();
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
    await expect.poll(async () => (await log(page)).some((c) => c.kind === 'open'), { timeout: 2_000 }).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  test('invalid form sends nothing to the API', async ({ page }) => {
    await instrument(page);
    const reqs = await mockInquiries(page);
    await page.goto('/contact/');
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
    await expect(page.locator('.pg-form__status')).toHaveText('Please check 3 fields above.');
    await page.waitForTimeout(300);
    expect(reqs).toHaveLength(0);
  });

  test('identical re-submit (e.g. after a blocked pop-up) is stored once', async ({ page }) => {
    await instrument(page, { popup: 'null' });
    const reqs = await mockInquiries(page);
    await page.goto('/contact/');
    await fillValid(page);
    const btn = page.getByRole('button', { name: /Send on WhatsApp/ });
    await btn.click();
    await expect(page.locator('.pg-form__status')).toContainText('blocked');
    await btn.click();
    await page.waitForTimeout(300);
    expect(reqs).toHaveLength(1);
    expect((await log(page)).filter((c) => c.kind === 'open')).toHaveLength(2);
  });

  test('after a failed store, a re-submit retries', async ({ page }) => {
    await instrument(page);
    let n = 0;
    const reqs = await mockInquiries(page, (route) => (n++ === 0 ? route.fulfill({ status: 500, body: '{}' }) : route.fulfill({ status: 201, body: '{"data":{}}' })));
    await page.goto('/contact/');
    await fillValid(page);
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
    await expect.poll(() => reqs.length).toBe(1);
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
    await expect.poll(() => reqs.length).toBe(2);
  });

  test('a bot-filled honeypot is passed through for the server to drop', async ({ page }) => {
    await instrument(page);
    const reqs = await mockInquiries(page);
    await page.goto('/contact/');
    await fillValid(page);
    await page.locator('input[name="website"]').evaluate((/** @type {HTMLInputElement} */ el) => { el.value = 'http://spam.example'; });
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
    await expect.poll(() => reqs.length).toBe(1);
    expect(reqs[0].postDataJSON().website).toBe('http://spam.example');
    // Honeypot is never validated / never blocks the visitor.
    await expect(page.locator('.pg-form__status')).toContainText('Opening WhatsApp');
  });

  test('QA-02 regression: whitespace-padded fields are rejected in the browser like the API does', async ({ page }) => {
    test.info().annotations.push({ type: 'issue', description: 'QA-02 (fixed): minlength/required count raw characters; the API trims first. Brief is handed off but silently not stored (400).' });
    await instrument(page);
    const reqs = await mockInquiries(page);
    await page.goto('/contact/');
    await page.locator('#f-name').fill('   ');
    await page.locator('#f-type').selectOption('web');
    await page.locator('#f-message').fill('short' + ' '.repeat(20));
    await page.locator('#f-message').blur();
    await page.getByRole('button', { name: /Send on WhatsApp/ }).click();
    await page.waitForTimeout(300);
    // Either the browser blocks it (no request) or the request satisfies the schema.
    if (reqs.length) expect(inquiryCreateSchema.safeParse(reqs[0].postDataJSON()).success).toBe(true);
    else expect((await log(page)).filter((c) => c.kind === 'open')).toHaveLength(0);
  });
});
