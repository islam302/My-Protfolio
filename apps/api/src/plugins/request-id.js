// @ts-check
import { randomUUID } from 'node:crypto';

const SAFE_ID = /^[A-Za-z0-9._:-]{8,64}$/;

/**
 * Fastify `genReqId`: reuse a well-formed upstream `X-Request-Id` (e.g. from nginx), else a UUID.
 * Anything else is replaced so it cannot be used for log injection.
 * @param {import('node:http').IncomingMessage} req
 */
export function genReqId(req) {
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
}

/**
 * Echo the request id on every response, errors and 404s included.
 * @param {import('fastify').FastifyInstance} app
 */
export function registerRequestId(app) {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
}
