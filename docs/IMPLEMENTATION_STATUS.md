# Implementation status

Last updated: 2026-11-23 · Branch `rebuild/monorepo` (pushed to `islam302/My-Protfolio`; `main` untouched) · Rollback: tag `backup/pre-rebuild-2026-11-23`.

## Definition of Done

| Requirement | Status | Evidence |
|---|---|---|
| Repository replacement | PASS | Old implementation removed (378 tracked files staged as deletions; no jQuery/Bootstrap/Vite/GA/Tailwind references anywhere). `docs/PROJECT_AUDIT.md` |
| Monorepo architecture | PASS | npm workspaces: `apps/{web,api,admin}`, `packages/validation` |
| Frontend | PASS | 14 pages build; `npm run check` 0 errors |
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
| E2E tests | PASS | 336 passed, 12 skipped (viewport-specific by design), 0 failed |
| Visual regression | PASS | 54/54. Baselines re-approved only after inspecting each diff (footer LinkedIn/Facebook links, contact cards, /work/ additions, Alreef in related/next links); 3 new baselines for `/work/alreef/` |
| Performance | NOT TESTED | Lighthouse not run (not installed); measured: hero clip 1.06 MB, ETQAN 2× shot 142 KB loaded only on high-density screens |
| Docker | PASS | Both images build; stack healthy; smoke test passes |
| CI/CD | NOT TESTED on GitHub | Workflows pass actionlint; not yet run on GitHub |
| Vercel deploy (static site) | PASS | https://www.islammohamed.online (Vercel project `islam-badran`, deploys from `main`): `vercel.json` (build, CSP/security headers mirrored from nginx, caching); `SITE_URL` set in the Vercel production env. Verified live: pages 200, 404 page, headers, canonical/sitemap, hero clip + screenshots, no console/CSP errors. The inquiry API is not on Vercel: the form uses WhatsApp/email |
| Hetzner deploy (full stack) | BLOCKED | Needs the VM, DNS and GitHub secrets (`DEPLOYMENT.md`) |
| Documentation | PASS | `README.md`, `docs/*`, `docs/security/*`, `infrastructure/deployment/DEPLOYMENT.md` |
| Production build | PASS | `npm run build` |

## Changes after the rebuild (owner requests, 2026-11-23)

1. **Hero dive clip** — replaced with the owner's high-quality approved clip (`assets/source/hero/hiro_video.mp4`): 880×590 @12 fps → 1280×858 @24 fps, same shot and geometry (measured), padded to the masked box, audio removed. Recipe in `assets/source/hero/README.md`.
2. **Reel no longer traps scrolling** — root cause: `home.js` cancels every wheel/touchmove (`preventDefault`) and `next()` wrapped from the last case to the first (`(n + N) % N`), so input never left the showcase. Now: forward from the last case fades the showcase out and opens `/work/` (prefetched); `/work/` scrolls natively; a deliberate pull upward at its top (or pull-down on touch) returns home only for visitors who came from `/`. Tests: `tests/e2e/reel-exit.spec.js` (wheel, keyboard, touch; desktop/tablet/mobile).
3. **Laptop screenshots** — root cause: sources are 1600 px, heavily compressed (27–90 KB); a 1920-px desktop needs ~1840 device px, 2× screens ~2600. Rendering was ruled out (identical with/without `will-change`). Re-captured from the live sites at 2× (`tools/screenshots/`) for ETQAN, Agentopia, Etqan Tutor, Original Software and Teslla Study, served via `srcset` (2560 px on 2× screens): 2.0–2.9× sharper at displayed size. LMFoundry and Qalamy Academy still need sources — see below.
4. **Source assets organised** — hero originals moved (checksums verified) to `assets/source/hero/` with a README; drafts `hero_v1–4` identified as white-background takes that do not match the approved design.
5. **Contact numbers** — primary phone/WhatsApp `+20 101 391 9821` (every WhatsApp link and the brief form), second number `+20 150 585 8198`; both shown one per line on the WhatsApp card and emitted as two `ContactPoint`s.
6. **LinkedIn + Facebook** — two new channel cards on /contact/ in the existing card style (3 + 2 grid on desktop, WhatsApp full-width + 2 + 2 on tablet, stacked on phones), footer "Elsewhere" links on every page, and `sameAs` in the Person JSON-LD.

7. **Alreef E-commerce case study** (`/work/alreef/`) — 8th project, from facts on alref.net and the project READMEs only (Arabic-first React storefront, Django REST API with catalogue, FEFO stock, offers/coupons, cash on delivery, order tracking, ops dashboard). Live-site screenshot at 2× via `tools/screenshots` (the site's own first-order popup dismissed); theme from the site's CSS. Hyphenated titles in display headings never split at the hyphen (`keepHyphens`, `.nobr`).
8. **Client & private work** on `/work/` below the grid ("Behind closed doors"): 7 text-only cards with no links (`apps/web/src/data/private-work.js`) — no client names, URLs, costs or internal metrics. Not affected by the category filter. Tests: `tests/e2e/private-work.spec.js`.

## Open items

- Better screenshots needed (no live URL in the repos or on the web): LMFoundry, Qalamy Academy. Provide each live URL (add to `SHOTS` in `tools/screenshots/capture.mjs`) or a ≥2560-px PNG of the same page top at a ~1600×880 window as `assets/source/projects/<slug>/cover@2x.png`, then run `node tools/screenshots/encode.mjs <slug>`.
- QA-01 (low, pre-existing): first click on Send can be swallowed by the blur-time layout shift on /contact/.
- QA-03 (nit, pre-existing): Tab during the mobile-menu fade skips links.
- SEC-05: restrict `/admin/` + `/api/v1/admin/` by IP in nginx once the admin's IP is known.
- Visual baselines are Windows-rendered; capture Linux baselines for CI from the original build.
- Lighthouse run; first real deploy; GitHub CI run.
