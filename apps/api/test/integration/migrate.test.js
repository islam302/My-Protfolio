// @ts-check
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestDb, usingRealPg } from '../helpers/setup.js';
import { migrate, pendingMigrations, listMigrations } from '../../src/db/migrate.js';
import { createPgliteDatabase } from '../../src/db/pglite.js';
import { createPgDatabase } from '../../src/db/pg.js';

/** @type {import('../../src/db/types.js').Database} */
let db;
before(async () => {
  db = await createTestDb();
});
after(async () => {
  await db.close();
});

describe('migrations', () => {
  test('are recorded and idempotent', async () => {
    const all = (await listMigrations()).map((m) => m.version);
    assert.ok(all.includes('0001_init'));
    const { rows } = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(rows.map((r) => r.version), all);
    assert.deepEqual(await migrate(db), []);
    assert.deepEqual(await pendingMigrations(db), []);
  });

  test('CHECK constraints mirror the validation rules', async () => {
    const insert = (/** @type {Record<string, unknown>} */ o) =>
      db.query('INSERT INTO inquiries (name, project_type, message, channel, status) VALUES ($1, $2, $3, $4, $5)', [
        o.name ?? 'Name',
        o.type ?? 'web',
        o.message ?? 'x'.repeat(30),
        o.channel ?? 'email',
        o.status ?? 'new',
      ]);
    await assert.rejects(insert({ type: 'spaceship' }));
    await assert.rejects(insert({ channel: 'fax' }));
    await assert.rejects(insert({ status: 'deleted' }));
    await assert.rejects(insert({ message: 'short' }));
    await assert.rejects(insert({ name: 'x'.repeat(81) }));
    await insert({});
    await db.query('DELETE FROM inquiries');
  });

  test('admins.email is unique case-insensitively; sessions cascade on admin delete', async () => {
    const hash = 'scrypt$1024$8$1$' + 'a'.repeat(30);
    const { rows } = await db.query('INSERT INTO admins (email, password_hash) VALUES ($1, $2) RETURNING id', ['Case@Example.com', hash]);
    await assert.rejects(db.query('INSERT INTO admins (email, password_hash) VALUES ($1, $2)', ['case@example.com', hash]));
    await db.query("INSERT INTO sessions (token_hash, admin_id, csrf_token, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')", [
      Buffer.alloc(32, 1),
      rows[0].id,
      'c'.repeat(43),
    ]);
    await db.query('DELETE FROM admins WHERE id = $1', [rows[0].id]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n, 0);
  });

  test('a failing migration is rolled back and not recorded', { skip: usingRealPg && 'uses a private PGlite' }, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pf-mig-'));
    try {
      const files = {
        '0001_ok.sql': 'CREATE TABLE ok_table (id int);',
        '0002_bad.sql': 'CREATE TABLE half_done (id int); SELECT * FROM no_such_table;',
        'README.md': 'ignored',
      };
      for (const [name, sql] of Object.entries(files)) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed names inside a fresh temp dir
        await writeFile(path.join(dir, name), sql);
      }
      const scratch = await createPgliteDatabase();
      await assert.rejects(migrate(scratch, { dir }), /0002_bad failed/);
      const { rows } = await scratch.query('SELECT version FROM schema_migrations');
      assert.deepEqual(rows.map((r) => r.version), ['0001_ok']);
      const half = await scratch.query("SELECT to_regclass('half_done') AS t");
      assert.equal(half.rows[0].t, null);
      await scratch.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('real PostgreSQL adapter', { skip: !usingRealPg && 'set TEST_DATABASE_URL to run against a real Postgres' }, () => {
  test('concurrent migrate() calls serialise on the advisory lock', async () => {
    const url = /** @type {string} */ (process.env.TEST_DATABASE_URL);
    const a = createPgDatabase({ connectionString: url, max: 2 });
    const b = createPgDatabase({ connectionString: url, max: 2 });
    try {
      const [ra, rb] = await Promise.all([migrate(a), migrate(b)]);
      assert.deepEqual([...ra, ...rb], []);
      const tx = await a.tx(async (q) => (await q.query('SELECT 1 AS one')).rows[0].one);
      assert.equal(tx, 1);
    } finally {
      await a.close();
      await b.close();
    }
  });
});
