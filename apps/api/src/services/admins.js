// @ts-check
import { z } from 'zod';
import { LIMITS } from '@portfolio/validation';
import { hashPassword } from '../lib/password.js';
import * as admins from '../repositories/admins.js';
import * as sessions from '../repositories/sessions.js';

/** @typedef {import('../db/types.js').Database} Database */

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(LIMITS.emailMax),
  password: z
    .string()
    .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters`)
    .max(LIMITS.passwordMax, `Password must be at most ${LIMITS.passwordMax} characters`),
});

export class AdminExistsError extends Error {
  constructor() {
    super('An admin with this email already exists (use --reset to change the password)');
    this.name = 'AdminExistsError';
  }
}

/**
 * Create an admin, or with `reset` replace its password, clear the lockout and revoke its sessions.
 * @param {Database} db
 * @param {{ email: string, password: string, reset?: boolean, scrypt?: import('../lib/password.js').ScryptParams }} input
 * @returns {Promise<{ action: 'created' | 'reset', id: string, email: string, sessionsRevoked: number }>}
 */
export async function upsertAdmin(db, { email, password, reset = false, scrypt }) {
  const creds = credentialsSchema.parse({ email, password });
  const hash = await hashPassword(creds.password, scrypt);
  return db.tx(async (q) => {
    const existing = await admins.findAdminByEmail(q, creds.email);
    if (!existing) {
      const created = await admins.insertAdmin(q, creds.email, hash);
      return { action: 'created', id: created.id, email: created.email, sessionsRevoked: 0 };
    }
    if (!reset) throw new AdminExistsError();
    await admins.resetAdminPassword(q, existing.id, hash);
    const revoked = await sessions.deleteSessionsForAdmin(q, existing.id);
    return { action: 'reset', id: existing.id, email: existing.email, sessionsRevoked: revoked };
  });
}
