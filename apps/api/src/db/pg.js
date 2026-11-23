// @ts-check
import pg from 'pg';

/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Queryable} Queryable */

/**
 * node-postgres adapter.
 * @param {{ connectionString: string, max?: number, statementTimeoutMs?: number, connectionTimeoutMs?: number, onError?: (err: Error) => void }} opts
 * @returns {Database}
 */
export function createPgDatabase({ connectionString, max = 10, statementTimeoutMs = 10_000, connectionTimeoutMs = 5_000, onError }) {
  const pool = new pg.Pool({
    connectionString,
    max,
    statement_timeout: statementTimeoutMs,
    idle_in_transaction_session_timeout: statementTimeoutMs * 3,
    connectionTimeoutMillis: connectionTimeoutMs,
    idleTimeoutMillis: 30_000,
    application_name: 'portfolio-api',
  });
  // An idle client erroring (e.g. DB restart) must not crash the process.
  pool.on('error', (err) => onError?.(err));

  /** @param {pg.PoolClient | pg.Pool} c @returns {Queryable} */
  const wrap = (c) => ({
    async query(text, params = []) {
      const res = await c.query(text, /** @type {any[]} */ (params));
      return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
    },
  });

  const root = wrap(pool);

  return {
    kind: 'pg',
    query: root.query,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async withConnection(fn) {
      const client = await pool.connect();
      try {
        return await fn({
          ...wrap(client),
          async exec(sql) {
            await client.query(sql);
          },
        });
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
