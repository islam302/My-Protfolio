// @ts-check
// Regression tests for findings in docs/security/VULNERABILITY_REGISTER.md.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, resetDb, makeApp, testConfig, testClock, createAdmin, loginRequest, ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/setup.js';

/** @type {import('../../src/db/types.js').Database} */
let db;

before(async () => {
  db = await createTestDb();
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
  await createAdmin(db);
});

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {number} i
 * @param {string} password
 */
const attempt = (app, i, password) =>
  app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', remoteAddress: `198.51.100.${(i % 250) + 1}`, payload: { email: ADMIN_EMAIL, password } });

const auditCount = async (/** @type {string} */ action) =>
  Number((await db.query('SELECT count(*)::int AS n FROM audit_log WHERE action = $1', [action])).rows[0].n);

describe('SEC-01: account lockout under concurrent login attempts', () => {
  test('a concurrent burst cannot evaluate more than maxFailures guesses, and a correct password sent after them is refused', async () => {
    const clock = testClock();
    const app = await makeApp({ db, clock, config: testConfig({ lockout: { maxFailures: 10, durationMs: 15 * 60_000 } }) });
    try {
      const burst = [];
      for (let i = 0; i < 25; i++) burst.push(attempt(app, i, `wrong guess ${i}`));
      burst.push(attempt(app, 200, ADMIN_PASSWORD)); // last in the burst, after the threshold
      const res = await Promise.all(burst);

      assert.ok(res.every((r) => r.statusCode === 401), 'every request in the burst gets the uniform 401, the correct one included');
      const { rows } = await db.query('SELECT failed_attempts, locked_until FROM admins');
      assert.ok(rows[0].locked_until !== null && new Date(rows[0].locked_until) > clock.now(), 'the account stays locked');
      assert.equal(await auditCount('auth.lockout'), 1, 'the lockout is audited exactly once');
      assert.equal(await auditCount('auth.login'), 0);

      // Still locked for the correct password until the window passes.
      assert.equal((await loginRequest(app)).statusCode, 401);
      clock.advance(15 * 60_000 + 1);
      assert.equal((await loginRequest(app)).statusCode, 200);
    } finally {
      await app.close();
    }
  });

  test('sequential behaviour is unchanged: the 10th failure locks, the 9th does not', async () => {
    const clock = testClock();
    const app = await makeApp({ db, clock });
    try {
      for (let i = 0; i < 9; i++) assert.equal((await attempt(app, i, `wrong ${i}`)).statusCode, 401);
      let { rows } = await db.query('SELECT failed_attempts, locked_until FROM admins');
      assert.deepEqual(rows[0], { failed_attempts: 9, locked_until: null });
      assert.equal(await auditCount('auth.lockout'), 0);

      // A correct password as the 10th attempt still logs in and clears the counter.
      assert.equal((await loginRequest(app)).statusCode, 200);
      ({ rows } = await db.query('SELECT failed_attempts, locked_until FROM admins'));
      assert.deepEqual(rows[0], { failed_attempts: 0, locked_until: null });

      for (let i = 0; i < 10; i++) await attempt(app, i, `wrong ${i}`);
      assert.equal(await auditCount('auth.lockout'), 1);
      assert.equal((await loginRequest(app)).statusCode, 401);
      // Attempts while locked are not counted and do not extend the lock.
      const before = (await db.query('SELECT locked_until FROM admins')).rows[0].locked_until;
      await attempt(app, 1, 'wrong again');
      const afterRow = (await db.query('SELECT failed_attempts, locked_until FROM admins')).rows[0];
      assert.equal(afterRow.failed_attempts, 0);
      assert.equal(new Date(afterRow.locked_until).getTime(), new Date(before).getTime());
    } finally {
      await app.close();
    }
  });
});
