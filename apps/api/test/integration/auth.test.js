// @ts-check
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestDb,
  resetDb,
  makeApp,
  testConfig,
  testClock,
  createAdmin,
  login,
  loginRequest,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PUBLIC_ORIGIN,
} from '../helpers/setup.js';
import { hashToken } from '../../src/lib/tokens.js';
import { upsertAdmin, AdminExistsError } from '../../src/services/admins.js';

/** @type {import('../../src/db/types.js').Database} */
let db;
/** @type {import('fastify').FastifyInstance} */
let app;

before(async () => {
  db = await createTestDb();
  app = await makeApp({ db });
});
after(async () => {
  await app.close();
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
  await createAdmin(db);
});

const sessionCount = async () => Number((await db.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n);

describe('login', () => {
  test('200 sets an HttpOnly SameSite=Strict cookie and returns admin + csrfToken', async () => {
    const res = await loginRequest(app);
    assert.equal(res.statusCode, 200);
    const { data } = res.json();
    assert.equal(data.admin.email, ADMIN_EMAIL);
    assert.match(data.admin.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(Object.keys(data.admin).sort(), ['email', 'id']);
    assert.ok(data.csrfToken.length >= 32);

    const cookie = res.cookies.find((c) => c.name === 'pf_session');
    assert.ok(cookie);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Strict');
    assert.equal(cookie.path, '/');
    assert.equal(cookie.maxAge, 8 * 3600);
    assert.match(cookie.value, /^[A-Za-z0-9_-]{43}$/);

    // Only the SHA-256 of the token is stored.
    const { rows } = await db.query('SELECT token_hash, ip FROM sessions');
    assert.equal(rows.length, 1);
    assert.deepEqual(Buffer.from(rows[0].token_hash), hashToken(cookie.value));
    assert.match(rows[0].ip, /^[0-9a-f]{64}$/);

    const admin = await db.query('SELECT last_login_at FROM admins');
    assert.ok(admin.rows[0].last_login_at);
  });

  test('email is case-insensitive', async () => {
    const res = await loginRequest(app, { email: ADMIN_EMAIL.toUpperCase() });
    assert.equal(res.statusCode, 200);
  });

  test('production cookie is __Host- prefixed and Secure', async () => {
    const config = testConfig({}, { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@localhost/x', PUBLIC_ORIGIN });
    const prod = await makeApp({ db, config });
    const res = await loginRequest(prod);
    assert.equal(res.statusCode, 200);
    const cookie = res.cookies.find((c) => c.name === '__Host-pf_session');
    assert.ok(cookie);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.domain, undefined);
    await prod.close();
  });

  test('wrong password and unknown email give identical 401 responses', async () => {
    const wrong = await loginRequest(app, { password: 'not the right password' });
    const unknown = await loginRequest(app, { email: 'nobody@example.com' });
    assert.equal(wrong.statusCode, 401);
    assert.equal(unknown.statusCode, 401);
    const strip = (/** @type {any} */ b) => ({ ...b.error, requestId: undefined });
    assert.deepEqual(strip(wrong.json()), strip(unknown.json()));
    assert.deepEqual(strip(wrong.json()), { code: 'UNAUTHENTICATED', message: 'Invalid email or password', requestId: undefined });
    assert.equal(wrong.headers['set-cookie'], undefined);
    assert.equal(unknown.headers['set-cookie'], undefined);
    assert.equal(await sessionCount(), 0);
  });

  test('validation: bad email / missing password / extra keys are 400', async () => {
    for (const payload of [{ email: 'not-an-email', password: 'x' }, { email: ADMIN_EMAIL }, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, admin: true }]) {
      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload });
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    }
  });

  test('login rotates: the previous session for that cookie is deleted', async () => {
    const first = await login(app);
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, cookies: first.cookies });
    assert.equal(res.statusCode, 200);
    const second = res.cookies.find((c) => c.name === 'pf_session');
    assert.ok(second && second.value !== first.token);
    assert.equal(await sessionCount(), 1);
    const old = await app.inject({ url: '/api/v1/admin/auth/me', cookies: first.cookies });
    assert.equal(old.statusCode, 401);
  });

  test('cross-site Origin on login is rejected', async () => {
    const res = await loginRequest(app, { headers: { origin: 'https://evil.example' } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'CSRF_FAILED');
    assert.equal((await loginRequest(app, { headers: { origin: PUBLIC_ORIGIN } })).statusCode, 200);
  });

  test('lockout after 10 consecutive failures for 15 minutes, with a uniform 401', async () => {
    const clock = testClock();
    const locked = await makeApp({ db, clock });
    for (let i = 0; i < 10; i++) {
      assert.equal((await loginRequest(locked, { password: `wrong password ${i}` })).statusCode, 401);
    }
    // Correct password is now refused with the very same response.
    const res = await loginRequest(locked);
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.message, 'Invalid email or password');
    const { rows } = await db.query('SELECT locked_until FROM admins');
    assert.ok(new Date(rows[0].locked_until) > clock.now());
    const audit = await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'auth.lockout'");
    assert.equal(audit.rows[0].n, 1);

    clock.advance(14 * 60_000);
    assert.equal((await loginRequest(locked)).statusCode, 401);
    clock.advance(2 * 60_000);
    assert.equal((await loginRequest(locked)).statusCode, 200);
    const after = await db.query('SELECT failed_attempts, locked_until FROM admins');
    assert.deepEqual(after.rows[0], { failed_attempts: 0, locked_until: null });
    await locked.close();
  });

  test('a success resets the failure counter', async () => {
    for (let i = 0; i < 9; i++) await loginRequest(app, { password: 'wrong wrong wrong' });
    assert.equal((await loginRequest(app)).statusCode, 200);
    for (let i = 0; i < 9; i++) await loginRequest(app, { password: 'wrong wrong wrong' });
    assert.equal((await loginRequest(app)).statusCode, 200);
  });

  test('login rate limit: 5 per window per IP then 429', async () => {
    const limited = await makeApp({ db, config: testConfig({ rateLimits: { login: { max: 5, timeWindow: 15 * 60_000 } } }) });
    for (let i = 0; i < 5; i++) assert.equal((await loginRequest(limited, { password: 'wrong wrong wrong' })).statusCode, 401);
    const res = await loginRequest(limited);
    assert.equal(res.statusCode, 429);
    assert.equal(res.json().error.code, 'RATE_LIMITED');
    assert.ok(Number(res.headers['retry-after']) > 0);
    await limited.close();
  });
});

