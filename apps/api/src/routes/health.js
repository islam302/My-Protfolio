// @ts-check
import { envelope, errors } from './schemas.js';
import { AppError } from '../lib/errors.js';

const READY_TIMEOUT_MS = 2_000;

/**
 * GET /api/health (liveness) and GET /api/health/ready (DB ping). Neither is rate limited.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('../db/types.js').Database }} deps
 */
export function healthRoutes(app, { db }) {
  const statusSchema = envelope({ type: 'object', required: ['status'], properties: { status: { type: 'string' } } });

  app.get(
    '/api/health',
    {
      config: { rateLimit: false },
      schema: { tags: ['health'], summary: 'Liveness', response: { 200: statusSchema } },
    },
    async () => ({ data: { status: 'ok' } }),
  );

  app.get(
    '/api/health/ready',
    {
      config: { rateLimit: false },
      schema: { tags: ['health'], summary: 'Readiness (database ping)', response: { 200: statusSchema, ...errors(503) } },
    },
    async (request) => {
      /** @type {NodeJS.Timeout | undefined} */
      let timer;
      try {
        await Promise.race([
          db.query('SELECT 1'),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('readiness check timed out')), READY_TIMEOUT_MS);
          }),
        ]);
        return { data: { status: 'ok' } };
      } catch (err) {
        request.log.warn({ err }, 'readiness check failed');
        throw new AppError(503, 'UNAVAILABLE', 'Database unavailable');
      } finally {
        clearTimeout(timer);
      }
    },
  );
}
