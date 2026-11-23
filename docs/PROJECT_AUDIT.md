# Project audit

Date: 2026-11-23 · Auditor: lead engineer · Scope: the working directory `D:\CODING\My-Protfolio` (old implementation) and the target repository `github.com/Etqan-agency/Islam_portfolio` (source of truth, commit `583e19f`).

## 1. Old implementation (removed)

Rollback point: annotated tag **`backup/pre-rebuild-2026-11-23`** → commit `aedbb73` (origin `islam302/My-Protfolio`, branch `main`). Nothing was pushed or rewritten; `main` is untouched. The rebuild lives on branch `rebuild/monorepo`.

| Finding | Detail | Action |
|---|---|---|
| Architecture | Single-page `index.html` (62 KB) + `com.html`, jQuery 1.x plugins (isotope, owl.carousel, magnific-popup, parallaxie, typed, countTo, appear, easing), Bootstrap, SCSS, plus Tailwind **CDN runtime** and GSAP from cdnjs, built by Vite 5 | Removed |
| Repository hygiene | **197 `node_modules/` files committed to git**, vendored jQuery plugins, compiled `stylesheet.css` committed alongside SCSS sources | Removed; `.gitignore` hardened |
| Third-party scripts | Google Analytics (`G-T2C2M8T99X`), Tailwind CDN JIT in production, unpinned CDN scripts without SRI | Not carried over. The target has no analytics; adding tracking is not justified by any feature and would need a consent banner |
| Backend | None | — |
| Tests / CI | None | — |
| User-owned files (untracked) | `Confident Professional with Retro Phone and Laptop.png`, `ai_video.mp4`, `hero-video/hero_v1–4.mp4` | **Kept in place, untouched**, git-ignored. Their purpose (raw hero footage?) needs the owner's confirmation; they are not referenced by the target design |

Verification that no obsolete implementation remains: `git ls-files` on `rebuild/monorepo` contains only `apps/`, `packages/`, `infrastructure/`, `tests/`, `docs/`, `scripts/`, `tools/`, `.github/` and root config — see §5.

## 2. Target repository (source of truth)

87 tracked files, 5.9 MB. Zero runtime dependencies.

| Area | What exists | Assessment |
|---|---|---|
| Build | `scripts/build.mjs` (~110 lines): imports `src/pages/*.js`, each returning page objects; writes `dist/<path>/index.html`, sitemap, robots, manifest | **Reuse as-is.** Small, deterministic, already does SEO validation |
| Templating | `src/lib/html.js` tagged template that escapes every interpolation; `raw()` opt-out used only for trusted constants | Reuse. Audited: no `raw()` on user data (there is no user data at build time) |
| Pages | home (bare layout, hero video + scroll reel), about, work (+ category filter), 7 case studies, services, contact, 404 — 13 HTML files | Reuse unchanged (design is approved) |
| Data | `src/data/site.js` (facts, links, nav), `src/data/projects.js` (all project copy, themes, images) | Reuse |
| SEO | canonical, OG/Twitter, JSON-LD `@graph` (Person, WebSite, Breadcrumb, ContactPage, Service…), `ldScript` escapes `<` | Reuse |
| Browser JS | `site.js` (nav, reveal), `home.js` (565 lines, video/scroll choreography), `work.js` (filter), `contact.js` (validation → wa.me / mailto) | Reuse; reviewed by frontend agent for DOM sinks/leaks |
| Styles | 5 CSS files with tokens in `site.css` | Reuse unchanged |
| Assets | WebP images with 800 px card variants, woff2 fonts (self-hosted), 580 KB hero MP4 | Reuse |
| Quality gate | `scripts/check.mjs`: broken links/assets, one `<h1>`, unique titles/descriptions, `alt`, CLS width/height | Reuse + run in CI |
| Dev server | `scripts/serve.mjs` with path-traversal guard | Reuse (dev only; production is nginx/static host) |
| Deploy | `netlify.toml`, `vercel.json` (cache headers only, **no security headers**) | Removed (owner decision: deploy to Hetzner via Docker Compose + nginx, which carries all headers/CSP) |
| Tools | `tools/brand/` Python/Swift recolour scripts for assets | Keep at repo root (asset pipeline, not app code) |
| Backend / DB / auth / tests / CI / Docker | **Missing** | Build |

### Gaps found in the target

1. **Contact briefs are never captured.** The form only opens WhatsApp/mailto; if the visitor doesn't press send, the lead is lost, and there is no record. → Inquiry API + admin panel (the only backend feature with a real justification; no invented features such as blog/testimonials, which the design doesn't have).
2. **No security headers / CSP** on any deployment config.
3. **No automated tests, no CI, no container build.**
4. Two lint-level issues (unused import in `about.js`, unused destructured variable in `check.mjs`) — fixed; output unchanged.

## 3. Classification

| Category | Items |
|---|---|
| Reused unchanged | All of `src/` (pages, templates, styles, data, lib, browser scripts except contact integration), `public/` assets, build/check/serve scripts |
| Refactored | `contact.js` page (budget/timeline lists now from `@portfolio/validation`), `contact.js` script (optional API submit), deploy configs (headers), `about.js`/`check.mjs` lint fixes |
| Rewritten | — (nothing in the target warranted a rewrite; rewriting working, approved code would only risk visual regressions) |
| Removed | Entire old implementation (see §1) |
| Added | `packages/validation`, `apps/api`, `apps/admin`, `infrastructure/`, `tests/`, `.github/`, `docs/` |

## 4. Design-preservation evidence

`apps/web` output with `PUBLIC_API_URL` unset was diffed against a clean build of the target commit: **73/73 files identical** after normalising the per-build `?v=` cache-bust token and sitemap `<lastmod>` date (both are timestamps by design). Pixel-level visual regression: see `docs/AGENT_REPORTS/05-qa.md`.

## 5. Final tree check

See `README.md` → *Repository layout* and `docs/IMPLEMENTATION_STATUS.md`.