describe('session', () => {
  test('GET /me returns the admin and the CSRF token', async () => {
    const s = await login(app);
    const res = await app.inject({ url: '/api/v1/admin/auth/me', cookies: s.cookies });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().data, { admin: { id: res.json().data.admin.id, email: ADMIN_EMAIL }, csrfToken: s.csrfToken });
  });

  test('GET /me without or with a bogus cookie is 401', async () => {
    assert.equal((await app.inject('/api/v1/admin/auth/me')).statusCode, 401);
    const bogus = await app.inject({ url: '/api/v1/admin/auth/me', cookies: { pf_session: 'x'.repeat(43) } });
    assert.equal(bogus.statusCode, 401);
    assert.equal(bogus.json().error.code, 'UNAUTHENTICATED');
    assert.ok(String(bogus.headers['set-cookie']).includes('pf_session=;'), 'stale cookie is cleared');
  });

  test('idle timeout: 30 minutes without activity ends the session', async () => {
    const clock = testClock();
    const timed = await makeApp({ db, clock });
    const s = await login(timed);
    clock.advance(29 * 60_000);
    assert.equal((await timed.inject({ url: '/api/v1/admin/auth/me', cookies: s.cookies })).statusCode, 200, 'activity refreshes last_seen_at');
    clock.advance(29 * 60_000);
    assert.equal((await timed.inject({ url: '/api/v1/admin/auth/me', cookies: s.cookies })).statusCode, 200);
    clock.advance(31 * 60_000);
    assert.equal((await timed.inject({ url: '/api/v1/admin/auth/me', cookies: s.cookies })).statusCode, 401);
    assert.equal(await sessionCount(), 0, 'expired session is deleted lazily');
    await timed.close();
  });

  test('absolute timeout: 8 hours even with constant activity', async () => {
    const clock = testClock();
    const timed = await makeApp({ db, clock });
    const s = await login(timed);
    for (let i = 0; i < 16; i++) {
      clock.advance(29 * 60_000); // 16 * 29 min = 7h44m
      assert.equal((await timed.inject({ url: '/api/v1/admin/auth/me', cookies: s.cookies })).statusCode, 200, `step ${i}`);
    }
    clock.advance(20 * 60_000); // 8h04m
    assert.equal((await timed.inject({ url: '/api/v1/admin/auth/me', cookies: s.cookies })).statusCode, 401);
    await timed.close();
  });

  test('logout deletes the session and clears the cookie; the old cookie is useless', async () => {
    const s = await login(app);
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/logout', cookies: s.cookies, headers: s.mutate });
    assert.equal(res.statusCode, 204);
    assert.equal(res.body, '');
    const cleared = res.cookies.find((c) => c.name === 'pf_session');
    assert.ok(cleared && cleared.value === '');
    assert.equal(await sessionCount(), 0);
    assert.equal((await app.inject({ url: '/api/v1/admin/auth/me', cookies: s.cookies })).statusCode, 401);
    const audit = await db.query("SELECT action FROM audit_log WHERE action LIKE 'auth.%' ORDER BY id");
    assert.deepEqual(audit.rows.map((r) => r.action), ['auth.login', 'auth.logout']);
  });

  test('logout with no body and no Content-Type (admin UI) is accepted', async () => {
    const s = await login(app);
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/logout', cookies: s.cookies, headers: { 'x-csrf-token': s.csrfToken } });
    assert.equal(res.headers['content-type'], undefined);
    assert.equal(res.statusCode, 204);
    assert.equal(await sessionCount(), 0);
  });

  test('logout with Content-Type: application/json and an empty body is accepted', async () => {
    const s = await login(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/logout',
      cookies: s.cookies,
      headers: { ...s.mutate, 'content-type': 'application/json' },
      payload: '',
    });
    assert.equal(res.statusCode, 204);
  });

  test('logout requires the CSRF token', async () => {
    const s = await login(app);
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/logout', cookies: s.cookies });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'CSRF_FAILED');
    assert.equal(await sessionCount(), 1);
  });

  test('logout without a session is 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/logout' });
    assert.equal(res.statusCode, 401);
  });
});

