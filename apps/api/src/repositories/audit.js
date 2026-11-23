// @ts-check

/** @typedef {import('../db/types.js').Queryable} Queryable */

/**
 * @param {Queryable} db
 * @param {{ adminId: string | null, action: string, entity: string, entityId: string | null, meta?: Record<string, unknown> | null }} entry
 */
export async function insertAudit(db, entry) {
  await db.query('INSERT INTO audit_log (admin_id, action, entity, entity_id, meta) VALUES ($1, $2, $3, $4, $5::jsonb)', [
    entry.adminId,
    entry.action,
    entry.entity,
    entry.entityId,
    entry.meta == null ? null : JSON.stringify(entry.meta),
  ]);
}
