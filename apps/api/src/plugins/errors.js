// @ts-check
import { AppError } from '../lib/errors.js';

/**
 * @typedef {{ code: string, message: string, details?: unknown[], requestId: string }} ErrorBody
 */

const BY_STATUS = /** @type {Record<number, string>} */ ({
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
});

/**
 * @param {unknown} err
 * @returns {err is { name: 'ZodError', issues: Array<{ path: PropertyKey[], message: string, code: string, keys?: string[] }> }}
 */
function isZodError(err) {
  return typeof err === 'object' && err !== null && /** @type {any} */ (err).name === 'ZodError' && Array.isArray(/** @type {any} */ (err).issues);
}

/**
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string, details?: unknown[] }}
 */
export function toErrorResponse(err) {
  if (err instanceof AppError) {
    return { status: err.statusCode, code: err.code, message: err.message, details: err.details };
  }
  if (isZodError(err)) {
    const location = /** @type {any} */ (err).validationContext;
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.issues.map((i) => ({
        ...(location ? { in: location } : {}),
        field: i.path.map(String).join('.') || (i.keys ? i.keys.join(',') : ''),
        code: i.code,
        message: i.message,
      })),
    };
  }
  const e = /** @type {{ statusCode?: unknown, code?: unknown }} */ (err ?? {});
  const status = typeof e.statusCode === 'number' ? e.statusCode : 500;
  switch (e.code) {
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
      return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' };
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
      return { status: 400, code: 'VALIDATION_ERROR', message: 'Malformed JSON body' };
    default:
  }
  if (status >= 400 && status < 500) {
    const code = BY_STATUS[status] ?? 'VALIDATION_ERROR';
    // Fastify/parser 4xx messages are generic and safe; still, keep a fixed vocabulary.
    const message = status === 400 ? 'Malformed request' : code === 'VALIDATION_ERROR' ? 'Bad request' : code.toLowerCase().replace(/_/g, ' ');
    return { status: BY_STATUS[status] ? status : 400, code, message };
  }
  return { status: 500, code: 'INTERNAL', message: 'Internal server error' };
}

/**
 * Uniform error envelope, JSON 404s, and logging that never leaks to clients.
 * @param {import('fastify').FastifyInstance} app
 */
export function registerErrorHandling(app) {
  app.setErrorHandler((err, request, reply) => {
    const { status, code, message, details } = toErrorResponse(err);
    if (status >= 500) {
      // Full error (stack, SQL message) goes to the log only; request id ties it to the response.
      request.log.error({ err, requestId: request.id }, 'request failed');
    } else {
      request.log.info({ code, status, requestId: request.id }, message);
    }
    /** @type {ErrorBody} */
    const body = { code, message, requestId: request.id };
    if (details && details.length) body.details = details;
    return reply.code(status).type('application/json; charset=utf-8').send({ error: body });
  });

  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (request, reply) => {
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: request.id } });
  });
}