describe('admin CLI service (upsertAdmin)', () => {
  test('creates, refuses duplicates, and --reset changes password, clears lockout and revokes sessions', async () => {
    await assert.rejects(createAdmin(db), AdminExistsError);
    await assert.rejects(createAdmin(db, ADMIN_EMAIL.toUpperCase()), AdminExistsError);

    await login(app);
    await db.query("UPDATE admins SET failed_attempts = 7, locked_until = now() + interval '1 hour'");
    const res = await upsertAdmin(db, { email: ADMIN_EMAIL, password: 'a brand new password', reset: true, scrypt: { N: 1024, r: 8, p: 1 } });
    assert.equal(res.action, 'reset');
    assert.equal(res.sessionsRevoked, 1);
    assert.equal(await sessionCount(), 0);
    const { rows } = await db.query('SELECT failed_attempts, locked_until FROM admins');
    assert.deepEqual(rows[0], { failed_attempts: 0, locked_until: null });
    assert.equal((await loginRequest(app)).statusCode, 401);
    assert.equal((await loginRequest(app, { password: 'a brand new password' })).statusCode, 200);
  });

  test('enforces the minimum password length and a valid email', async () => {
    await assert.rejects(upsertAdmin(db, { email: 'new@example.com', password: 'short' }), /at least 12/);
    await assert.rejects(upsertAdmin(db, { email: 'not an email', password: 'long enough password' }), (err) => /** @type {any} */ (err).name === 'ZodError');
  });

  test('stores a scrypt hash, never the password', async () => {
    const { rows } = await db.query('SELECT password_hash FROM admins');
    assert.match(rows[0].password_hash, /^scrypt\$/);
    assert.ok(!rows[0].password_hash.includes(ADMIN_PASSWORD));
  });
});
