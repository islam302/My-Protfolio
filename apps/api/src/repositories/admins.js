// @ts-check

/** @typedef {import('../db/types.js').Queryable} Queryable */

/**
 * @typedef {{ id: string, email: string, passwordHash: string, failedAttempts: number, lockedUntil: Date | null }} AdminRecord
 */

/** @param {Record<string, any>} r @returns {AdminRecord} */
const toAdmin = (r) => ({
  id: r.id,
  email: r.email,
  passwordHash: r.password_hash,
  failedAttempts: Number(r.failed_attempts),
  lockedUntil: r.locked_until ? new Date(r.locked_until) : null,
});

const COLUMNS = 'id, email, password_hash, failed_attempts, locked_until';

/**
 * @param {Queryable} db
 * @param {string} email
 */
export async function findAdminByEmail(db, email) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM admins WHERE lower(email) = lower($1)`, [email]);
  return rows[0] ? toAdmin(rows[0]) : null;
}

/**
 * @param {Queryable} db
 * @param {string} id
 */
export async function findAdminById(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM admins WHERE id = $1`, [id]);
  return rows[0] ? toAdmin(rows[0]) : null;
}

/**
 * @param {Queryable} db
 * @param {string} email
 * @param {string} passwordHash
 */
export async function insertAdmin(db, email, passwordHash) {
  const { rows } = await db.query(`INSERT INTO admins (email, password_hash) VALUES ($1, $2) RETURNING ${COLUMNS}`, [email, passwordHash]);
  return toAdmin(rows[0]);
}

/**
 * Set a new password and clear any lockout.
 * @param {Queryable} db
 * @param {string} id
 * @param {string} passwordHash
 */
export async function resetAdminPassword(db, id, passwordHash) {
  await db.query('UPDATE admins SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1', [id, passwordHash]);
}

/**
 * Reserve one login attempt BEFORE the password is verified, so concurrent requests can never
 * evaluate more than `maxFailures` guesses per lockout window (SEC-01). One atomic UPDATE:
 *  - no row is returned when the account is currently locked (the attempt must be refused);
 *  - otherwise the attempt is counted, and the attempt that reaches `maxFailures` locks the
 *    account until `lockUntil` and resets the counter (Postgres evaluates every SET expression
 *    against the old row). A successful login later clears both (`recordSuccessfulLogin`).
 * @param {Queryable} db
 * @param {string} id
 * @param {number} maxFailures
 * @param {Date} now
 * @param {Date} lockUntil
 * @returns {Promise<{ allowed: boolean, triggeredLock: boolean }>}
 */
export async function reserveLoginAttempt(db, id, maxFailures, now, lockUntil) {
  const { rows } = await db.query(
    `UPDATE admins SET
       failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
       locked_until    = CASE WHEN failed_attempts + 1 >= $2 THEN $4::timestamptz ELSE locked_until END
     WHERE id = $1 AND (locked_until IS NULL OR locked_until <= $3::timestamptz)
     RETURNING (locked_until IS NOT NULL AND locked_until > $3::timestamptz) AS triggered_lock`,
    [id, maxFailures, now, lockUntil],
  );
  return rows[0] ? { allowed: true, triggeredLock: rows[0].triggered_lock === true } : { allowed: false, triggeredLock: false };
}

/**
 * @param {Queryable} db
 * @param {string} id
 * @param {Date} now
 */
export async function recordSuccessfulLogin(db, id, now) {
  await db.query('UPDATE admins SET failed_attempts = 0, locked_until = NULL, last_login_at = $2 WHERE id = $1', [id, now]);
}
