#!/usr/bin/env node
// Phase C/E security PoCs against the API, LOCALHOST ONLY.
//
// The API is built in-process with buildApp() on an in-memory PGlite database and driven with
// app.inject() (no socket, no network). Nothing here touches an external host.
//
//   node tests/security/poc-api.mjs            # all checks
//   node tests/security/poc-api.mjs timing     # only the (slow) timing check
//
// Output: one line per check, "[PASS]" = control held, "[VULN]" = issue reproduced, "[INFO]" = measurement.
// Exit code is 0 either way: this is an evidence collector, not a gate (the gates are the regression tests).
import {
  createTestDb,
  resetDb,
  makeApp,
  testConfig,
  createAdmin,
  login,
  loginRequest,
  validInquiry,
  seedInquiries,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PUBLIC_ORIGIN,
} from '../../apps/api/test/helpers/setup.js';
import { upsertAdmin } from '../../apps/api/src/services/admins.js';
import { DEFAULT_SCRYPT } from '../../apps/api/src/lib/password.js';

const only = process.argv[2];
const results = [];
const out = (tag, id, msg) => {
  results.push({ tag, id });
  console.log(`[${tag}] ${id}: ${msg}`);
};
const check = (id, ok, msg) => out(ok ? 'PASS' : 'VULN', id, msg);
const short = (s, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);

const db = await createTestDb();

async function fresh(config = testConfig(), clock) {
  await resetDb(db);
  await createAdmin(db);
  return makeApp({ db, config, clock });
}

