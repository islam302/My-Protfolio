// @ts-check
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Opaque random token, base64url. 32 bytes = 256 bits. */
export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/**
 * SHA-256 of a token; this is what is stored for sessions (raw tokens never touch the DB).
 * @param {string} token
 */
export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * Constant-time string comparison that does not leak length (both sides are hashed first).
 * @param {string} a
 * @param {string} b
 */
export function safeEqual(a, b) {
  return timingSafeEqual(hashToken(a), hashToken(b));
}

/**
 * HMAC-SHA256(secret, ip) as hex. Raw IPs are never stored.
 * @param {string} secret
 * @param {string} ip
 */
export function hashIp(secret, ip) {
  return createHmac('sha256', secret).update(ip, 'utf8').digest('hex');
}
