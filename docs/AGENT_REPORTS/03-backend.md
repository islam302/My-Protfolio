# 03 — Backend engineer report (`apps/api`)

## Scope

Built the inquiry and admin API exactly as `docs/API_CONTRACT.md` describes. It is a Fastify 5 app in plain ESM JavaScript with JSDoc types and no build step. It uses PostgreSQL in production and PGlite in tests. I only wrote under `apps/api/**`, plus this report.

**One dependency change:** I ran `npm install zod@^4.6.7 -w @portfolio/api`. The config validator and the admin CLI import `zod` directly, so it is now a declared dependency. Before this it was only reachable through hoisting from `@portfolio/validation`. The version is the same one already installed, so the only change is the `apps/api/package.json` entry plus the lockfile. (`package-lock.json` already showed as staged-deleted in git before I ran it; the lead owns the lockfile.)

## Files

```
apps/api/
  migrations/0001_init.sql          schema: admins, sessions, inquiries, audit_log (+ set_updated_at trigger)
  src/config.js                     zod-validated env -> AppConfig; ConfigError with readable message
  src/app.js                        buildApp({ config, db, logger?, redis?, clock? }) - no listen
  src/server.js                     boot, pending-migration warning, Redis, graceful SIGTERM/SIGINT
  src/db/types.js                   Database interface typedefs { query, tx, withConnection, close }
  src/db/pg.js                      node-postgres Pool adapter (max, statement_timeout, connect timeout)
  src/db/pglite.js                  PGlite adapter (tests); bytea normalised to Buffer
  src/db/index.js                   createDatabase(config)
  src/db/migrate.js                 ordered migrations, one tx each, pg_advisory_lock, schema_migrations
  src/db/migrate-cli.js             npm run db:migrate
  src/cli/create-admin.js           npm run admin:create (env-only credentials, --reset)
  src/lib/{password,tokens,sql,errors,clock}.js
  src/repositories/{inquiries,admins,sessions,audit}.js   SQL only, parameterised
  src/services/{inquiries,auth,admins,audit}.js            business logic
  src/plugins/{errors,security,rate-limit,auth,request-id,validation}.js
  src/routes/{health,inquiries,schemas}.js, src/routes/admin/{auth,inquiries}.js
  test/helpers/setup.js
  test/unit/{lib,config}.test.js
  test/integration/{platform,inquiries,auth,admin-inquiries,migrate}.test.js
```

## Design decisions

- **Validation:** route `body`, `querystring` and `params` schemas are the shared zod schemas themselves.
  - A custom `setValidatorCompiler` runs `safeParse`, and the parsed value replaces the raw input.
  - Strict schemas reject unknown keys, which stops mass assignment.
  - A `ZodError` becomes a 400 `VALIDATION_ERROR` with `details: [{ in, field, code, message }]`.
  - `@fastify/swagger`'s `transform` turns the zod schemas into JSON Schema for OpenAPI, so no rules are duplicated.
  - Response schemas are plain JSON Schema. fast-json-stringify therefore only serialises the listed fields, so `ip_hash` and `user_agent` cannot leak.
