# Architecture

## Overview

```
                    ┌──────────────────────── nginx (web container, :8080 / :443) ─────────────────────────┐
 Browser ──HTTPS──▶ │  /            → apps/web/dist   (static, CSP, cache headers)                          │
                    │  /admin/      → apps/admin/dist (static, stricter CSP, noindex)                      │
                    │  /api/*       → proxy ─────────────┐  limit_req, 16 KiB body cap                     │
                    └────────────────────────────────────┼──────────────────────────────────────────────────┘
                                                         ▼
                                     apps/api (Fastify, Node 22, non-root, read-only FS)
                                         │  config (zod) · request-id · helmet · rate-limit (Redis)
                                         │  routes → services → repositories → db adapter
                                         ▼                                   ▼
                                  PostgreSQL 17 (internal network)     Redis 7 (internal, rate-limit store)
```

Same-origin by design: the site, admin and API share one origin, so the session cookie is `SameSite=Strict`, CORS stays closed, and the CSP can be `connect-src 'self'`.

Production target: a **Hetzner Cloud VM** running this Docker Compose stack (see `infrastructure/deployment/DEPLOYMENT.md`). The site still builds without `PUBLIC_API_URL`, and that output is byte-identical to the approved original.

## Monorepo

| Workspace | Purpose | Runtime deps |
|---|---|---|
| `packages/validation` | zod schemas + constants for inquiries, admin login, list queries. Used by the web build (select options), and the API (request validation) | zod 4 |
| `apps/web` | The approved static site generator (unchanged design) | `@portfolio/validation` (build time only) |
| `apps/admin` | Static admin UI for inquiries (vanilla JS, `textContent`-only rendering) | none |
| `apps/api` | Inquiry + admin API | fastify 5 + official plugins, pg, ioredis |

Tooling at the root: npm workspaces (one lockfile), ESLint 10 flat config (+ `eslint-plugin-security` on server code), Prettier (new code only; the original web source keeps its approved hand formatting), TypeScript 7 in `checkJs` strict mode over `packages/*/src` and `apps/api/src`, Playwright for E2E + visual regression, `node:test` for unit/integration.

## Key decisions

| Decision | Why | Alternatives rejected |
|---|---|---|
| Keep the original zero-dependency generator | It is small, correct, already SEO-validated, and the design is approved. Porting to React/Next/Astro would add a large dependency tree and risk visual drift for no user-facing gain | Next.js/Astro rewrite |
| Plain ESM JS + JSDoc, type-checked by `tsc --checkJs` | Strict typing without a build step, consistent with the original's philosophy; Node runs the source directly | TS + compile step |
| Fastify | Schema-first, fast, mature official plugins for helmet, rate-limit (with Redis store), cookies, CORS, OpenAPI | Express (more manual hardening) |
| PostgreSQL + PGlite in tests | Real relational constraints, FKs, CHECKs, advisory-locked migrations; PGlite runs real Postgres in-process so integration tests need no server | SQLite (no prod parity), ORMs (unneeded for 4 tables) |
| Hand-written SQL migrations, forward-only | 4 tables; transparent, reviewable; rollback = restore from backup + previous image | Prisma/Knex |
| Opaque DB-backed sessions, not JWT | Instant revocation, no signing-key management, tiny scale | JWT |
| scrypt from `node:crypto` | No native addon to build in Alpine; OWASP-acceptable parameters | argon2 (native build) |
| Honeypot + rate limits, no CAPTCHA | No third-party script, no visual change, no tracking; low-value target | reCAPTCHA/Turnstile |
| Projects stay in `apps/web/src/data` (no projects API) | The site is statically generated; a projects API would duplicate the single source of truth with no consumer | DB-backed CMS |
| No analytics | Not part of the target; would require consent | GA/Plausible (owner can add later) |

## Request lifecycle (API)

1. nginx: TLS, `limit_req`, body size cap, `X-Forwarded-For`.
2. Fastify: `trustProxy` (hop count) → request id → helmet headers → rate limiter (route category) → content-type/body-limit checks.
3. Route: zod validation (strict — unknown keys rejected) → service (business rules, transactions) → repository (parameterised SQL only).
4. Errors: one handler maps to the envelope in `docs/API_CONTRACT.md`; 5xx bodies are generic, details only in logs (with redaction of cookies/passwords).

## Data model

See `docs/API_CONTRACT.md` § Database and `apps/api/migrations/`. Personal data minimisation: IPs are stored only as HMAC-SHA256 with a server secret, admin API never returns `ip_hash`/`user_agent`.
