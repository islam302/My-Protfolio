# 04 — Application security report

## Scope and rules

- **Target:** a localhost-only white-box assessment of `rebuild/monorepo`, authorised by the owner. No external hosts and no destructive payloads were used, and no secrets were printed. See `docs/security/scope.md`.
- **Scope checker:** the deterministic checker (`scope.py`, supplied by the lead and read before running) reports IN-SCOPE for localhost, 127.0.0.1 and ::1, and OUT-OF-SCOPE for the production and third-party hosts.
- **Toolkit:** Claude-BugHunter. Every skill used was read first; per-skill outcomes are in `docs/security/BUGHUNTER_AUDIT.md`.

## Deliverables

- `docs/security/scope.md`
- `docs/security/ATTACK_SURFACE.md`
- `docs/security/BUGHUNTER_AUDIT.md`
- `docs/security/VULNERABILITY_REGISTER.md`
- `docs/security/REMEDIATION_REPORT.md`
- `docs/security/FINAL_SECURITY_ASSESSMENT.md`
- `docs/security/patches/serve-mjs.patch`
- `docs/security/evidence/*.txt` (raw PoC output)
- PoCs in `tests/security/`:
  - `poc-api.mjs`
  - `poc-admin-xss.mjs`
  - `poc-serve.mjs`
  - `force-loopback.mjs`

## Findings

| ID | Title | Severity | Status |
|---|---|---|---|
| SEC-01 | Lockout bypass via concurrent login race (+ lockout never audited in a burst) | Medium | **Fixed** (`repositories/admins.js` `reserveLoginAttempt`, `services/auth.js`) + 2 regression tests |
| SEC-02 | Dev static server dies on `/%E0%A4%A` (unhandled URIError) | Low | Patch ready (lead) |
| SEC-03 | Dev static server open redirect `//evil.example/%2E%2E%2Fwork` → `Location: //evil.example/…` | Low | Patch ready (lead) |
| SEC-04 | Dev static server binds all interfaces | Low | Patch ready (lead) |
| SEC-05 | Lockout DoS by anyone knowing the admin email | Low | Accepted; nginx allowlist recommended |
| SEC-06 | `/api/health/ready` unthrottled DB ping | Info | nginx recommendation |
| SEC-07 | Rate limits fail open on Redis error | Info | Accepted |
| SEC-08 | Dev-only Origin fallback trusts Host | Info | Accepted |
| SEC-09 | Client `X-Request-Id` trusted without nginx | Info | Accepted |
| SEC-10 | No headers on dev servers; `style-src-attr 'unsafe-inline'` | Info | Accepted |
| QA-02 | Padded contact fields pass the browser but fail the API | QA bug (owned on request) | **Fixed** (`apps/web/src/scripts/contact.js`) |

**Verified not vulnerable:**
- SQLi
- stored, DOM and HTML-injection XSS (real browser)
- CSRF (all variants)
- session fixation, rotation and invalidation
- auth bypass / layer ordering
- user enumeration (body and timing)
- lockout normalisation (case and whitespace)
- XFF spoofing with `TRUST_PROXY=0` (with `=1` it is safe only behind nginx, which overwrites the header)
- CORS
- prototype pollution and mass assignment
- error leakage
- ReDoS
- path traversal on the dev server
- secrets in the tree and in history
- `npm audit`

## For the lead

1. **Apply** `git apply docs/security/patches/serve-mjs.patch`. This fixes SEC-02/03/04 in `apps/web/scripts/serve.mjs`, which is outside my edit scope. Then run `node tests/security/poc-serve.mjs`, which should report `0 vuln`. Dev servers will listen on 127.0.0.1; set `WEB_HOST=0.0.0.0` for LAN access.
2. **QA-02 marker:** remove `test.fail();` at **`tests/e2e/api-mode.spec.js:216`**. The annotation is on line 215 and the test starts at line 214.
3. **Infra (DevOps files):**
   - SEC-05: an nginx allowlist for `/api/v1/admin/` and `/admin/`. The exact block is in the register. Behind a Hetzner load balancer or Cloudflare, enable `real-ip.conf` first.
   - SEC-06: restrict `/api/health/ready` to 127.0.0.1.
