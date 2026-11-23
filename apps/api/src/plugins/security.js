// @ts-check
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';

/**
 * Security headers for a JSON API (no HTML is served except Swagger UI, which sets its own CSP)
 * plus an opt-in CORS allowlist for split-origin development.
 * @param {import('fastify').FastifyInstance} app
 * @param {import('../config.js').AppConfig} config
 */
export async function registerSecurity(app, config) {
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    // HSTS only means something over TLS; nginx may also set it.
    strictTransportSecurity: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });

  if (config.corsOrigins.length) {
    await app.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 600,
    });
  }

  // API responses are per-user and must never be cached by browsers or proxies.
  app.addHook('onSend', async (request, reply, payload) => {
    if (!request.url.startsWith('/api/docs')) reply.header('cache-control', 'no-store');
    return payload;
  });
}
