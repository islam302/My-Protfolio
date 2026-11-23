// @ts-check
import { createPgDatabase } from './pg.js';

/**
 * Production database from config.
 * @param {import('../config.js').AppConfig} config
 * @param {(err: Error) => void} [onError]
 */
export function createDatabase(config, onError) {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');
  return createPgDatabase({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    statementTimeoutMs: config.databaseStatementTimeoutMs,
    onError,
  });
}
