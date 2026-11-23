// @ts-check
import { insertAudit } from '../repositories/audit.js';

/** @typedef {import('../db/types.js').Queryable} Queryable */

/** Audit actions written by the API. */
export const AUDIT = Object.freeze({
  inquiryUpdate: 'inquiry.update',
  inquiryDelete: 'inquiry.delete',
  login: 'auth.login',
  logout: 'auth.logout',
  lockout: 'auth.lockout',
});

/**
 * Record an audit entry. Pass the transaction handle so the entry commits with the change.
 * @param {Queryable} q
 * @param {string | null} adminId
 * @param {string} action
 * @param {string} entity
 * @param {string | null} entityId
 * @param {Record<string, unknown> | null} [meta]
 */
export function audit(q, adminId, action, entity, entityId, meta = null) {
  return insertAudit(q, { adminId, action, entity, entityId, meta });
}
