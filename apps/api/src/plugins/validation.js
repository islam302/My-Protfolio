// @ts-check

/**
 * Route schemas for body/querystring/params are the shared zod schemas from
 * `@portfolio/validation`. This compiler runs them (strict objects reject unknown keys; the
 * parsed, transformed value replaces the raw input), and a ZodError reaches the error handler
 * as a 400 VALIDATION_ERROR. Plain JSON schemas (response schemas for docs/serialisation) pass through.
 */

/**
 * @param {unknown} schema
 * @returns {schema is { safeParse: (v: unknown) => { success: true, data: unknown } | { success: false, error: Error }, toJSONSchema: (o?: object) => Record<string, unknown> }}
 */
export function isZodSchema(schema) {
  return typeof schema === 'object' && schema !== null && typeof (/** @type {any} */ (schema).safeParse) === 'function';
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export function registerZodValidation(app) {
  app.setValidatorCompiler(({ schema }) => {
    if (!isZodSchema(schema)) return () => true;
    return (data) => {
      const result = schema.safeParse(data);
      return result.success ? { value: result.data } : { error: result.error };
    };
  });
}

/**
 * @param {unknown} schema
 * @returns {unknown}
 */
function toJson(schema) {
  if (!isZodSchema(schema)) return schema;
  const json = schema.toJSONSchema({ io: 'input', unrepresentable: 'any', target: 'draft-07' });
  delete json.$schema;
  return json;
}

/**
 * @fastify/swagger `transform`: render zod route schemas as JSON Schema in the OpenAPI document.
 * @param {{ schema: any, url: string }} arg
 */
export function swaggerTransform({ schema, url }) {
  if (!schema) return { schema: /** @type {any} */ (schema), url };
  /** @type {Record<string, unknown>} */
  const out = { ...schema };
  for (const key of ['body', 'querystring', 'params', 'headers']) {
    if (key in out) out[key] = toJson(out[key]);
  }
  return { schema: /** @type {any} */ (out), url };
}