4. **Not tested** (details in `FINAL_SECURITY_ASSESSMENT.md`):
   - The Docker/nginx runtime, real Postgres, Redis and TLS.
   - Semgrep, ZAP, Trivy and gitleaks. None of them are installed.

## Files I changed outside docs/tests

- `apps/api/src/repositories/admins.js`: `recordFailedLogin` was replaced by `reserveLoginAttempt` (atomic, run before scrypt).
- `apps/api/src/services/auth.js`: `login()` now reserves the attempt first and decides the lockout audit from the UPDATE result. The uniform 401 and the timing equalisation are unchanged.
- `apps/api/test/integration/security-regressions.test.js` (new).
- `apps/web/src/scripts/contact.js`: trimmed, code-point length validation (QA-02). The messages are the existing ones, and there is no visual change.

`docs/API_CONTRACT.md` needs no change. No dependencies were added, and root `npm install` was not run.

## Real command output (final run)

```
$ npm test -w @portfolio/api
1..23
# tests 100
# suites 23
# pass 100
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 13796.5796

$ npm test -w @portfolio/validation
# tests 7
# pass 7
# fail 0

$ npx tsc -p tsconfig.json            -> exit 0 (no output)
$ npx eslint apps packages tests/security   -> exit 0 (no output)

$ npm run build -w @portfolio/web     (PUBLIC_API_URL unset)
Built 13 pages in 121ms → dist/  (SITE_URL=https://islambadran.com)
HTML IDENTICAL: 13 files (cache-busting ?v= normalised)   # old vs new contact.js
$ npm run check -w @portfolio/web
Checked 13 HTML files.
  ✓ no errors

$ npm audit            -> found 0 vulnerabilities
$ npm audit --omit=dev -> found 0 vulnerabilities

$ node tests/security/poc-api.mjs      (after fix)
[PASS] RACE-lockout: 25 concurrent wrong guesses + 1 correct (threshold 10): failure-accounting UPDATEs applied=10, wrong->401 x25, correct login -> 401; lockout audit rows=1; final failed_attempts=0, locked=true; …
[PASS] ENUM-timing: median known=87.6ms unknown=88.3ms delta=0.7ms (0.8%), n=24 each, scrypt N=2^15, in-process (no network jitter)
Summary: 35 checks, 29 pass, 0 vuln, 6 info
   (before fix: [VULN] RACE-lockout: … failure-accounting UPDATEs applied=25 … correct login -> 200 AFTER the account had been locked … lockout audit rows=0)

$ node tests/security/poc-admin-xss.mjs
[PASS] payload execution: window.__xss=undefined, dialogs=0
[PASS] injected elements in list/detail DOM: 0
[PASS] saved note round-trips as plain text in <textarea>: "<img src=x onerror=window.__xss=8>"
[PASS] requests to non-loopback/other origins: none

$ node tests/security/poc-serve.mjs    (current serve.mjs)
[VULN] SERVE-bind: }).listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}`));
[PASS] SERVE-traversal: 11 traversal variants … -> none escaped dist/
[VULN] SERVE-open-redirect: //evil.example/%2E%2E%2Fwork -> 301 Location: //evil.example/%2E%2E%2Fwork/ (browser goes to host "evil.example") | …
[VULN] SERVE-malformed-uri: GET /%E0%A4%A -> ERROR ECONNRESET; follow-up GET / -> ERROR ECONNREFUSED (process died …)
   (with patch: SERVE-bind/open-redirect/malformed-uri all PASS, "Summary: 0 vuln, 3 pass")

$ npx playwright test tests/e2e/api-mode.spec.js tests/e2e/contact.spec.js --project=e2e-desktop --reporter=line
  1) … KNOWN BUG QA-02: whitespace-padded fields pass browser validation but fail the API schema
    Expected to fail, but passed.
  1 failed
  25 passed (10.9s)
```
