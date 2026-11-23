# Claude-BugHunter audit log

Toolkit: Claude-BugHunter, installed at `C:\Users\DELL\.claude` (`commands/*.md`, `skills/*/SKILL.md`). Each command and skill file below was read before it was applied. Only the parts that fit a **white-box review of a local application** were used. The bug-bounty framing (payout, program rules, dedup against HackerOne, "admin-only = kill") was dropped, because the owner wants defence-in-depth findings, including admin-side ones.

## Method

1. **Scope** (`/scope`). The scope is in `scope.md`. Active tests touched only in-process `app.inject()` (no socket) and servers bound to `127.0.0.1`.
2. **Surface** (`/surface`): `ATTACK_SURFACE.md`. `/surface` expects a recon manifest from `/recon`. External recon is out of scope, so the ranking was built from the source code instead.
3. **Hunt**: source review per skill (below), then localhost PoCs.
   - `tests/security/poc-api.mjs` (35 checks): API via `buildApp` + PGlite.
   - `tests/security/poc-admin-xss.mjs`: real API on 127.0.0.1, admin SPA, headless Chromium.
   - `tests/security/poc-serve.mjs`: dev static server forced to loopback with `force-loopback.mjs`.
4. **Triage / validate** (`/triage`, `/validate`, `triage-validation` skill). Each candidate needed a reproducing request and response. The "layer-ordering trap" rule was applied to every auth result: auth was probed with well-formed bodies. A finding is "Confirmed" only with captured output.
5. **Chain** (`/chain`): every confirmed issue was checked against the A→B table.
6. **Token-scan**: adapted (see below).
7. **Report** (`/report`): adapted into the register format the lead asked for (ID, CWE, CVSS, evidence, fix, regression test) instead of an H1/Bugcrowd submission.

### Deterministic scope check

At first, `/scope`'s `engine/scope.py` was **not installed**, so scope was enforced by hand with `scope.md`. Partway through, the lead supplied the checker. The owner approved the download, and the file is at `…/scratchpad/bughunter-engine/scope.py`: stdlib only. It was read in full before it was run (`argparse`/`ipaddress`/`re`/`urlparse`; no network, no file writes).

- Self-test: `python -I scope.py --selftest` → `scope.py self-test: PASS`
- Check: `python -I scope.py --md docs/security/scope.md <targets…>` (exit 1, because out-of-scope targets were included on purpose):

```
scope: warning: scope rule '::1' widened to host '::1' (scope is per-host)
IN-SCOPE   localhost
IN-SCOPE   http://127.0.0.1:4321/
IN-SCOPE   http://127.0.0.1:3000/api/health
IN-SCOPE   http://[::1]:4321/
IN-SCOPE   app.localhost
OUT-OF-SCOPE  islambadran.com  (islambadran.com matches an out-of-scope rule)
OUT-OF-SCOPE  https://api.islambadran.com  (api.islambadran.com matches an out-of-scope rule)
OUT-OF-SCOPE  etqanpp.com  (etqanpp.com matches an out-of-scope rule)
OUT-OF-SCOPE  https://wa.me/201  (wa.me matches an out-of-scope rule)
OUT-OF-SCOPE  example.com  (example.com matches an out-of-scope rule)
OUT-OF-SCOPE  192.168.1.10  (192.168.1.10 matches no in-scope rule (default deny))
OUT-OF-SCOPE  evil.example  (evil.example matches no in-scope rule (default deny))
```

(The `::1` warning is cosmetic: the rule contains `:`, which the checker reads as a port. The host match is still exact.)

**Timing, stated plainly:** the first PoC runs happened before the checker arrived, under the manual scope. They used in-process inject (no socket) plus `127.0.0.1` listeners, which the checker later confirmed as IN-SCOPE. Every run after the checker arrived used the same targets: the post-fix `poc-api`, `poc-serve` with the patch, and the `poc-admin-xss` evidence run. Hostnames such as `evil.example` appear only as *header values* (`Origin`, `Host`, `Location` checks) in in-process or loopback requests. Nothing ever connected to them. The admin-XSS PoC also aborts any browser request that is not to its own loopback port, and it recorded "requests to non-loopback/other origins: none".

## Skill-by-skill record

