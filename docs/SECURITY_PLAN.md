# Security plan

References: OWASP Top 10 (2021/2025), OWASP ASVS 4.0.3 L2 (selected controls), OWASP Cheat Sheets (Session Management, Password Storage, CSRF, REST).
Scope of testing: **local development and the local Docker stack only** (localhost). No production or third-party systems are tested.

## Threat model (summary)

| Asset | Threat | Control |
|---|---|---|
| Admin account | Credential stuffing / brute force | Login rate limit 5/15 min/IP (Redis-backed when scaled) + per-account lockout (10 fails → 15 min) + uniform errors + dummy-hash timing equalisation (ASVS 2.2.1, 2.2.2) |
| Admin session | Theft, fixation, CSRF | Opaque 256-bit token, SHA-256 at rest, HttpOnly + Secure + SameSite=Strict + `__Host-` prefix, rotate on login, idle 30 min / absolute 8 h, synchronizer CSRF token + Origin check (ASVS 3.x, 4.2.2) |
| Inquiries (PII: names, messages) | Disclosure via IDOR/BOLA, injection, logs | Every admin route behind an auth preHandler; single-tenant admin (all admins may see all inquiries — documented); parameterised SQL; log redaction; IP stored as HMAC only |
| Public form | Spam / abuse / DoS | Honeypot, 5 per 10 min per IP, global limit, 16 KiB body cap (nginx + Fastify), strict schema |
| Site visitors | XSS, clickjacking, mixed content | Build-time escaping (`html` template), strict CSP with script hash, `frame-ancestors 'none'`, HSTS, no third-party scripts |
| Admin UI | Stored XSS from inquiry content | `textContent`-only rendering, `script-src 'self'`, no inline handlers |
| Infrastructure | Container escape, secret leakage | Non-root, read-only rootfs, `cap_drop: ALL`, `no-new-privileges`, DB/Redis on internal network with no host ports, secrets only via env, gitleaks in CI |
| Supply chain | Vulnerable/malicious deps | Minimal deps, lockfile + `npm ci`, `npm audit` gate, Dependabot, Trivy, pinned base images |

## Vulnerability classes to investigate (Claude-BugHunter mapping)

| Class | Skill(s) | Applicability |
|---|---|---|
| SQL injection | `hunt-sqli` | API repositories (list search, ids) |
| XSS (stored/reflected/DOM) | `hunt-xss`, `hunt-dom`, `hunt-html-injection` | Static templates, `contact.js`/`home.js`/`work.js`, admin UI rendering |
| CSRF | `hunt-csrf` | Admin mutations, login |
| IDOR/BOLA, broken access control | `hunt-idor`, `hunt-auth-bypass` | Admin routes |
| Authentication / session | `hunt-session`, `hunt-brute-force`, `hunt-ato` | Login, lockout, session lifecycle |
| Business logic / race | `hunt-business-logic`, `hunt-race-condition` | Lockout counter, rate limits, honeypot |
| API misconfig / info disclosure | `hunt-api-misconfig`, `hunt-exceptional-conditions`, `hunt-source-leak` | Error handler, docs exposure, headers, source maps |
| CORS | `hunt-cors` | API CORS config |
| Open redirect | `hunt-open-redirect` | Admin post-login redirect, serve.mjs trailing-slash redirect |
| Path traversal / LFI | `hunt-lfi` | `serve.mjs` (dev), nginx locations |
| Node.js specifics | `hunt-nodejs` | Prototype pollution, ReDoS, child_process (none expected) |
| Host header / cache poisoning | `hunt-host-header`, `hunt-cache-poison` | nginx, canonical URLs are build-time constants |
| Clickjacking | `hunt-clickjacking` | Headers |
| HTTP smuggling | `hunt-http-smuggling` | nginx ↔ Node (review only) |
| SSRF, file upload, XXE, SSTI, deserialization, OAuth, JWT, GraphQL, WebSocket, LDAP | — | **Not applicable**: no outbound fetches from user input, no uploads, no XML, no server templates of user input, no OAuth/JWT/GraphQL/WebSocket/LDAP. Confirmed during review |

## Process

Phase A scope & surface → B source review + hunting with the skills above → C safe validation on localhost (PoC requests against the local API/PGlite, no destructive payloads) → D fix + regression test per finding → E re-test and final assessment. Deliverables in `docs/security/`.
