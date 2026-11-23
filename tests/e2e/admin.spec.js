// @ts-check
/**
 * Admin panel (apps/admin, served at /admin/) against a stateful in-test mock of the admin API
 * from docs/API_CONTRACT.md. No real API/database is involved: see tests/e2e/fullstack (lead) for that.
 */
import { existsSync } from 'node:fs';
import { test, expect } from './support/helpers.js';

const ADMIN = /** @type {string} */ (process.env.PW_ADMIN_URL);
const HAS_ADMIN = existsSync('apps/admin/dist/index.html') || existsSync('apps/admin/scripts/build.mjs');
test.skip(!HAS_ADMIN, 'apps/admin not built yet (no apps/admin/dist/index.html or build script)');
test.use({ baseURL: ADMIN });

const CSRF = 'csrf-test-token-0123456789abcdef';
const ADMIN_USER = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test' };
// Test-only credentials for the mock; never a real account.
const EMAIL = 'owner@example.test';
const PASSWORD = 'mock-password-for-tests';

const XSS_NAME = '<img src=x onerror="window.__xss=1">Mallory';
const XSS_MSG = '<script>window.__xss=2</script><b>bold?</b> & "quotes"';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const seed = () => [
  { id: uuid(1), name: 'Sara Ahmed', type: 'mobile', budget: '$1,000 – $5,000', timeline: null, message: 'Booking app for clinics, Arabic + English.', channel: 'whatsapp', status: 'new', notes: null, createdAt: '2026-11-20T10:00:00.000Z', updatedAt: '2026-11-20T10:00:00.000Z' },
  { id: uuid(2), name: XSS_NAME, type: 'web', budget: null, timeline: 'As soon as possible', message: XSS_MSG, channel: 'email', status: 'read', notes: 'called back', createdAt: '2026-11-19T09:00:00.000Z', updatedAt: '2026-11-19T12:00:00.000Z' },
  { id: uuid(3), name: 'Omar', type: 'ai', budget: null, timeline: null, message: 'An AI agent for support tickets please.', channel: 'whatsapp', status: 'replied', notes: null, createdAt: '2026-11-18T08:00:00.000Z', updatedAt: '2026-11-18T08:00:00.000Z' },
];

/**
 * Install a stateful mock of /api/v1/admin/**. Returns the state for assertions.
 * @param {import('@playwright/test').Page} page
 */
