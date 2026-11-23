// @ts-check
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, makeApp, testConfig } from '../helpers/setup.js';
import { buildApp } from '../../src/app.js';

/** @type {import('../../src/db/types.js').Database} */
let db;
before(async () => {
  db = await createTestDb();
});
after(async () => {
  await db.close();
});

describe('health', () => {
  test('GET /api/health is ok and not rate limited', async () => {
    const app = await makeApp({ db, config: testConfig({ rateLimits: { global: { max: 1, timeWindow: 60_000 } } }) });
    for (let i = 0; i < 3; i++) {
      const res = await app.inject('/api/health');
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { data: { status: 'ok' } });
      assert.equal(res.headers['x-ratelimit-limit'], undefined);
    }
    await app.close();
  });

  test('GET /api/health/ready pings the database', async () => {
    const app = await makeApp({ db });
    const res = await app.inject('/api/health/ready');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { data: { status: 'ok' } });
    await app.close();
  });

  test('readiness is 503 when the database fails, without leaking the error', async () => {
    /** @type {import('../../src/db/types.js').Database} */
    const broken = {
      ...db,
      query: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password authentication failed');
      },
    };
    const app = await buildApp({ config: testConfig(), db: broken, logger: false });
    const res = await app.inject('/api/health/ready');
    assert.equal(res.statusCode, 503);
    const body = res.json();
    assert.equal(body.error.code, 'UNAVAILABLE');
    assert.ok(body.error.requestId);
    assert.ok(!res.body.includes('ECONNREFUSED'));
    assert.ok(!res.body.includes('password'));
    await app.close();
  });
});

describe('cross-cutting behaviour', () => {
  test('every response carries X-Request-Id; safe upstream ids are reused, unsafe ones replaced', async () => {
    const app = await makeApp({ db });
    const a = await app.inject('/api/health');
    assert.match(String(a.headers['x-request-id']), /^[0-9a-f-]{36}$/);

    const b = await app.inject({ url: '/api/health', headers: { 'x-request-id': 'nginx-abc-12345' } });
    assert.equal(b.headers['x-request-id'], 'nginx-abc-12345');

    const c = await app.inject({ url: '/api/health', headers: { 'x-request-id': 'bad id\nINJECTED log line' } });
    assert.match(String(c.headers['x-request-id']), /^[0-9a-f-]{36}$/);

    const d = await app.inject('/nope');
    assert.ok(d.headers['x-request-id']);
    assert.equal(d.json().error.requestId, d.headers['x-request-id']);
    await app.close();
  });

  test('security headers are present', async () => {
    const app = await makeApp({ db });
    const res = await app.inject('/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(String(res.headers['content-security-policy']), /default-src 'none'/);
    assert.match(String(res.headers['content-security-policy']), /frame-ancestors 'none'/);
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['x-powered-by'], undefined);
    await app.close();
  });

  test('HSTS only in production', async () => {
    const prodConfig = testConfig(
      {},
      { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@localhost/x', PUBLIC_ORIGIN: 'https://islambadran.com' },
    );
    const app = await makeApp({ db, config: prodConfig });
    const res = await app.inject('/api/health');
    assert.match(String(res.headers['strict-transport-security']), /max-age=31536000/);
    await app.close();
  });

  test('unknown routes give a JSON 404 envelope', async () => {
    const app = await makeApp({ db });
    for (const url of ['/nope', '/api/v1/unknown', '/api/v1/admin/nope']) {
      const res = await app.inject(url);
      assert.equal(res.statusCode, 404, url);
      assert.match(String(res.headers['content-type']), /application\/json/);
      assert.equal(res.json().error.code, 'NOT_FOUND');
    }
    await app.close();
  });

  test('CORS is closed by default and opt-in via CORS_ORIGINS', async () => {
    const closed = await makeApp({ db });
    const a = await closed.inject({ url: '/api/health', headers: { origin: 'https://evil.example' } });
    assert.equal(a.headers['access-control-allow-origin'], undefined);
    await closed.close();

    const open = await makeApp({ db, config: testConfig({}, { CORS_ORIGINS: 'http://localhost:5173' }) });
    const b = await open.inject({ url: '/api/health', headers: { origin: 'http://localhost:5173' } });
    assert.equal(b.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(b.headers['access-control-allow-credentials'], 'true');
    const c = await open.inject({ url: '/api/health', headers: { origin: 'https://evil.example' } });
    assert.equal(c.headers['access-control-allow-origin'], undefined);
    await open.close();
  });

  test('TRUST_PROXY controls whether X-Forwarded-For is believed (rate-limit key)', async () => {
    const rl = { rateLimits: { global: { max: 1, timeWindow: 60_000 } } };
    const noProxy = await makeApp({ db, config: testConfig(rl) });
    const r1 = await noProxy.inject({ url: '/nope', headers: { 'x-forwarded-for': '198.51.100.1' } });
    const r2 = await noProxy.inject({ url: '/nope', headers: { 'x-forwarded-for': '198.51.100.2' } });
    assert.equal(r1.statusCode, 404);
    assert.equal(r2.statusCode, 429, 'spoofed XFF must not reset the limit without TRUST_PROXY');
    await noProxy.close();

    const proxied = await makeApp({ db, config: testConfig({ ...rl, trustProxy: 1 }) });
    const p1 = await proxied.inject({ url: '/nope', headers: { 'x-forwarded-for': '198.51.100.1' } });
    const p2 = await proxied.inject({ url: '/nope', headers: { 'x-forwarded-for': '198.51.100.2' } });
    assert.equal(p1.statusCode, 404);
    assert.equal(p2.statusCode, 404, 'behind a trusted proxy each client IP has its own bucket');
    await proxied.close();
  });
});

describe('OpenAPI docs', () => {
  test('served at /api/docs and /api/docs/json outside production, describing every route', async () => {
    const app = await makeApp({ db });
    const json = await app.inject('/api/docs/json');
    assert.equal(json.statusCode, 200);
    const spec = json.json();
    assert.equal(spec.openapi, '3.0.3');
    for (const p of ['/api/health', '/api/health/ready', '/api/v1/inquiries', '/api/v1/admin/auth/login', '/api/v1/admin/auth/logout', '/api/v1/admin/auth/me', '/api/v1/admin/inquiries', '/api/v1/admin/inquiries/{id}']) {
      assert.ok(spec.paths[p], `missing ${p}`);
    }
    const body = spec.paths['/api/v1/inquiries'].post.requestBody.content['application/json'].schema;
    assert.equal(body.additionalProperties, false);
    assert.ok(body.properties.name && body.properties.website);
    assert.ok(spec.paths['/api/v1/admin/inquiries/{id}'].patch);
    assert.ok(spec.paths['/api/v1/admin/inquiries/{id}'].delete);

    const ui = await app.inject('/api/docs/');
    assert.equal(ui.statusCode, 200);
    assert.match(String(ui.headers['content-type']), /text\/html/);
    await app.close();
  });

  test('disabled in production unless API_DOCS=true', async () => {
    const env = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@localhost/x', PUBLIC_ORIGIN: 'https://islambadran.com' };
    const off = await makeApp({ db, config: testConfig({}, env) });
    assert.equal((await off.inject('/api/docs/json')).statusCode, 404);
    await off.close();
    const on = await makeApp({ db, config: testConfig({}, { ...env, API_DOCS: 'true' }) });
    assert.equal((await on.inject('/api/docs/json')).statusCode, 200);
    await on.close();
  });
});
