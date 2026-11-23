// @ts-check
import { z } from 'zod';

/**
 * Environment configuration, validated with zod at boot (see docs/API_CONTRACT.md).
 * `loadConfig` throws a ConfigError with a readable message; `server.js` prints it and exits.
 */

export class ConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

/** Empty strings in .env files mean "unset". */
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const origin = z
  .url({ protocol: /^https?$/ })
  .transform((v) => new URL(v).origin);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: optionalString.pipe(z.url({ protocol: /^postgres(ql)?$/ }).optional()),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(600_000).default(10_000),
  REDIS_URL: optionalString.pipe(z.url({ protocol: /^rediss?$/ }).optional()),
  PUBLIC_ORIGIN: optionalString.pipe(origin.optional()),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(origin)),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  IP_HASH_SECRET: optionalString.pipe(z.string().min(32, 'IP_HASH_SECRET must be at least 32 characters').optional()),
  SESSION_COOKIE_SECURE: optionalString.pipe(bool.optional()),
  API_DOCS: optionalString.pipe(bool.optional()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

/**
 * @typedef {{ max: number, timeWindow: number }} RateLimitRule
 * @typedef {{ global: RateLimitRule, inquiry: RateLimitRule, login: RateLimitRule, admin: RateLimitRule }} RateLimits
 * @typedef {{
 *   env: 'development' | 'test' | 'production',
 *   isProduction: boolean,
 *   port: number,
 *   host: string,
 *   databaseUrl: string | undefined,
 *   databasePoolMax: number,
 *   databaseStatementTimeoutMs: number,
 *   redisUrl: string | undefined,
 *   publicOrigin: string | undefined,
 *   corsOrigins: string[],
 *   trustProxy: number,
 *   ipHashSecret: string | undefined,
 *   cookieSecure: boolean,
 *   cookieName: string,
 *   apiDocs: boolean,
 *   logLevel: string,
 *   bodyLimit: number,
 *   session: { idleMs: number, absoluteMs: number, touchIntervalMs: number },
 *   lockout: { maxFailures: number, durationMs: number },
 *   rateLimits: RateLimits,
 *   scrypt: { N: number, r: number, p: number },
 * }} AppConfig
 */

const MIN = 60_000;

/** Contract defaults. Not env-driven; tests override them programmatically. */
export const DEFAULT_RATE_LIMITS = Object.freeze({
  global: { max: 300, timeWindow: MIN },
  inquiry: { max: 5, timeWindow: 10 * MIN },
  login: { max: 5, timeWindow: 15 * MIN },
  admin: { max: 120, timeWindow: MIN },
});

/** @param {import('zod').ZodError} error */
function formatIssues(error) {
  return error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {AppConfig}
 */
export function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid configuration:\n${formatIssues(parsed.error)}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';

  /** @type {string[]} */
  const problems = [];
  if (isProduction) {
    if (!e.DATABASE_URL) problems.push('DATABASE_URL is required in production');
    if (!e.IP_HASH_SECRET) problems.push('IP_HASH_SECRET (>= 32 chars) is required in production');
    if (!e.PUBLIC_ORIGIN) problems.push('PUBLIC_ORIGIN is required in production');
  }
  if (problems.length) {
    throw new ConfigError(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }

  // Production always uses a Secure, __Host- prefixed cookie, whatever SESSION_COOKIE_SECURE says.
  const cookieSecure = isProduction ? true : (e.SESSION_COOKIE_SECURE ?? false);

  return {
    env: e.NODE_ENV,
    isProduction,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    databasePoolMax: e.DATABASE_POOL_MAX,
    databaseStatementTimeoutMs: e.DATABASE_STATEMENT_TIMEOUT_MS,
    redisUrl: e.REDIS_URL,
    publicOrigin: e.PUBLIC_ORIGIN,
    corsOrigins: e.CORS_ORIGINS,
    trustProxy: e.TRUST_PROXY,
    ipHashSecret: e.IP_HASH_SECRET,
    cookieSecure,
    cookieName: cookieSecure ? '__Host-pf_session' : 'pf_session',
    // Docs are opt-in in production and on by default elsewhere.
    apiDocs: isProduction ? e.API_DOCS === true : (e.API_DOCS ?? true),
    logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === 'test' ? 'silent' : 'info'),
    bodyLimit: 16 * 1024,
    session: { idleMs: 30 * MIN, absoluteMs: 8 * 60 * MIN, touchIntervalMs: MIN },
    lockout: { maxFailures: 10, durationMs: 15 * MIN },
    rateLimits: structuredClone(DEFAULT_RATE_LIMITS),
    scrypt: { N: 2 ** 15, r: 8, p: 1 },
  };
}
