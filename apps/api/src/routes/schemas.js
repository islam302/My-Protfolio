// @ts-check
import { PROJECT_TYPES, CHANNELS, INQUIRY_STATUSES } from '@portfolio/validation';

/**
 * JSON Schemas for responses. They document the API (OpenAPI) and, through fast-json-stringify,
 * guarantee that only listed fields are ever serialised (e.g. ip_hash can never leak).
 */

const nullableString = { type: ['string', 'null'] };

export const inquirySchema = {
  type: 'object',
  required: ['id', 'name', 'type', 'budget', 'timeline', 'message', 'channel', 'status', 'notes', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    type: { type: 'string', enum: [...PROJECT_TYPES] },
    budget: nullableString,
    timeline: nullableString,
    message: { type: 'string' },
    channel: { type: 'string', enum: [...CHANNELS] },
    status: { type: 'string', enum: [...INQUIRY_STATUSES] },
    notes: nullableString,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const adminSchema = {
  type: 'object',
  required: ['id', 'email'],
  properties: { id: { type: 'string', format: 'uuid' }, email: { type: 'string' } },
};

export const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object', additionalProperties: true } },
        requestId: { type: 'string' },
      },
    },
  },
};

/** @param {object} data */
export const envelope = (data) => ({ type: 'object', required: ['data'], properties: { data } });

/** Error responses, documented only (errors are serialised by the error handler). */
export const errors = (/** @type {number[]} */ ...codes) => Object.fromEntries(codes.map((c) => [c, { description: 'Error', ...errorSchema }]));

export const sessionTag = [{ cookieAuth: [] }];
export const csrfSecurity = [{ cookieAuth: [], csrfToken: [] }];
