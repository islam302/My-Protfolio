# Implementation plan

| Phase | Work | Owner | Depends on |
|---|---|---|---|
| 1 | Inspect current project + target; rollback tag `backup/pre-rebuild-2026-11-23`; branch `rebuild/monorepo` | lead | — |
| 2 | Audit → `PROJECT_AUDIT.md`, `ARCHITECTURE.md`, `SECURITY_PLAN.md`, `TESTING_STRATEGY.md` | lead | 1 |
| 3 | Monorepo skeleton (npm workspaces, ESLint/Prettier/tsc), `packages/validation`, frozen `API_CONTRACT.md`; remove old implementation; import target into `apps/web`; byte-equivalence check | lead | 2 |
| 4–7 (parallel) | `apps/api` (backend + DB + tests) · `apps/web` API mode + `apps/admin` · Playwright E2E + visual baselines from original · Docker/nginx/CI/deploy docs | agents 3, 2, 5, 6 | 3 |
| 8 | Integration: install, lint, typecheck, all tests, full-stack E2E (real API + PGlite/Postgres), visual regression | lead | 4–7 |
| 9 | Security: BugHunter-driven review + hunting, safe local validation, fixes with regression tests, re-test | agent 4 + lead | 8 |
| 10 | Performance: Lighthouse, API latency, query/index review | agent 7 + lead | 8 |
| 11 | Docker stack verification (if daemon available), CI config review | lead | 7 |
| 12 | Final docs, `IMPLEMENTATION_STATUS.md`, production-readiness audit with PASS/FAIL/NOT TESTED/BLOCKED | lead | all |

Interfaces frozen before parallel work: `docs/API_CONTRACT.md`, `packages/validation`, directory ownership in `docs/AGENT_COORDINATION.md`.