- **Body parsing:** every content-type parser is removed and only `application/json` is re-added. Anything else gets a 415.
  - An empty JSON body counts as "no body". This is what lets `POST /logout` work with no body.
  - A request with no `Content-Type` and no body is also accepted (the lead's request; tested).
  - The body limit is 16 KiB, and going over it gives a 413.
  - `__proto__` and `constructor` keys in a body are a parse error (400).
- **Order of checks:** for admin routes, the session check, the admin limiter, the Origin check and the CSRF check all run as route-level `onRequest` hooks.
  - They are added with an `onRoute` hook, so they run *after* the global rate limiter.
  - As a result, unauthenticated requests get a 401 before any body parsing or validation, and floods are limited before any database lookup.
  - Login sits in the admin scope but outside the guarded sub-scope.
- **Rate limits:**
  - **Global limit:** `@fastify/rate-limit`, 300/min/IP by default. It is turned off for both health routes.
  - **Category limits** (inquiry 5/10 min/IP, login 5/15 min/IP, admin 120/min per session or IP) are built with `app.createRateLimit` and *stack* on top of the global limit. I avoided `app.rateLimit()` for these because the plugin's hooks run only once per request, so a second limiter would silently skip one of them.
  - **Store:** Redis when `REDIS_URL` is set, memory otherwise. Keys are prefixed per category.
  - **Redis failure:** fails open (`skipOnError`).
  - **Limit reached:** 429 `RATE_LIMITED` with a `Retry-After` header.
  - **Client IP:** `TRUST_PROXY=N` trusts exactly N proxy hops.
- **Auth:**
  - The session token is 32 random bytes, and only its SHA-256 is stored. The CSRF token is 32 random bytes.
  - Idle timeout is 30 min and absolute timeout is 8 h. `last_seen_at` is written at most once a minute.
  - Expired sessions are deleted lazily: when they are next used, and in bulk on every login.
  - Login deletes the session belonging to the presented cookie (rotation).
  - Lockout: after 10 consecutive failures the account is locked for 15 min and the counter resets. This is one atomic `UPDATE` and is audited as `auth.lockout`.
  - Unknown emails are checked against a dummy scrypt hash with the same parameters. Unknown, wrong and locked all return the same 401 `Invalid email or password`.
  - Password hashes use scrypt N=2^15, r=8, p=1, with the parameters stored in the hash string. The password is NFKC-normalised first, and comparison uses `timingSafeEqual`.
  - Login and logout are written to `audit_log` too.
- **CSRF:** every POST/PATCH/DELETE under the guard needs `X-CSRF-Token` to match the session's token, compared in constant time on hashes.
  - An `Origin` header, when present, must be `PUBLIC_ORIGIN` or one of `CORS_ORIGINS`. If neither is configured (dev only), it must match the request's own host.
  - Login gets the Origin check but no token check.
- **Cookie:** `pf_session`, or `__Host-pf_session` when secure. `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=8h`. Production always forces Secure.
- **Honeypot:** checked in `preValidation`. A non-empty `website` gets a 201 with a random v4 UUID and `createdAt`, and nothing is stored, even when the rest of the body is junk. The service checks again as a backstop.
- **Errors:**
  - One envelope for everything. 5xx responses are always `INTERNAL` / "Internal server error" in every environment.
  - The full error is logged with the request id.
  - Logs redact cookie, authorization, `x-csrf-token`, set-cookie and password.
  - Unknown routes get a JSON 404 (and are rate limited).
- **Headers:** helmet configured for a JSON API.
  - CSP `default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, CORP same-origin, HSTS in production only.
  - `Cache-Control: no-store` on everything except docs. Swagger UI sets its own CSP (`staticCSP`).
- **Request id:** a well-formed upstream `X-Request-Id` (`[A-Za-z0-9._:-]{8,64}`) is reused; anything else is replaced by a UUID. Every response carries it.
- **IPs:** stored only as HMAC-SHA256(`IP_HASH_SECRET`, ip) on inquiries and sessions. Without a secret (dev and test only) a per-process random secret is used.
- **Clock injection:** `buildApp({ clock })`. Session and lockout timestamps are computed in the app and passed as parameters, so the tests can control time.
- **Schema:**
  - CHECKs mirror `PROJECT_TYPES`, `CHANNELS`, `INQUIRY_STATUSES` and the `LIMITS` lengths.
  - `budget` and `timeline` only have length CHECKs (1..100). Their allowed values are UI copy that will change, so that list is enforced in the app.
  - `updated_at` is maintained by a trigger.
  - Empty `notes` are stored as NULL.
- **Readiness 503:** the body is `{ error: { code: "UNAVAILABLE", … } }`. The contract does not name a code for 503, so I picked `UNAVAILABLE`.

## How to run

```bash
# env (see contract): DATABASE_URL, PUBLIC_ORIGIN, IP_HASH_SECRET (>=32), TRUST_PROXY=1 behind nginx, optional REDIS_URL
npm run db:migrate -w @portfolio/api
ADMIN_EMAIL=me@example.com ADMIN_PASSWORD='at least 12 chars' npm run admin:create -w @portfolio/api
ADMIN_EMAIL=me@example.com ADMIN_PASSWORD='new password here' npm run admin:create -w @portfolio/api -- --reset
npm run dev -w @portfolio/api        # or: npm start -w @portfolio/api
```

- The server warns at boot if migrations are pending; it does not apply them itself.
- `--reset` sets the new password, clears the lockout and revokes all of that admin's sessions.
- The CLI never reads credentials from argv and never prints the password.

One extra optional env var: `DATABASE_STATEMENT_TIMEOUT_MS` (default 10000).

## Tests

Command: `npm test -w @portfolio/api` (node:test, `--test-concurrency=1`). Each file gets a fresh in-memory PGlite with migrations applied, and tables are truncated between tests. Requests go through `app.inject()`.

Actual summary from the final run:

```
# tests 98
# suites 22
# pass 98
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 12117.9464
```

The "real PostgreSQL adapter" suite is skipped when `TEST_DATABASE_URL` is unset; node counts it as a skipped *suite*, so it does not show in `skipped`. Setting `TEST_DATABASE_URL` runs the whole suite on real Postgres and truncates tables, so point it at a throwaway database. I did not connect to the local Postgres, so the real-Postgres path has not been run.

What the tests cover:
- password hashing, verifying and rejecting malformed hashes
- token hashing, `safeEqual`, IP HMAC, ILIKE escaping, config validation, error mapping
- every endpoint's happy path, validation details, mass assignment (create and patch), prototype pollution, honeypot (including a junk body)
- pagination, filter, sort and search, including literal `%`, `_` and `\`
- SQL-injection-shaped `q`, ids and body text
- 404s (route and resource), 401 on every admin route before validation
- identical responses for wrong password and unknown email, lockout with expiry, failure-counter reset
- idle and absolute expiry with an injected clock, login rotation, logout invalidating the session (including no body/no Content-Type, and empty JSON)
- CSRF missing, wrong or another session's token → 403; bad or `null` Origin → 403
- 429 for inquiry, login, admin, global and stacked limits, with Retry-After
- `TRUST_PROXY` behaviour; 413, 415, malformed JSON
- no stack or SQL in error bodies (dev and production config)
- security headers, HSTS in production only, CORS allowlist, X-Request-Id
- readiness 503, OpenAPI paths, docs disabled in production
- migrations idempotent, rollback on failure, CHECKs, cascade

I also did a manual smoke test over real HTTP (`listen` + `fetch`): login, then logout with no body → 204; `/api/docs/` → 200.

## Lint and typecheck

- `npx tsc -p tsconfig.json` → exit 0, no errors.
- `npx eslint apps/api` → exit 0, no errors and no warnings. There are two targeted `security/detect-non-literal-fs-filename` disables in `migrate.js` and one in a test, each with a reason comment.

## Known issues and notes

- `@portfolio/validation`:
  - `uuidParamSchema` uses zod's RFC-variant UUID check, so non-RFC UUIDs get a 400 rather than a 404. That is fine, because `gen_random_uuid()` produces v4.
  - `loginSchema` uses `.email()`, which is deprecated in zod 4 in favour of `z.email()`. It still works.
- Rate limits are not env-configurable. They are the contract defaults and are overridden programmatically through `config.rateLimits` in tests.
- With the memory store, limits are per process. Use `REDIS_URL` if you run more than one instance.
- Swagger UI's own CSP includes `upgrade-insecure-requests`. That is harmless behind TLS, but over plain-http dev it can upgrade asset URLs.

## For other agents

- **Admin UI (02):**
  - Send `credentials: 'same-origin'`.
  - Keep `csrfToken` from login or `/me` and send it as `X-CSRF-Token` on POST, PATCH and DELETE, logout included.
  - Logout needs no body.
  - A 401 means the session has gone; redirect to login.
- **QA (05):** tests can call `buildApp({ config, db, clock, logger: false })` directly. `test/helpers/setup.js` has `createTestDb`, `testConfig`, `login` and `seedInquiries`.
- **DevOps (06):**
  - Env vars: `NODE_ENV=production`, `DATABASE_URL`, `PUBLIC_ORIGIN`, `IP_HASH_SECRET` (≥32), `TRUST_PROXY=1`, optional `REDIS_URL`, `API_DOCS`, `LOG_LEVEL`, `DATABASE_POOL_MAX`, `DATABASE_STATEMENT_TIMEOUT_MS`.
  - Run `npm run db:migrate -w @portfolio/api` before starting.
  - Liveness probe: `/api/health`. Readiness probe: `/api/health/ready`.
  - The server shuts down gracefully on SIGTERM, with a forced exit after 10 s.
