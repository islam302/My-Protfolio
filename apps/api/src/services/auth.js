// @ts-check
import { hashPassword, verifyPassword } from '../lib/password.js';
import { generateToken, hashToken, hashIp } from '../lib/tokens.js';
import { unauthenticated } from '../lib/errors.js';
import * as admins from '../repositories/admins.js';
import * as sessions from '../repositories/sessions.js';
import { audit, AUDIT } from './audit.js';

/** @typedef {import('../db/types.js').Database} Database */
/** @typedef {import('../repositories/sessions.js').SessionRecord} SessionRecord */

export const INVALID_CREDENTIALS = 'Invalid email or password';
const UA_MAX = 512;

/**
 * @typedef {{
 *   db: Database,
 *   clock: import('../lib/clock.js').Clock,
 *   ipHashSecret: string,
 *   session: { idleMs: number, absoluteMs: number, touchIntervalMs: number },
 *   lockout: { maxFailures: number, durationMs: number },
 *   scrypt: import('../lib/password.js').ScryptParams,
 * }} AuthDeps
 */

/** @param {AuthDeps} deps */
export function createAuthService({ db, clock, ipHashSecret, session: sessionCfg, lockout, scrypt }) {
  // Verified against when the email is unknown, so both paths cost one scrypt with the same params.
  /** @type {Promise<string>} */
  const dummyHash = hashPassword(generateToken(24), scrypt);

  return {
    /**
     * Verify credentials and open a new session (rotating any session the client already had).
     * Every failure (unknown email, wrong password, locked) throws the same 401.
     * @param {{ email: string, password: string }} creds
     * @param {{ ip: string, userAgent: string | undefined, currentToken: string | undefined }} ctx
     */
    async login({ email, password }, ctx) {
      const now = clock.now();
      const admin = await admins.findAdminByEmail(db, email);
      // The attempt is counted atomically before the (slow) password check, so a burst of
      // concurrent guesses cannot all read the same pre-lock state (SEC-01). Both paths still
      // run exactly one scrypt with the same parameters.
      const attempt = admin
        ? await admins.reserveLoginAttempt(db, admin.id, lockout.maxFailures, now, new Date(now.getTime() + lockout.durationMs))
        : null;
      const ok = await verifyPassword(password, admin ? admin.passwordHash : await dummyHash);
      if (!admin || !attempt) throw unauthenticated(INVALID_CREDENTIALS);

      if (!attempt.allowed) throw unauthenticated(INVALID_CREDENTIALS); // locked
      if (!ok) {
        if (attempt.triggeredLock) await audit(db, admin.id, AUDIT.lockout, 'admin', admin.id, null);
        throw unauthenticated(INVALID_CREDENTIALS);
      }

      const token = generateToken(32);
      const csrfToken = generateToken(32);
      const ipHash = hashIp(ipHashSecret, ctx.ip);
      await db.tx(async (q) => {
        if (ctx.currentToken) await sessions.deleteSessionByTokenHash(q, hashToken(ctx.currentToken));
        await sessions.deleteExpiredSessions(q, now, new Date(now.getTime() - sessionCfg.idleMs));
        await admins.recordSuccessfulLogin(q, admin.id, now);
        await sessions.insertSession(q, {
          tokenHash: hashToken(token),
          adminId: admin.id,
          csrfToken,
          ipHash,
          userAgent: ctx.userAgent ? ctx.userAgent.slice(0, UA_MAX) : null,
          now,
          expiresAt: new Date(now.getTime() + sessionCfg.absoluteMs),
        });
        await audit(q, admin.id, AUDIT.login, 'admin', admin.id, null);
      });
      return { token, csrfToken, admin: { id: admin.id, email: admin.email }, maxAgeSeconds: Math.floor(sessionCfg.absoluteMs / 1000) };
    },

    /**
     * Resolve a session cookie. Expired sessions (idle or absolute) are deleted lazily.
     * @param {string | undefined} token
     * @returns {Promise<SessionRecord | null>}
     */
    async authenticate(token) {
      if (!token || token.length > 128) return null;
      const s = await sessions.findSessionByTokenHash(db, hashToken(token));
      if (!s) return null;
      const now = clock.now();
      const idleExpired = now.getTime() - s.lastSeenAt.getTime() >= sessionCfg.idleMs;
      const absoluteExpired = now >= s.expiresAt;
      if (idleExpired || absoluteExpired) {
        await sessions.deleteSession(db, s.id);
        return null;
      }
      // Throttle writes: refresh last_seen_at at most once per touch interval.
      if (now.getTime() - s.lastSeenAt.getTime() >= sessionCfg.touchIntervalMs) {
        await sessions.touchSession(db, s.id, now);
        s.lastSeenAt = now;
      }
      return s;
    },

    /** @param {SessionRecord} s */
    async logout(s) {
      await db.tx(async (q) => {
        await sessions.deleteSession(q, s.id);
        await audit(q, s.adminId, AUDIT.logout, 'admin', s.adminId, null);
      });
    },
  };
}

/** @typedef {ReturnType<typeof createAuthService>} AuthService */
