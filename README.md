# Islam Badran — portfolio (monorepo)

Static portfolio site (design approved, unchanged), an inquiry API with an admin panel,
shared validation, Docker/nginx deployment for a Hetzner server, and full test coverage.

```
apps/
  web/          Static site generator (the approved design). Zero runtime deps.  → apps/web/README.original.md
  api/          Fastify 5 + PostgreSQL: contact inquiries, admin auth, audit log  → docs/API_CONTRACT.md
  admin/        Static admin UI for inquiries, served at /admin/
packages/
  validation/   zod schemas + constants shared by web, admin and api
infrastructure/ docker/ (Dockerfiles) · nginx/ (CSP, TLS, routing) · deployment/ (Hetzner guide, backup/restore, deploy) · monitoring/
tests/          e2e/ (Playwright) · visual/ (regression vs the original design) · security/ (PoCs)
tools/          brand/ (asset recolouring) · screenshots/ (capture project screenshots from live sites)
assets/source/  Archival originals (hero photo, approved dive clip, drafts, screenshot masters) — never served
docs/           Audit, architecture, plans, security reports, agent reports, status
```

Requirements: Node ≥ 22.12, npm 10; Docker for the full stack; ffmpeg for media tools.

## Commands

| Task | Command |
|---|---|
| Install | `npm ci` |
| Static site only (dev, :4321) | `npm run dev -w @portfolio/web` |
| Whole monorepo (API :3000 + site) | set `DATABASE_URL` (see `.env.example`), then `npm run dev` |
| API only | `npm run dev -w @portfolio/api` |
| Migrations | `npm run db:migrate` |
| Create / reset admin | `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run admin:create` (`-- --reset` to change password) |
| Production build (web + admin) | `SITE_URL=https://your-domain npm run build` (add `PUBLIC_API_URL=/api` to enable the API form) |
| Lint / types / format | `npm run lint` · `npm run typecheck` · `npm run format:check` |
| Unit + integration | `npm test` (API uses in-process PGlite; set `TEST_DATABASE_URL` for real Postgres) |
| Site link/SEO check | `npm run build && npm run check` |
| E2E | `npm run test:e2e` (first time: `npx playwright install chromium`) |
| Visual regression | `npx playwright test tests/visual` |
| Security PoCs (local only) | `node tests/security/poc-api.mjs` · `poc-admin-xss.mjs` · `poc-serve.mjs` |
| Dependency audit | `npm audit` |
| Full stack in Docker | `cp .env.example .env` (fill secrets) → `docker compose up -d --build --wait` → http://127.0.0.1:8080 (`WEB_PORT=18080` if 8080 is reserved on Windows) |
| Smoke test | `infrastructure/deployment/smoke-test.sh http://127.0.0.1:8080` |
| Deploy to Hetzner | `infrastructure/deployment/DEPLOYMENT.md` (manual `deploy.yml` workflow with approval) |
| Project screenshots | `node tools/screenshots/capture.mjs <slug>` → `node tools/screenshots/encode.mjs <slug>` |

Status, results and open items: `docs/IMPLEMENTATION_STATUS.md`. Security: `docs/security/FINAL_SECURITY_ASSESSMENT.md`.
