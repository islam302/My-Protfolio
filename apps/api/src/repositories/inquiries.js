// @ts-check
import { escapeLike } from '../lib/sql.js';

/** @typedef {import('../db/types.js').Queryable} Queryable */

/**
 * Public shape of an inquiry. Never includes ip_hash or user_agent.
 * @typedef {{
 *   id: string, name: string, type: string, budget: string | null, timeline: string | null,
 *   message: string, channel: string, status: string, notes: string | null,
 *   createdAt: string, updatedAt: string
 * }} Inquiry
 */

const COLUMNS = 'id, name, project_type, budget, timeline, message, channel, status, notes, created_at, updated_at';

/** @param {unknown} v */
const iso = (v) => (v instanceof Date ? v : new Date(String(v))).toISOString();

/**
 * @param {Record<string, any>} r
 * @returns {Inquiry}
 */
export function toInquiry(r) {
  return {
    id: r.id,
    name: r.name,
    type: r.project_type,
    budget: r.budget ?? null,
    timeline: r.timeline ?? null,
    message: r.message,
    channel: r.channel,
    status: r.status,
    notes: r.notes ?? null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/**
 * @param {Queryable} db
 * @param {{ name: string, type: string, budget: string | null, timeline: string | null, message: string, channel: string, ipHash: string | null, userAgent: string | null }} input
 * @returns {Promise<{ id: string, createdAt: string }>}
 */
export async function insertInquiry(db, input) {
  const { rows } = await db.query(
    `INSERT INTO inquiries (name, project_type, budget, timeline, message, channel, ip_hash, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [input.name, input.type, input.budget, input.timeline, input.message, input.channel, input.ipHash, input.userAgent],
  );
  return { id: rows[0].id, createdAt: iso(rows[0].created_at) };
}

/**
 * @param {Queryable} db
 * @param {{ page: number, pageSize: number, status?: string, type?: string, q?: string, sort: 'createdAt' | '-createdAt' }} query
 * @returns {Promise<{ items: Inquiry[], total: number }>}
 */
export async function listInquiries(db, query) {
  /** @type {string[]} */
  const where = [];
  /** @type {unknown[]} */
  const params = [];
  const add = (/** @type {unknown} */ v) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (query.status) where.push(`status = ${add(query.status)}`);
  if (query.type) where.push(`project_type = ${add(query.type)}`);
  if (query.q) {
    const p = add(`%${escapeLike(query.q)}%`);
    where.push(`(name ILIKE ${p} ESCAPE '\\' OR message ILIKE ${p} ESCAPE '\\')`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // Only two fixed orderings exist; never interpolate user input into ORDER BY.
  const order = query.sort === 'createdAt' ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';

  const countRes = await db.query(`SELECT count(*)::int AS total FROM inquiries ${whereSql}`, params);
  const total = Number(countRes.rows[0].total);

  const limit = add(query.pageSize);
  const offset = add((query.page - 1) * query.pageSize);
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM inquiries ${whereSql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
  return { items: rows.map(toInquiry), total };
}

/**
 * @param {Queryable} db
 * @param {string} id
 */
export async function findInquiry(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM inquiries WHERE id = $1`, [id]);
  return rows[0] ? toInquiry(rows[0]) : null;
}

/**
 * Row lock + current values, used to compute the audit diff inside a transaction.
 * @param {Queryable} db
 * @param {string} id
 */
export async function findInquiryForUpdate(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM inquiries WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ? toInquiry(rows[0]) : null;
}

/**
 * @param {Queryable} db
 * @param {string} id
 * @param {{ status?: string, notes?: string | null }} patch
 */
export async function updateInquiry(db, id, patch) {
  /** @type {string[]} */
  const sets = [];
  /** @type {unknown[]} */
  const params = [id];
  if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.notes !== undefined) {
    params.push(patch.notes);
    sets.push(`notes = $${params.length}`);
  }
  if (!sets.length) return findInquiry(db, id);
  const { rows } = await db.query(`UPDATE inquiries SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`, params);
  return rows[0] ? toInquiry(rows[0]) : null;
}

/**
 * @param {Queryable} db
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteInquiry(db, id) {
  const { rows } = await db.query('DELETE FROM inquiries WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}
