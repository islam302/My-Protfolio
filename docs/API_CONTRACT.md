# API contract (v1)

Frozen interface between `apps/web`, `apps/admin` and `apps/api`. Change it only through the lead.
Validation rules live in `packages/validation` (`@portfolio/validation`) and are the single source of truth.

## Conventions

- Base path: `/api` (health) and `/api/v1` (resources). In production nginx serves the site, `/admin/` and proxies `/api/` to the API — **same origin**, so CORS is closed by default (`CORS_ORIGINS` allowlist is for split-origin dev only).
- JSON only. `Content-Type: application/json` required on bodies; body limit 16 KiB.
- Success: `{ "data": …, "meta"?: … }`. Error: `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details"?: [...], "requestId": "…" } }`.
- Error codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `CSRF_FAILED` 403, `FORBIDDEN` 403, `NOT_FOUND` 404, `PAYLOAD_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `RATE_LIMITED` 429 (with `Retry-After`), `INTERNAL` 500 (never leaks internals).
- Every response carries `X-Request-Id`.
- IDs are UUIDs. Timestamps are ISO-8601 UTC strings, camelCase fields.

## Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Liveness `{ data: { status: "ok" } }`. Not rate limited. |
| GET | `/api/health/ready` | Readiness: DB ping. 503 when DB down. |
| POST | `/api/v1/inquiries` | Body = `inquiryCreateSchema` (`name, type, budget?, timeline?, message, channel, website?`). 201 `{ data: { id, createdAt } }`. If honeypot `website` is non-empty: respond **201 with a fake id shape**, store nothing (do not tip off bots). Rate limit: **5 / 10 min / IP** + global. |

## Admin (session cookie)

Auth cookie: `pf_session` (dev) / `__Host-pf_session` (production: `Secure`), `HttpOnly`, `SameSite=Strict`, `Path=/`. Opaque 32-byte random token; only its SHA-256 is stored. Idle timeout 30 min, absolute 8 h. Login rotates the session.

CSRF: every state-changing admin request (POST/PATCH/DELETE except login) must send `X-CSRF-Token` equal to the session's token (synchronizer token, returned by login and `/me`), and an `Origin` that matches `PUBLIC_ORIGIN` when an Origin header is present.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/admin/auth/login` | Body = `loginSchema`. 200 `{ data: { admin: { id, email }, csrfToken } }`. Uniform 401 `Invalid email or password` for unknown email / wrong password / locked (no enumeration; constant-time path incl. dummy hash). Rate limit **5 / 15 min / IP**; account lockout after 10 consecutive failures for 15 min. |
| POST | `/api/v1/admin/auth/logout` | Deletes session, clears cookie. 204. |
| GET | `/api/v1/admin/auth/me` | 200 `{ data: { admin, csrfToken } }` or 401. |
| GET | `/api/v1/admin/inquiries` | Query = `inquiryListQuerySchema` (`page, pageSize≤100, status, type, q, sort`). 200 `{ data: Inquiry[], meta: { page, pageSize, total, totalPages } }`. `q` searches name/message (parameterised `ILIKE`, wildcards escaped). |
| GET | `/api/v1/admin/inquiries/:id` | 200 `{ data: Inquiry }`, 404. |
| PATCH | `/api/v1/admin/inquiries/:id` | Body = `inquiryUpdateSchema` (`status?, notes?`). 200 `{ data: Inquiry }`. Writes `audit_log`. |
| DELETE | `/api/v1/admin/inquiries/:id` | 204. Writes `audit_log`. |

Admin rate limit: 120 / min / session-or-IP.

`Inquiry` = `{ id, name, type, budget|null, timeline|null, message, channel, status, notes|null, createdAt, updatedAt }` (never ip hash / user agent).

## Docs

`GET /api/docs` (Swagger UI) + `/api/docs/json` — enabled when `API_DOCS=true` (default on outside production).

## Database (PostgreSQL ≥ 15; tests use PGlite)

- `admins(id uuid pk default gen_random_uuid(), email text not null, password_hash text not null, failed_attempts int not null default 0, locked_until timestamptz, last_login_at timestamptz, created_at, updated_at)`; `unique index on lower(email)`.
- `sessions(id uuid pk, token_hash bytea unique not null, admin_id uuid not null references admins on delete cascade, csrf_token text not null, ip text, user_agent text, created_at, last_seen_at, expires_at)`; index `(admin_id)`, `(expires_at)`.
- `inquiries(id uuid pk, name text not null, project_type text not null check in (...), budget text, timeline text, message text not null, channel text not null check, status text not null default 'new' check, notes text, ip_hash text, user_agent text, created_at, updated_at)`; indexes `(status, created_at desc)`, `(created_at desc)`, length CHECKs mirroring LIMITS.
- `audit_log(id bigint generated always as identity pk, admin_id uuid references admins on delete set null, action text not null, entity text not null, entity_id uuid, meta jsonb, created_at)`.
- `schema_migrations(version text pk, applied_at)`. SQL files `apps/api/migrations/NNNN_name.sql`, applied in a transaction under `pg_advisory_lock`.
- IP addresses stored only as HMAC-SHA256(`IP_HASH_SECRET`, ip).

## Configuration (env, validated at boot with zod; process exits on invalid config)

`NODE_ENV`, `PORT` (3000), `HOST` (0.0.0.0), `DATABASE_URL`, `DATABASE_POOL_MAX` (10), `REDIS_URL` (optional → distributed rate limit), `PUBLIC_ORIGIN` (e.g. `https://islambadran.com`), `CORS_ORIGINS` (comma list, default empty), `TRUST_PROXY` (hop count, default 0 / `1` behind nginx), `IP_HASH_SECRET` (≥32 chars, required in production), `SESSION_COOKIE_SECURE` (default true in production), `API_DOCS`, `LOG_LEVEL`.

## Web integration

- Build-time env `PUBLIC_API_URL` (e.g. `/api`). **Unset ⇒ the generated site is byte-identical to the original** (form hands off to WhatsApp/email only).
- Set ⇒ the form gets `data-api="…"` and a visually hidden honeypot input; `contact.js` sends the brief with `fetch(…, { keepalive: true })` **without awaiting** (so `window.open` keeps the user gesture), then hands off to WhatsApp/email exactly as before. The intro sentence “The form doesn’t store anything…” is replaced by an accurate one, since the statement would otherwise be false.
