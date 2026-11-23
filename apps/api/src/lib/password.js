// @ts-check
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with scrypt (node:crypto). Stored format:
 *   scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
 * Parameters live in the hash, so the cost can be raised later without a migration.
 */

/** @typedef {{ N: number, r: number, p: number }} ScryptParams */

/** @type {ScryptParams} */
export const DEFAULT_SCRYPT = Object.freeze({ N: 2 ** 15, r: 8, p: 1 });
const KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * @param {string} password
 * @param {Buffer} salt
 * @param {ScryptParams} params
 * @returns {Promise<Buffer>}
 */
function derive(password, salt, { N, r, p }) {
  // scrypt needs ~128 * N * r bytes; allow headroom above the default 32 MiB cap.
  const maxmem = 256 * N * r + 1024 * 1024;
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/**
 * @param {string} password
 * @param {ScryptParams} [params]
 */
export async function hashPassword(password, params = DEFAULT_SCRYPT) {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, params);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * @param {string} stored
 * @returns {{ params: ScryptParams, salt: Buffer, key: Buffer } | null}
 */
function parse(stored) {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const valid = (/** @type {number} */ n, /** @type {number} */ max) => Number.isInteger(n) && n > 0 && n <= max;
  // N must be a power of two; bounds stop a corrupted row from exhausting memory.
  if (!valid(N, 2 ** 20) || (N & (N - 1)) !== 0 || !valid(r, 32) || !valid(p, 16)) return null;
  const salt = Buffer.from(parts[4], 'base64');
  const key = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || key.length !== KEYLEN) return null;
  return { params: { N, r, p }, salt, key };
}

/**
 * Constant-time verification. Returns false for malformed hashes.
 * @param {string} password
 * @param {string} stored
 */
export async function verifyPassword(password, stored) {
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed.params);
  return timingSafeEqual(key, parsed.key);
}
