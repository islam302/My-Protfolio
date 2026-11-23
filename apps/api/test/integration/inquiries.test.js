// @ts-check
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, resetDb, makeApp, testConfig, validInquiry } from '../helpers/setup.js';
import { buildApp } from '../../src/app.js';

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
beforeEach(() => resetDb(db));

/** @param {unknown} payload @param {Record<string, string>} [headers] */
const post = (payload, headers = {}) => app.inject({ method: 'POST', url: '/api/v1/inquiries', payload: /** @type {any} */ (payload), headers });
const count = async () => Number((await db.query('SELECT count(*)::int AS n FROM inquiries')).rows[0].n);

describe('POST /api/v1/inquiries', () => {
  test('201 stores the inquiry and returns id + createdAt only', async () => {
    const res = await post(validInquiry(), { 'user-agent': 'TestBrowser/1.0' });
    assert.equal(res.statusCode, 201);
    const { data } = res.json();
    assert.deepEqual(Object.keys(data).sort(), ['createdAt', 'id']);
    assert.match(data.id, /^[0-9a-f-]{36}$/);
    assert.ok(!Number.isNaN(Date.parse(data.createdAt)));

    const { rows } = await db.query('SELECT * FROM inquiries WHERE id = $1', [data.id]);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.name, 'Ada Lovelace');
    assert.equal(row.project_type, 'web');
    assert.equal(row.budget, '$1,000 – $5,000');
    assert.equal(row.status, 'new');
    assert.equal(row.user_agent, 'TestBrowser/1.0');
    // IP stored only as an HMAC, never raw.
    assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(row).includes('127.0.0.1'));
  });

  test('optional budget/timeline may be omitted or empty', async () => {
    const a = await post(validInquiry({ budget: undefined, timeline: undefined }));
    const b = await post(validInquiry({ budget: '', timeline: '' }));
    assert.equal(a.statusCode, 201);
    assert.equal(b.statusCode, 201);
    const { rows } = await db.query('SELECT budget, timeline FROM inquiries');
    assert.deepEqual(rows, [{ budget: null, timeline: null }, { budget: null, timeline: null }]);
  });

  test('text is trimmed and control characters are stripped', async () => {
    const res = await post(validInquiry({ name: '  Ada\u0000 Lovelace\u0007  ', message: 'Hello there,\r\nI need a website for my business please.' }));
    assert.equal(res.statusCode, 201);
    const { rows } = await db.query('SELECT name, message FROM inquiries');
    assert.equal(rows[0].name, 'Ada Lovelace');
    assert.equal(rows[0].message, 'Hello there,\nI need a website for my business please.');
  });

  test('validation errors are 400 VALIDATION_ERROR with field details', async () => {
    const res = await post({ name: '', type: 'spaceship', message: 'too short', channel: 'fax' });
    assert.equal(res.statusCode, 400);
    const { error } = res.json();
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.ok(error.requestId);
    const fields = error.details.map((/** @type {any} */ d) => d.field);
    for (const f of ['name', 'type', 'message', 'channel']) assert.ok(fields.includes(f), `missing detail for ${f}`);
    assert.ok(error.details.every((/** @type {any} */ d) => d.in === 'body'));
    assert.equal(await count(), 0);
  });

  test('limits from @portfolio/validation are enforced', async () => {
    assert.equal((await post(validInquiry({ name: 'x'.repeat(81) }))).statusCode, 400);
    assert.equal((await post(validInquiry({ message: 'x'.repeat(2001) }))).statusCode, 400);
    assert.equal((await post(validInquiry({ budget: 'A million dollars' }))).statusCode, 400);
    assert.equal((await post(validInquiry({ name: 42 }))).statusCode, 400);
    assert.equal(await count(), 0);
  });

  test('mass assignment: unknown keys are rejected', async () => {
    for (const extra of [{ status: 'replied' }, { notes: 'x' }, { id: '00000000-0000-4000-8000-000000000000' }, { ip_hash: 'x' }, { createdAt: '2020-01-01' }]) {
      const res = await post({ ...validInquiry(), ...extra });
      assert.equal(res.statusCode, 400, JSON.stringify(extra));
      assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    }
    assert.equal(await count(), 0);
  });

  test('prototype pollution payloads are rejected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/inquiries',
      headers: { 'content-type': 'application/json' },
      payload: `{"name":"A","type":"web","message":"${'m'.repeat(30)}","channel":"email","__proto__":{"admin":true}}`,
    });
    assert.equal(res.statusCode, 400);
    assert.equal(/** @type {any} */ ({}).admin, undefined);
  });

  test('honeypot: filled website gets a 201 with a fake id and nothing is stored', async () => {
    const res = await post(validInquiry({ website: 'http://spam.example' }));
    assert.equal(res.statusCode, 201);
    const { data } = res.json();
    assert.match(data.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(!Number.isNaN(Date.parse(data.createdAt)));
    assert.equal(await count(), 0);

    // Even an otherwise invalid bot submission gets the same answer.
    const junk = await post({ website: 'x', spam: true });
    assert.equal(junk.statusCode, 201);
    assert.equal(await count(), 0);
  });

  test('honeypot: empty website is a normal submission', async () => {
    const res = await post(validInquiry({ website: '' }));
    assert.equal(res.statusCode, 201);
    assert.equal(await count(), 1);
  });

  test('415 for non-JSON bodies', async () => {
    for (const [type, payload] of [
      ['text/plain', 'hello'],
      ['application/x-www-form-urlencoded', 'name=a&type=web'],
      ['multipart/form-data; boundary=x', '--x--'],
    ]) {
      const res = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': type }, payload });
      assert.equal(res.statusCode, 415, type);
      assert.equal(res.json().error.code, 'UNSUPPORTED_MEDIA_TYPE');
    }
  });

  test('413 over 16 KiB', async () => {
    const res = await post({ ...validInquiry(), message: 'x'.repeat(17 * 1024) });
    assert.equal(res.statusCode, 413);
    assert.equal(res.json().error.code, 'PAYLOAD_TOO_LARGE');
  });

  test('malformed JSON and empty bodies are 400', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'application/json' }, payload: '{"name":' });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'VALIDATION_ERROR');
    const empty = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'application/json' }, payload: '' });
    assert.equal(empty.statusCode, 400);
    const array = await post([validInquiry()]);
    assert.equal(array.statusCode, 400);
  });

  test('SQL-injection-shaped input is stored literally', async () => {
    const evil = "Robert'); DROP TABLE inquiries;--";
    const res = await post(validInquiry({ name: evil, message: `${evil} ${"' OR 1=1 --".repeat(3)}` }));
    assert.equal(res.statusCode, 201);
    const { rows } = await db.query('SELECT name FROM inquiries');
    assert.equal(rows[0].name, evil);
  });

  test('error responses never include stack traces or SQL', async () => {
    /** @type {import('../../src/db/types.js').Database} */
    const failing = {
      ...db,
      query: async () => {
        throw Object.assign(new Error('duplicate key value violates unique constraint "inquiries_pkey" INSERT INTO inquiries'), { code: '23505' });
      },
    };
    const prod = testConfig({}, { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@localhost/x', PUBLIC_ORIGIN: 'https://islambadran.com' });
    for (const config of [testConfig(), prod]) {
      const broken = await buildApp({ config, db: failing, logger: false });
      const res = await broken.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry() });
      assert.equal(res.statusCode, 500);
      const body = res.json();
      assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message', 'requestId']);
      assert.equal(body.error.code, 'INTERNAL');
      assert.equal(body.error.message, 'Internal server error');
      assert.ok(!/INSERT|constraint|at .*\.js|stack/i.test(res.body));
      await broken.close();
    }
  });
});

