/**
 * Optional inquiry API integration (build time).
 *
 *   PUBLIC_API_URL=/api npm run build
 *
 * Unset or empty => null, and the site is generated exactly as before (the brief
 * form only hands off to WhatsApp / email). Set => the /contact/ form gets
 * data-api="<url>" plus a honeypot input, and src/scripts/contact.js also POSTs
 * the brief to `${url}/v1/inquiries`.
 *
 * Accepted values: a same-origin path ("/api") or an absolute http(s) URL
 * ("https://api.example.com"). Trailing slashes are dropped. Anything else fails
 * the build instead of silently shipping a broken form.
 */
export function publicApiUrl(value = process.env.PUBLIC_API_URL) {
  const v = (value ?? '').trim();
  if (!v) return null;
  const url = v.replace(/\/+$/, '');
  const ok = /^\/(?!\/)[\w\-./~%]+$/.test(url) || /^https?:\/\/[\w\-.]+(?::\d+)?(?:\/[\w\-./~%]*)?$/.test(url);
  if (!ok) throw new Error(`PUBLIC_API_URL must be a path like "/api" or an http(s) URL, got ${JSON.stringify(v)}`);
  return url;
}
