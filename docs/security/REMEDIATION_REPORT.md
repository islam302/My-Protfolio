# Remediation report

## Summary

| ID | Severity | Change | Where | Regression test | Status |
|---|---|---|---|---|---|
| SEC-01 | Medium | Atomic attempt reservation before password verification; lockout audit decided from the UPDATE result | `apps/api/src/repositories/admins.js` (`reserveLoginAttempt`, replaces `recordFailedLogin`), `apps/api/src/services/auth.js` (`login`) | `apps/api/test/integration/security-regressions.test.js` (2 tests) + `tests/security/poc-api.mjs` RACE-lockout | **Fixed, re-tested** |
| SEC-02 | Low | try/catch around `decodeURIComponent` → 404 | `apps/web/scripts/serve.mjs` | `tests/security/poc-serve.mjs` SERVE-malformed-uri | **Patch ready**: `docs/security/patches/serve-mjs.patch` (lead applies) |
| SEC-03 | Low | Redirect only `^/(?![/\\])` paths without backslashes | same | SERVE-open-redirect | **Patch ready** (same patch) |
| SEC-04 | Low | `listen(PORT, WEB_HOST ?? '127.0.0.1')` | same | SERVE-bind | **Patch ready** (same patch) |
| SEC-05 | Low | nginx allowlist for `/api/v1/admin/` + `/admin/` (snippet in register) | `infrastructure/nginx/snippets/app-locations.conf` | manual: request from a non-allowed IP → 403 | Recommendation (lead / DevOps) |
| SEC-06 | Info | Restrict or limit `/api/health/ready` at nginx | same | manual | Recommendation (lead / DevOps) |
| SEC-07..10 | Info | none (accepted, documented) | — | — | Accepted |
| QA-02 | (QA, non-security) | Trimmed, code-point length validation in the contact form | `apps/web/src/scripts/contact.js` | `tests/e2e/api-mode.spec.js:214` now passes; its `test.fail()` marker is at **line 216** and should be removed by QA/lead | **Fixed** |

## SEC-01: details

**Before:**

```js
const admin = await admins.findAdminByEmail(db, email);                 // stale snapshot
const ok = await verifyPassword(password, admin ? admin.passwordHash : await dummyHash);  // ~100 ms
if (!admin) throw …;
if (admin.lockedUntil > now) throw …;                                   // decided on the snapshot
if (!ok) { await admins.recordFailedLogin(…); if (admin.failedAttempts + 1 >= max) audit(lockout); throw … }
// success → recordSuccessfulLogin() clears failed_attempts AND locked_until
```

**After:**

```js
const admin = await admins.findAdminByEmail(db, email);
const attempt = admin ? await admins.reserveLoginAttempt(db, admin.id, max, now, lockUntil) : null;   // atomic
const ok = await verifyPassword(password, admin ? admin.passwordHash : await dummyHash);
if (!admin || !attempt) throw …;
if (!attempt.allowed) throw …;            // locked (decided by the UPDATE's WHERE clause)
if (!ok) { if (attempt.triggeredLock) audit(lockout); throw …; }
```

```sql
UPDATE admins SET
  failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
  locked_until    = CASE WHEN failed_attempts + 1 >= $2 THEN $4::timestamptz ELSE locked_until END
WHERE id = $1 AND (locked_until IS NULL OR locked_until <= $3::timestamptz)
RETURNING (locked_until IS NOT NULL AND locked_until > $3::timestamptz) AS triggered_lock
```

**Properties:**
- Postgres row locking serialises concurrent UPDATEs, so at most `maxFailures` attempts are admitted per window.
- Once an attempt sets the lock, the `WHERE` clause refuses every later reservation, so in-flight requests that arrive afterwards cannot log in.
- The behaviour seen by clients is unchanged:
  - The 10th consecutive failure locks the account for 15 minutes.
  - Attempts while locked are neither counted nor extend the lock.
  - A success resets the counter.
  - The response is the same uniform 401.
- Timing equalisation is kept. The known-email path performs one UPDATE and one scrypt, and the unknown-email path one scrypt, as before. Measured medians: 87.6 vs 88.3 ms.
- `docs/API_CONTRACT.md` needs no change (behaviour is unchanged).

