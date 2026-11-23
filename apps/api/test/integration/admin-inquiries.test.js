// @ts-check
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, resetDb, makeApp, testConfig, createAdmin, login, seedInquiries, PUBLIC_ORIGIN } from '../helpers/setup.js';

/** @type {import('../../src/db/types.js').Database} */
let db;
/** @type {import('fastify').FastifyInstance} */
let app;
/** @type {Awaited<ReturnType<typeof login>>} */
let s;

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
  s = await login(app);
});

const MISSING = '00000000-0000-4000-8000-000000000000';
const base = '/api/v1/admin/inquiries';

/** @param {string} url */
const get = (url) => app.inject({ url, cookies: s.cookies });

describe('authorization', () => {
  test('every admin route requires a session (401), before validation', async () => {
    const [id] = await seedInquiries(db, [{}]);
    const routes = [
      { method: 'GET', url: '/api/v1/admin/auth/me' },
      { method: 'POST', url: '/api/v1/admin/auth/logout' },
      { method: 'GET', url: base },
      { method: 'GET', url: `${base}?page=-1&evil=1` },
      { method: 'GET', url: `${base}/${id}` },
      { method: 'GET', url: `${base}/not-a-uuid` },
      { method: 'PATCH', url: `${base}/${id}`, payload: { status: 'read' } },
      { method: 'PATCH', url: `${base}/${id}`, payload: { junk: true } },
      { method: 'DELETE', url: `${base}/${id}` },
    ];
    for (const r of routes) {
      const res = await app.inject(/** @type {any} */ ({ ...r, headers: { 'x-csrf-token': s.csrfToken } }));
      assert.equal(res.statusCode, 401, `${r.method} ${r.url}`);
      assert.equal(res.json().error.code, 'UNAUTHENTICATED');
    }
    const { rows } = await db.query('SELECT status FROM inquiries');
    assert.equal(rows[0].status, 'new');
  });
});

describe('admin + global limit ordering', () => {
  test('unauthenticated floods hit the global limiter (which runs before the session lookup)', async () => {
    const limited = await makeApp({ db, config: testConfig({ rateLimits: { global: { max: 2, timeWindow: 60_000 } } }) });
    assert.equal((await limited.inject(base)).statusCode, 401);
    assert.equal((await limited.inject(base)).statusCode, 401);
    const res = await limited.inject(base);
    assert.equal(res.statusCode, 429);
    await limited.close();
  });
});

describe('GET /admin/inquiries', () => {
  test('lists with pagination meta, newest first, never exposing ip_hash/user_agent', async () => {
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    await seedInquiries(db, Array.from({ length: 25 }, (_, i) => ({ name: `N${i}`, createdAt: new Date(t0 + i * 60_000) })));
    await db.query("UPDATE inquiries SET ip_hash = 'deadbeef', user_agent = 'UA-secret'");

    const p1 = await get(`${base}?pageSize=10`);
    assert.equal(p1.statusCode, 200);
    const body = p1.json();
    assert.deepEqual(body.meta, { page: 1, pageSize: 10, total: 25, totalPages: 3 });
    assert.equal(body.data.length, 10);
    assert.equal(body.data[0].name, 'N24');
    assert.deepEqual(Object.keys(body.data[0]).sort(), ['budget', 'channel', 'createdAt', 'id', 'message', 'name', 'notes', 'status', 'timeline', 'type', 'updatedAt']);
    assert.ok(!p1.body.includes('deadbeef') && !p1.body.includes('UA-secret'));

    const p3 = (await get(`${base}?pageSize=10&page=3`)).json();
    assert.equal(p3.data.length, 5);
    assert.equal(p3.data[4].name, 'N0');

    const beyond = (await get(`${base}?page=9`)).json();
    assert.deepEqual(beyond.data, []);
    assert.equal(beyond.meta.total, 25);

    const asc = (await get(`${base}?sort=createdAt&pageSize=1`)).json();
    assert.equal(asc.data[0].name, 'N0');

    const dflt = (await get(base)).json();
    assert.equal(dflt.meta.pageSize, 20);
  });

  test('filters by status and type', async () => {
    await seedInquiries(db, [
      { type: 'web', status: 'new' },
      { type: 'mobile', status: 'new' },
      { type: 'web', status: 'archived' },
    ]);
    assert.equal((await get(`${base}?status=new`)).json().meta.total, 2);
    assert.equal((await get(`${base}?type=web`)).json().meta.total, 2);
    assert.equal((await get(`${base}?type=web&status=archived`)).json().meta.total, 1);
  });

  test('q searches name and message case-insensitively, wildcards literal', async () => {
    await seedInquiries(db, [
      { name: 'Grace Hopper', message: 'Compilers are the future of programming.' },
      { name: 'Alan', message: 'We need 100% uptime on the new_service please.' },
      { name: 'Linus', message: 'A kernel project with a long description here.' },
    ]);
    assert.equal((await get(`${base}?q=grace`)).json().meta.total, 1);
    assert.equal((await get(`${base}?q=COMPILERS`)).json().meta.total, 1);
    assert.equal((await get(`${base}?q=${encodeURIComponent('100%')}`)).json().meta.total, 1);
    assert.equal((await get(`${base}?q=%25`)).json().meta.total, 1, '% matches only a literal percent');
    assert.equal((await get(`${base}?q=_`)).json().meta.total, 1, '_ matches only a literal underscore');
    assert.equal((await get(`${base}?q=${encodeURIComponent('\\')}`)).json().meta.total, 0);
    assert.equal((await get(`${base}?q=nomatch`)).json().meta.total, 0);
  });

  test('SQL-injection-shaped q is harmless', async () => {
    await seedInquiries(db, [{}, {}]);
    for (const q of ["' OR '1'='1", "'; DROP TABLE inquiries; --", '%\') OR 1=1 --', 'x\' UNION SELECT password_hash FROM admins --']) {
      const res = await get(`${base}?q=${encodeURIComponent(q)}`);
      assert.equal(res.statusCode, 200, q);
      assert.equal(res.json().meta.total, 0, q);
    }
    assert.equal((await db.query('SELECT count(*)::int AS n FROM inquiries')).rows[0].n, 2);
  });

  test('invalid query parameters are 400', async () => {
    for (const qs of ['page=0', 'pageSize=101', 'status=deleted', 'type=x', 'sort=name', 'sort=created_at;DROP', 'unknown=1', `q=${'x'.repeat(101)}`]) {
      const res = await get(`${base}?${qs}`);
      assert.equal(res.statusCode, 400, qs);
      assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    }
  });
});

