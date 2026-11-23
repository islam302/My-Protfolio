/**
 * Admin panel settings. `apiBase` is rewritten by scripts/build.mjs from the
 * ADMIN_API_BASE env var (default "/api", same origin as /admin/).
 */
export const config = Object.freeze({
  apiBase: '/api',
  pageSize: 20,
});
