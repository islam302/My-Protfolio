# Final security assessment

**Scope:** localhost white-box review of `rebuild/monorepo` (API, admin SPA, static site, shared validation, dev tooling). Infrastructure was reviewed read-only. See `scope.md`.

**Overall:** the application layer is in good shape. It has parameterised SQL everywhere, strict zod schemas that reject unknown and prototype keys, opaque hashed sessions with `__Host-` SameSite=Strict cookies, a synchronizer CSRF token plus an Origin allowlist, uniform and timing-equalised login errors, and `textContent`-only rendering in the admin panel. Two of these passed a real-browser PoC: stored XSS through the inquiry → admin path, and session fixation. One real authentication weakness was found and fixed: **SEC-01**, a lockout race. The remaining confirmed issues are in the dev-only static server (SEC-02/03/04), and a tested patch is ready for the lead. **No High or Critical findings.**

## Final status

| ID | Severity | Status |
|---|---|---|
| SEC-01 | Medium | Fixed + regression tests + PoC re-run |
| SEC-02 | Low | Patch ready (lead applies `docs/security/patches/serve-mjs.patch`) |
| SEC-03 | Low | Patch ready (same) |
| SEC-04 | Low | Patch ready (same) |
| SEC-05 | Low | Accepted; nginx allowlist recommended (lead/DevOps) |
| SEC-06 | Info | Recommendation (nginx) |
| SEC-07 | Info | Accepted |
| SEC-08 | Info | Accepted |
| SEC-09 | Info | Accepted |
| SEC-10 | Info | Accepted |

## Second pass over the fixed areas

- **`reserveLoginAttempt`:**
  - The SQL is fully parameterised.
  - The `RETURNING` clause reads the *new* row, so `triggered_lock` is true only for the attempt that set the lock.
  - An expired `locked_until` passes the `WHERE` clause. It is not reset to NULL, but it is ignored by every later comparison. On success, `recordSuccessfulLogin` nulls it, exactly as before.
  - No stuck state is possible: the lock is written in the same statement that reaches the threshold, so a crash between reservation and verification cannot leave the account "full but not locked".
  - The concurrency proof is the `RACE-lockout` PoC: 10 UPDATEs applied and 15 refused.
  - Uniform error and timing were re-measured after the fix: identical bodies, 0.8 % median delta.
- **`contact.js`:**
  - `setCustomValidity` is cleared on every `showError` call, so a corrected field becomes valid on the next `input` event. The existing contact tests ("fixing it clears the error live") pass.
  - The `<select>` and the honeypot are excluded.
  - No new sinks; all messages are still set through `textContent`.

## Residual risks

1. **Concurrent guess budget.** SEC-01 now enforces the budget exactly: at most 10 guesses per 15 minutes per account. Together with the per-IP limit and the 12-character minimum password, online guessing is impractical. Breached-password screening is not implemented (ASVS 2.1.7), so the owner should pick a unique passphrase.
2. **Lockout DoS (SEC-05).** This remains until an edge allowlist (or a private admin email) is deployed.
3. **Single-tenant admin.** Any admin sees and edits all inquiries. This is a documented design choice. There is no per-admin role model and no UI to revoke all sessions (the CLI `--reset` does it).
4. **Rate limits are per process** without Redis, and fail open on Redis errors (SEC-07). The nginx `limit_req` is the backstop.
5. **PII retention.** Inquiries, the audit log and expired sessions have no retention or purge job. Expired sessions are only deleted lazily, on login. 5xx logs can contain driver error details, which may quote parameter values. Log access must be restricted on the server.
6. **`style-src-attr 'unsafe-inline'`** in the site CSP (documented trade-off). The site renders no user content.
7. **Infrastructure assumptions not verified at runtime:**
   - nginx overwrites `X-Forwarded-For`.
   - The API port is not published.
   - `TRUST_PROXY=1` matches the real hop count once a Hetzner load balancer or Cloudflare is added. If it is, enable `real-ip.conf` and keep `TRUST_PROXY=1`; never raise it without also restricting who can reach nginx.

## Not tested (and why)

| Item | Status | Reason |
|---|---|---|
| Docker / nginx runtime (`docker compose up`), container hardening, nginx `limit_req`, headers as actually served, HTTP smuggling between nginx and Node | **NOT TESTED** | DevOps is still editing `infrastructure/**` and `docker-compose*`; the configuration was only read. Recommend a post-integration pass: `curl -I` the headers, `limit_req` bursts, and `/.git` and `/.env` returning 404. |
| Real PostgreSQL (row-lock semantics of SEC-01 under a pool with >1 connection) | **NOT TESTED** | Only PGlite (single connection) was used. The fix relies on standard `UPDATE … WHERE … RETURNING` row locking, which is stronger on real Postgres. Run `TEST_DATABASE_URL=… npm test -w @portfolio/api` against a throwaway DB. |
| Redis-backed rate limiting | **NOT TESTED** | No local Redis was started. |
| TLS configuration (`tls.example.conf`), HSTS preload, certificate handling | **NOT TESTED** | No TLS endpoint locally. |
| Semgrep SAST | **NOT TESTED** | Not installed (`command -v semgrep` → not found). `eslint-plugin-security` ran instead (0 findings). |
| OWASP ZAP DAST | **NOT TESTED** | Not installed. The hand-written localhost PoCs cover the API and dev-server surface. |
| Trivy (image/dependency CVE scan) | **NOT TESTED** | Not installed; the images were not built. `npm audit` reported 0 vulnerabilities (production and dev). |
| gitleaks / trufflehog | **NOT TESTED** | Not installed. A regex secret scan of the working tree and `git log -p --all` (61 commits) found nothing. |
| Cross-browser admin XSS (Firefox/WebKit) | **NOT TESTED** | Chromium only. The sinks are `textContent`/`value`, which behave the same in every engine. |
| Production / deployed hosts | **Out of scope** | By rule (`scope.md`). |

## Commands run (final)

| Command | Result |
|---|---|
| `npm test -w @portfolio/api` | `# tests 100` `# pass 100` `# fail 0` |
| `npm test -w @portfolio/validation` | `# tests 7` `# pass 7` `# fail 0` |
| `npx tsc -p tsconfig.json` | exit 0 |
| `npx eslint apps packages tests/security` | exit 0 |
| `npm run build -w @portfolio/web` (no `PUBLIC_API_URL`) | `Built 13 pages … → dist/`; HTML identical to the pre-change build |
| `npm run check -w @portfolio/web` | `Checked 13 HTML files.` `✓ no errors` |
| `npm audit` / `npm audit --omit=dev` | `found 0 vulnerabilities` |
| `node tests/security/poc-api.mjs` | `35 checks, 29 pass, 0 vuln, 6 info` |
| `node tests/security/poc-admin-xss.mjs` | 4 PASS, no execution |
| `node tests/security/poc-serve.mjs` | current file: 2 vuln (+ bind); patched copy: 0 vuln |
| `npx playwright test tests/e2e/api-mode.spec.js tests/e2e/contact.spec.js --project=e2e-desktop` | `25 passed`, `1 failed` (= QA-02 `test.fail` now passing; remove the marker) |
