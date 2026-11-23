// @ts-check
import { loadConfig, ConfigError } from '../config.js';
import { createDatabase } from './index.js';
import { migrate } from './migrate.js';

/** `npm run db:migrate -w @portfolio/api` */
async function main() {
  const config = loadConfig();
  const db = createDatabase(config);
  try {
    const applied = await migrate(db, { log: (m) => console.log(`[migrate] ${m}`) });
    console.log(applied.length ? `[migrate] ${applied.length} migration(s) applied` : '[migrate] up to date');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof ConfigError ? err.message : `[migrate] ${err.message}`);
  process.exit(1);
});
