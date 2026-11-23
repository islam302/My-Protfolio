import { html, cx } from '../lib/html.js';
import { links } from '../data/site.js';
import { getProject } from '../data/projects.js';
import { webpSize } from '../lib/images.js';

/* Small markup pieces shared across pages. */

/** A project's logo as a small, decorative-sized image (alt names the product). */
export function logoImg(p, cls = 'pg-logo') {
  const { w, h } = webpSize(p.images.logo) || { w: 300, h: 300 };
  return html`<span class="${cls}"><img src="${p.images.logo}" alt="${p.title} logo" width="${w}" height="${h}" loading="lazy" decoding="async"></span>`;
}

/** A linked project "pill": logo + name (+ optional tagline). */
export function projectLink(slug, { tagline = true } = {}) {
  const p = getProject(slug);
  if (!p) return '';
  return html`<a class="pg-proj" href="/work/${p.slug}/">
    ${logoImg(p)}
    <span class="pg-proj__text"><strong>${p.title}</strong>${tagline ? html`<small>${p.tagline}</small>` : ''}</span>
    <span class="pg-proj__arrow" aria-hidden="true">↗</span>
  </a>`;
}

/** Visible breadcrumb trail (the JSON-LD version comes from breadcrumbLd). */
export function crumbs(trail, cls = '') {
  return html`<nav class="${cx('breadcrumbs', cls)}" aria-label="Breadcrumb"><ol>
    ${trail.map((t, i) => (i === trail.length - 1
      ? html`<li><span aria-current="page">${t.name}</span></li>`
      : html`<li><a href="${t.path}">${t.name}</a></li>`))}
  </ol></nav>`;
}

export function ctaBand(title, text = 'Message on WhatsApp') {
  return html`<section class="cta-band" aria-label="Start a project">
  <div class="container">
    <p class="cta-band__title">${title}</p>
    <div class="btn-row">
      <a class="btn btn--dark" href="${links.whatsapp()}" target="_blank" rel="noopener">${text}</a>
      <a class="btn" href="/contact/#brief">Send a project brief</a>
    </div>
  </div>
</section>`;
}