describe('inquiry rate limit', () => {
  test('5 per window per IP, then 429 RATE_LIMITED with Retry-After', async () => {
    const limited = await makeApp({ db, config: testConfig({ rateLimits: { inquiry: { max: 5, timeWindow: 600_000 } } }) });
    for (let i = 0; i < 5; i++) {
      const ok = await limited.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry() });
      assert.equal(ok.statusCode, 201, `request ${i + 1}`);
    }
    const res = await limited.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry() });
    assert.equal(res.statusCode, 429);
    assert.equal(res.json().error.code, 'RATE_LIMITED');
    assert.ok(Number(res.headers['retry-after']) > 0);
    assert.equal(await count(), 5);

    // Another IP is unaffected; health is never limited.
    const other = await limited.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry(), remoteAddress: '203.0.113.9' });
    assert.equal(other.statusCode, 201);
    assert.equal((await limited.inject('/api/health')).statusCode, 200);
    await limited.close();
  });

  test('the global limit stacks on top', async () => {
    const limited = await makeApp({ db, config: testConfig({ rateLimits: { global: { max: 2, timeWindow: 60_000 } } }) });
    assert.equal((await limited.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry() })).statusCode, 201);
    assert.equal((await limited.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry() })).statusCode, 201);
    assert.equal((await limited.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry() })).statusCode, 429);
    await limited.close();
  });
});
