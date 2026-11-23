// @ts-check
import { loadConfig, ConfigError } from '../config.js';
import { createDatabase } from '../db/index.js';
import { upsertAdmin, AdminExistsError } from '../services/admins.js';

/**
 * Create (or with --reset, re-key) the admin account.
 *
 *   ADMIN_EMAIL=me@example.com ADMIN_PASSWORD='…' npm run admin:create -w @portfolio/api [-- --reset]
 *
 * Credentials come from the environment only (never argv, which leaks into shell history and
 * `ps`), and the password is never printed. --reset sets the new password, clears the lockout
 * and revokes all of that admin's sessions.
 */
async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--reset');
  if (unknown.length) {
    console.error(`Unknown argument(s): ${unknown.join(' ')}. Usage: ADMIN_EMAIL=… ADMIN_PASSWORD=… create-admin [--reset]`);
    process.exit(2);
  }
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment.');
    process.exit(2);
  }

  const config = loadConfig();
  const db = createDatabase(config);
  try {
    const result = await upsertAdmin(db, { email, password, reset: args.includes('--reset'), scrypt: config.scrypt });
    if (result.action === 'created') console.log(`Admin created: ${result.email}`);
    else console.log(`Admin password reset: ${result.email} (lockout cleared, ${result.sessionsRevoked} session(s) revoked)`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  if (err instanceof ConfigError || err instanceof AdminExistsError) console.error(err.message);
  else if (err && err.name === 'ZodError') console.error(`Invalid input:\n${err.issues.map((/** @type {{ path: PropertyKey[], message: string }} */ i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  else console.error(`create-admin failed: ${err?.message ?? err}`);
  process.exit(1);
});
