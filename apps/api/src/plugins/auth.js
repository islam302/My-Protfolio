// @ts-check
import { safeEqual } from '../lib/tokens.js';
import { unauthenticated, csrfFailed } from '../lib/errors.js';

/** @typedef {import('fastify').FastifyRequest} FastifyRequest */
/** @typedef {import('fastify').FastifyReply} FastifyReply */
/** @typedef {import('../repositories/sessions.js').SessionRecord} SessionRecord */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Session + CSRF guards for the admin scope. The resolved session is kept in a WeakMap
 * (no request decoration needed, and it disappears with the request).
 *
 * @param {{ config: import('../config.js').AppConfig, auth: import('../services/auth.js').AuthService }} deps
 */
export function createAuthGuards({ config, auth }) {
  /** @type {WeakMap<FastifyRequest, SessionRecord>} */
  const sessions = new WeakMap();
  const allowedOrigins = new Set([...(config.publicOrigin ? [config.publicOrigin] : []), ...config.corsOrigins]);

  const cookieOptions = /** @type {const} */ ({
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
  });

  return {
    cookieName: config.cookieName,

    /** @param {FastifyRequest} request */
    getSession(request) {
      return sessions.get(request);
    },

    /** @param {FastifyRequest} request */
    readToken(request) {
      return request.cookies[config.cookieName];
    },

    /**
     * @param {FastifyReply} reply
     * @param {string} token
     * @param {number} maxAgeSeconds
     */
    setSessionCookie(reply, token, maxAgeSeconds) {
      reply.setCookie(config.cookieName, token, { ...cookieOptions, maxAge: maxAgeSeconds });
    },

    /** @param {FastifyReply} reply */
    clearSessionCookie(reply) {
      reply.clearCookie(config.cookieName, cookieOptions);
    },

    /**
     * preHandler: require a valid session.
     * @param {FastifyRequest} request
     * @param {FastifyReply} reply
     */
    async requireSession(request, reply) {
      const token = request.cookies[config.cookieName];
      const hadCookie = Object.hasOwn(request.cookies, config.cookieName);
      const session = await auth.authenticate(token);
      if (!session) {
        if (hadCookie) reply.clearCookie(config.cookieName, cookieOptions);
        throw unauthenticated();
      }
      sessions.set(request, session);
    },

    /**
     * preHandler: reject cross-site Origins on state-changing requests (login included).
     * With no configured origin (dev only) the Origin must match the request's own host.
     * @param {FastifyRequest} request
     */
    async checkOrigin(request) {
      if (!MUTATING.has(request.method)) return;
      const origin = request.headers.origin;
      if (origin === undefined) return;
      const ok = allowedOrigins.size ? allowedOrigins.has(origin) : origin === `${request.protocol}://${request.host}`;
      if (!ok) throw csrfFailed('Origin not allowed');
    },

    /**
     * preHandler: synchronizer-token check for state-changing requests. Runs after requireSession.
     * @param {FastifyRequest} request
     */
    async checkCsrfToken(request) {
      if (!MUTATING.has(request.method)) return;
      const session = sessions.get(request);
      const header = request.headers['x-csrf-token'];
      if (!session || typeof header !== 'string' || header.length === 0 || !safeEqual(header, session.csrfToken)) {
        throw csrfFailed();
      }
    },
  };
}

/** @typedef {ReturnType<typeof createAuthGuards>} AuthGuards */
