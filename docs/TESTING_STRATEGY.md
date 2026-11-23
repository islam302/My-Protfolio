# Testing strategy

| Layer | Tool | Location | Runs in CI | What |
|---|---|---|---|---|
| Static checks | ESLint 10 (+ security plugin), Prettier, `tsc --checkJs` strict | root | yes | style, unsafe patterns, types |
| Build gate | `apps/web/scripts/check.mjs` | web | yes | broken links/assets, one `<h1>`, unique titles/descriptions, `alt`, image dimensions |
| Unit | `node:test` | `packages/validation/test`, `apps/api/test/unit` | yes | schemas, password hashing, tokens, config, SQL escaping |
| Integration | `node:test` + `fastify.inject` + PGlite (or real Postgres via `TEST_DATABASE_URL`) | `apps/api/test` | yes (Postgres service container) | every endpoint, auth, CSRF, rate limits, errors, migrations |
| E2E | Playwright (Chromium; desktop 1440, tablet 768, mobile 375) | `tests/e2e` | yes | every page, navigation, mobile menu, work filter, case studies, contact validation + hand-off, API mode (mocked), admin flows (mocked), slow network, failed API, 404 |
| Full-stack E2E | Playwright against the Docker stack or local API + PGlite | `tests/e2e` (`FULLSTACK=1`) | yes when stack is up | real inquiry submit → admin sees it |
| Visual regression | Playwright `toHaveScreenshot` | `tests/visual` | yes | baselines captured from the **original** target build, compared to the rebuilt site at 3 viewports; animations disabled, video masked, reveals forced |
| Security | Semgrep, gitleaks, Trivy, npm audit, CodeQL, OWASP ZAP baseline + manual review with Claude-BugHunter skills; regression tests per finding | `.github/workflows/security.yml`, `tests/security` | yes | SAST, SCA, secrets, DAST |
| Performance | Lighthouse (mobile + desktop), API latency smoke (autocannon-style with `node:http`) | `tests/performance` | manual / CI optional | Core Web Vitals, bundle weight, p95 latency |

Rules: no test is skipped to hide a failure (skips carry a reason); results in reports are copied from real output; visual diffs above threshold block release.
