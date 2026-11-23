// @ts-check
import { randomUUID } from 'node:crypto';
import * as repo from '../repositories/inquiries.js';
import { hashIp } from '../lib/tokens.js';
import { notFound } from '../lib/errors.js';
import { audit, AUDIT } from './audit.js';

/** @typedef {import('../db/types.js').Database} Database */
/** @typedef {import('@portfolio/validation').InquiryCreate} InquiryCreate */
/** @typedef {import('@portfolio/validation').InquiryUpdate} InquiryUpdate */
/** @typedef {import('@portfolio/validation').InquiryListQuery} InquiryListQuery */

const UA_MAX = 512;

/**
 * @param {{ db: Database, ipHashSecret: string, clock: import('../lib/clock.js').Clock }} deps
 */
export function createInquiryService({ db, ipHashSecret, clock }) {
  return {
    /**
     * Store a public inquiry. A filled honeypot gets a convincing fake receipt and nothing is stored.
     * @param {InquiryCreate} input
     * @param {{ ip: string, userAgent: string | undefined }} meta
     */
    async create(input, meta) {
      if (isHoneypotFilled(input.website)) return fakeReceipt(clock);
      return repo.insertInquiry(db, {
        name: input.name,
        type: input.type,
        budget: input.budget,
        timeline: input.timeline,
        message: input.message,
        channel: input.channel,
        ipHash: hashIp(ipHashSecret, meta.ip),
        userAgent: meta.userAgent ? meta.userAgent.slice(0, UA_MAX) : null,
      });
    },

    /** @param {InquiryListQuery} query */
    async list(query) {
      const { items, total } = await repo.listInquiries(db, {
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        type: query.type,
        q: query.q || undefined,
        sort: query.sort,
      });
      return { items, meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
    },

    /** @param {string} id */
    async get(id) {
      const inquiry = await repo.findInquiry(db, id);
      if (!inquiry) throw notFound('Inquiry not found');
      return inquiry;
    },

    /**
     * @param {string} id
     * @param {InquiryUpdate} patch
     * @param {string} adminId
     */
    async update(id, patch, adminId) {
      // Empty notes are stored as NULL so "no notes" has a single representation.
      const notes = patch.notes === undefined ? undefined : patch.notes === null || patch.notes.trim() === '' ? null : patch.notes;
      return db.tx(async (q) => {
        const before = await repo.findInquiryForUpdate(q, id);
        if (!before) throw notFound('Inquiry not found');
        const after = await repo.updateInquiry(q, id, { status: patch.status, notes });
        if (!after) throw notFound('Inquiry not found');
        /** @type {Record<string, unknown>} */
        const changes = {};
        if (patch.status !== undefined && before.status !== after.status) changes.status = { from: before.status, to: after.status };
        if (notes !== undefined && before.notes !== after.notes) changes.notes = { changed: true }; // content not copied into the log
        await audit(q, adminId, AUDIT.inquiryUpdate, 'inquiry', id, { changes });
        return after;
      });
    },

    /**
     * @param {string} id
     * @param {string} adminId
     */
    async remove(id, adminId) {
      await db.tx(async (q) => {
        const deleted = await repo.deleteInquiry(q, id);
        if (!deleted) throw notFound('Inquiry not found');
        await audit(q, adminId, AUDIT.inquiryDelete, 'inquiry', id, null);
      });
    },
  };
}

/** @param {string | undefined} v */
export function isHoneypotFilled(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** @param {import('../lib/clock.js').Clock} clock */
function fakeReceipt(clock) {
  return { id: randomUUID(), createdAt: clock.now().toISOString() };
}

/** @typedef {ReturnType<typeof createInquiryService>} InquiryService */
