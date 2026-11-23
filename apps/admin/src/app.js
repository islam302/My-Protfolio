/*
 * Inquiry admin panel. Plain DOM, no framework.
 *
 * Security notes:
 *  - Every value that comes from the API is rendered with textContent /
 *    createElement / attribute setters. There is no innerHTML anywhere.
 *  - The CSRF token lives in memory only (api.js); the session is an HttpOnly cookie.
 *  - Strict-CSP friendly: no inline scripts, handlers or style attributes.
 */
import { api, ApiError, setCsrf } from './api.js';
import { config } from './config.js';
import { INQUIRY_STATUSES, PROJECT_TYPES, LIMITS } from './constants.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/* ---------- labels & formatting ---------- */
const TYPE_LABELS = {
  web: 'Web platform / SaaS',
  mobile: 'Mobile app',
  ai: 'AI product',
  ecommerce: 'E-commerce',
  arabic: 'Arabic-first website',
  design: 'UI/UX design',
  other: 'Something else',
};
const CHANNEL_LABELS = { whatsapp: 'WhatsApp', email: 'Email' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const typeLabel = (t) => TYPE_LABELS[t] || String(t ?? '');
const statusLabel = (s) => cap(String(s ?? ''));

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const formatDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
};
const numFmt = new Intl.NumberFormat();

/** Element factory: text only, never HTML. */
function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) if (c) node.append(c);
  return node;
}

const fillSelect = (select, values, label) => {
  for (const v of values) select.append(el('option', { text: label(v), attrs: { value: v } }));
};

/** Human message for an API error (the server message is shown only for validation). */
function describe(err, what) {
  if (!(err instanceof ApiError)) return `Something went wrong while ${what}. Please try again.`;
  switch (err.code) {
    case 'NETWORK':
      return `Can’t reach the server while ${what}. Check your connection and try again.`;
    case 'RATE_LIMITED':
      return `Too many requests. Please wait ${retryText(err.retryAfter)} and try again.`;
    case 'VALIDATION_ERROR':
      return err.message ? `The server rejected this: ${err.message}` : 'The server rejected this request.';
    case 'NOT_FOUND':
      return 'This inquiry no longer exists.';
    case 'CSRF_FAILED':
    case 'FORBIDDEN':
      return 'Your session could not be verified. Reload the page and try again.';
    default:
      return `Something went wrong while ${what} (error ${err.status || '?'}). Please try again.`;
  }
}
const retryText = (s) =>
  !s ? 'a moment' : s < 90 ? `${s} second${s === 1 ? '' : 's'}` : `${Math.ceil(s / 60)} minutes`;

/* ---------- state ---------- */
const state = {
  admin: null,
  query: { page: 1, pageSize: config.pageSize, status: '', type: '', q: '', sort: '-createdAt' },
  meta: null,
  listAbort: null,
  listSeq: 0,
  current: null, // inquiry open in the dialog
  opener: null, // element to refocus when the dialog closes
};

/* ---------- views ---------- */
const views = { boot: $('boot'), login: $('login-view'), list: $('list-view') };
function show(name) {
  for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
  $('user-box').hidden = name !== 'list';
}

/* ---------- session ---------- */
function signedIn(data) {
  state.admin = data.admin;
  setCsrf(data.csrfToken);
  $('user-email').textContent = data.admin?.email ?? '';
  show('list');
}

function toLogin(note) {
  state.admin = null;
  setCsrf('');
  state.listAbort?.abort();
  state.opener = null;
  closeDialogs();
  $('rows').replaceChildren();
  const n = $('login-note');
  n.textContent = note || '';
  n.hidden = !note;
  $('login-error').hidden = true;
  /** @type {HTMLInputElement} */ ($('login-password')).value = '';
  show('login');
  $('login-email').focus();
}

/** Any 401 outside the login form: the session expired or was revoked. */
function handleAuth(err) {
  if (err instanceof ApiError && err.status === 401) {
    toLogin('Your session has ended. Please sign in again.');
    return true;
  }
  return false;
}

