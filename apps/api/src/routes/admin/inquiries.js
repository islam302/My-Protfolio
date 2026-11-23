// @ts-check
import { inquiryListQuerySchema, inquiryUpdateSchema, uuidParamSchema } from '@portfolio/validation';
import { inquirySchema, envelope, errors, sessionTag, csrfSecurity } from '../schemas.js';

/**
 * Admin inquiry management. Registered inside the session guard.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ inquiries: import('../../services/inquiries.js').InquiryService, guards: import('../../plugins/auth.js').AuthGuards }} deps
 */
export function adminInquiryRoutes(app, { inquiries, guards }) {
  const adminId = (/** @type {import('fastify').FastifyRequest} */ req) => /** @type {string} */ (guards.getSession(req)?.adminId);
  const id = (/** @type {import('fastify').FastifyRequest} */ req) => /** @type {{ id: string }} */ (req.params).id;

  app.get(
    '/inquiries',
    {
      schema: {
        tags: ['admin-inquiries'],
        summary: 'List inquiries (paginated, filterable, searchable)',
        security: sessionTag,
        querystring: inquiryListQuerySchema,
        response: {
          200: {
            type: 'object',
            required: ['data', 'meta'],
            properties: {
              data: { type: 'array', items: inquirySchema },
              meta: {
                type: 'object',
                required: ['page', 'pageSize', 'total', 'totalPages'],
                properties: { page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } },
              },
            },
          },
          ...errors(400, 401),
        },
      },
    },
    async (request) => {
      const query = /** @type {import('@portfolio/validation').InquiryListQuery} */ (request.query);
      const { items, meta } = await inquiries.list(query);
      return { data: items, meta };
    },
  );

  app.get(
    '/inquiries/:id',
    {
      schema: {
        tags: ['admin-inquiries'],
        summary: 'Get one inquiry',
        security: sessionTag,
        params: uuidParamSchema,
        response: { 200: envelope(inquirySchema), ...errors(400, 401, 404) },
      },
    },
    async (request) => ({ data: await inquiries.get(id(request)) }),
  );

  app.patch(
    '/inquiries/:id',
    {
      schema: {
        tags: ['admin-inquiries'],
        summary: 'Update status and/or notes (audited)',
        security: csrfSecurity,
        params: uuidParamSchema,
        body: inquiryUpdateSchema,
        response: { 200: envelope(inquirySchema), ...errors(400, 401, 403, 404, 415) },
      },
    },
    async (request) => {
      const patch = /** @type {import('@portfolio/validation').InquiryUpdate} */ (request.body);
      return { data: await inquiries.update(id(request), patch, adminId(request)) };
    },
  );

  app.delete(
    '/inquiries/:id',
    {
      schema: {
        tags: ['admin-inquiries'],
        summary: 'Delete an inquiry (audited)',
        security: csrfSecurity,
        params: uuidParamSchema,
        response: { 204: { type: 'null', description: 'Deleted' }, ...errors(400, 401, 403, 404) },
      },
    },
    async (request, reply) => {
      await inquiries.remove(id(request), adminId(request));
      return reply.code(204).send();
    },
  );
}
