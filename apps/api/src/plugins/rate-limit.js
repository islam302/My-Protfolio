// @ts-check
import rateLimit from '@fastify/rate-limit';
import { AppError } from '../lib/errors.js';

/**
 * Registers the global limiter (every route unless `config.rateLimit: false`) and returns
 * factories for the stricter per-category limiters, which stack on top of the global one.
 * Uses Redis when a client is supplied (shared across instances), memory otherwise.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ rules: import('../config.js').RateLimits, redis?: import('ioredis').Redis | null }} opts
 */
export async function registerRateLimits(app, { rules, redis }) {
  await app.register(rateLimit, {
    global: true,
    max: rules.global.max,
    timeWindow: rules.global.timeWindow,
    ...(redis ? { redis, nameSpace: 'pf-rl:' } : {}),
    // Fail open if Redis is unreachable: availability of the public form beats strict limiting.
    skipOnError: true,
    errorResponseBuilder: (_req, ctx) => new AppError(429, 'RATE_LIMITED', `Too many requests, retry in ${ctx.after}`),
  });

  /**
   * @param {string} name
   * @param {import('../config.js').RateLimitRule} rule
   * @param {(req: import('fastify').FastifyRequest) => string} key
   */
  const make = (name, rule, key) => {
    // createRateLimit (not app.rateLimit): the plugin's own hooks run at most once per request,
    // so a second `app.rateLimit()` hook would silently skip the global limit or vice versa.
    const check = app.createRateLimit({ max: rule.max, timeWindow: rule.timeWindow, keyGenerator: (req) => `${name}:${key(req)}` });
    /**
     * @param {import('fastify').FastifyRequest} req
     * @param {import('fastify').FastifyReply} reply
     */
    return async (req, reply) => {
      const r = await check(req);
      if (r.isAllowed || !r.isExceeded) return;
      reply.header('retry-after', r.ttlInSeconds);
      throw new AppError(429, 'RATE_LIMITED', `Too many requests, retry in ${r.ttlInSeconds} seconds`);
    };
  };

  return {
    /** POST /api/v1/inquiries: per IP. */
    inquiry: () => make('inquiry', rules.inquiry, (req) => req.ip),
    /** POST /admin/auth/login: per IP. */
    login: () => make('login', rules.login, (req) => req.ip),
    /** Admin routes: per session (when resolved) or IP. */
    admin: (/** @type {(req: import('fastify').FastifyRequest) => string | undefined} */ sessionId) =>
      make('admin', rules.admin, (req) => {
        const sid = sessionId(req);
        return sid ? `s:${sid}` : `ip:${req.ip}`;
      }),
  };
}

/** @typedef {Awaited<ReturnType<typeof registerRateLimits>>} Limiters */