async function boot() {
  fillSelect($('f-status'), INQUIRY_STATUSES, statusLabel);
  fillSelect($('f-type'), PROJECT_TYPES, typeLabel);
  fillSelect($('d-status'), INQUIRY_STATUSES, statusLabel);
  readQueryFromUrl();
  try {
    const { data } = await api.me();
    signedIn(data);
    await loadList();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) toLogin();
    else toLogin(describe(err, 'checking your session'));
  }
}

/* ---------- login / logout ---------- */
const loginForm = /** @type {HTMLFormElement} */ ($('login-form'));
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailEl = /** @type {HTMLInputElement} */ ($('login-email'));
  const passEl = /** @type {HTMLInputElement} */ ($('login-password'));
  const errEl = $('login-error');
  const btn = /** @type {HTMLButtonElement} */ ($('login-submit'));
  const fail = (msg, focusEl) => {
    errEl.textContent = msg;
    errEl.hidden = false;
    focusEl?.focus();
  };
  $('login-note').hidden = true;
  const email = emailEl.value.trim();
  if (!email || !emailEl.checkValidity()) return fail('Enter your email address.', emailEl);
  if (!passEl.value) return fail('Enter your password.', passEl);

  btn.disabled = true;
  btn.textContent = 'Signing in…';
  errEl.hidden = true;
  try {
    const { data } = await api.login(email, passEl.value);
    passEl.value = '';
    signedIn(data);
    $('list-title').focus();
    await loadList();
  } catch (err) {
    passEl.value = '';
    if (err instanceof ApiError && (err.status === 401 || err.status === 400))
      fail('Invalid email or password.', passEl);
    else if (err instanceof ApiError && err.status === 429)
      fail(`Too many sign-in attempts. Try again in ${retryText(err.retryAfter)}.`, emailEl);
    else fail(describe(err, 'signing in'), passEl);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('logout').addEventListener('click', async () => {
  const btn = /** @type {HTMLButtonElement} */ ($('logout'));
  btn.disabled = true;
  try {
    await api.logout();
  } catch {
    /* the local session is cleared either way; the server session expires on its own */
  } finally {
    btn.disabled = false;
  }
  toLogin('You are signed out.');
});

/* ---------- filters & URL state ---------- */
const filters = /** @type {HTMLFormElement} */ ($('filters'));
const inSet = (v, set) => (set.includes(v) ? v : '');

function readQueryFromUrl() {
  const p = new URLSearchParams(location.search);
  const page = Number.parseInt(p.get('page') || '1', 10);
  state.query.page = Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
  state.query.status = inSet(p.get('status') || '', INQUIRY_STATUSES);
  state.query.type = inSet(p.get('type') || '', PROJECT_TYPES);
  state.query.q = (p.get('q') || '').trim().slice(0, 100);
  state.query.sort = p.get('sort') === 'createdAt' ? 'createdAt' : '-createdAt';
  writeFilters();
}

function writeFilters() {
  const f = filters.elements;
  f.namedItem('q').value = state.query.q;
  f.namedItem('status').value = state.query.status;
  f.namedItem('type').value = state.query.type;
  f.namedItem('sort').value = state.query.sort;
  const th = $('th-date');
  th.setAttribute('aria-sort', state.query.sort === 'createdAt' ? 'ascending' : 'descending');
  $('sort-date').setAttribute(
    'aria-label',
    `Received, sorted ${state.query.sort === 'createdAt' ? 'oldest' : 'newest'} first. Change order`,
  );
}

function writeUrl() {
  const p = new URLSearchParams();
  const q = state.query;
  if (q.page > 1) p.set('page', String(q.page));
  if (q.status) p.set('status', q.status);
  if (q.type) p.set('type', q.type);
  if (q.q) p.set('q', q.q);
  if (q.sort !== '-createdAt') p.set('sort', q.sort);
  const s = p.toString();
  history.replaceState(null, '', s ? `?${s}` : location.pathname);
}

function readFilters() {
  const f = filters.elements;
  state.query.q = f.namedItem('q').value.trim().slice(0, 100);
  state.query.status = inSet(f.namedItem('status').value, INQUIRY_STATUSES);
  state.query.type = inSet(f.namedItem('type').value, PROJECT_TYPES);
  state.query.sort = f.namedItem('sort').value === 'createdAt' ? 'createdAt' : '-createdAt';
  state.query.page = 1;
}

filters.addEventListener('submit', (e) => {
  e.preventDefault();
  readFilters();
  loadList();
});
for (const id of ['f-status', 'f-type', 'f-sort']) {
  $(id).addEventListener('change', () => {
    readFilters();
    loadList();
  });
}
$('filters-reset').addEventListener('click', () => {
  filters.reset();
  readFilters();
  loadList();
  $('f-q').focus();
});
$('sort-date').addEventListener('click', () => {
  state.query.sort = state.query.sort === 'createdAt' ? '-createdAt' : 'createdAt';
  state.query.page = 1;
  loadList();
});
$('refresh').addEventListener('click', () => loadList());
$('page-prev').addEventListener('click', () => goPage(-1));
$('page-next').addEventListener('click', () => goPage(1));
function goPage(delta) {
  const total = state.meta?.totalPages || 1;
  const next = Math.min(Math.max(1, state.query.page + delta), total);
  if (next === state.query.page) return;
  state.query.page = next;
  loadList().then(() => $('list-title').focus());
}

/* ---------- list ---------- */
const listStatus = $('list-status');
const listError = $('list-error');
let retryTimer = 0;
let lastAction = () => loadList();

function showListError(err, action) {
  lastAction = action;
  $('list-error-text').textContent = describe(err, 'loading inquiries');
  listError.hidden = false;
  const retry = /** @type {HTMLButtonElement} */ ($('list-retry'));
  clearTimeout(retryTimer);
  if (err instanceof ApiError && err.code === 'RATE_LIMITED' && err.retryAfter) {
    retry.disabled = true;
    retryTimer = setTimeout(
      () => {
        retry.disabled = false;
      },
      Math.min(err.retryAfter, 900) * 1000,
    );
  } else {
    retry.disabled = false;
  }
}
$('list-retry').addEventListener('click', () => lastAction());

async function loadList() {
  writeFilters();
  writeUrl();
  state.listAbort?.abort();
  const ctrl = new AbortController();
  state.listAbort = ctrl;
  const seq = ++state.listSeq;

  const wrap = $('table-wrap');
  wrap.setAttribute('aria-busy', 'true');
  listStatus.textContent = 'Loading inquiries…';
  listError.hidden = true;

  const q = state.query;
  try {
    const res = await api.list(
      {
        page: q.page,
        pageSize: q.pageSize,
        status: q.status || undefined,
        type: q.type || undefined,
        q: q.q || undefined,
        sort: q.sort,
      },
      ctrl.signal,
    );
    if (seq !== state.listSeq) return;
    const rows = Array.isArray(res.data) ? res.data : [];
    state.meta = res.meta || { page: q.page, pageSize: q.pageSize, total: rows.length, totalPages: 1 };
    // Page fell off the end (e.g. after deleting the last row of the last page).
    if (!rows.length && state.meta.total > 0 && q.page > state.meta.totalPages) {
      q.page = Math.max(1, state.meta.totalPages);
      return loadList();
    }
    renderRows(rows);
    renderPager();
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    if (seq !== state.listSeq) return;
    if (handleAuth(err)) return;
    listStatus.textContent = '';
    showListError(err, () => loadList());
  } finally {
    if (seq === state.listSeq) wrap.removeAttribute('aria-busy');
  }
}

function renderRows(rows) {
  const tbody = $('rows');
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const view = el('button', { className: 'adm-link', text: r.name || '(no name)', attrs: { type: 'button' } });
    view.addEventListener('click', () => openDetail(r.id, view));
    const statusCls = INQUIRY_STATUSES.includes(r.status) ? ` adm-pill--${r.status}` : '';
    frag.append(
      el('tr', {}, [
        el('td', { attrs: { 'data-label': 'Received' } }, [
          el('time', { text: formatDate(r.createdAt), attrs: { datetime: String(r.createdAt ?? '') } }),
        ]),
        el('th', { attrs: { scope: 'row', 'data-label': 'Name' } }, [view]),
        el('td', { text: typeLabel(r.type), attrs: { 'data-label': 'Type' } }),
        el('td', { text: CHANNEL_LABELS[r.channel] || String(r.channel ?? ''), attrs: { 'data-label': 'Channel' } }),
        el('td', { attrs: { 'data-label': 'Status' } }, [
          el('span', { className: `adm-pill${statusCls}`, text: statusLabel(r.status) }),
        ]),
        el('td', { className: 'adm-table__act' }, [
          (() => {
            const b = el('button', {
              className: 'btn btn--ghost adm-btn adm-btn--sm',
              text: 'Open',
              attrs: { type: 'button' },
            });
            b.append(el('span', { className: 'sr-only', text: ` inquiry from ${r.name || 'unknown'}` }));
            b.addEventListener('click', () => openDetail(r.id, b));
            return b;
          })(),
        ]),
      ]),
    );
  }
  tbody.replaceChildren(frag);

  const m = state.meta;
  const empty = $('empty');
  const filtered = Boolean(state.query.q || state.query.status || state.query.type);
  $('table-wrap').hidden = rows.length === 0;
  empty.hidden = rows.length > 0;
  empty.textContent = filtered
    ? 'No inquiries match these filters.'
    : 'No inquiries yet. New briefs from the contact form will appear here.';
  if (!rows.length) listStatus.textContent = empty.textContent;
  else {
    const from = (m.page - 1) * m.pageSize + 1;
    listStatus.textContent = `Showing ${numFmt.format(from)}–${numFmt.format(from + rows.length - 1)} of ${numFmt.format(m.total)} inquiries.`;
  }
}

