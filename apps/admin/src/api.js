/**
 * Thin client for the admin endpoints in docs/API_CONTRACT.md.
 * Same origin, session cookie (HttpOnly) + synchronizer CSRF token held in memory only.
 */
import { config } from './config.js';

export class ApiError extends Error {
  /**
   * @param {number} status HTTP status (0 = network failure)
   * @param {string} code   contract error code, e.g. RATE_LIMITED
   * @param {string} message server message (shown only for VALIDATION_ERROR)
   * @param {number} [retryAfter] seconds, from Retry-After on 429
   */
  constructor(status, code, message, retryAfter) {
    super(message || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

let csrfToken = '';
export const setCsrf = (t) => {
  csrfToken = typeof t === 'string' ? t : '';
};

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
// Production is same-origin (nginx). A split-origin dev API (ADMIN_API_BASE=http://localhost:3000/api)
// needs credentials: 'include' plus the API's CORS_ORIGINS allowlist.
const CREDENTIALS = new URL(config.apiBase, location.origin).origin === location.origin ? 'same-origin' : 'include';

/**
 * @param {string} method
 * @param {string} path  e.g. "/v1/admin/inquiries"
 * @param {{ body?: unknown, query?: Record<string, string|number|undefined>, signal?: AbortSignal }} [opts]
 */
export async function request(method, path, { body, query, signal } = {}) {
  const url = new URL(config.apiBase + path, location.origin);
  if (query)
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (MUTATING.has(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: CREDENTIALS,
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Network error');
  }

  if (res.status === 204) return null;
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty or non-JSON body (e.g. a proxy error page) */
  }
  if (!res.ok) {
    const e = json && typeof json === 'object' && json.error && typeof json.error === 'object' ? json.error : {};
    const ra = Number.parseInt(res.headers.get('Retry-After') || '', 10);
    throw new ApiError(
      res.status,
      typeof e.code === 'string' ? e.code : `HTTP_${res.status}`,
      typeof e.message === 'string' ? e.message : '',
      Number.isFinite(ra) && ra > 0 ? ra : undefined,
    );
  }
  if (!json || typeof json !== 'object') throw new ApiError(res.status, 'BAD_RESPONSE', 'Unexpected response');
  return json;
}

const enc = encodeURIComponent;

export const api = {
  login: (email, password) => request('POST', '/v1/admin/auth/login', { body: { email, password } }),
  logout: () => request('POST', '/v1/admin/auth/logout'),
  me: () => request('GET', '/v1/admin/auth/me'),
  list: (query, signal) => request('GET', '/v1/admin/inquiries', { query, signal }),
  get: (id) => request('GET', `/v1/admin/inquiries/${enc(id)}`),
  update: (id, patch) => request('PATCH', `/v1/admin/inquiries/${enc(id)}`, { body: patch }),
  remove: (id) => request('DELETE', `/v1/admin/inquiries/${enc(id)}`),
};