| Skill / command | Applied? | What was checked | Outcome |
|---|---|---|---|
| `/scope` (+ `scope.py`) | Applied | `scope.md`; checker output above | All active targets IN-SCOPE |
| `/surface` | Applied (adapted: no recon manifest) | Routes, auth, limits, browser sinks, cookies, stores, boundaries | `ATTACK_SURFACE.md` |
| `/recon`, `/autopilot`, `hunt-subdomain`, `offensive-osint`, `web2-recon` | **Not applied** | External recon/OSINT is out of scope | — |
| `hunt-sqli` | Applied | Every SQL string in `repositories/*.js`: positional params; ILIKE + `escapeLike` + `ESCAPE '\'`; ORDER BY from a 2-value enum; LIMIT/OFFSET parameterised. PoC: q/id/sort/page/body payloads | Not vulnerable |
| `hunt-xss` | Applied | Stored path inquiry → admin (OOB-or-it-didn't-happen gate: a `window.__xss` beacon plus a dialog listener, in a real browser, no CSP); build-time `html` escaping; JSON-LD `<` escaping | Not vulnerable (`poc-admin-xss.txt`) |
| `hunt-dom` | Applied | Grep for `innerHTML/outerHTML/insertAdjacentHTML/document.write/eval/new Function/postMessage/serviceWorker`. `location.hash`/`search` flows in `work.js`, `contact.js`, admin `readQueryFromUrl`. DOM clobbering: no global-by-id lookups used as config | Not vulnerable |
| `hunt-html-injection` | Applied | Same sinks. Server returns JSON only (`application/json` + nosniff); static HTML has no runtime input | Not vulnerable |
| `hunt-csrf` | Applied | Raw-client header-check shortcut: no token, wrong token, cross-session token, evil/null/look-alike Origin, text/plain JSON, logout CSRF, login CSRF; SameSite=Strict; JSON-only parser | Not vulnerable |
| `hunt-idor` | Applied (limited) | Single-tenant admin model (documented); no public read endpoint; UUID ids; unknown id → 404 | Not applicable beyond that (one role) |
| `hunt-auth-bypass` | Applied | Guard chain on every admin route (`onRoute` hook), layer-ordering with well-formed bodies, forged, overlong and wrongly named cookies, method override, trailing-slash routing (`ignoreTrailingSlash`) | Not vulnerable |
| `hunt-session` | Applied | Fixation (planted cookie), rotation, logout and password-reset invalidation, idle/absolute expiry (existing tests), cookie attributes dev/prod, 256-bit entropy, hash-at-rest; JWT/refresh/OAuth phases not applicable | Not vulnerable |
| `hunt-brute-force` | Applied | Four rate-limit states: hard lockout with the correct password refused afterwards (not a shadow throttle); IP rotation via XFF with TRUST_PROXY 0 vs 1; enumeration by body, status and timing medians; lockout as DoS | **SEC-01** (via race), **SEC-05** |
| `hunt-ato` | Applied | Paths 1–11: no password reset, email change, OAuth, MFA, magic link or registration flows exist. Only path 7 (login oracle) applies, covered by brute-force/enum | Not vulnerable / mostly not applicable |
| `hunt-business-logic` | Applied | Honeypot (fake 201, nothing stored, junk body), duplicate-submit guard (client), status workflow (enum only), notes-content excluded from audit, empty notes → NULL | Not vulnerable |
| `hunt-race-condition` | Applied | Source grep "await find … await update" without lock: **auth lockout read-verify-write** (vulnerable); inquiry update uses `SELECT … FOR UPDATE` in a tx (safe); in-memory rate-limit store increments synchronously (safe). PoC: 26 concurrent logins | **SEC-01 (fixed)** |
| `hunt-api-misconfig` | Applied | Mass assignment (strict zod, create and patch), prototype pollution (body + query), verb tampering, Swagger exposure (dev only, no secrets), JWT/OData not applicable | Not vulnerable |
| `hunt-exceptional-conditions` | Applied | Malformed JSON, wrong types, deep nesting, NUL bytes, oversize, odd charsets, astral Unicode vs DB CHECKs, malformed percent-encoding (dev server), 5xx envelope | **SEC-02** (dev server); API not vulnerable |
| `hunt-source-leak` | Applied | Source maps (none in dist), `.git`/dotfiles (nginx denies `/\.`; dev server traversal-safe), Swagger (dev only), build-info: none | Not vulnerable |
| `hunt-cors` | Applied | Default (no CORS plugin), allowlist exact-match incl. suffix/`null`, credentials only for listed origins | Not vulnerable |
| `hunt-open-redirect` | Applied | Admin has no post-login `next=` param; `api.js` uses `redirect:'error'`; nginx `/admin` → constant; dev server trailing-slash 301 | **SEC-03** (dev server) |
| `hunt-lfi` | Applied | `serve.mjs` resolver (11 traversal encodings), nginx `root` vs `alias` (no off-by-slash), admin build `cp` (no user input), `migrate.js` reads a fixed dir | Not vulnerable |
| `hunt-nodejs` | Applied | Prototype pollution (Fastify `onProtoPoisoning:'error'` + zod strict), no lodash merge / `child_process` / template engine / dynamic `require`, Express-style trust-proxy (Fastify hop-count function verified), ReDoS timings on all shared regexes | Not vulnerable |
| `hunt-host-header` | Applied | No password reset or absolute URLs from Host (canonical URLs are build-time constants); Host vs Origin check with/without PUBLIC_ORIGIN; nginx passes `$host`, `server_name _` | **SEC-08** (Info, dev only) |
| `hunt-clickjacking` | Applied | XFO DENY + `frame-ancestors 'none'` (site, admin via nginx); API helmet XFO + `frame-ancestors 'none'` | Not vulnerable in production; dev servers send none (SEC-10, Info) |
| `hunt-cache-poison` | Applied (review) | API `Cache-Control: no-store`; admin no-store; HTML `no-cache`; long cache only for `?v=` versioned assets; no unkeyed header reflected | Not vulnerable |
| `hunt-http-smuggling` | Applied (review only) | nginx `proxy_http_version 1.1`, `Connection ""`, no `chunked` rewriting; Fastify strict parser | Not tested at runtime (Docker stack not run) |
| `hunt-ssrf`, `hunt-file-upload`, `hunt-xxe`, `hunt-ssti`, `hunt-deserialization`, `hunt-oauth`, `hunt-saml`, `hunt-jwt-crypto`, `hunt-graphql`, `hunt-websocket`, `hunt-ldap`, `hunt-nosqli`, `hunt-llm-ai` | **Not applicable** | Confirmed by grep: no outbound fetch from user input (server side has none), no uploads, no XML, no server templating of user input, no `JSON.parse` of untrusted data outside Fastify's poisoning-safe parser, no OAuth/SAML/JWT/GraphQL/WS/LDAP/Mongo/LLM | — |
| `/triage`, `/validate`, `triage-validation` | Applied | 7-question gate per finding, layer-ordering trap, "never call confirmed without evidence"; Q4 "admin-only = kill" ignored on purpose (defensive review) | Severity and status assigned in the register |
| `/chain` | Applied | SEC-03 open redirect: no OAuth or token flow → no chain. SEC-02/04: LAN exposure + crash = DoS of preview only. SEC-01 + SEC-05: the lockout fix makes SEC-05 slightly easier to trigger concurrently (same 10-failure budget) → infra allowlist recommended | No escalation chain found |
| `/token-scan` | **Adapted** | As shipped, it is a smart-contract rug-pull scanner (Solidity/Anchor mint/fee/LP greps): not applicable here, no contracts. Applied the lead's intent instead: regex secret scan of the working tree and `git log -p --all` (61 commits) for AWS/GitHub/Slack/Stripe/OpenAI/Google keys, private keys, JWTs, DSNs with passwords, `password=`/`token=` literals, secret-like filenames; plus review of token **handling** (session/CSRF token generation, storage, comparison, logging redaction) | Clean: only placeholders. Token handling sound |
| `/report` | Applied (adapted) | Register format instead of platform submission | `VULNERABILITY_REGISTER.md` |
| `/hunt`, `/intel`, `/remember`, `/pickup`, `/memory-gc` | Not applied | Bounty-session workflow / memory tooling, not needed for a one-off local review | — |

## Coverage summary

- **Server code reviewed in full:** every file under `apps/api/src/**`, `apps/api/migrations/0001_init.sql`, `packages/validation/src/**`.
- **Client code reviewed:** `apps/admin/src/**`, `apps/web/src/scripts/**`, `apps/web/src/templates/**`, `apps/web/src/lib/**`, `apps/web/scripts/serve.mjs`, `apps/admin/scripts/build.mjs`.
- **Read-only review (not run):** `infrastructure/nginx/**` and `docker-compose.yml`.
- **Executed:**
  - 35 API PoC checks, before and after the fix.
  - 1 browser stored-XSS PoC.
  - 5 dev-server checks, against the current file and against the patched copy.
  - `npm audit`, the secret grep over the tree and history, and the full API/validation/web suites, tsc and eslint.
- **Tools not available locally:** Semgrep, ZAP, Trivy, gitleaks, trufflehog and nuclei (`command -v` returned not found for each). See `FINAL_SECURITY_ASSESSMENT.md`.