function renderPager() {
  const m = state.meta;
  const pages = Math.max(1, m.totalPages || 1);
  $('pager').hidden = pages <= 1;
  $('page-info').textContent = `Page ${numFmt.format(m.page)} of ${numFmt.format(pages)}`;
  /** @type {HTMLButtonElement} */ ($('page-prev')).disabled = m.page <= 1;
  /** @type {HTMLButtonElement} */ ($('page-next')).disabled = m.page >= pages;
}

/* ---------- detail dialog ---------- */
const dialog = /** @type {HTMLDialogElement} */ ($('detail'));
const confirmDlg = /** @type {HTMLDialogElement} */ ($('confirm'));
const detailStatus = $('detail-status');
const detailForm = /** @type {HTMLFormElement} */ ($('detail-form'));
const notesEl = /** @type {HTMLTextAreaElement} */ ($('d-notes'));
const dStatusEl = /** @type {HTMLSelectElement} */ ($('d-status'));
notesEl.maxLength = LIMITS.notesMax;

const updateCount = () => {
  $('d-notes-count').textContent =
    `${numFmt.format(notesEl.value.length)} / ${numFmt.format(LIMITS.notesMax)} characters`;
};
notesEl.addEventListener('input', updateCount);

function closeDialogs() {
  if (confirmDlg.open) confirmDlg.close();
  if (dialog.open) dialog.close();
}

