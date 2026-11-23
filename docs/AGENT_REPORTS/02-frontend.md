# 02 — Frontend engineer report

Date: 2026-11-23 · Branch `rebuild/monorepo` · Nothing committed, no `npm install`.

## Scope

1. Optional inquiry-API integration in `apps/web` behind the build-time env `PUBLIC_API_URL`. The design must not change.
2. Review of the browser scripts (`apps/web/src/scripts/*.js`) for XSS sinks, unsafe URLs, leaks and errors. Review of `layout.js` for strict-CSP blockers.
3. New `apps/admin`: a static, framework-free inquiry admin UI served at `/admin/`.

## Files

**Inspected:** `apps/web/README.original.md`, `apps/web/scripts/{build,check,serve}.mjs`, `apps/web/src/templates/layout.js`, `apps/web/src/lib/{html,seo}.js`, `apps/web/src/pages/{contact,home,work}.js`, `apps/web/src/data/site.js`, `apps/web/src/styles/{site,pages}.css`, all of `apps/web/src/scripts/*.js`, `packages/validation/src/{index,constants}.js`, `docs/API_CONTRACT.md`, `docs/AGENT_COORDINATION.md`, `eslint.config.js`, `.prettierignore`, `tsconfig.json`.

**Added**
- `apps/web/src/lib/api.js`: `publicApiUrl()` reads and validates `PUBLIC_API_URL`.
- `apps/admin/scripts/build.mjs`
- `apps/admin/src/index.html`, `admin.css`, `app.js`, `api.js`, `config.js`

**Modified**
- `apps/web/src/pages/contact.js`: conditional `data-api`, honeypot and intro sentence.
- `apps/web/src/scripts/contact.js`: fire-and-forget POST, honeypot excluded from validation, `submitter` fallback.
- `apps/web/src/scripts/site.js`: Escape focus handling.
- `apps/web/src/scripts/home.js`: listener and timer leak in `playEased()`.
- `apps/admin/package.json`: added the `"build"` script.

`apps/web/scripts/**` is unchanged. The scripts in `src/scripts` keep their CRLF line endings.

## Task 1 — web changes

### `PUBLIC_API_URL` (`src/lib/api.js`)
- If it is unset or empty, `publicApiUrl()` returns `null` and the page markup is exactly the original.
- Accepted values are a same-origin path (`/api`) or an absolute `http(s)://host[:port][/path]`. Trailing slashes are removed.
- Anything else stops the build with a clear error. This covers `//evil.com`, `javascript:…`, values with quotes or spaces, and a bare `/`. I tested each of these.
- The value goes into markup only through the escaping `html` tag.
- **Git Bash note:** MSYS rewrites `PUBLIC_API_URL=/api` into `C:/Program Files/Git/api`. The build then fails, which is correct. Prefix the command with `MSYS_NO_PATHCONV=1` or use PowerShell/cmd. Linux, Docker and CI are not affected.

### `/contact/` markup, only when the env is set (`src/pages/contact.js`)
- `<form … data-api="/api">`.
- Intro sentence replaced with: “Your brief is saved so I can follow up, and it opens WhatsApp (or your email app) with your message ready to send.”
- Honeypot (`HONEYPOT_FIELD` = `website`), placed after the message field:
  `<div class="sr-only" aria-hidden="true"><label for="f-website">Leave this empty</label><input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off" value=""></div>`
  - It reuses the existing `.sr-only` class: absolute, 1×1, clipped. No CSS changes were needed.
  - Because it is absolutely positioned, it is out of the `.pg-form` grid flow, so it adds no grid gap.
  - Measured in a browser: the form is 853.15px tall with or without the honeypot, and every field and the actions keep the same `top`. No horizontal overflow.

### `src/scripts/contact.js`
- If `form.dataset.api` exists, the brief is sent after validation passes and immediately before the existing hand-off:
  - `fetch(`${api}/v1/inquiries`, { method:'POST', keepalive:true, headers:{'Content-Type':'application/json'}, credentials:'same-origin', body })`
  - The body is `{name,type,budget,timeline,message,channel,website}`, with trimmed name and message. This matches `inquiryCreateSchema`; empty budget and timeline are sent as `""`, which the schema accepts.
- The request is **not awaited**. `window.open` and `location.href` run in the same synchronous gesture handler as before.
- Failures are silent apart from one `console.warn`: rejection, non-2xx, or `fetch` throwing synchronously.
- An identical payload is not posted twice, e.g. a second click after a blocked pop-up. After a failure the next click retries.
- The honeypot is left out of the validation `fields` list so it never gets `aria-invalid`.
- All existing messages and behaviour are unchanged. Values only go through `JSON.stringify` and `encodeURIComponent`. There is no `innerHTML`.

