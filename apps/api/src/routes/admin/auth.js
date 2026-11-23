// @ts-check
import { loginSchema } from '@portfolio/validation';
import { adminSchema, envelope, errors, sessionTag, csrfSecurity } from '../schemas.js';

/** @typedef {import('../../plugins/auth.js').AuthGuards} AuthGuards */

const sessionPayload = envelope({
  type: 'object',
  required: ['admin', 'csrfToken'],
  properties: { admin: adminSchema, csrfToken: { type: 'string' } },
});

/**
 * POST /login (public). Registered in the admin scope, outside the session guard.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ auth: import('../../services/auth.js').AuthService, guards: AuthGuards, limiters: import('../../plugins/rate-limit.js').Limiters }} deps
 */
export function loginRoute(app, { auth, guards, limiters }) {
  app.post(
    '/auth/login',
    {
      onRequest: [limiters.login(), guards.checkOrigin],
      schema: {
        tags: ['admin-auth'],
        summary: 'Log in (sets the session cookie, returns the CSRF token)',
        body: loginSchema,
        response: { 200: sessionPayload, ...errors(400, 401, 403, 415, 429) },
      },
    },
    async (request, reply) => {
      const creds = /** @type {{ email: string, password: string }} */ (request.body);
      const result = await auth.login(creds, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        currentToken: guards.readToken(request),
      });
      guards.setSessionCookie(reply, result.token, result.maxAgeSeconds);
      return { data: { admin: result.admin, csrfToken: result.csrfToken } };
    },
  );
}

/**
 * POST /logout and GET /me. Registered inside the session guard.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ auth: import('../../services/auth.js').AuthService, guards: AuthGuards }} deps
 */
export function sessionRoutes(app, { auth, guards }) {
  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['admin-auth'],
        summary: 'Log out (deletes the session, clears the cookie)',
        security: csrfSecurity,
        response: { 204: { type: 'null', description: 'Logged out' }, ...errors(401, 403) },
      },
    },
    async (request, reply) => {
      const session = guards.getSession(request);
      if (session) await auth.logout(session);
      guards.clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );

  app.get(
    '/auth/me',
    {
      schema: {
        tags: ['admin-auth'],
        summary: 'Current admin and CSRF token',
        security: sessionTag,
        response: { 200: sessionPayload, ...errors(401) },
      },
    },
    async (request) => {
      const s = /** @type {import('../../repositories/sessions.js').SessionRecord} */ (guards.getSession(request));
      return { data: { admin: { id: s.adminId, email: s.email }, csrfToken: s.csrfToken } };
    },
  );
}