if (!only || only === 'core') {
  // ---------------------------------------------------------------- SQLi
  {
    const app = await fresh();
    const s = await login(app);
    await seedInquiries(db, [{ name: 'Alice' }, { name: 'Bob' }]);
    const payloads = ["' OR '1'='1", "%' OR 1=1 --", "'; DROP TABLE inquiries; --", "\\' OR 1=1 --", '%', '_', "' UNION SELECT password_hash FROM admins --"];
    let leaked = false;
    const codes = [];
    for (const q of payloads) {
      const r = await app.inject({ url: `/api/v1/admin/inquiries?q=${encodeURIComponent(q)}`, cookies: s.cookies });
      codes.push(r.statusCode);
      if (r.statusCode !== 200 || r.json().meta.total !== 0 || /scrypt\$/.test(r.body)) leaked = true;
    }
    const still = await db.query('SELECT count(*)::int AS n FROM inquiries');
    check('SQLI-q', !leaked && still.rows[0].n === 2, `q payloads -> statuses ${codes.join(',')}, every result total=0, table intact (${still.rows[0].n} rows)`);

    const idPayloads = ["1' OR '1'='1", '00000000-0000-0000-0000-000000000000\' OR 1=1--', '../../etc/passwd', '1;SELECT pg_sleep(5)'];
    const idCodes = [];
    for (const id of idPayloads) idCodes.push((await app.inject({ url: `/api/v1/admin/inquiries/${encodeURIComponent(id)}`, cookies: s.cookies })).statusCode);
    check('SQLI-id', idCodes.every((c) => c === 400 || c === 404), `id payloads -> ${idCodes.join(',')} (uuid schema rejects before SQL)`);

    const sortR = await app.inject({ url: '/api/v1/admin/inquiries?sort=created_at;DROP%20TABLE%20x', cookies: s.cookies });
    const pageR = await app.inject({ url: '/api/v1/admin/inquiries?pageSize=100000', cookies: s.cookies });
    check('SQLI-sort/page', sortR.statusCode === 400 && pageR.statusCode === 400, `sort injection -> ${sortR.statusCode}, pageSize=100000 -> ${pageR.statusCode}`);

    const body = await app.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry({ name: "Robert'); DROP TABLE inquiries;--", message: "' OR 1=1; -- a long enough message body here" }) });
    const stored = await db.query("SELECT name FROM inquiries WHERE name LIKE 'Robert%'");
    check('SQLI-body', body.statusCode === 201 && stored.rows.length === 1, `SQL in body stored literally (${body.statusCode}, name=${JSON.stringify(stored.rows[0]?.name)})`);
    await app.close();
  }

  // ---------------------------------------------------------------- body handling / prototype pollution
  {
    const app = await fresh();
    const big = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ ...validInquiry(), message: 'x'.repeat(17 * 1024) }) });
    const form = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'name=a' });
    const plain = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'text/plain' }, payload: JSON.stringify(validInquiry()) });
    const charset = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'application/json; charset=utf-16' }, payload: JSON.stringify(validInquiry()) });
    const malformed = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'application/json' }, payload: '{"name":' });
    const deep = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'application/json' }, payload: '['.repeat(5000) + ']'.repeat(5000) });
    const arr = await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'application/json' }, payload: '[1,2,3]' });
    const nul = await app.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry({ name: 'Nul\u0000Byte', message: 'contains a NUL \u0000 byte which Postgres text rejects' }) });
    const typed = await app.inject({ method: 'POST', url: '/api/v1/inquiries', payload: { ...validInquiry(), name: { $gt: '' } } });
    check(
      'BODY-odd',
      big.statusCode === 413 && form.statusCode === 415 && plain.statusCode === 415 && malformed.statusCode === 400 && deep.statusCode === 400 && arr.statusCode === 400 && typed.statusCode === 400 && nul.statusCode === 201 && charset.statusCode < 500,
      `17KiB->${big.statusCode}, form->${form.statusCode}, text/plain->${plain.statusCode}, json;charset=utf-16->${charset.statusCode}, malformed->${malformed.statusCode}, 5000-deep array->${deep.statusCode}, top-level array->${arr.statusCode}, object-typed field->${typed.statusCode}, NUL byte->${nul.statusCode} (stripped)`,
    );

    const protoBodies = ['{"__proto__":{"polluted":"yes"},"name":"a"}', '{"constructor":{"prototype":{"polluted":"yes"}}}', '{"name":"x","nested":{"__proto__":{"polluted":1}}}'];
    const pc = [];
    for (const p of protoBodies) pc.push((await app.inject({ method: 'POST', url: '/api/v1/inquiries', headers: { 'content-type': 'application/json' }, payload: p })).statusCode);
    const s = await login(app);
    const q1 = await app.inject({ url: '/api/v1/admin/inquiries?__proto__[polluted]=yes', cookies: s.cookies });
    const q2 = await app.inject({ url: '/api/v1/admin/inquiries?constructor[prototype][polluted]=1', cookies: s.cookies });
    check('PROTO', pc.every((c) => c === 400) && q1.statusCode === 400 && q2.statusCode === 400 && ({}).polluted === undefined, `body proto keys -> ${pc.join(',')}, query proto keys -> ${q1.statusCode},${q2.statusCode}, Object.prototype.polluted=${({}).polluted}`);

    const mass = await app.inject({ method: 'POST', url: '/api/v1/inquiries', payload: { ...validInquiry(), status: 'archived', notes: 'x', ip_hash: 'x' } });
    const [id] = await seedInquiries(db, [{}]);
    const massPatch = await app.inject({ method: 'PATCH', url: `/api/v1/admin/inquiries/${id}`, cookies: s.cookies, headers: s.mutate, payload: { status: 'read', createdAt: '2000-01-01T00:00:00Z', id: '00000000-0000-4000-8000-000000000000' } });
    check('MASS-ASSIGN', mass.statusCode === 400 && massPatch.statusCode === 400, `create with status/notes/ip_hash -> ${mass.statusCode}; patch with createdAt/id -> ${massPatch.statusCode}`);
    await app.close();
  }

  // ---------------------------------------------------------------- exceptional conditions: DB CHECK vs JS length
  {
    const app = await fresh();
    // 10 astral-plane emoji = 20 UTF-16 code units (passes the JS min of 20) but only 10 code points
    // (fails the Postgres CHECK char_length(message) BETWEEN 20 AND 2000).
    const r = await app.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry({ message: '\u{1F600}'.repeat(10) }) });
    const leak = /char_length|inquiries_message_check|constraint|violates|pglite|postgres/i.test(r.body);
    check('EXC-astral', r.statusCode < 500 && !leak, `message of 10 emoji -> ${r.statusCode} ${short(r.body)}${leak ? ' (DB detail leaked!)' : ''}`);
    const nm = await app.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry({ name: '\u{1F600}'.repeat(40) }) });
    check('EXC-astral-name', nm.statusCode < 500, `name of 40 emoji (80 UTF-16 units) -> ${nm.statusCode}`);
    const s = await login(app);
    const [id] = await seedInquiries(db, [{}]);
    const notes = await app.inject({ method: 'PATCH', url: `/api/v1/admin/inquiries/${id}`, cookies: s.cookies, headers: s.mutate, payload: { notes: '\u{1F600}'.repeat(2000) } });
    check('EXC-astral-notes', notes.statusCode < 500, `notes of 2000 emoji (4000 UTF-16 units) -> ${notes.statusCode}`);
    await app.close();
  }

  // ---------------------------------------------------------------- error leakage
  {
    const app = await fresh(testConfig({}, { NODE_ENV: 'development' }));
    const probes = [
      ['GET', '/api/v1/admin/inquiries/not-a-uuid'],
      ['GET', '/api/does-not-exist'],
      ['GET', '/api/v1/admin/inquiries?page=abc'],
      ['POST', '/api/v1/admin/auth/login'],
      ['TRACE', '/api/health'],
    ];
    const leaks = [];
    for (const [method, url] of probes) {
      const r = await app.inject({ method, url, headers: { 'content-type': 'application/json' }, payload: method === 'POST' ? '{"email":' : undefined });
      if (/at \w+ \(|node_modules|\.js:\d+|stack|SELECT|syntax error/i.test(r.body)) leaks.push(`${method} ${url}`);
    }
    check('ERR-LEAK', leaks.length === 0, leaks.length ? `leaks in ${leaks.join('; ')}` : `${probes.length} malformed probes: generic envelopes only, no stack/SQL/paths`);
    await app.close();
  }

  // ---------------------------------------------------------------- auth: layer ordering, IDOR, unauth
  {
    const app = await fresh();
    const [id] = await seedInquiries(db, [{}]);
    const routes = [
      ['GET', '/api/v1/admin/inquiries'],
      ['GET', `/api/v1/admin/inquiries/${id}`],
      ['PATCH', `/api/v1/admin/inquiries/${id}`, { status: 'read' }],
      ['DELETE', `/api/v1/admin/inquiries/${id}`],
      ['GET', '/api/v1/admin/auth/me'],
      ['POST', '/api/v1/admin/auth/logout'],
    ];
    const codes = [];
    for (const [method, url, payload] of routes) codes.push((await app.inject({ method, url, payload })).statusCode);
    const forged = await app.inject({ url: '/api/v1/admin/inquiries', cookies: { pf_session: 'A'.repeat(43) } });
    const longTok = await app.inject({ url: '/api/v1/admin/inquiries', cookies: { pf_session: 'A'.repeat(5000) } });
    const otherName = await app.inject({ url: '/api/v1/admin/inquiries', cookies: { '__Host-pf_session': (await login(app)).token } });
    const methodOverride = await app.inject({ method: 'GET', url: `/api/v1/admin/inquiries/${id}`, headers: { 'x-http-method-override': 'DELETE' } });
    check(
      'AUTHZ',
      codes.every((c) => c === 401) && forged.statusCode === 401 && longTok.statusCode === 401 && otherName.statusCode === 401 && methodOverride.statusCode === 401,
      `unauth well-formed requests -> ${codes.join(',')}; forged token -> ${forged.statusCode}; 5000-char token -> ${longTok.statusCode}; dev app with __Host- cookie name -> ${otherName.statusCode}; method override -> ${methodOverride.statusCode}`,
    );
    const s = await login(app);
    const rnd = await app.inject({ url: '/api/v1/admin/inquiries/3f2504e0-4f89-41d3-9a0c-0305e82c3301', cookies: s.cookies });
    out('INFO', 'IDOR', `single-tenant admin model (all admins see all inquiries, documented); unknown uuid -> ${rnd.statusCode}; public API exposes no read endpoint for inquiries`);
    await app.close();
  }

  // ---------------------------------------------------------------- CSRF / Origin
  {
    const app = await fresh();
    const s = await login(app);
    const [id] = await seedInquiries(db, [{}]);
    const url = `/api/v1/admin/inquiries/${id}`;
    const noTok = await app.inject({ method: 'PATCH', url, cookies: s.cookies, headers: { origin: PUBLIC_ORIGIN }, payload: { status: 'read' } });
    const badTok = await app.inject({ method: 'PATCH', url, cookies: s.cookies, headers: { origin: PUBLIC_ORIGIN, 'x-csrf-token': 'x' }, payload: { status: 'read' } });
    const evil = await app.inject({ method: 'PATCH', url, cookies: s.cookies, headers: { origin: 'https://evil.example', 'x-csrf-token': s.csrfToken }, payload: { status: 'read' } });
    const nullO = await app.inject({ method: 'PATCH', url, cookies: s.cookies, headers: { origin: 'null', 'x-csrf-token': s.csrfToken }, payload: { status: 'read' } });
    const lookalike = await app.inject({ method: 'PATCH', url, cookies: s.cookies, headers: { origin: `${PUBLIC_ORIGIN}.evil.example`, 'x-csrf-token': s.csrfToken }, payload: { status: 'read' } });
    const textPlain = await app.inject({ method: 'PATCH', url, cookies: s.cookies, headers: { 'content-type': 'text/plain', 'x-csrf-token': s.csrfToken }, payload: '{"status":"read"}' });
    const logoutNoTok = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/logout', cookies: s.cookies });
    const loginEvil = await loginRequest(app, { headers: { origin: 'https://evil.example' } });
    const delNoTok = await app.inject({ method: 'DELETE', url, cookies: s.cookies });
    const other = await login(app);
    const crossSession = await app.inject({ method: 'PATCH', url, cookies: s.cookies, headers: { 'x-csrf-token': other.csrfToken }, payload: { status: 'read' } });
    check(
      'CSRF',
      [noTok, badTok, evil, nullO, lookalike, logoutNoTok, loginEvil, delNoTok, crossSession].every((r) => r.statusCode === 403) && textPlain.statusCode === 415,
      `no token ${noTok.statusCode}, wrong token ${badTok.statusCode}, evil Origin ${evil.statusCode}, Origin null ${nullO.statusCode}, look-alike Origin ${lookalike.statusCode}, other session's token ${crossSession.statusCode}, text/plain JSON ${textPlain.statusCode}, logout w/o token ${logoutNoTok.statusCode}, DELETE w/o token ${delNoTok.statusCode}, login from evil Origin ${loginEvil.statusCode}`,
    );
    const cookieHdr = (await loginRequest(app)).headers['set-cookie'];
    check('COOKIE', /HttpOnly/i.test(String(cookieHdr)) && /SameSite=Strict/i.test(String(cookieHdr)) && /Path=\//.test(String(cookieHdr)), `dev Set-Cookie: ${String(cookieHdr).replace(/=[A-Za-z0-9_-]{20,}/, '=<token>')}`);
    await app.close();
    const prod = await fresh(testConfig({}, { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' }));
    const pc = String((await loginRequest(prod)).headers['set-cookie']);
    check('COOKIE-prod', /^__Host-pf_session=/.test(pc) && /Secure/.test(pc) && !/Domain=/i.test(pc), `prod Set-Cookie: ${pc.replace(/=[A-Za-z0-9_-]{20,}/, '=<token>')}`);
    await prod.close();
  }

  // ---------------------------------------------------------------- session fixation / lifecycle
  {
    const app = await fresh();
    const planted = 'attacker-chosen-token-value-0123456789abcdef';
    const r = await loginRequest(app, { headers: { cookie: `pf_session=${planted}` } });
    const issued = r.cookies.find((c) => c.name === 'pf_session')?.value;
    const usePlanted = await app.inject({ url: '/api/v1/admin/auth/me', cookies: { pf_session: planted } });
    check('SESSION-fixation', issued && issued !== planted && usePlanted.statusCode === 401, `login with planted cookie issues a fresh token (${issued !== planted}); planted token -> ${usePlanted.statusCode}`);

    const s1 = await login(app);
    const s2 = await loginRequest(app, { headers: { cookie: `pf_session=${s1.token}` } });
    const old = await app.inject({ url: '/api/v1/admin/auth/me', cookies: s1.cookies });
    check('SESSION-rotation', s2.statusCode === 200 && old.statusCode === 401, `re-login rotates: old token -> ${old.statusCode}`);

    const s3 = await login(app);
    await app.inject({ method: 'POST', url: '/api/v1/admin/auth/logout', cookies: s3.cookies, headers: s3.mutate });
    const after = await app.inject({ url: '/api/v1/admin/auth/me', cookies: s3.cookies });
    const s4 = await login(app);
    await upsertAdmin(db, { email: ADMIN_EMAIL, password: 'a brand new password 123', reset: true, scrypt: { N: 1024, r: 8, p: 1 } });
    const afterReset = await app.inject({ url: '/api/v1/admin/auth/me', cookies: s4.cookies });
    check('SESSION-invalidation', after.statusCode === 401 && afterReset.statusCode === 401, `after logout -> ${after.statusCode}; after admin:create --reset -> ${afterReset.statusCode}`);
    const tok = s4.token;
    out('INFO', 'SESSION-entropy', `token ${tok.length} chars base64url (32 random bytes = 256 bits); stored as SHA-256 only`);
    await app.close();
  }

  // ---------------------------------------------------------------- brute force: lockout normalisation bypass
  {
    const app = await fresh(testConfig({ lockout: { maxFailures: 10, durationMs: 15 * 60_000 } }));
    const variants = [ADMIN_EMAIL.toUpperCase(), ` ${ADMIN_EMAIL} `, 'Admin@Example.com', `${ADMIN_EMAIL}\t`, ADMIN_EMAIL];
    for (let i = 0; i < 10; i++) await loginRequest(app, { email: variants[i % variants.length], password: `wrong-${i}` });
    const good = await loginRequest(app);
    const row = (await db.query('SELECT failed_attempts, locked_until FROM admins')).rows[0];
    check('LOCKOUT-normalise', good.statusCode === 401 && row.locked_until !== null, `10 failures across case/whitespace variants lock the one account; correct password then -> ${good.statusCode}`);
    const uni = await loginRequest(app, { email: 'admin@exаmple.com' }); // Cyrillic 'а'
    out('INFO', 'LOCKOUT-homoglyph', `homoglyph email -> ${uni.statusCode} (rejected by the email schema or unknown account; never matches the real admin)`);
    await app.close();
  }

  // ---------------------------------------------------------------- race: concurrent logins vs the lockout
  {
    await resetDb(db);
    await createAdmin(db);
    // Instrumented view of the DB: count failure-accounting UPDATEs that hit the admin row, and
    // snapshot locked_until after every UPDATE on admins (same connection/tx, so no deadlock).
    let counted = 0;
    const snaps = [];
    const wrapQ = (q) => ({
      query: async (sql, params) => {
        const r = await q.query(sql, params);
        if (/UPDATE admins/.test(sql)) {
          if (/failed_attempts\s*=\s*CASE/.test(sql) && r.rowCount > 0) counted++;
          const s = (await q.query('SELECT locked_until FROM admins')).rows[0];
          snaps.push(/last_login_at/.test(sql) ? `success(${s.locked_until ? 'locked' : 'unlocked'})` : s.locked_until ? 'locked' : 'open');
        }
        return r;
      },
    });
    const idb = { ...db, query: (sql, p) => wrapQ(db).query(sql, p), tx: (fn) => db.tx((q) => fn(wrapQ(q))) };
    const app = await makeApp({ db: idb, config: testConfig({ lockout: { maxFailures: 10, durationMs: 15 * 60_000 } }) });
    const N = 25;
    const reqs = [];
    for (let i = 0; i < N; i++) reqs.push(app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', remoteAddress: `198.51.100.${i + 1}`, payload: { email: ADMIN_EMAIL, password: `wrong-guess-${i}` } }));
    // The real password, fired in the same burst from yet another address (an attacker whose list
    // happens to contain it, or a credential-stuffing botnet).
    reqs.push(app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', remoteAddress: '198.51.100.200', payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } }));
    const res = await Promise.all(reqs);
    const lockouts = Number((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'auth.lockout'")).rows[0].n);
    const ok = res[N].statusCode;
    const firstLock = snaps.indexOf('locked');
    const successIdx = snaps.findIndex((s) => s.startsWith('success'));
    const successAfterLock = ok === 200 && firstLock !== -1 && successIdx > firstLock;
    const row = (await db.query('SELECT failed_attempts, locked_until FROM admins')).rows[0];
    const wrong401 = res.slice(0, N).filter((r) => r.statusCode === 401).length;
    check(
      'RACE-lockout',
      !successAfterLock && counted <= 10 && (ok !== 200 || firstLock === -1),
      `${N} concurrent wrong guesses + 1 correct (threshold 10): failure-accounting UPDATEs applied=${counted}, wrong->401 x${wrong401}, correct login -> ${ok}` +
        `${successAfterLock ? ` AFTER the account had been locked (UPDATE #${firstLock + 1} set locked_until; success at UPDATE #${successIdx + 1} cleared it)` : ''}; lockout audit rows=${lockouts}; final failed_attempts=${row.failed_attempts}, locked=${row.locked_until !== null}; sequence=${snaps.join('>')}`,
    );
    await app.close();
  }

  // ---------------------------------------------------------------- rate limits & X-Forwarded-For
  for (const trust of [0, 1]) {
    const cfg = testConfig({ trustProxy: trust });
    cfg.rateLimits.login = { max: 5, timeWindow: 15 * 60_000 };
    cfg.rateLimits.inquiry = { max: 5, timeWindow: 10 * 60_000 };
    const app = await fresh(cfg);
    const codes = [];
    for (let i = 0; i < 8; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': `203.0.113.${i + 1}`, 'x-real-ip': `203.0.113.${i + 1}` }, payload: { email: 'nobody@example.com', password: 'x' } });
      codes.push(r.statusCode);
    }
    const chained = [];
    for (let i = 0; i < 8; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/v1/inquiries', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': `10.0.0.${i}, 192.0.2.77` }, payload: validInquiry() });
      chained.push(r.statusCode);
    }
    const limited = codes.includes(429);
    if (trust === 0) check('XFF-trust0', limited && chained.includes(429), `TRUST_PROXY=0, rotating X-Forwarded-For: login ${codes.join(',')} | inquiry ${chained.join(',')} (header ignored)`);
    else
      out(
        limited ? 'PASS' : 'INFO',
        'XFF-trust1',
        `TRUST_PROXY=1, socket=127.0.0.1, rotating X-Forwarded-For: login ${codes.join(',')} (each spoofed IP gets its own bucket = expected: only safe when the single trusted hop (nginx) OVERWRITES XFF, which proxy-api.conf does) | inquiry with "spoof, real" chain ${chained.join(',')} (right-most entry used)`,
      );
    await app.close();
  }

  // ---------------------------------------------------------------- headers / CORS / host header / docs
  {
    const app = await fresh();
    const h = (await app.inject({ url: '/api/health' })).headers;
    const want = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'cross-origin-resource-policy', 'x-request-id', 'cache-control'];
    const missing = want.filter((k) => !h[k]);
    check('HEADERS', missing.length === 0 && !h['x-powered-by'] && h['cache-control'] === 'no-store', `CSP="${h['content-security-policy']}", XFO=${h['x-frame-options']}, nosniff=${h['x-content-type-options']}, cache=${h['cache-control']}${missing.length ? ' missing ' + missing.join(',') : ''}`);
    const cors = await app.inject({ method: 'OPTIONS', url: '/api/v1/admin/inquiries', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    const corsGet = await app.inject({ url: '/api/health', headers: { origin: 'https://evil.example' } });
    check('CORS-default', !cors.headers['access-control-allow-origin'] && !corsGet.headers['access-control-allow-origin'], `no CORS_ORIGINS: preflight -> ${cors.statusCode}, ACAO=${cors.headers['access-control-allow-origin'] ?? 'absent'}`);
    await app.close();

    const capp = await fresh(testConfig({ corsOrigins: ['http://localhost:5173'] }));
    const reflect = await capp.inject({ url: '/api/health', headers: { origin: 'https://evil.example' } });
    const sub = await capp.inject({ url: '/api/health', headers: { origin: 'http://localhost:5173.evil.example' } });
    const nul = await capp.inject({ url: '/api/health', headers: { origin: 'null' } });
    const good = await capp.inject({ url: '/api/health', headers: { origin: 'http://localhost:5173' } });
    check('CORS-allowlist', !reflect.headers['access-control-allow-origin'] && !sub.headers['access-control-allow-origin'] && !nul.headers['access-control-allow-origin'] && good.headers['access-control-allow-origin'] === 'http://localhost:5173', `allowlist [http://localhost:5173]: evil->${reflect.headers['access-control-allow-origin'] ?? 'none'}, suffix->${sub.headers['access-control-allow-origin'] ?? 'none'}, null->${nul.headers['access-control-allow-origin'] ?? 'none'}, allowed->${good.headers['access-control-allow-origin']} (credentials=${good.headers['access-control-allow-credentials']})`);
    await capp.close();

    // Host header: production has PUBLIC_ORIGIN, so request Host never decides the Origin check.
    const papp = await fresh();
    const s = await login(papp);
    const [id] = await seedInquiries(db, [{}]);
    const hostSpoof = await papp.inject({ method: 'PATCH', url: `/api/v1/admin/inquiries/${id}`, cookies: s.cookies, headers: { host: 'evil.example', origin: 'http://evil.example', 'x-csrf-token': s.csrfToken }, payload: { status: 'read' } });
    check('HOST-origin', hostSpoof.statusCode === 403, `PUBLIC_ORIGIN set; Host: evil.example + Origin: http://evil.example -> ${hostSpoof.statusCode}`);
    await papp.close();
    const dapp = await fresh(testConfig({ publicOrigin: undefined }));
    const ds = await login(dapp);
    const [id2] = await seedInquiries(db, [{}]);
    const devSpoof = await dapp.inject({ method: 'PATCH', url: `/api/v1/admin/inquiries/${id2}`, cookies: ds.cookies, headers: { host: 'evil.example', origin: 'http://evil.example', 'x-csrf-token': ds.csrfToken }, payload: { status: 'read' } });
    out('INFO', 'HOST-dev-fallback', `no PUBLIC_ORIGIN (dev only): Origin compared with request Host -> ${devSpoof.statusCode}. Not browser-exploitable (a cross-site browser request carries the API's Host, and the CSRF token is still required).`);
    await dapp.close();

    const dev = await fresh(testConfig({}, { NODE_ENV: 'development' }));
    const docs = await dev.inject({ url: '/api/docs/json' });
    await dev.close();
    const prodApp = await fresh(testConfig({}, { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' }));
    const pdocs = await prodApp.inject({ url: '/api/docs/json' });
    const hsts = (await prodApp.inject({ url: '/api/health' })).headers['strict-transport-security'];
    await prodApp.close();
    check('DOCS', pdocs.statusCode === 404, `OpenAPI: dev ${docs.statusCode} (no secrets in spec: ${!/password_hash|IP_HASH|secret/i.test(docs.body)}), production ${pdocs.statusCode}; prod HSTS=${hsts}`);
  }

  // ---------------------------------------------------------------- stored XSS payload round-trip (API side)
  {
    const app = await fresh();
    const xss = '<img src=x onerror=alert(document.domain)><script>alert(1)</script>"\'><svg/onload=alert(1)>';
    const c = await app.inject({ method: 'POST', url: '/api/v1/inquiries', payload: validInquiry({ name: xss.slice(0, 80), message: `${xss} long enough message` }) });
    const s = await login(app);
    const l = await app.inject({ url: '/api/v1/admin/inquiries', cookies: s.cookies });
    const item = l.json().data[0];
    out('INFO', 'XSS-roundtrip', `payload stored verbatim (${c.statusCode}) and returned as JSON string (content-type ${l.headers['content-type']}, nosniff=${l.headers['x-content-type-options']}); name=${JSON.stringify(item.name).slice(0, 60)}… -> safety depends on the admin UI sink (see poc-admin-xss)`);
    await app.close();
  }

  // ---------------------------------------------------------------- ReDoS
  {
    const { loginSchema, inquiryCreateSchema, inquiryListQuerySchema } = await import('@portfolio/validation');
    const { genReqId } = await import('../../apps/api/src/plugins/request-id.js');
    const cases = [
      ['loginSchema.email', () => loginSchema.safeParse({ email: `${'a'.repeat(15000)}@${'a.'.repeat(300)}`, password: 'x' })],
      ['loginSchema.email-2', () => loginSchema.safeParse({ email: `${'a.'.repeat(7000)}@x`, password: 'x' })],
      ['inquiry.message clean()', () => inquiryCreateSchema.safeParse(validInquiry({ message: '\r'.repeat(15000) + '\u0001'.repeat(1000) }))],
      ['list.q', () => inquiryListQuerySchema.safeParse({ q: ' '.repeat(15000) + 'x' })],
      ['genReqId', () => genReqId(/** @type {any} */ ({ headers: { 'x-request-id': `${'a'.repeat(60000)}!` } }))],
    ];
    const times = cases.map(([n, f]) => {
      const t = performance.now();
      f();
      return [n, performance.now() - t];
    });
    check('REDOS', times.every(([, t]) => t < 100), times.map(([n, t]) => `${n} ${t.toFixed(1)}ms`).join(', '));
  }
}

// -------------------------------------------------------------------- timing (unknown vs known email)
if (!only || only === 'timing') {
  await resetDb(db);
  await upsertAdmin(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, scrypt: DEFAULT_SCRYPT });
  const cfg = testConfig();
  cfg.scrypt = { ...DEFAULT_SCRYPT }; // production cost: N=2^15
  const app = await makeApp({ db, config: cfg });
  const sample = async (email) => {
    const t = performance.now();
    const r = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email, password: 'definitely-wrong-password' } });
    return { ms: performance.now() - t, body: r.body, status: r.statusCode };
  };
  await sample('warm@example.com');
  const known = [];
  const unknown = [];
  // Interleave so drift affects both series equally. Stay below the lockout threshold (10) by
  // resetting the counter between known-email samples.
  for (let i = 0; i < 24; i++) {
    known.push(await sample(ADMIN_EMAIL));
    unknown.push(await sample(`nobody${i}@example.com`));
    await db.query('UPDATE admins SET failed_attempts = 0, locked_until = NULL');
  }
  const med = (a) => {
    const s = a.map((x) => x.ms).sort((x, y) => x - y);
    return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
  };
  const sameBody = known.every((k) => k.body.replace(/"requestId":"[^"]+"/, '') === unknown[0].body.replace(/"requestId":"[^"]+"/, ''));
  const mk = med(known);
  const mu = med(unknown);
  const delta = Math.abs(mk - mu);
  check('ENUM-response', sameBody && known.every((k) => k.status === 401) && unknown.every((u) => u.status === 401), `known vs unknown email: identical status (401) and body (ignoring requestId): ${sameBody}`);
  out(delta / Math.max(mk, mu) < 0.15 ? 'PASS' : 'VULN', 'ENUM-timing', `median known=${mk.toFixed(1)}ms unknown=${mu.toFixed(1)}ms delta=${delta.toFixed(1)}ms (${((100 * delta) / Math.max(mk, mu)).toFixed(1)}%), n=24 each, scrypt N=2^15, in-process (no network jitter)`);
  await app.close();
}

await db.close();
const vulns = results.filter((r) => r.tag === 'VULN').map((r) => r.id);
console.log(`\nSummary: ${results.length} checks, ${results.filter((r) => r.tag === 'PASS').length} pass, ${vulns.length} vuln${vulns.length ? ` (${vulns.join(', ')})` : ''}, ${results.filter((r) => r.tag === 'INFO').length} info`);
