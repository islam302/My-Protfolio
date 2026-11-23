// @ts-check
import { loadConfig } from '../../src/config.js';
import { buildApp } from '../../src/app.js';
import { migrate } from '../../src/db/migrate.js';
import { createPgliteDatabase } from '../../src/db/pglite.js';
import { createPgDatabase } from '../../src/db/pg.js';
import { upsertAdmin } from '../../src/services/admins.js';

/** Cheap scrypt for tests (real deployments use N=2^15). */
export const TEST_SCRYPT = { N: 2 ** 10, r: 8, p: 1 };
export const PUBLIC_ORIGIN = 'http://localhost:4321';
export const ADMIN_EMAIL = 'admin@example.com';
export const ADMIN_PASSWORD = 'correct horse battery staple';

/** True when the suite runs against a real Postgres (TEST_DATABASE_URL) instead of PGlite. */
export const usingRealPg = Boolean(process.env.TEST_DATABASE_URL);

/**
 * Fresh, migrated database. PGlite in-memory by default; real Postgres when TEST_DATABASE_URL is set
 * (tables are truncated instead, so point it at a throwaway database).
 */
export async function createTestDb() {
  const db = usingRealPg
    ? createPgDatabase({ connectionString: /** @type {string} */ (process.env.TEST_DATABASE_URL), max: 4 })
    : await createPgliteDatabase();
  await migrate(db);
  await resetDb(db);
  return db;
}

/** @param {import('../../src/db/types.js').Database} db */
export async function resetDb(db) {
  await db.query('TRUNCATE audit_log, sessions, inquiries, admins RESTART IDENTITY CASCADE');
}

/**
 * @typedef {{ [K in keyof import('../../src/config.js').AppConfig]?: Partial<import('../../src/config.js').AppConfig[K]> }} ConfigOverrides
 */

/**
 * Test config: generous rate limits unless a test lowers them, cheap scrypt.
 * @param {ConfigOverrides} [overrides]
 * @param {Record<string, string>} [env]
 */
export function testConfig(overrides = {}, env = {}) {
  const base = loadConfig({
    NODE_ENV: 'test',
    PUBLIC_ORIGIN,
    IP_HASH_SECRET: 'test-secret-test-secret-test-secret-0123',
    ...env,
  });
  const big = { max: 10_000, timeWindow: 60_000 };
  base.rateLimits = { global: big, inquiry: big, login: big, admin: big };
  base.scrypt = TEST_SCRYPT;
  for (const [k, v] of Object.entries(overrides)) {
    const cur = /** @type {any} */ (base)[k];
    /** @type {any} */ (base)[k] = v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' ? { ...cur, ...v } : v;
  }
  return base;
}

/** A controllable clock. */
export function testClock(start = new Date()) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    /** @param {number} ms */
    advance(ms) {
      t += ms;
    },
  };
}

/**
 * @param {{ db: import('../../src/db/types.js').Database, config?: import('../../src/config.js').AppConfig, clock?: import('../../src/lib/clock.js').Clock }} opts
 */
export async function makeApp({ db, config = testConfig(), clock }) {
  const app = await buildApp({ config, db, logger: false, clock });
  await app.ready();
  return app;
}

/**
 * @param {import('../../src/db/types.js').Database} db
 * @param {string} [email]
 * @param {string} [password]
 */
export function createAdmin(db, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  return upsertAdmin(db, { email, password, scrypt: TEST_SCRYPT });
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ email?: string, password?: string, headers?: Record<string, string> }} [opts]
 */
export function loginRequest(app, { email = ADMIN_EMAIL, password = ADMIN_PASSWORD, headers = {} } = {}) {
  return app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email, password }, headers });
}

/**
 * Log in and return what an admin client needs for later requests.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ email?: string, password?: string }} [opts]
 */
export async function login(app, opts) {
  const res = await loginRequest(app, opts);
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name.endsWith('pf_session'));
  if (!cookie) throw new Error('no session cookie');
  const { csrfToken } = res.json().data;
  return {
    token: cookie.value,
    csrfToken,
    cookies: { [cookie.name]: cookie.value },
    /** Headers for a state-changing request. */
    mutate: { 'x-csrf-token': csrfToken, origin: PUBLIC_ORIGIN },
  };
}

export function validInquiry(overrides = {}) {
  return {
    name: 'Ada Lovelace',
    type: 'web',
    budget: '$1,000 – $5,000',
    timeline: 'Within 1–3 months',
    message: 'I would like a new website for my analytical engine business.',
    channel: 'email',
    ...overrides,
  };
}

/**
 * Insert inquiries directly (bypassing the rate-limited endpoint) with controlled timestamps.
 * @param {import('../../src/db/types.js').Database} db
 * @param {Array<Partial<{ name: string, type: string, message: string, status: string, createdAt: Date }>>} rows
 */
export async function seedInquiries(db, rows) {
  /** @type {string[]} */
  const ids = [];
  for (const r of rows) {
    const { rows: out } = await db.query(
      `INSERT INTO inquiries (name, project_type, message, channel, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'email', $4, $5, $5) RETURNING id`,
      [r.name ?? 'Seed', r.type ?? 'web', r.message ?? 'A seeded inquiry message that is long enough.', r.status ?? 'new', r.createdAt ?? new Date()],
    );
    ids.push(out[0].id);
  }
  return ids;
}
