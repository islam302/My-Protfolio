// @ts-check
import { PGlite } from '@electric-sql/pglite';

/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Queryable} Queryable */

/**
 * In-process PGlite adapter (dev dependency; used by tests). In-memory unless `dataDir` is given.
 * @param {{ dataDir?: string }} [opts]
 * @returns {Promise<Database>}
 */
export async function createPgliteDatabase({ dataDir } = {}) {
  const db = new PGlite(dataDir);
  await db.waitReady;

  /** @param {{ query: PGlite['query'] }} c @returns {Queryable} */
  const wrap = (c) => ({
    async query(text, params = []) {
      const res = await c.query(text, /** @type {any[]} */ (params));
      // Normalise bytea (Uint8Array) to Buffer so callers see the same types as with `pg`.
      const rows = res.rows.map((row) => {
        const r = /** @type {Record<string, unknown>} */ (row);
        for (const k of Object.keys(r)) {
          const v = r[k];
          if (v instanceof Uint8Array && !Buffer.isBuffer(v)) r[k] = Buffer.from(v);
        }
        return r;
      });
      return { rows, rowCount: res.affectedRows || rows.length };
    },
  });

  const root = wrap(db);

  return {
    kind: 'pglite',
    query: root.query,
    tx(fn) {
      return db.transaction((t) => fn(wrap(t)));
    },
    async withConnection(fn) {
      return fn({
        ...root,
        async exec(sql) {
          await db.exec(sql);
        },
      });
    },
    async close() {
      await db.close();
    },
  };
}
