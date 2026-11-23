// @ts-check
import { inquiryCreateSchema, HONEYPOT_FIELD } from '@portfolio/validation';
import { isHoneypotFilled } from '../services/inquiries.js';
import { envelope, errors } from './schemas.js';
import { randomUUID } from 'node:crypto';

/**
 * POST /api/v1/inquiries (public contact form).
 * @param {import('fastify').FastifyInstance} app
 * @param {{ inquiries: import('../services/inquiries.js').InquiryService, limiters: import('../plugins/rate-limit.js').Limiters, clock: import('../lib/clock.js').Clock }} deps
 */
export function inquiryRoutes(app, { inquiries, limiters, clock }) {
  app.post(
    '/api/v1/inquiries',
    {
      onRequest: [limiters.inquiry()],
      // Honeypot is checked before validation so a bot gets the same 201 even with junk fields.
      preValidation: async (request, reply) => {
        const body = /** @type {Record<string, unknown> | undefined} */ (request.body);
        const trap = body && typeof body === 'object' ? body[HONEYPOT_FIELD] : undefined;
        if (typeof trap === 'string' && isHoneypotFilled(trap)) {
          request.log.info('honeypot triggered; inquiry discarded');
          return reply.code(201).send({ data: { id: randomUUID(), createdAt: clock.now().toISOString() } });
        }
        return undefined;
      },
      schema: {
        tags: ['inquiries'],
        summary: 'Submit a project inquiry',
        body: inquiryCreateSchema,
        response: {
          201: envelope({
            type: 'object',
            required: ['id', 'createdAt'],
            properties: { id: { type: 'string', format: 'uuid' }, createdAt: { type: 'string', format: 'date-time' } },
          }),
          ...errors(400, 413, 415, 429),
        },
      },
    },
    async (request, reply) => {
      const input = /** @type {import('@portfolio/validation').InquiryCreate} */ (request.body);
      const receipt = await inquiries.create(input, { ip: request.ip, userAgent: request.headers['user-agent'] });
      return reply.code(201).send({ data: receipt });
    },
  );
}
