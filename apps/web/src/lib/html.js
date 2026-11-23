/**
 * Tiny, dependency-free HTML templating.
 *
 *   html`<p>${userText}</p>`      -> interpolations are escaped
 *   html`<div>${raw(trusted)}</div>` -> opt out of escaping
 *   html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>` -> arrays are joined
 *
 * Nested `html` results are already safe and are not escaped twice.
 */
class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export const raw = (s) => new SafeHtml(String(s));

function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escape(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new SafeHtml(out);
}

/** Join class names, skipping falsy values. */
export const cx = (...c) => c.filter(Boolean).join(' ');
