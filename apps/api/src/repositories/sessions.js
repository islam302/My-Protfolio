// @ts-check

/** @typedef {import('../db/types.js').Queryable} Queryable */

/**
 * @typedef {{ id: string, adminId: string, email: string, csrfToken: string, createdAt: Date, lastSeenAt: Date, expiresAt: Date }} SessionRecord
 */

/**
 * @param {Queryable} db
 * @param {{ tokenHash: Buffer, adminId: string, csrfToken: string, ipHash: string | null, userAgent: string | null, now: Date, expiresAt: Date }} s
 * @returns {Promise<string>} session id
 */
export async function insertSession(db, s) {
  const { rows } = await db.query(
    `INSERT INTO sessions (token_hash, admin_id, csrf_token, ip, user_agent, created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7) RETURNING id`,
    [s.tokenHash, s.adminId, s.csrfToken, s.ipHash, s.userAgent, s.now, s.expiresAt],
  );
  return rows[0].id;
}

/**
 * @param {Queryable} db
 * @param {Buffer} tokenHash
 * @returns {Promise<SessionRecord | null>}
 */
export async function findSessionByTokenHash(db, tokenHash) {
  const { rows } = await db.query(
    `SELECT s.id, s.admin_id, a.email, s.csrf_token, s.created_at, s.last_seen_at, s.expires_at
       FROM sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.token_hash = $1`,
    [tokenHash],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    adminId: r.admin_id,
    email: r.email,
    csrfToken: r.csrf_token,
    createdAt: new Date(r.created_at),
    lastSeenAt: new Date(r.last_seen_at),
    expiresAt: new Date(r.expires_at),
  };
}

/**
 * @param {Queryable} db
 * @param {string} id
 * @param {Date} now
 */
export async function touchSession(db, id, now) {
  await db.query('UPDATE sessions SET last_seen_at = $2 WHERE id = $1', [id, now]);
}

/** @param {Queryable} db @param {string} id */
export async function deleteSession(db, id) {
  await db.query('DELETE FROM sessions WHERE id = $1', [id]);
}

/** @param {Queryable} db @param {Buffer} tokenHash */
export async function deleteSessionByTokenHash(db, tokenHash) {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

/** @param {Queryable} db @param {string} adminId */
export async function deleteSessionsForAdmin(db, adminId) {
  const { rowCount } = await db.query('DELETE FROM sessions WHERE admin_id = $1', [adminId]);
  return rowCount;
}

/**
 * Lazy cleanup: drop sessions past their absolute expiry or idle deadline.
 * @param {Queryable} db
 * @param {Date} now
 * @param {Date} idleCutoff  sessions last seen before this are idle-expired
 */
export async function deleteExpiredSessions(db, now, idleCutoff) {
  await db.query('DELETE FROM sessions WHERE expires_at <= $1 OR last_seen_at <= $2', [now, idleCutoff]);
}
