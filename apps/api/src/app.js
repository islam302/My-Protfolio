// @ts-check
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { randomBytes } from 'node:crypto';

import { systemClock } from './lib/clock.js';
import { genReqId, registerRequestId } from './plugins/request-id.js';
import { registerSecurity } from './plugins/security.js';
import { registerErrorHandling } from './plugins/errors.js';
import { registerRateLimits } from './plugins/rate-limit.js';
import { createAuthGuards } from './plugins/auth.js';
import { registerZodValidation, swaggerTransform } from './plugins/validation.js';
import { createInquiryService } from './services/inquiries.js';
import { createAuthService } from './services/auth.js';
import { healthRoutes } from './routes/health.js';
import { inquiryRoutes } from './routes/inquiries.js';
import { loginRoute, sessionRoutes } from './routes/admin/auth.js';
import { adminInquiryRoutes } from './routes/admin/inquiries.js';

/** Paths redacted from logs wherever they appear. */
export const LOG_REDACT = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'body.password',
];

/**
 * Build the Fastify app without listening (tests use `app.inject()`).
 *
 * @param {{
 *   config: import('./config.js').AppConfig,
 *   db: import('./db/types.js').Database,
 *   logger?: boolean | Record<string, unknown>,
 *   redis?: import('ioredis').Redis | null,
 *   clock?: import('./lib/clock.js').Clock,
 * }} opts
 */
export async function buildApp({ config, db, logger, redis = null, clock = systemClock }) {
  const app = Fastify({
    logger:
      logger === false
        ? false
        : { level: config.logLevel, redact: { paths: LOG_REDACT, censor: '[redacted]' }, ...(typeof logger === 'object' ? logger : {}) },
    genReqId,
    // Trust exactly TRUST_PROXY hops (e.g. 1 behind nginx) when deriving request.ip / protocol.
    trustProxy: config.trustProxy > 0 ? (_addr, hop) => hop < config.trustProxy : false,
    bodyLimit: config.bodyLimit,
    // Only JSON bodies exist in this API; let a malicious prototype key fail parsing outright.
    onProtoPoisoning: 'error',
    onConstructorPoisoning: 'error',
    return503OnClosing: true,
    routerOptions: { ignoreTrailingSlash: true, maxParamLength: 200 },
  });

  // Dev/test without a configured secret get a per-process one (hashes then don't survive restarts).
  const ipHashSecret = config.ipHashSecret ?? randomBytes(32).toString('hex');

  // --- JSON-only body parsing (415 for anything else). Empty JSON bodies count as "no body".
  const jsonParser = app.getDefaultJsonParser('error', 'error');
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === '') return done(null, undefined);
    return jsonParser(req, /** @type {string} */ (body), done);
  });

  registerRequestId(app);
  registerZodValidation(app);
  await registerSecurity(app, config);
  await app.register(cookie);
  const limiters = await registerRateLimits(app, { rules: config.rateLimits, redis });
  registerErrorHandling(app);

  if (config.apiDocs) {
    await app.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: { title: 'Portfolio API', version: '1.0.0', description: 'Inquiry intake and admin API. See docs/API_CONTRACT.md.' },
        components: {
          securitySchemes: {
            cookieAuth: { type: 'apiKey', in: 'cookie', name: config.cookieName },
            csrfToken: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' },
          },
        },
        tags: [{ name: 'health' }, { name: 'inquiries' }, { name: 'admin-auth' }, { name: 'admin-inquiries' }],
      },
      transform: swaggerTransform,
    });
    await app.register(swaggerUi, {
      routePrefix: '/api/docs',
      staticCSP: true,
      uiConfig: { docExpansion: 'list', deepLinking: false },
    });
  }

  const inquiries = createInquiryService({ db, ipHashSecret, clock });
  const auth = createAuthService({ db, clock, ipHashSecret, session: config.session, lockout: config.lockout, scrypt: config.scrypt });
  const guards = createAuthGuards({ config, auth });

  healthRoutes(app, { db });
  inquiryRoutes(app, { inquiries, limiters, clock });

  await app.register(
    async (admin) => {
      loginRoute(admin, { auth, guards, limiters });

      // Everything else under /api/v1/admin requires a session; mutations also need CSRF + Origin.
      // They are appended as route-level onRequest hooks (after the global limiter, which
      // @fastify/rate-limit adds the same way) so unauthenticated requests are rejected
      // before body parsing and validation, and floods are limited before any DB lookup.
      await admin.register(async (guarded) => {
        const adminLimiter = limiters.admin((req) => guards.getSession(req)?.id);
        const chain = [guards.requireSession, adminLimiter, guards.checkOrigin, guards.checkCsrfToken];
        guarded.addHook('onRoute', (route) => {
          const r = /** @type {{ onRequest?: unknown }} */ (route);
          const existing = r.onRequest === undefined ? [] : Array.isArray(r.onRequest) ? r.onRequest : [r.onRequest];
          r.onRequest = [...existing, ...chain];
        });
        sessionRoutes(guarded, { auth, guards });
        adminInquiryRoutes(guarded, { inquiries, guards });
      });
    },
    { prefix: '/api/v1/admin' },
  );

  return app;
}
