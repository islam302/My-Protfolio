# 06 — DevOps & infrastructure report

Agent: DevOps & Infrastructure Engineer · Branch `rebuild/monorepo` · 2026-11-23
Nothing committed, pushed, installed (no `npm install`) or deployed.

**Update (lead decision): production = docker compose stack on a Hetzner Cloud VM (Ubuntu 24.04).** Netlify/Vercel are not used: `apps/web/netlify.toml` and `apps/web/vercel.json` were deleted and every Netlify/Vercel mention removed from `infrastructure/**`, `.github/**`, `.env.example` and this report. nginx (`infrastructure/nginx/snippets/security-headers.conf`) is now the **single copy** of the CSP and its hashes. (One mention remains in `apps/web/README.original.md` — outside my scope, left to the lead.)

## Files created / changed

| File | Purpose |
|---|---|
| `infrastructure/docker/api.Dockerfile` | Multi-stage API image: `npm ci --omit=dev --ignore-scripts --workspace @portfolio/api --include-workspace-root=false` (all workspace manifests copied so the lockfile stays in sync), runtime copies only `packages/validation` + `apps/api/{src,migrations}`; root-owned code, `USER node`, tini PID 1, npm/yarn/corepack removed, `apk upgrade`, HEALTHCHECK on `/api/health` via `node -e fetch`. |
| `infrastructure/docker/web.Dockerfile` | Build stage runs web + admin builds (args `SITE_URL`, `PUBLIC_API_URL=/api`, `ADMIN_API_BASE=/api`; `packages/validation` in context for the admin constants); runtime `nginxinc/nginx-unprivileged:1.31.7-alpine3.24` (uid 101, :8080), site at `/`, admin at `/admin/`, `nginx -t` at build time, HEALTHCHECK `/healthz`. |
| `infrastructure/nginx/nginx.conf` | Read-only-friendly (pid/temp in /tmp), `server_tokens off`, JSON access log (API query strings redacted), gzip (+ brotli note), HSTS/upgrade-insecure-requests maps (on only over HTTPS / `X-Forwarded-Proto: https`), `limit_req_zone` (10 r/s per IP for `/api/`, 30 r/min per IP for POST/PUT/PATCH/DELETE), `limit_conn`. |
| `infrastructure/nginx/default.conf` | :8080 server, versioned-asset cache map, includes the shared locations. |
| `infrastructure/nginx/snippets/app-locations.conf` | All locations (shared by HTTP and the TLS example): `/healthz`, dotfile deny (`/.env`, `/.git` → 404), `/api/health` (no nginx rate limit), `/api/` (16k body, rate limits, JSON 413/429/503 envelopes in contract format), `/admin/` (strict CSP, `no-store`, `noindex`), fonts 1y immutable, images/media 30d, css/js immutable only when `?v=` present, HTML `no-cache`, GET/HEAD only on static, custom 404 `/404.html`. |
| `infrastructure/nginx/snippets/security-headers.conf` | Site CSP + docs on every directive. |
| `infrastructure/nginx/snippets/security-headers-admin.conf` | Admin CSP (no inline script/style). |
| `infrastructure/nginx/snippets/common-headers.conf` | HSTS (HTTPS only), nosniff, Referrer-Policy, XFO DENY, COOP, Permissions-Policy. |
| `infrastructure/nginx/snippets/proxy-api.conf` | Proxy to `api:3000` via Docker DNS (nginx starts without the API), overwrites `X-Forwarded-For`/`X-Real-IP` with `$remote_addr`, passes `X-Request-Id`, hides upstream duplicates of nginx-owned headers (keeps the API's own CSP). |
| `infrastructure/nginx/snippets/real-ip.conf` | `real_ip` for a trusted LB/CDN (off by default; include is commented in nginx.conf). |
| `infrastructure/nginx/tls.example.conf` | Production TLS server, mounted by `docker-compose.prod.yml`: :8081 serves the ACME http-01 webroot and 308-redirects to HTTPS; :8443 TLS 1.2/1.3 (Mozilla intermediate, X25519, tickets off, HTTP/2), www→apex, site via `app-locations.conf`. OCSP stapling off (Let's Encrypt ended OCSP). Certs read from `/etc/nginx/certs` (uid 101). |
| `docker-compose.yml` | `db` (postgres 17.12, user 70, SCRAM, named volume, healthcheck), `redis` (8.10.3, password, no persistence, user 999), `migrate` (one-shot), `api` (after migrate completed + redis healthy), `web` (only published port, `127.0.0.1:${WEB_PORT:-8080}`). All: `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, tmpfs, cpu/mem/pids limits, json-file log rotation. Networks: `frontend`, `backend` (`internal: true`). API env mapped explicitly (no blanket `env_file`). |
| `docker-compose.prod.yml` | Hetzner overlay: `web` ports `!override` → host 80→8081 and 443→8443 only (base 127.0.0.1:8080 binding removed), mounts `tls.example.conf`, `${PORTFOLIO_SHARED}/certs` and `/acme` read-only; forces `PUBLIC_ORIGIN` (required), `SESSION_COOKIE_SECURE=true`, `API_DOCS=false`; images come from `API_IMAGE`/`WEB_IMAGE` (digest refs). |
| `docker-compose.dev.yml` | Opt-in overlay: DB/Redis on 127.0.0.1, `API_DOCS=true`, debug logs, non-Secure cookie. |
| `.env.example` | Every contract variable (+ `DATABASE_STATEMENT_TIMEOUT_MS` found in `apps/api/src/config.js`), compose vars, generation commands. |
| `.dockerignore` | Excludes secrets, VCS, node_modules, dist, docs/tests, root media. |
| `.github/workflows/ci.yml` | quality (lint, format advisory, typecheck, `npm test`, build, `npm run check`, API-mode build, `npm audit --audit-level=high`), api-integration (Postgres service, `TEST_DATABASE_URL`), e2e (Playwright, report artifact), docker (build both, Trivy HIGH/CRITICAL ignore-unfixed, compose smoke test). |
| `.github/workflows/security.yml` | gitleaks (CLI image, full history), Semgrep (`p/javascript p/nodejs p/owasp-top-ten p/secrets`), CodeQL (security-extended), Trivy fs + config, ZAP baseline against the compose stack on 127.0.0.1; weekly cron. |
| `.github/workflows/deploy.yml` | Manual only (`workflow_dispatch`, input `ref`). Job 1 builds + pushes both images to GHCR (tag `sha-<commit>`, SBOM + provenance), Trivy gate, outputs **digests**. Job 2 (`environment: production` → required-reviewer approval, `packages: read`): pinned-host-key SSH (`StrictHostKeyChecking yes`, `BatchMode`), uploads the release bundle, short-lived GHCR login on the VM, runs `remote-deploy.sh` with digest refs, logs out, removes the key. Secrets: `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`, `HETZNER_KNOWN_HOSTS`; optional vars `SITE_URL`, `DEPLOY_PATH`, `HETZNER_PORT`. |
| `.github/dependabot.yml` | npm, docker, docker-compose, github-actions (weekly, grouped). |
| `.github/zap/rules.tsv` | ZAP rule levels (FAIL for missing headers/cookie flags; WARN for HSTS over http and the accepted `style-src-attr` risk). |
| `infrastructure/deployment/DEPLOYMENT.md` | Rewritten for Hetzner: Cloud Firewall (outer), OS hardening (sudo user, keys only, `PasswordAuthentication no`, no root, ufw 22/80/443 + why Docker publishes bypass ufw), unattended-upgrades, fail2ban, Docker Engine from Docker's apt repo + daemon.json, deploy user + `/srv/portfolio/{releases,shared,current}` layout, `.env` 600, Let's Encrypt (placeholder cert bootstrap → certbot webroot → deploy hook → systemd renewal), deploy (workflow + manual), admin creation, forward-only migrations, rollback (auto / `--rollback` / older digests), backups (cron + `backup.sh` + restic to Hetzner Storage Box), restore, health/monitoring, logging. |
| `infrastructure/deployment/remote-deploy.sh` | Runs on the VM: validates digest refs + `.env` mode 600 → compose config → pull → backup (if DB exists) → `run --rm migrate` → `up -d --no-build --wait` → smoke test against `PUBLIC_ORIGIN`; on failure auto-redeploys the previous release's digests; records `deployed.env`/`previous.env`, flips `current`, keeps 5 releases; `--rollback` mode. |
| `infrastructure/deployment/certbot-deploy-hook.sh` | certbot deploy hook: copies fullchain/privkey to `shared/certs` owned by uid 101 (key 0600), `nginx -t` + graceful reload. |
| `infrastructure/deployment/backup.sh` / `restore.sh` / `smoke-test.sh` | pg_dump custom format inside the db container + verify + checksum + retention; restore is dry-run unless `--confirm-target=<db>` matches, verifies checksum, refuses while `api` runs, single transaction; read-only post-deploy smoke test. |
| `infrastructure/monitoring/README.md` | Signals/thresholds, uptime examples, log fields, jq queries, DB connection check. |

## CSP

Hashes computed by me from the built HTML (`apps/web/dist`, every page scanned for inline `<script>`/`<style>`), matching the frontend agent's values:

- inline script `document.documentElement.classList.add('js')` (13 pages): **`sha256-Du+OJKJSbdUgz5nrHeWWINvez6XKDDU/tyj/5c2uvwo=`** (also verified with `openssl dgst -sha256 -binary | openssl base64`).
- inline `<style>` on `/work/`: **`sha256-vRSASVDSHjJBYSp8loYBJjH4gx4PLn5Y817EG9Uuv8M=`**.
- No other executable inline scripts (`application/ld+json` / `application/json` blocks are data, not subject to `script-src`).

Site policy:
```
default-src 'self'; script-src 'self' 'sha256-Du+OJKJSbdUgz5nrHeWWINvez6XKDDU/tyj/5c2uvwo=';
style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'sha256-vRSASVDSHjJBYSp8loYBJjH4gx4PLn5Y817EG9Uuv8M='; style-src-attr 'unsafe-inline';
img-src 'self' data:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; manifest-src 'self';
worker-src 'none'; frame-src 'none'; form-action 'self' mailto:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'
[; upgrade-insecure-requests  — only over HTTPS]
```
Decisions:
- `style-src-attr 'unsafe-inline'` is the documented accepted risk (inline `style=""` attributes in the design). `style-src 'self' 'unsafe-inline'` is only the fallback for browsers without `-elem/-attr`.
- `media-src blob:` — `home.js` plays the hero clip from `URL.createObjectURL(blob)` (found in code; would have broken the hero otherwise).
- `form-action 'self' mailto:` — the no-JS fallback submits the form to its `mailto:` action. **`https://wa.me` was deliberately left out**: WhatsApp is opened via `window.open()` / links, which `form-action` does not govern (deviation from the brief, least privilege).
- Admin: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'` + `Cache-Control: no-store` + `X-Robots-Tag: noindex`. Admin sources contain no inline styles/scripts.
- `/api/*` keeps the API's own (helmet) CSP; nginx owns the transport headers.

## Pinned versions (verified to exist on 2026-11-23)

Images: `node:22.23.5-alpine3.24`, `postgres:17.12-alpine3.24`, `redis:8.10.3-alpine3.23`, `nginxinc/nginx-unprivileged:1.31.7-alpine3.24`, `ghcr.io/gitleaks/gitleaks:v8.30.1`, `semgrep/semgrep:1.140.0`. Digests not pinned (examples noted in the Dockerfiles); Dependabot bumps tags.
Actions are **SHA-pinned** (resolved with `git ls-remote`): checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2, setup-buildx v4.4.1, build-push v7.4.0, trivy-action v0.36.0, codeql-action v4.39.4.

## Verification (Docker Desktop started successfully, engine 29.9.2)

| Check | Result | Evidence |
|---|---|---|
| `docker compose config -q` (base and base+dev overlay) | PASS | both OK (after moving `pids_limit` into `deploy.resources.limits.pids`) |
| Build web image | PASS | `nginx -t` passes inside the build |
| Build API image | PASS | built from the backend agent's current `apps/api` |
| Trivy image scan HIGH/CRITICAL `--ignore-unfixed` | PASS (both) after adding `apk upgrade` | first scan of web image found fixable libxml2/libxslt/musl/zlib CVEs in the base image → fixed; rescan exit 0 for api and web |
| Trivy config scan (Dockerfiles) | PASS | 0 failures |
| Compose stack up (`--wait`) | PASS | db/redis healthy, migrate `applied 0001_init` exit 0, api healthy, web healthy |
| `smoke-test.sh` through nginx | PASS | health 200, ready 200, `/` `/admin/` 200, 404 page, `/.env` 404, all headers |
| Security headers via curl | PASS | CSP/XFO/nosniff/Referrer/COOP/Permissions on site, admin, API; `Server: nginx` without version; HSTS + `upgrade-insecure-requests` only with `X-Forwarded-Proto: https` |
| CSP in a real browser (Chromium pane) on `/`, `/work/`, `/contact/`, `/admin/` | PASS | no CSP violations in console; hero video `src` is `blob:` and plays; `/work/` inline `<style>` applied (8 rules); admin renders with strict CSP |
| `POST /api/v1/inquiries` through nginx | PASS | 201 `{data:{id,createdAt}}` |
| nginx 16k body limit | PASS | 20 KB body → 413 JSON `PAYLOAD_TOO_LARGE` |
| nginx rate limit | PASS | 30 parallel POSTs → 26×429 (JSON `RATE_LIMITED`, `Retry-After`) |
| Upstream down | PASS | API absent → 503 JSON envelope, nginx keeps serving the site |
| Static methods | PASS | `POST /` → 403 |
| Admin CLI + login via nginx | PASS | `docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD api node src/cli/create-admin.js` → created; login 200 with `__Host-pf_session; HttpOnly; Secure; SameSite=Strict` |
| `X-Request-Id` correlation | PASS | client-supplied value replaced by nginx's, same id returned by the API |
| Container hardening | PASS | `docker inspect`: all 4 long-running services `ReadonlyRootfs=true`, `CapDrop=[ALL]`, `no-new-privileges`, non-root users, memory limits; only web has a port binding (127.0.0.1) |
| `backup.sh` / `restore.sh` | PASS | backup + checksum; dry run exits 3; refuses while api runs; real restore brought back a deleted test row |
| Workflow YAML syntax | PASS | `yaml` parser (node_modules) on all workflow/compose/dependabot files; **actionlint** (container) exit 0 |
| Shell scripts | PASS | `bash -n` + **shellcheck** (container) exit 0 |
| Hetzner update: `docker compose config` base / base+dev / **base+prod** (throwaway env in scratch dir) | PASS | prod render: web publishes only 80→8081 and 443→8443 (127.0.0.1:8080 removed by `!override`), digest images, `API_DOCS=false`, `SESSION_COOKIE_SECURE=true` |
| Hetzner update: prod TLS nginx (`tls.example.conf`) in the real web image, read-only, self-signed cert | PASS | `nginx -t` OK; :80 ACME token served, other paths 308 → `https://islambadran.com/…`; www → apex 308; HTTP/2 200; TLS 1.2 + 1.3 accepted, TLS 1.1 refused; HSTS + `upgrade-insecure-requests` + full CSP on HTTPS |
| Hetzner update: `remote-deploy.sh` guard rails | PASS | refuses `.env` not 600; refuses tag (non-digest) refs; refuses release dir outside `releases/`; `--rollback` with nothing deployed exits 1 |
| Hetzner update: actionlint (incl. deploy.yml) + shellcheck (all scripts) | PASS | both exit 0 (SC2029 client-side ssh expansion intentionally disabled per line; values validated first) |
| `docker compose down -v` | done | stack, volumes and temp `.env` (scratch dir, random secrets) removed |
| GitHub workflows executing on GitHub | NOT TESTED | needs a push (not allowed) |
| ZAP baseline, gitleaks, Semgrep, CodeQL runs | NOT TESTED | defined in `security.yml`; run on GitHub |
| Playwright E2E / npm audit in CI | NOT TESTED here | owned by QA / runs in CI |
| dev overlay running (`docker-compose.dev.yml`) | NOT TESTED at runtime | config validated only |
| `deploy.yml` end to end, `remote-deploy.sh` full deploy/auto-rollback on a VM, certbot issuance/renewal + deploy hook, server hardening steps, restic → Storage Box | NOT TESTED | needs the Hetzner VM, DNS, GitHub environment secrets; no deploys allowed |

Host note: port **8080 cannot be bound on this Windows machine** (WinNAT excluded port range, "access forbidden"); tests used `WEB_PORT=18080`. Also in Git Bash use `MSYS_NO_PATHCONV=1` when passing `/api` build args.

## Notes for other agents / the lead

- `apps/api` must keep `src/server.js`, `src/db/migrate-cli.js`, `src/cli/create-admin.js` and `migrations/` paths (the image and compose depend on them) and must not need npm at runtime.
- If the inline js-class script or the `/work/` `<style>` changes, update the hashes in `infrastructure/nginx/snippets/security-headers.conf` — the single copy (no other hosting config repeats them).
- `apps/web/README.original.md` updated by the lead to point to the Hetzner deployment.
- Executable bit: files were created on Windows; before committing run `git add --chmod=+x infrastructure/deployment/*.sh` (CI calls them with `bash`, so it is not required there).
- `npm run format:check` is advisory (`continue-on-error`) in CI until the lead decides otherwise.
- Shell-level `docker compose build` builds the same API image twice (api + migrate share the tag); second is a cache hit.

## Commands for the owner

```bash
cp .env.example .env    # fill secrets: openssl rand -hex 32 (DB/Redis), openssl rand -base64 48 (IP_HASH_SECRET)
docker compose up -d --build --wait               # http://localhost:8080 (set WEB_PORT=18080 on this PC)
docker compose run --rm -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD api node src/cli/create-admin.js
infrastructure/deployment/smoke-test.sh http://127.0.0.1:8080
infrastructure/deployment/backup.sh ./backups
docker compose down        # -v also deletes the DB volume
# dev: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```
Production (Hetzner) — full procedure in `infrastructure/deployment/DEPLOYMENT.md`:
1. Create the VM (Ubuntu 24.04, SSH key), Hetzner Cloud Firewall (22 from your IPs, 80/443), DNS.
2. Harden (sudo user, keys only, ufw 22/80/443, unattended-upgrades, fail2ban), install Docker from Docker's apt repo, create `deploy` user + `/srv/portfolio` layout, `shared/.env` (600).
3. GitHub → Environments → `production`: required reviewers = owner; secrets `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`, `HETZNER_KNOWN_HOSTS` (verified `ssh-keyscan -t ed25519` output).
4. Placeholder cert → run *Deploy (manual, Hetzner)* (first run fails the smoke test by design) → `certbot certonly --webroot -w /srv/portfolio/shared/acme …` with the deploy hook → run the deploy again.
5. Create the admin, install the backup + restic cron jobs, set up the uptime checks.