**Regression evidence (from the final suite run):**

```
# tests 100
# suites 23
# pass 100
# fail 0
```

That is 98 existing tests plus the 2 new ones in `security-regressions.test.js`.

## Dev server patch (SEC-02/03/04)

- **Patch:** `docs/security/patches/serve-mjs.patch`, a unified diff against the current `apps/web/scripts/serve.mjs`. `git apply --check` passes.
- **Apply with:** `git apply docs/security/patches/serve-mjs.patch`.
- **Verification:** the patched file was run through the same PoC harness. Output is in `docs/security/evidence/poc-serve.with-patch.txt`:

```
[PASS] SERVE-bind: }).listen(PORT, HOST, …)
[PASS] SERVE-traversal: 11 traversal variants … -> none escaped dist/
[PASS] SERVE-open-redirect: no off-site Location for 4 protocol-relative probes
[PASS] SERVE-malformed-uri: GET /%E0%A4%A -> HTTP/1.1 404 Not Found; follow-up GET / -> HTTP/1.1 200 OK
```

- **Compatibility:** `npm run dev` / `npm run preview` then serve on `http://127.0.0.1:4321`. To reach it from a phone on the LAN, use `WEB_HOST=0.0.0.0`.
  - The variable is deliberately not `HOST`: `.env.example:21` sets `HOST=0.0.0.0` for the API, and reusing that name would silently re-expose the server.
  - The patch does not affect any Playwright server: `tests/e2e/support/serve-*.mjs` are separate files.
- **After applying:** `node tests/security/poc-serve.mjs` should print `0 vuln`.

## QA-02: contact form validates trimmed values

- **Change:** `apps/web/src/scripts/contact.js:30-58`.
  - `trimIssue()` flags a required field that is empty after `trim()`, or a field shorter than `minlength` after trimming. Length counts code points (`[...s].length`), which is how zod 4 and Postgres `char_length` count.
  - `showError()` sets `setCustomValidity(...)`, so `checkValidity()`, the submit gate and the inline error all agree.
- **Messages:** the existing strings ("Please add your name.", "A little more detail helps: at least 20 characters (you have N).") are reused. No new copy was added.
- **No visual change:**
  - The only CSS hook is `[aria-invalid='true']`, set exactly as before.
  - The custom-validity state is applied only when `showError` already runs.
  - The unset-`PUBLIC_API_URL` build HTML is identical with the old and new `contact.js`: all 13 pages, with the `?v=` cache-buster normalised. The build copies scripts verbatim (`apps/web/scripts/build.mjs:30`).
- **Tests:**
  - `npx playwright test tests/e2e/api-mode.spec.js tests/e2e/contact.spec.js --project=e2e-desktop` gave `25 passed`, `1 failed`. The one failure is `KNOWN BUG QA-02 … Expected to fail, but passed`, which shows the bug is fixed.
  - **For the lead:** remove `test.fail();` at `tests/e2e/api-mode.spec.js:216`. Its `issue` annotation is on line 215.
- **Side effect (intended):** in the default non-API build, a whitespace-only name is now rejected instead of producing `Name: ` in the WhatsApp text. This is the "same input" case QA noted.

## Infrastructure changes for the lead (not applied, DevOps-owned files)

1. **SEC-05:** IP allowlist for `/api/v1/admin/` and `/admin/`. The exact block is in `VULNERABILITY_REGISTER.md#sec-05`. Behind a Hetzner load balancer or Cloudflare, enable `snippets/real-ip.conf` with the provider's CIDRs first. Otherwise `$remote_addr` is the load balancer's address.
2. **SEC-06:**
   ```nginx
   location = /api/health/ready { allow 127.0.0.1; deny all; include /etc/nginx/snippets/proxy-api.conf; }
   ```
   Alternatively, add `limit_req zone=api burst=10 nodelay;` inside `location ^~ /api/health`.
3. **Optional, SEC-07:** if a Redis outage must not relax login limits, give the login limiter its own `skipOnError: false` store (an API change, owner's call).
