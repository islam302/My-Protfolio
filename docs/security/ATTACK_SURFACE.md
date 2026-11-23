# Attack surface inventory

This inventory comes from a white-box review of the code on branch `rebuild/monorepo`, done after the backend, frontend and admin agents finished. It follows the BugHunter `/surface` idea: rank, then hunt. There is no recon manifest, because this is a local white-box review (see `BUGHUNTER_AUDIT.md`).

## 1. Components and trust boundaries

```
 Internet ──TLS──▶ [nginx :8080 edge]  (infrastructure/nginx, TRUST BOUNDARY 1: untrusted clients)
                       │  static: /  /css /js /fonts /images /media  (apps/web/dist)
                       │  static: /admin/                              (apps/admin/dist, stricter CSP)
                       │  proxy:  /api/*  → api:3000  (XFF/X-Request-Id OVERWRITTEN, Host passed)
                       ▼
                 [Fastify API :3000]  (apps/api, TRUST BOUNDARY 2: only nginx may reach it; TRUST_PROXY=1)
                       │ parameterised SQL                 │ rate-limit counters
                       ▼                                   ▼
                 [PostgreSQL 17] (backend net, no host port)   [Redis 8] (backend net, requirepass)
Browser-side:  public site JS (contact.js, home.js, work.js, site.js)  ·  admin SPA (app.js, api.js)
Out-of-band:   CLI  `admin:create` (env-only credentials), `db:migrate`
Dev only:      apps/web/scripts/serve.mjs (static server), API `npm run dev`, Swagger UI /api/docs
```

