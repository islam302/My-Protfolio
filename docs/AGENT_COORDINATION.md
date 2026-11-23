# Agent coordination

Lead/orchestrator: main session. All agents work in the same checkout (`D:\CODING\My-Protfolio`, branch `rebuild/monorepo`) on **disjoint directories**. Nobody commits, switches branch or runs `npm install` at the root without the lead (dependencies are pre-installed; lockfile is lead-owned).

| # | Agent | Owns (may write) | Must not touch | Report |
|---|---|---|---|---|
| 1 | Repository auditor & architect | lead (done inline) — `docs/PROJECT_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md` | — | in docs |
| 2 | Frontend engineer | `apps/web/src/**`, `apps/web/scripts/**`, `apps/admin/**` | `apps/api`, `tests/`, infra | `docs/AGENT_REPORTS/02-frontend.md` |
| 3 | Backend engineer | `apps/api/**` | everything else | `docs/AGENT_REPORTS/03-backend.md` |
| 4 | Application security engineer | phase 2 (after integration): findings + fixes coordinated via lead; `docs/security/**`, `tests/security/**` | — | `docs/AGENT_REPORTS/04-security.md` |
| 5 | QA & E2E automation | `playwright.config.js`, `tests/e2e/**`, `tests/visual/**`, `tests/integration/**` | app source | `docs/AGENT_REPORTS/05-qa.md` |
| 6 | DevOps & infrastructure | `infrastructure/**`, `docker-compose*.yml`, `.github/**`, `.env.example`, `.dockerignore` | app source | `docs/AGENT_REPORTS/06-devops.md` |
| 7 | Performance & code quality | phase 2: Lighthouse + bundle/query review; `tests/performance/**` | — | `docs/AGENT_REPORTS/07-performance.md` |

Shared interfaces (frozen before parallel work):

- `docs/API_CONTRACT.md` — endpoints, envelopes, auth/CSRF, schema, env.
- `packages/validation` — zod schemas + constants (lead-owned).
- Design baseline: original target build is byte-identical to `apps/web` output with `PUBLIC_API_URL` unset (verified by lead: 73/73 files).

## Status log

- Phase 1–3 (lead): repo inspected, rollback tag `backup/pre-rebuild-2026-11-23`, old implementation removed, monorepo skeleton, shared validation, lint/typecheck green, contract frozen.