dialog.addEventListener('close', () => {
  state.current = null;
  const back = state.opener;
  state.opener = null;
  // The opener may have been re-rendered; fall back to the list heading.
  if (back && back.isConnected) back.focus();
  else if (!views.list.hidden) $('list-title').focus();
});
$('detail-close').addEventListener('click', () => dialog.close());

let detailSeq = 0;
async function openDetail(id, opener) {
  const seq = ++detailSeq;
  state.opener = opener;
  state.current = null;
  $('detail-body').hidden = true;
  $('detail-title').textContent = 'Inquiry';
  detailStatus.textContent = 'Loading…';
  if (!dialog.open) dialog.showModal();
  $('detail-close').focus();
  try {
    const { data } = await api.get(id);
    if (!dialog.open || seq !== detailSeq) return;
    renderDetail(data);
    detailStatus.textContent = '';
    $('detail-title').focus();
  } catch (err) {
    if (seq !== detailSeq) return;
    if (handleAuth(err)) return;
    detailStatus.textContent = describe(err, 'loading this inquiry');
    if (err instanceof ApiError && err.status === 404) loadList();
  }
}

function renderDetail(d) {
  state.current = d;
  const title = $('detail-title');
  title.textContent = d.name || 'Inquiry';
  title.setAttribute('tabindex', '-1');
  const rows = [
    ['Received', formatDate(d.createdAt)],
    ['Last updated', formatDate(d.updatedAt)],
    ['Project type', typeLabel(d.type)],
    ['Budget', d.budget || 'Not given'],
    ['Timeline', d.timeline || 'Not given'],
    ['Channel', CHANNEL_LABELS[d.channel] || String(d.channel ?? '')],
    ['Status', statusLabel(d.status)],
    ['ID', d.id],
  ];
  $('detail-meta').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
  $('detail-message').textContent = d.message ?? '';
  dStatusEl.value = INQUIRY_STATUSES.includes(d.status) ? d.status : INQUIRY_STATUSES[0];
  notesEl.value = d.notes ?? '';
  updateCount();
  $('detail-body').hidden = false;
}