### Script review: findings and fixes

| # | File | Finding | Action |
|---|---|---|---|
| 1 | `home.js` `playEased()` | Each dive added an `ended` listener with `{once:true}`. The clip is paused at about 99.5%, so `ended` normally never fires, and listeners built up on `<video>` with every hero↔case cycle. The 6 s fallback `setTimeout` was also never cleared. | `finish()` now removes the listener and clears the timer. No visual change. |
| 2 | `site.js` | Escape closed the mobile nav even when focus was inside it, leaving focus on a hidden link (WCAG 2.4.3). It also ran on every Escape press. | It now acts only when the nav is open, and returns focus to the toggle if focus was inside the menu. |
| 3 | `contact.js` | `e.submitter` is missing on Safari before 15.4, so “Send by email” behaved like WhatsApp there. | It now remembers the last clicked `[data-via]` button as a fallback. |
| — | `home.js` | `CASES` data: `JSON.parse` of a `<script type="application/json">` that the server escapes (`<` → `\u003c`). It is only written with `textContent`. | Safe. No change. |
| — | `home.js` | `$('dLink').href = c.href` and `img.src = dataset.src` use author-controlled build data (relative paths). | Safe today. If project data ever comes from a CMS, add a scheme allowlist. |
| — | `home.js` | `URL.createObjectURL` for the dive clip is created once per page and used for the page's lifetime. | Not a leak. |
| — | `home.js`, `site.js` | Window and document listeners, the `matchMedia` listener and the IntersectionObserver live for the page's lifetime. This is a multi-page site, not an SPA, and the observer unobserves each element after it is revealed. | Not leaks. |
| — | `work.js` | The hash filter is checked against a whitelist (`valid` Set) before `replaceState`. | Safe. |
| — | all | No `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function`. Status links are built with `createElement` and `textContent`, and their hrefs are generated (`mailto:` / `https://wa.me/`). | — |

### CSP (layout.js, markup unchanged)
- The only executable inline script is `<script>document.documentElement.classList.add('js')</script>`, identical on all 13 pages.
  - **`script-src 'self' 'sha256-Du+OJKJSbdUgz5nrHeWWINvez6XKDDU/tyj/5c2uvwo='`**
  - The hash is computed over the exact bytes `document.documentElement.classList.add('js')` (UTF-8, no whitespace).
- `<script type="application/ld+json">` (13 pages) and `<script type="application/json" id="cases-data">` (home) are data blocks, not executed, so they need no hash.
- **Other blockers for DevOps:**
  - `/work/` has an inline `<style>` (the no-JS `:target` filter CSS). It needs `style-src 'self' 'sha256-vRSASVDSHjJBYSp8loYBJjH4gx4PLn5Y817EG9Uuv8M='`. It is generated from the category list, so recompute it if categories change.
  - Inline `style="--d:…"` and theme-variable attributes are on 10 of the 13 pages. They need `style-src-attr 'unsafe-inline'`; otherwise reveal delays and case-study colours break. Styles set through the CSSOM in `home.js` are not affected.
  - `home.js` fetches `/media/hero-dive.mp4` and plays it from a `blob:` URL, so it needs `connect-src 'self'` and `media-src 'self' blob:`.
  - The contact form `action` is `mailto:`, so `form-action 'self' mailto:` is needed for the no-JS fallback.
- I did not change layout markup.
- In a local spot check I served the site with `default-src 'self'; script-src 'self' 'sha256-Du+…'; style-src 'self' 'sha256-vRSA…'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' mailto:`. Home, /work/ and /contact/ loaded with no CSP violations; the `js` class was applied, and the dive and back-to-hero ran.

### Equivalence diff (PUBLIC_API_URL unset)
- **Method:** I built before any change and copied `dist` to the scratchpad. After the changes I rebuilt and compared every file byte for byte, normalising only `?v=[a-z0-9]+` and `<lastmod>`.
- **Result: 73 vs 73 files; 70 identical; 0 added or missing.** Every HTML page, CSS file, image, font, sitemap, robots and manifest is identical.
- The 3 differing files are exactly the intentionally changed scripts: `js/contact.js`, `js/home.js` and `js/site.js`. `build.mjs` copies `src/scripts` verbatim, so source-level fixes necessarily change those bytes. With no `data-api`, the contact script never calls `fetch`, so runtime behaviour matches the original apart from fixes #1–#3.
- With `PUBLIC_API_URL=/api`, compared with the unset build: 72/73 identical. Only `contact/index.html` differs, and only by the intro sentence, `data-api="/api"` and the honeypot `div` (plus `?v=`).

