// @ts-check
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Connection} Connection */

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;
// Arbitrary constant shared by every instance so concurrent boots/CLIs serialise.
const LOCK_KEY = 727_384_001;

/**
 * @param {string} [dir]
 * @returns {Promise<{ version: string, file: string }[]>}
 */
export async function listMigrations(dir = MIGRATIONS_DIR) {
  // The directory is a fixed path inside the package, not user input.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const files = await readdir(dir);
  return files
    .filter((f) => FILE_RE.test(f))
    .sort()
    .map((f) => ({ version: f.replace(/\.sql$/, ''), file: path.join(dir, f) }));
}

/** @param {import('./types.js').Queryable} q */
async function ensureTable(q) {
  await q.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

/**
 * @param {import('./types.js').Queryable} q
 * @returns {Promise<Set<string>>}
 */
async function appliedVersions(q) {
  const { rows } = await q.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((r) => String(r.version)));
}

/**
 * Versions not yet applied.
 * @param {Database} db
 * @param {string} [dir]
 */
export async function pendingMigrations(db, dir = MIGRATIONS_DIR) {
  await ensureTable(db);
  const applied = await appliedVersions(db);
  return (await listMigrations(dir)).filter((m) => !applied.has(m.version)).map((m) => m.version);
}

/**
 * Apply pending migrations in order, each in its own transaction, under a session-level
 * advisory lock so that two instances never migrate at once.
 * @param {Database} db
 * @param {{ dir?: string, log?: (msg: string) => void }} [opts]
 * @returns {Promise<string[]>} versions applied
 */
export async function migrate(db, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  return db.withConnection(async (conn) => {
    let locked = false;
    try {
      await conn.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
      locked = true;
    } catch {
      // PGlite (single connection) may not support advisory locks; nothing to serialise against.
      log('advisory lock unavailable; continuing without it');
    }
    try {
      await ensureTable(conn);
      const applied = await appliedVersions(conn);
      /** @type {string[]} */
      const done = [];
      for (const m of await listMigrations(dir)) {
        if (applied.has(m.version)) continue;
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from listMigrations (fixed dir + strict filename regex)
        const sql = await readFile(m.file, 'utf8');
        await conn.exec('BEGIN');
        try {
          await conn.exec(sql);
          await conn.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
          await conn.exec('COMMIT');
        } catch (err) {
          await conn.exec('ROLLBACK').catch(() => {});
          throw new Error(`Migration ${m.version} failed: ${/** @type {Error} */ (err).message}`, { cause: err });
        }
        log(`applied ${m.version}`);
        done.push(m.version);
      }
      return done;
    } finally {
      if (locked) await conn.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    }
  });
}