let saving = false;
detailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = state.current;
  if (!d || saving) return;
  const patch = {};
  if (dStatusEl.value !== d.status) patch.status = dStatusEl.value;
  const notes = notesEl.value.trim() ? notesEl.value : null;
  if (notes !== (d.notes ?? null)) patch.notes = notes;
  if (!Object.keys(patch).length) {
    detailStatus.textContent = 'Nothing to save: no changes.';
    return;
  }
  if (notes && notes.length > LIMITS.notesMax) {
    detailStatus.textContent = `Notes are limited to ${numFmt.format(LIMITS.notesMax)} characters.`;
    notesEl.focus();
    return;
  }
  saving = true;
  const btn = /** @type {HTMLButtonElement} */ ($('detail-save'));
  btn.disabled = true;
  detailStatus.textContent = 'Saving…';
  try {
    const { data } = await api.update(d.id, patch);
    if (state.current?.id === d.id) renderDetail(data);
    detailStatus.textContent = 'Saved.';
    loadList();
  } catch (err) {
    if (handleAuth(err)) return;
    detailStatus.textContent = describe(err, 'saving');
  } finally {
    saving = false;
    btn.disabled = false;
  }
});

/* ---------- delete ---------- */
$('detail-delete').addEventListener('click', () => {
  const d = state.current;
  if (!d) return;
  $('confirm-text').textContent =
    `The inquiry from ${d.name || 'this person'} (${formatDate(d.createdAt)}) will be permanently deleted. This cannot be undone.`;
  confirmDlg.showModal();
  $('confirm-cancel').focus();
});
$('confirm-cancel').addEventListener('click', () => confirmDlg.close());
confirmDlg.addEventListener('close', () => {
  if (dialog.open) $('detail-delete').focus();
});

$('confirm-ok').addEventListener('click', async () => {
  const d = state.current;
  const btn = /** @type {HTMLButtonElement} */ ($('confirm-ok'));
  if (!d || btn.disabled) return;
  btn.disabled = true;
  try {
    await api.remove(d.id);
    confirmDlg.close();
    state.opener = null; // its row is gone
    dialog.close();
    await loadList();
    listStatus.textContent = `Inquiry from ${d.name || 'unknown'} deleted. ${listStatus.textContent}`;
    $('list-title').focus();
  } catch (err) {
    confirmDlg.close();
    if (handleAuth(err)) return;
    if (err instanceof ApiError && err.status === 404) {
      dialog.close();
      await loadList();
      listStatus.textContent = 'That inquiry was already deleted.';
      return;
    }
    detailStatus.textContent = describe(err, 'deleting');
  } finally {
    btn.disabled = false;
  }
});

boot();