## Task 2 — `apps/admin`

**Build:** `npm run build -w @portfolio/admin` runs `scripts/build.mjs`.
- It copies `src/` to `dist/` (6 files).
- It copies `packages/validation/src/constants.js` to `dist/constants.js`, so status and type lists match what the API validates. It does this by relative path; I added no package dependency because the lockfile is lead-owned.
- Optional `ADMIN_API_BASE` (default `/api`, same validation rule as the web) is baked into `dist/config.js`.

**Page and CSP**
- `index.html` links `/css/site.css` (tokens, fonts, `.btn`, `.sr-only`, `.skip-link`) and `./admin.css`.
- It has `noindex,nofollow`, `referrer: no-referrer`, and no external resources.
- There are no inline scripts, inline handlers or `style=` attributes, so it works under `script-src 'self'; style-src 'self'`. I confirmed there were no violations under that CSP in the mock.
- Without JS, the login form stays `hidden`, so credentials cannot be sent by a native GET.

**Features**
- **Session check:** `GET /auth/me` on load.
- **Login:** a single generic “Invalid email or password.” for 400 and 401. 429 shows “Too many sign-in attempts. Try again in N …” using `Retry-After`. The password field is cleared after every attempt.
- **Logout:** `POST` with CSRF. The local state is cleared even if the call fails.
- **List:** table with pagination (20 per page) and filters for status, type and `q` (≤100 characters).
  - Sort by date from a select or a sortable column header with `aria-sort`.
  - Filters are kept in the URL query (read back with an allowlist) and survive a refresh.
  - An out-of-range page falls back to the last valid page.
  - Out-of-order responses are discarded (AbortController plus a sequence number).
- **Detail:** a `<dialog>` showing full metadata and the full message (`pre-wrap`).
  - Status change and private notes (live counter, `LIMITS.notesMax`), saved with `PATCH` sending changed fields only. Empty notes are sent as `null`.
  - Delete goes through a separate confirmation dialog (`role=alertdialog`, focus starts on Cancel), then `DELETE`.
- **CSRF:** `X-CSRF-Token` is sent on every POST, PATCH and DELETE. The token is held in memory only, never in web storage.
- **Errors:**
  - 401 anywhere returns to login with “Your session has ended…”.
  - 429 shows the wait time, and the Retry button stays disabled until `Retry-After` passes.
  - Network errors and 403 CSRF or 404 get specific messages; server text is shown only for `VALIDATION_ERROR`.
  - Loading, empty (“No inquiries yet…” or “No inquiries match these filters.”) and saving states are all handled.
- **Rendering:** all API data goes through `textContent`, `createElement` and `setAttribute`. There is no `innerHTML` anywhere in admin; I checked with grep. Dates use `Intl.DateTimeFormat`, numbers use `Intl.NumberFormat`.
- **Accessibility:**
  - Every control is labelled. Status regions use `role=status` / `aria-live`; errors use `role=alert`.
  - Focus moves to the list heading after login, paging and delete, and to the email field on logout or 401. The dialog returns focus to the button that opened it.
  - Row actions are real buttons, rows are `th scope=row` and there is a skip link.
  - At ≤640px the table becomes labelled cards. At 375px there is no horizontal overflow (measured `scrollWidth` 375).

**Spot check with a local mock (not the real API)**
- I served web `dist`, admin `dist` and an in-memory mock API from one origin on `localhost:4399`. The mock lives only in the scratchpad and the server is stopped.
- **Verified:**
  - Wrong password → generic error; mock test credentials → list.
  - An XSS payload in the name and message renders as inert text.
  - Detail and PATCH (status + notes) saved.
  - Delete through the confirm dialog: the list reloads, the deletion is announced and focus moves to the heading.
  - Paging (`?page=2`, “21–40 of 46”), the sort toggle (`aria-sort` ascending) and the search empty state.
  - An invalid URL filter is dropped, and an out-of-range page resets.
  - 429 with Retry-After 2 → message, then retry re-enabled after about 2 s.
  - Network failure → message; server-side session revoke → back to login; logout.
  - 375px card layout.
  - The mock log confirms `X-CSRF-Token` on PATCH, DELETE and logout.
- **Web, API mode:** one POST with the exact expected JSON for two clicks (dedupe). With `window.open` stubbed, the hand-off still ran and the status text was unchanged. With `fetch` forced to reject, the hand-off still ran and only one `console.warn` appeared.

