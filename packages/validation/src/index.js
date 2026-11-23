// @ts-check
import { z } from 'zod';
import { PROJECT_TYPES, BUDGETS, TIMELINES, CHANNELS, INQUIRY_STATUSES, LIMITS, HONEYPOT_FIELD } from './constants.js';

export * from './constants.js';

/** Strip C0/C1 control characters except tab/newline, and normalise line endings. */
// Control characters are matched on purpose: they are stripped from user text.
// eslint-disable-next-line no-control-regex
const clean = (/** @type {string} */ s) => s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

const text = (/** @type {number} */ min, /** @type {number} */ max) =>
  z.string().transform(clean).pipe(z.string().trim().min(min).max(max));

/** Optional select: "" or missing means "not given". */
const optionalEnum = (/** @type {readonly [string, ...string[]]} */ values) =>
  z
    .union([z.enum(values), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null));

/** Public body of POST /api/v1/inquiries. Unknown keys are rejected (no mass assignment). */
export const inquiryCreateSchema = z
  .object({
    name: text(1, LIMITS.nameMax),
    type: z.enum(PROJECT_TYPES),
    budget: optionalEnum(BUDGETS),
    timeline: optionalEnum(TIMELINES),
    message: text(LIMITS.messageMin, LIMITS.messageMax),
    channel: z.enum(CHANNELS),
    [HONEYPOT_FIELD]: z.string().max(200).optional(),
  })
  .strict();

/** Body of PATCH /api/v1/admin/inquiries/:id. At least one field. */
export const inquiryUpdateSchema = z
  .object({
    status: z.enum(INQUIRY_STATUSES).optional(),
    notes: z.string().transform(clean).pipe(z.string().max(LIMITS.notesMax)).nullable().optional(),
  })
  .strict()
  .refine((v) => v.status !== undefined || v.notes !== undefined, { message: 'Nothing to update' });

/** Query of GET /api/v1/admin/inquiries. */
export const inquiryListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(INQUIRY_STATUSES).optional(),
    type: z.enum(PROJECT_TYPES).optional(),
    q: z.string().trim().max(100).optional(),
    sort: z.enum(['createdAt', '-createdAt']).default('-createdAt'),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(LIMITS.emailMax),
    password: z.string().min(1).max(LIMITS.passwordMax),
  })
  .strict();

export const uuidParamSchema = z.object({ id: z.string().uuid() }).strict();

/** @typedef {z.infer<typeof inquiryCreateSchema>} InquiryCreate */
/** @typedef {z.infer<typeof inquiryUpdateSchema>} InquiryUpdate */
/** @typedef {z.infer<typeof inquiryListQuerySchema>} InquiryListQuery */