async function mockAdminApi(page, { loggedIn = false } = {}) {
  const state = { session: loggedIn, inquiries: seed(), calls: /** @type {{method:string,path:string,headers:Record<string,string>,body:any}[]} */ ([]), forceListStatus: 0 };
  const json = (route, status, body, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'X-Request-Id': 'req-test', ...headers }, body: body === null ? '' : JSON.stringify(body) });
  const err = (route, status, code, message) => json(route, status, { error: { code, message, requestId: 'req-test' } });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    const headers = req.headers();
    let body;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    state.calls.push({ method, path, headers, body });

    const mutating = method !== 'GET' && method !== 'HEAD';
    if (path === '/v1/admin/auth/login' && method === 'POST') {
      if (body?.email === EMAIL && body?.password === PASSWORD) {
        state.session = true;
        return json(route, 200, { data: { admin: ADMIN_USER, csrfToken: CSRF } });
      }
      return err(route, 401, 'UNAUTHENTICATED', 'Invalid email or password');
    }
    if (!state.session) return err(route, 401, 'UNAUTHENTICATED', 'Not signed in');
    if (mutating && headers['x-csrf-token'] !== CSRF) return err(route, 403, 'CSRF_FAILED', 'CSRF token missing or invalid');

    if (path === '/v1/admin/auth/me' && method === 'GET') return json(route, 200, { data: { admin: ADMIN_USER, csrfToken: CSRF } });
    if (path === '/v1/admin/auth/logout' && method === 'POST') { state.session = false; return route.fulfill({ status: 204, body: '' }); }
    if (path === '/v1/admin/inquiries' && method === 'GET') {
      if (state.forceListStatus) return err(route, state.forceListStatus, state.forceListStatus === 401 ? 'UNAUTHENTICATED' : 'INTERNAL', 'x');
      const p = url.searchParams;
      let rows = state.inquiries.slice();
      if (p.get('status')) rows = rows.filter((r) => r.status === p.get('status'));
      if (p.get('type')) rows = rows.filter((r) => r.type === p.get('type'));
      if (p.get('q')) rows = rows.filter((r) => (r.name + r.message).toLowerCase().includes(/** @type {string} */ (p.get('q')).toLowerCase()));
      rows.sort((a, b) => (p.get('sort') === 'createdAt' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
      const page = Number(p.get('page') || 1);
      const pageSize = Number(p.get('pageSize') || 20);
      const total = rows.length;
      return json(route, 200, { data: rows.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
    }
    const m = path.match(/^\/v1\/admin\/inquiries\/([^/]+)$/);
    if (m) {
      const i = state.inquiries.findIndex((r) => r.id === decodeURIComponent(m[1]));
      if (i < 0) return err(route, 404, 'NOT_FOUND', 'Not found');
      if (method === 'GET') return json(route, 200, { data: state.inquiries[i] });
      if (method === 'PATCH') {
        state.inquiries[i] = { ...state.inquiries[i], ...body, updatedAt: '2026-11-23T12:00:00.000Z' };
        return json(route, 200, { data: state.inquiries[i] });
      }
      if (method === 'DELETE') { state.inquiries.splice(i, 1); return route.fulfill({ status: 204, body: '' }); }
    }
    return err(route, 404, 'NOT_FOUND', `unmocked ${method} ${path}`);
  });
  return state;
}

async function signIn(page) {
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('admin auth', () => {
  test('no session → login form; bad password → uniform error; good → inquiry list', async ({ page }) => {
    const api = await mockAdminApi(page);
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.locator('#list-view')).toBeHidden();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#login-error')).toHaveText('Invalid email or password.');
    await expect(page.getByLabel('Password')).toHaveValue('');

    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Inquiries' })).toBeVisible();
    await expect(page.locator('#user-email')).toHaveText(EMAIL);
    await expect(page.locator('#rows tr')).toHaveCount(3);
    await expect(page.locator('#list-status')).toHaveText('Showing 1–3 of 3 inquiries.');
    const login = api.calls.find((c) => c.path === '/v1/admin/auth/login' && c.body?.password === PASSWORD);
    expect(login?.headers['content-type']).toContain('application/json');
    // The password is never put in the URL.
    expect(page.url()).not.toContain(PASSWORD);
  });

  test('client-side checks before calling the API', async ({ page }) => {
    const api = await mockAdminApi(page);
    await page.goto('/admin/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#login-error')).toHaveText('Enter your email address.');
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#login-error')).toHaveText('Enter your password.');
    expect(api.calls.filter((c) => c.path.endsWith('/login'))).toHaveLength(0);
  });

  test('429 on login shows the retry time', async ({ page }) => {
    await mockAdminApi(page);
    await page.route('**/api/v1/admin/auth/login', (r) => r.fulfill({ status: 429, headers: { 'Retry-After': '600' }, contentType: 'application/json', body: '{"error":{"code":"RATE_LIMITED","message":"x"}}' }));
    await page.goto('/admin/');
    await signIn(page);
    await expect(page.locator('#login-error')).toHaveText('Too many sign-in attempts. Try again in 10 minutes.');
  });

  test('a 401 mid-session returns to the login form', async ({ page }) => {
    const api = await mockAdminApi(page, { loggedIn: true });
    await page.goto('/admin/');
    await expect(page.locator('#rows tr')).toHaveCount(3);
    api.forceListStatus = 401;
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.locator('#login-note')).toHaveText('Your session has ended. Please sign in again.');
    await expect(page.locator('#rows tr')).toHaveCount(0); // data cleared from the DOM
  });

  test('logout sends CSRF token and returns to login', async ({ page }) => {
    const api = await mockAdminApi(page);
    await page.goto('/admin/');
    await signIn(page);
    await expect(page.locator('#rows tr')).toHaveCount(3);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.locator('#login-note')).toHaveText('You are signed out.');
    const out = api.calls.find((c) => c.path === '/v1/admin/auth/logout');
    expect(out?.headers['x-csrf-token']).toBe(CSRF);
  });
});

