// @ts-check
import { loadConfig, ConfigError } from './config.js';
import { createDatabase } from './db/index.js';
import { pendingMigrations } from './db/migrate.js';
import { buildApp } from './app.js';

/** Boot: config -> DB pool -> migration check -> (Redis) -> listen; graceful shutdown on SIGTERM/SIGINT. */
async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof ConfigError ? err.message : err);
    process.exit(1);
  }

  /** @type {((err: Error) => void) | undefined} */
  let onPoolError;
  const db = createDatabase(config, (err) => onPoolError?.(err));

  /** @type {import('ioredis').Redis | null} */
  let redis = null;
  if (config.redisUrl) {
    const { Redis } = await import('ioredis');
    // Rate limiting must not hang requests when Redis is down (the limiter fails open).
    redis = new Redis(config.redisUrl, { connectTimeout: 1_000, maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
  }

  const app = await buildApp({ config, db, redis });
  onPoolError = (err) => app.log.error({ err }, 'idle database client error');
  redis?.on('error', (err) => app.log.warn({ err: err.message }, 'redis error'));

  try {
    const pending = await pendingMigrations(db);
    if (pending.length) app.log.warn({ pending }, 'database has pending migrations; run `npm run db:migrate`');
  } catch (err) {
    app.log.warn({ err }, 'could not check migrations (database unreachable?)');
  }

  let shuttingDown = false;
  /** @param {string} signal */
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    const force = setTimeout(() => {
      app.log.error('forced exit after shutdown timeout');
      process.exit(1);
    }, 10_000);
    force.unref();
    try {
      await app.close();
      await db.close();
      if (redis) await redis.quit().catch(() => redis?.disconnect());
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error('fatal: failed to start', err);
  process.exit(1);
});