| Boundary | What crosses it | Control |
|---|---|---|
| Visitor → nginx | any HTTP | `limit_req`/`limit_conn`, 16 KiB body on `/api/`, `limit_except GET` on static, dotfiles 404, security headers + CSP |
| nginx → API | proxied `/api/*` | XFF and X-Request-Id overwritten (`proxy-api.conf`); API trusts exactly 1 hop |
| Public form → DB | inquiry fields | zod strict schema, honeypot, 5/10 min/IP + global 300/min/IP, parameterised insert, DB CHECKs |
| DB → admin browser | stored inquiry text (attacker-controlled) | JSON only; admin renders with `textContent`/`value`; admin CSP `script-src 'self'` |
| Admin browser → API | session cookie + CSRF token | HttpOnly/SameSite=Strict/`__Host-` cookie, synchronizer token, Origin allowlist |
| Operator shell → DB | admin credentials | CLI reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` from env only, never argv, never prints |

## 2. HTTP routes (apps/api)

The global limit (300/min/IP, `@fastify/rate-limit`) covers every route except where noted. Category limits stack on top of it.

| Method | Path | Auth | CSRF / Origin | Rate limit | Inputs | Notes |
|---|---|---|---|---|---|---|
| GET | `/api/health` | none | n/a | **none** (global off) | none | liveness |
| GET | `/api/health/ready` | none | n/a | **none** (global off, nginx none) | none | runs `SELECT 1` (SEC-06) |
| POST | `/api/v1/inquiries` | none | none (public, cookie-less) | 5/10 min/IP + global | JSON body `name,type,budget?,timeline?,message,channel,website?` | honeypot in `preValidation` → fake 201 |
| POST | `/api/v1/admin/auth/login` | none | Origin allowlist (if header present); no token | 5/15 min/IP + global; lockout 10 fails/15 min per account | `email,password` | uniform 401; dummy-hash timing equalisation |
| POST | `/api/v1/admin/auth/logout` | session | token + Origin | 120/min/session + global | empty body | 204 |
| GET | `/api/v1/admin/auth/me` | session | n/a | 120/min/session + global | none | returns csrfToken (same-origin only, no CORS by default) |
| GET | `/api/v1/admin/inquiries` | session | n/a | 120/min/session + global | `page≤10000,pageSize≤100,status,type,q≤100,sort` | ILIKE with escaped wildcards; fixed ORDER BY |
| GET | `/api/v1/admin/inquiries/:id` | session | n/a | same | `id` uuid | 404 if missing |
| PATCH | `/api/v1/admin/inquiries/:id` | session | token + Origin | same | `status?,notes?≤4000` (strict) | audit_log |
| DELETE | `/api/v1/admin/inquiries/:id` | session | token + Origin | same | `id` | audit_log |
| GET | `/api/docs`, `/api/docs/json`, `/api/docs/static/*` | none | n/a | global | none | **only when `API_DOCS`** (default on outside production; compose sets `false`) |
| * | anything else | none | n/a | global (notFound handler) | — | JSON 404 |

Guard order for admin routes is `onRequest`: global limiter → `requireSession` (DB lookup) → admin limiter → `checkOrigin` → `checkCsrfToken`. After that come body parsing and then validation. Unauthenticated requests therefore get a 401 before any parsing. This was verified with well-formed bodies, following the layer-ordering rule in `triage-validation`.

## 3. Browser entry points

| Surface | Source of input | Sinks | Assessment |
|---|---|---|---|
| `apps/web/src/scripts/contact.js` | form fields, `?type=` query | `textContent`, `a.href` = composed `wa.me`/`mailto:` URL (encoded), `fetch` to `data-api` | `?type` is only matched against existing `<option>` values; no HTML sinks |
| `apps/web/src/scripts/work.js` | `location.hash` (`#filter-[\w-]+`) | `dataset` comparison, `history.replaceState` | regex-anchored; no sink |
| `apps/web/src/scripts/home.js` | static `CASES` data, `data-src` | `textContent`, `href` from static data, `URL.createObjectURL(blob)` from same-origin fetch | no user input |
| `apps/web/src/scripts/site.js` | clicks | aria attributes | — |
| Build-time templates (`templates/*.js`, `lib/html.js`) | author-controlled data only | `html` tagged template escapes `& < > " '`; JSON-LD escapes `<` | no runtime user input |
| `apps/admin/src/app.js` | API JSON (attacker-controlled inquiry text), `location.search` | `textContent`, `setAttribute` (static attribute names; values are text), `<textarea>.value` | no `innerHTML`; query params whitelisted (`inSet`, ints, `slice(0,100)`) |
| `apps/admin/src/api.js` | — | `fetch(..., { redirect: 'error', credentials: same-origin })` | CSRF token held in memory only |

There are no `postMessage` listeners, service workers, `eval`, `new Function` or `document.write` (checked with grep for each pattern).

## 4. Cookies, headers, tokens

| Item | Value |
|---|---|
| Session cookie | `pf_session` (dev) / `__Host-pf_session` (production): HttpOnly, SameSite=Strict, Path=/, Secure in production, Max-Age 8 h, no Domain |
| Session token | 32 random bytes base64url (256 bit); DB stores SHA-256 only; idle 30 min, absolute 8 h; rotated on login; deleted on logout, `--reset` |
| CSRF token | 32 random bytes per session, `X-CSRF-Token`, compared with `timingSafeEqual` on SHA-256 |
| Password hash | scrypt N=2^15 r=8 p=1, 16-byte salt, NFKC, params in hash, bounded parsing |
| IP storage | HMAC-SHA256(`IP_HASH_SECRET`, ip) only |
| API headers | helmet: CSP `default-src 'none'; frame-ancestors 'none'…`, nosniff, XFO, Referrer-Policy no-referrer, CORP same-origin, HSTS (prod), `Cache-Control: no-store` |
| Site/admin headers | nginx `security-headers*.conf`: strict CSP (script hash), XFO DENY, COOP, Permissions-Policy, HSTS over TLS |
| Request headers trusted | `X-Forwarded-For/Proto/Host` only with `TRUST_PROXY=N` (hop-count function); `X-Request-Id` if it matches `[A-Za-z0-9._:-]{8,64}` |

## 5. Data stores

| Store | Data | Sensitivity | Access |
|---|---|---|---|
| `admins` | email, scrypt hash, lockout counters | high | API + CLI |
| `sessions` | token hash, csrf token, ip HMAC, UA | high | API |
| `inquiries` | name, message, budget, timeline, channel, notes, ip HMAC, UA | PII | API (admin read/write, public insert) |
| `audit_log` | admin id, action, entity id, meta (no notes content) | medium | API insert only |
| Redis | rate-limit counters (`pf-rl:*`), no persistence | low | API |
| Logs (pino) | request metadata; cookie/authorization/csrf/set-cookie/password redacted; 5xx errors with stack | medium | operator |

## 6. Dev and operator surfaces

| Surface | Exposure | Notes |
|---|---|---|
| `apps/web/scripts/serve.mjs` | **all interfaces** on :4321 (SEC-04) | static file server for `dist/`; traversal-safe; crash on malformed URI (SEC-02); open redirect (SEC-03) |
| API dev (`node --watch src/server.js`) | `HOST` default `0.0.0.0` | dev config has docs on, no PUBLIC_ORIGIN fallback (SEC-08) |
| Swagger UI `/api/docs` | dev only | spec contains no secrets (checked) |
| `admin:create` CLI | local shell | env-only credentials; `--reset` revokes sessions |
| CI (`.github/workflows`) | GitHub | read-only review; throwaway Postgres creds `postgres:postgres` for a service container only |

## 7. Priority ranking used for hunting

1. **P1**: login/lockout/session (`services/auth.js`, `plugins/auth.js`), admin mutations (CSRF), stored inquiry text reaching the admin UI (stored XSS).
2. **P2**: list search (SQLi), body parsing (prototype pollution, oversize, content types), error handler (leakage), rate-limit keying (XFF), CORS.
3. **P3**: dev static server (traversal, redirect), headers and clickjacking, source and secret leakage, ReDoS in shared schemas.
4. **Kill list** (not applicable, see audit): SSRF, file upload, XXE, SSTI, deserialization, OAuth/SAML/JWT, GraphQL, WebSocket, LDAP, NoSQL. None of these features exist.