describe('GET /admin/inquiries/:id', () => {
  test('200 for an existing inquiry', async () => {
    const [id] = await seedInquiries(db, [{ name: 'Found' }]);
    const res = await get(`${base}/${id}`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.id, id);
    assert.equal(res.json().data.name, 'Found');
    assert.equal(res.json().data.notes, null);
  });

  test('404 for a missing id, 400 for a non-uuid / injection-shaped id', async () => {
    const missing = await get(`${base}/${MISSING}`);
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'NOT_FOUND');
    for (const id of ['123', "1' OR '1'='1", encodeURIComponent("00000000-0000-4000-8000-000000000000' OR 1=1--")]) {
      const res = await get(`${base}/${id}`);
      assert.equal(res.statusCode, 400, id);
      assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    }
  });
});

describe('PATCH /admin/inquiries/:id', () => {
  /** @param {string} id @param {unknown} payload @param {Record<string, string>} [headers] */
  const patch = (id, payload, headers = s.mutate) => app.inject({ method: 'PATCH', url: `${base}/${id}`, cookies: s.cookies, headers, payload: /** @type {any} */ (payload) });

  test('updates status/notes, bumps updatedAt and writes audit_log', async () => {
    const [id] = await seedInquiries(db, [{ createdAt: new Date('2026-01-01T00:00:00Z') }]);
    const res = await patch(id, { status: 'replied', notes: 'Called back on Monday.' });
    assert.equal(res.statusCode, 200);
    const { data } = res.json();
    assert.equal(data.status, 'replied');
    assert.equal(data.notes, 'Called back on Monday.');
    assert.ok(Date.parse(data.updatedAt) > Date.parse(data.createdAt));

    const { rows } = await db.query("SELECT admin_id, action, entity, entity_id, meta FROM audit_log WHERE action = 'inquiry.update'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entity, 'inquiry');
    assert.equal(rows[0].entity_id, id);
    assert.ok(rows[0].admin_id);
    assert.deepEqual(rows[0].meta, { changes: { status: { from: 'new', to: 'replied' }, notes: { changed: true } } });
    assert.ok(!JSON.stringify(rows[0].meta).includes('Monday'), 'note text is not copied into the audit log');
  });

  test('notes can be cleared with null or ""', async () => {
    const [id] = await seedInquiries(db, [{}]);
    await patch(id, { notes: 'temp' });
    assert.equal((await patch(id, { notes: '' })).json().data.notes, null);
    await patch(id, { notes: 'temp' });
    assert.equal((await patch(id, { notes: null })).json().data.notes, null);
  });

  test('validation: empty body, bad status, too-long notes, mass assignment', async () => {
    const [id] = await seedInquiries(db, [{}]);
    for (const payload of [{}, { status: 'deleted' }, { notes: 'x'.repeat(4001) }, { status: 'read', name: 'hacked' }, { status: 'read', createdAt: '2000-01-01' }, { ip_hash: 'x' }]) {
      const res = await patch(id, payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    }
    const { rows } = await db.query('SELECT name, status FROM inquiries');
    assert.deepEqual(rows[0], { name: 'Seed', status: 'new' });
  });

  test('404 for a missing inquiry', async () => {
    const res = await patch(MISSING, { status: 'read' });
    assert.equal(res.statusCode, 404);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM audit_log WHERE entity_id = $1', [MISSING])).rows[0].n, 0);
  });

  test('CSRF: missing or wrong token is 403 and nothing changes', async () => {
    const [id] = await seedInquiries(db, [{}]);
    for (const headers of [{}, { origin: PUBLIC_ORIGIN }, { 'x-csrf-token': 'wrong', origin: PUBLIC_ORIGIN }, { 'x-csrf-token': '' }]) {
      const res = await patch(id, { status: 'read' }, /** @type {Record<string, string>} */ (headers));
      assert.equal(res.statusCode, 403, JSON.stringify(headers));
      assert.equal(res.json().error.code, 'CSRF_FAILED');
    }
    assert.equal((await db.query('SELECT status FROM inquiries')).rows[0].status, 'new');
  });

  test("CSRF: another session's token is rejected", async () => {
    const [id] = await seedInquiries(db, [{}]);
    const other = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email: 'admin@example.com', password: 'correct horse battery staple' } });
    const otherToken = other.json().data.csrfToken;
    const res = await patch(id, { status: 'read' }, { 'x-csrf-token': otherToken });
    assert.equal(res.statusCode, 403);
  });

  test('bad Origin is 403 even with a valid token; no Origin is allowed', async () => {
    const [id] = await seedInquiries(db, [{}]);
    for (const origin of ['https://evil.example', 'null', 'http://localhost:4321.evil.example']) {
      const res = await patch(id, { status: 'read' }, { 'x-csrf-token': s.csrfToken, origin });
      assert.equal(res.statusCode, 403, origin);
      assert.equal(res.json().error.code, 'CSRF_FAILED');
    }
    assert.equal((await patch(id, { status: 'read' }, { 'x-csrf-token': s.csrfToken })).statusCode, 200);
  });

  test('GET is not subject to CSRF', async () => {
    const res = await app.inject({ url: base, cookies: s.cookies, headers: { origin: 'https://evil.example' } });
    assert.equal(res.statusCode, 200);
  });

  test('415 for non-JSON PATCH bodies', async () => {
    const [id] = await seedInquiries(db, [{}]);
    const res = await app.inject({ method: 'PATCH', url: `${base}/${id}`, cookies: s.cookies, headers: { ...s.mutate, 'content-type': 'text/plain' }, payload: 'status=read' });
    assert.equal(res.statusCode, 415);
  });
});

