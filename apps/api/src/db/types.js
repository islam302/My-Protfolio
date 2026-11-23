// @ts-check

/**
 * The tiny database interface every layer above `db/` depends on. Two adapters implement it:
 * `pg.js` (node-postgres Pool, production) and `pglite.js` (in-process WASM Postgres, tests).
 *
 * @typedef {{ rows: any[], rowCount: number }} QueryResult
 *
 * @typedef {object} Queryable
 * @property {(text: string, params?: unknown[]) => Promise<QueryResult>} query  Parameterised single statement.
 *
 * @typedef {Queryable & { exec: (sql: string) => Promise<void> }} Connection
 *   A dedicated connection; `exec` runs a multi-statement script (migrations).
 *
 * @typedef {object} DatabaseExtras
 * @property {'pg' | 'pglite'} kind
 * @property {<T>(fn: (q: Queryable) => Promise<T>) => Promise<T>} tx  Run `fn` inside BEGIN/COMMIT (ROLLBACK on throw).
 * @property {<T>(fn: (c: Connection) => Promise<T>) => Promise<T>} withConnection  Run `fn` on one dedicated connection.
 * @property {() => Promise<void>} close
 *
 * @typedef {Queryable & DatabaseExtras} Database
 */

export {};