## Verification run (all executed)
- `npx eslint apps/web apps/admin` → clean.
- `npx prettier --check apps/admin apps/web/src/lib/api.js` → clean. `apps/web/src` and `apps/web/scripts` are prettier-ignored by design.
- `npm run build -w @portfolio/web` + `npm run check -w @portfolio/web` with the env unset → 13 pages, no errors.
- `MSYS_NO_PATHCONV=1 PUBLIC_API_URL=/api npm run build -w @portfolio/web` + `check` → no errors.
- `npm run build -w @portfolio/admin` → 6 files.
- Equivalence diff → as above.
- **Not run:** any test against the real API (it is being built in parallel), screen-reader testing, Safari or Firefox testing, and Playwright.
- `apps/web/dist` was last built by me with the env unset. Another agent also rebuilt it during my session, so the shared `dist` is contended.

## Known issues / notes for others
- **Lead:** the web build is not byte-identical at file level for `js/*.js` because the script fixes and the API code ship in the same files. HTML, CSS and assets are identical. If strict file-level identity of the JS is required, the API code could move to a separate module that is only referenced when `PUBLIC_API_URL` is set; say if you want that.
- **No-JS fallback with the API on:** the native `mailto:` (enctype `text/plain`) body also contains an empty `website=` line. This is harmless.
- **Autofill:** browsers that ignore `autocomplete="off"` could autofill the honeypot for a real user, who would then be silently dropped by the API. This is unlikely for a field named `website` with no matching autofill profile data. QA should check it in Chrome, Safari and Firefox with saved addresses.
- **Backend:** admin logout is sent as `POST` with no body and no `Content-Type`; the API must accept that. Login with a malformed email gets a 400 from zod, which the UI shows as the generic credentials error.
- **DevOps and backend, admin packaging:**
  - The admin build reads `../../packages/validation/src/constants.js`, so a Docker build stage needs `packages/validation` in its context.
  - nginx must serve `/css/site.css` and `/fonts/*` from the web app on the same origin as `/admin/`.
  - With a split-origin dev API (`ADMIN_API_BASE=http://localhost:3000/api`), admin switches to `credentials:'include'`. The API then needs `CORS_ORIGINS` set and the cookie sent cross-port; SameSite=Strict still works on localhost because it is same-site.
- `apps/admin/dist/constants.js` keeps its `// @ts-check` JSDoc, which is harmless in the browser.

## What QA should test
1. **Unset mode (e.g. visual snapshots):** pixel-identical to the baseline on every page. The /contact/ hand-off (WhatsApp new tab, blocked pop-up message, email) works as before, and no requests go to `/api`.
2. **`PUBLIC_API_URL=/api` mode**
   - **Request:** a valid submit sends exactly one `POST /api/v1/inquiries` (201) with the schema body and `channel` matching the button. `window.open` still opens a tab (the gesture is preserved, so no pop-up blocker). Email opens `mailto:`.
   - **Failure:** with the API down or returning 4xx/5xx/429, the hand-off still works and the page shows no error.
   - **Validation:** an invalid form sends no POST.
   - **Honeypot:**
     - Not reachable by Tab.
     - Not in the accessibility tree (axe: no `aria-hidden-focus` violation thanks to `tabindex=-1`).
     - No layout shift compared with unset mode.
     - Filling it via devtools → API returns 201 and stores nothing.
   - **Copy:** the intro sentence is updated.
3. **Admin**
   - Login: success, wrong password and lockout/429 messages, with no email enumeration.
   - Session and CSRF:
     - Refresh keeps the session.
     - After 30 min idle, any action returns to login.
     - Logout clears the cookie.
     - `X-CSRF-Token` is present on PATCH, DELETE and logout; a forged request without it gets 403.
   - List:
     - Filters, search, sort and pagination match the API.
     - The URL state survives a reload.
     - The empty state appears when nothing matches.
   - Detail:
     - Long and RTL/Arabic messages wrap correctly.
     - Saving status and notes persists them.
     - The 4000-character notes limit holds.
     - Deleting asks for confirmation, then removes the row.
     - A 404 on an already-deleted inquiry is handled.
   - XSS: names, messages and notes containing HTML/JS render as text, and there are no CSP violations under `script-src 'self'; style-src 'self'`.
   - Keyboard only: login → list → open → edit → delete → close, with focus returned each time. Escape closes dialogs.
   - Layout: 375px width works, and there is no horizontal page scroll.
