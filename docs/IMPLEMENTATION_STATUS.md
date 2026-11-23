# Implementation status

Last updated: 2026-11-23 · Branch `rebuild/monorepo` (not committed, not pushed) · Rollback: tag `backup/pre-rebuild-2026-11-23`.

## Definition of Done

| Requirement | Status | Evidence |
|---|---|---|
| Repository replacement | PASS | Old implementation removed (378 tracked files staged as deletions; no jQuery/Bootstrap/Vite/GA/Tailwind references anywhere). `docs/PROJECT_AUDIT.md` |
| Monorepo architecture | PASS | npm workspaces: `apps/{web,api,admin}`, `packages/validation` |
| Frontend | PASS | 13 pages build; `npm run check` 0 errors |
| Original design preserved | PASS | 73/73 output files identical to the target build (API mode off) before intended changes; visual regression 51/51 (42 baselines from the original build, 9 re-approved where the new ETQAN screenshot appears — diff confined to that image) |
| Backend | PASS | Fastify API per `docs/API_CONTRACT.md` |
| Database | PASS | Postgres migration `0001_init.sql`; verified on Postgres 17 in Docker and PGlite |
| API integration | PASS | Docker stack: form → 201 → stored → visible in admin; honeypot stores nothing |
| Rate limiting | PASS | API categories + nginx `limit_req`; 429 verified in tests and through nginx |
| Authentication | PASS | scrypt, DB sessions, `__Host-` cookie (Secure/HttpOnly/Strict verified), lockout (race fixed: SEC-01) |
| Authorization | PASS | 401 unauthenticated, 403 without CSRF token, audit log written |
| Security review | PASS (local scope) | BugHunter skills + scope.py; `docs/security/*`; 0 High/Critical; SEC-01..06 fixed or mitigated |
| Dependency audit | PASS | `npm audit`: 0 vulnerabilities; Trivy: 0 HIGH/CRITICAL in both images |
| Unit tests | PASS | validation 7/7 |
| Integration tests | PASS | API 100/100 (PGlite). Real-Postgres suite: NOT TESTED locally (runs in CI via `TEST_DATABASE_URL`) |
| E2E tests | PASS | 315 passed, 12 skipped (viewport-specific by design), 0 failed |
| Visual regression | PASS | 51/51 |
| Performance | NOT TESTED | Lighthouse not run (not installed); measured: hero clip 1.06 MB, ETQAN 2× shot 142 KB loaded only on high-density screens |
| Docker | PASS | Both images build; stack healthy; smoke test passes |
| CI/CD | NOT TESTED on GitHub | Workflows pass actionlint; not yet run on GitHub |
| Hetzner deploy | BLOCKED | Needs the VM, DNS and GitHub secrets (`DEPLOYMENT.md`) |
| Documentation | PASS | `README.md`, `docs/*`, `docs/security/*`, `infrastructure/deployment/DEPLOYMENT.md` |
| Production build | PASS | `npm run build` |

## Changes after the rebuild (owner requests, 2026-11-23)

1. **Hero dive clip** — replaced with the owner's high-quality approved clip (`assets/source/hero/hiro_video.mp4`): 880×590 @12 fps → 1280×858 @24 fps, same shot and geometry (measured), padded to the masked box, audio removed. Recipe in `assets/source/hero/README.md`.
2. **Reel no longer traps scrolling** — root cause: `home.js` cancels every wheel/touchmove (`preventDefault`) and `next()` wrapped from the last case to the first (`(n + N) % N`), so input never left the showcase. Now: forward from the last case fades the showcase out and opens `/work/` (prefetched); `/work/` scrolls natively; a deliberate pull upward at its top (or pull-down on touch) returns home only for visitors who came from `/`. Tests: `tests/e2e/reel-exit.spec.js` (wheel, keyboard, touch; desktop/tablet/mobile).
3. **Laptop screenshots** — root cause: sources are 1600 px, heavily compressed (27–90 KB); a 1920-px desktop needs ~1840 device px, 2× screens ~2600. Rendering was ruled out (identical with/without `will-change`). ETQAN re-captured from its live site at 3200 px (`tools/screenshots/`), served via `srcset` (2560 px on 2× screens): 2.9× sharper at displayed size. **6 projects still need sources** (no public site found) — see below.
4. **Source assets organised** — hero originals moved (checksums verified) to `assets/source/hero/` with a README; drafts `hero_v1–4` identified as white-background takes that do not match the approved design.

## Open items

- Better screenshots needed (no live URL in the repos or on the web): Agentopia, Etqan Tutor, Original Software, LMFoundry, Qalamy Academy, Teslla Study. Provide each live URL (add to `SHOTS` in `tools/screenshots/capture.mjs`) or a ≥2560-px PNG of the same page top at a ~1600×880 window as `assets/source/projects/<slug>/cover@2x.png`, then run `node tools/screenshots/encode.mjs <slug>`.
- QA-01 (low, pre-existing): first click on Send can be swallowed by the blur-time layout shift on /contact/.
- QA-03 (nit, pre-existing): Tab during the mobile-menu fade skips links.
- SEC-05: restrict `/admin/` + `/api/v1/admin/` by IP in nginx once the admin's IP is known.
- Visual baselines are Windows-rendered; capture Linux baselines for CI from the original build.
- Lighthouse run; first real deploy; GitHub CI run.