describe('DELETE /admin/inquiries/:id', () => {
  /** @param {string} id @param {Record<string, string>} [headers] */
  const del = (id, headers = s.mutate) => app.inject({ method: 'DELETE', url: `${base}/${id}`, cookies: s.cookies, headers });

  test('204, removes the row and writes audit_log', async () => {
    const [id, keep] = await seedInquiries(db, [{}, {}]);
    const res = await del(id);
    assert.equal(res.statusCode, 204);
    assert.equal(res.body, '');
    const { rows } = await db.query('SELECT id FROM inquiries');
    assert.deepEqual(rows.map((r) => r.id), [keep]);
    const audit = await db.query("SELECT entity_id FROM audit_log WHERE action = 'inquiry.delete'");
    assert.deepEqual(audit.rows.map((r) => r.entity_id), [id]);
    assert.equal((await del(id)).statusCode, 404, 'second delete is 404');
  });

  test('CSRF required', async () => {
    const [id] = await seedInquiries(db, [{}]);
    assert.equal((await del(id, {})).statusCode, 403);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM inquiries')).rows[0].n, 1);
  });

  test('400 for a non-uuid id', async () => {
    assert.equal((await del('nope')).statusCode, 400);
  });
});

describe('admin rate limit', () => {
  test('per session, then 429', async () => {
    const limited = await makeApp({ db, config: testConfig({ rateLimits: { admin: { max: 3, timeWindow: 60_000 } } }) });
    const session = await login(limited);
    for (let i = 0; i < 3; i++) assert.equal((await limited.inject({ url: base, cookies: session.cookies })).statusCode, 200);
    const res = await limited.inject({ url: base, cookies: session.cookies });
    assert.equal(res.statusCode, 429);
    assert.equal(res.json().error.code, 'RATE_LIMITED');
    assert.ok(res.headers['retry-after']);
    await limited.close();
  });
});