test.describe('admin inquiries', () => {
  test('list → detail → status change (PATCH with CSRF) → delete (DELETE with CSRF)', async ({ page }) => {
    const api = await mockAdminApi(page);
    await page.goto('/admin/');
    await signIn(page);
    await expect(page.locator('#rows tr')).toHaveCount(3);

    await page.getByRole('button', { name: 'Sara Ahmed', exact: true }).click();
    const dlg = page.locator('#detail');
    await expect(dlg).toBeVisible();
    await expect(page.locator('#detail-title')).toHaveText('Sara Ahmed');
    await expect(page.locator('#detail-message')).toHaveText('Booking app for clinics, Arabic + English.');
    await expect(page.locator('#detail-meta')).toContainText('Mobile app');
    await expect(page.locator('#detail-meta')).toContainText('Not given'); // timeline null

    await page.getByLabel('Status').last().selectOption('replied');
    await page.getByLabel(/Notes/).fill('Sent proposal');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#detail-status')).toHaveText('Saved.');
    const patch = api.calls.find((c) => c.method === 'PATCH');
    expect(patch?.path).toBe(`/v1/admin/inquiries/${uuid(1)}`);
    expect(patch?.body).toEqual({ status: 'replied', notes: 'Sent proposal' });
    expect(patch?.headers['x-csrf-token']).toBe(CSRF);
    expect(patch?.headers['content-type']).toContain('application/json');
    await expect(page.locator('#rows tr').first().locator('.adm-pill')).toHaveText('Replied');

    // Save without changes does not call the API.
    const before = api.calls.length;
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#detail-status')).toHaveText('Nothing to save: no changes.');
    expect(api.calls.length).toBe(before);

    await page.getByRole('button', { name: 'Delete…' }).click();
    const confirm = page.locator('#confirm');
    await expect(confirm).toBeVisible();
    await expect(page.locator('#confirm-cancel')).toBeFocused(); // safe default
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dlg).toBeHidden();
    await expect(page.locator('#rows tr')).toHaveCount(2);
    await expect(page.locator('#list-status')).toContainText('Inquiry from Sara Ahmed deleted.');
    const del = api.calls.find((c) => c.method === 'DELETE');
    expect(del?.path).toBe(`/v1/admin/inquiries/${uuid(1)}`);
    expect(del?.headers['x-csrf-token']).toBe(CSRF);
  });

  test('cancel delete keeps the inquiry', async ({ page }) => {
    const api = await mockAdminApi(page, { loggedIn: true });
    await page.goto('/admin/');
    await page.getByRole('button', { name: 'Omar', exact: true }).click();
    await page.getByRole('button', { name: 'Delete…' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#confirm')).toBeHidden();
    await expect(page.locator('#detail')).toBeVisible();
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  test('every mutating request carries X-CSRF-Token; GETs do not need it', async ({ page }) => {
    const api = await mockAdminApi(page, { loggedIn: true });
    await page.goto('/admin/');
    await page.getByRole('button', { name: 'Omar', exact: true }).click();
    await page.getByLabel('Status').last().selectOption('archived');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#detail-status')).toHaveText('Saved.');
    const mutating = api.calls.filter((c) => !['GET', 'HEAD'].includes(c.method) && !c.path.endsWith('/login'));
    expect(mutating.length).toBeGreaterThan(0);
    for (const c of mutating) expect(c.headers['x-csrf-token'], `${c.method} ${c.path}`).toBe(CSRF);
    // Token is not leaked into URLs or storage.
    for (const c of api.calls) expect(c.path).not.toContain(CSRF);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
    expect(stored).not.toContain(CSRF);
  });

  test('XSS payloads in name/message render as text, never as HTML', async ({ page }) => {
    await mockAdminApi(page, { loggedIn: true });
    /** @type {string[]} */ const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    await page.goto('/admin/');
    const nameBtn = page.getByRole('button', { name: XSS_NAME, exact: true });
    await expect(nameBtn).toBeVisible();
    await expect(nameBtn).toHaveText(XSS_NAME);
    await nameBtn.click();
    await expect(page.locator('#detail-title')).toHaveText(XSS_NAME);
    await expect(page.locator('#detail-message')).toHaveText(XSS_MSG);
    // No element was created from the payload.
    expect(await page.locator('#rows img, #detail img, #detail-message b, #detail script').count()).toBe(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  test('filters are sent as query parameters and kept in the URL', async ({ page }) => {
    const api = await mockAdminApi(page, { loggedIn: true });
    await page.goto('/admin/');
    await expect(page.locator('#rows tr')).toHaveCount(3);
    await page.locator('#f-status').selectOption('read');
    await expect(page.locator('#rows tr')).toHaveCount(1);
    await expect(page).toHaveURL(/[?&]status=read/);
    const last = api.calls.filter((c) => c.path === '/v1/admin/inquiries').at(-1);
    expect(last).toBeTruthy();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.locator('#rows tr')).toHaveCount(3);
    await page.locator('#f-q').fill('zzz-no-match');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('#empty')).toHaveText('No inquiries match these filters.');
  });

  test('deep link with filters restores them', async ({ page }) => {
    await mockAdminApi(page, { loggedIn: true });
    await page.goto('/admin/?type=ai&sort=createdAt');
    await expect(page.locator('#f-type')).toHaveValue('ai');
    await expect(page.locator('#f-sort')).toHaveValue('createdAt');
    await expect(page.locator('#rows tr')).toHaveCount(1);
  });

  test('server error on list shows a retry, which recovers', async ({ page }) => {
    const api = await mockAdminApi(page, { loggedIn: true });
    api.forceListStatus = 500;
    await page.goto('/admin/');
    await expect(page.locator('#list-error')).toBeVisible();
    await expect(page.locator('#list-error-text')).toContainText('error 500');
    api.forceListStatus = 0;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('#rows tr')).toHaveCount(3);
    await expect(page.locator('#list-error')).toBeHidden();
  });

  test('detail dialog closes with Escape and returns focus to the opener', async ({ page }) => {
    await mockAdminApi(page, { loggedIn: true });
    await page.goto('/admin/');
    const opener = page.getByRole('button', { name: 'Omar', exact: true });
    await opener.click();
    await expect(page.locator('#detail-title')).toHaveText('Omar');
    await page.keyboard.press('Escape');
    await expect(page.locator('#detail')).toBeHidden();
    await expect(opener).toBeFocused();
  });
});
