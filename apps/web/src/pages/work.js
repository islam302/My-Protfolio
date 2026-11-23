import { html, raw, cx, keepHyphens } from '../lib/html.js';
import { abs, breadcrumbLd, personId, websiteId } from '../lib/seo.js';
import { projects, categories, cardSrc } from '../data/projects.js';
import { webpSize } from '../lib/images.js';
import { crumbs } from '../templates/partials.js';
import { privateWork } from '../data/private-work.js';

/* ------------------------------------------------------------------ helpers
 * Shared with src/pages/project.js (related-work cards on case studies).
 * ------------------------------------------------------------------------ */

export const catSlug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Card-sized variant of an image object: { src, w, h }. */
export function cardImage(img) {
  const src = cardSrc(img.src);
  if (src === img.src) return { src, w: img.w, h: img.h };
  const s = webpSize(src);
  return { src, w: s?.w || 800, h: s?.h || Math.round((img.h * 800) / img.w) };
}

/** Theme custom properties for a project wrapper. */
export const themeStyle = (p) => `--p-bg:${p.theme.bg};--p-ac:${p.theme.ac};--p-fg:${p.theme.fg}`;

/** Logo in a small white sticker. Decorative (the title sits next to it). */
export function logoBadge(p, cls = 'logo-badge') {
  const s = webpSize(p.images.logo) || { w: 300, h: 300 };
  return html`<span class="${cls}"${raw(p.logoBg ? ` style="background:${p.logoBg}"` : "")}><img src="${p.images.logo}" width="${s.w}" height="${s.h}" alt="" loading="lazy" decoding="async"></span>`;
}

/**
 * One project card. The title link is stretched over the whole card
 * (one link per card); everything else is plain content.
 */
export function projectCard(p, { level = 2, reveal = true } = {}) {
  const img = cardImage(p.images.cover);
  const mobile = p.kind === 'mobile';
  const h = (inner) => (level === 3 ? html`<h3 class="work-card__title">${inner}</h3>` : html`<h2 class="work-card__title">${inner}</h2>`);
  return html`
<li class="${cx('work-card', mobile && 'work-card--mobile', p.theme.light && 'work-card--light')}" data-cat="${catSlug(p.category)}" style="${themeStyle(p)}"${raw(reveal ? ' data-reveal' : '')}>
  <div class="work-card__media">
    <img src="${img.src}" width="${img.w}" height="${img.h}" alt="${p.images.cover.alt}" loading="lazy" decoding="async">
  </div>
  <div class="work-card__body">
    <div class="work-card__meta">${logoBadge(p, 'logo-badge logo-badge--sm')}<span class="work-card__label">${p.label}</span></div>
    ${h(html`<a class="work-card__link" href="/work/${p.slug}/">${keepHyphens(p.title)}</a>`)}
    <p class="work-card__tagline">${p.tagline}</p>
    <span class="work-card__more" aria-hidden="true">Read the case study <span class="work-card__arrow">→</span></span>
  </div>
</li>`;
}

/**
 * Text-only card for client / private work: no link, no image.
 * @param {import('../data/private-work.js').PrivateWork} w
 * @param {number} i
 */
function privateCard(w, i) {
  return html`
<li class="work-private__card" data-reveal style="--d:${(i % 3) * 0.06}s">
  <div class="work-private__meta"><span class="work-private__status">${w.status}</span><span class="work-card__label">${w.kind}</span></div>
  <h3 class="work-card__title">${w.name}${w.nameAr ? html` <span class="work-private__ar" lang="ar" dir="rtl">${w.nameAr}</span>` : ''}</h3>
  <p class="work-card__tagline">${w.summary}</p>
  <ul class="chips work-private__stack" aria-label="Stack">${w.stack.map((t) => html`<li class="chip">${t}</li>`)}</ul>
</li>`;
}

/* -------------------------------------------------------------------- page */

export default () => {
  const counts = Object.fromEntries(categories.map((c) => [c, projects.filter((p) => p.category === c).length]));
  const cats = categories.map((c) => ({ name: c, slug: catSlug(c), n: counts[c] }));

  // No-JS filtering: each chip links to an empty #filter-<cat> target placed before the
  // filter bar and grid, and :target hides the other cards. With JS, work.js takes over.
  const noJsCss = cats
    .map((c) =>
      `html:not(.js) #filter-${c.slug}:target ~ .work-grid > [data-cat]:not([data-cat="${c.slug}"]){display:none}` +
      `html:not(.js) #filter-${c.slug}:target ~ .work-filter a[href="#filter-${c.slug}"]{background:var(--white);color:var(--ink);border-color:var(--white)}`,
    )
    .join('');

  const trail = [{ name: 'Home', path: '/' }, { name: 'Work', path: '/work/' }];
  const description =
    'Case studies by Islam Badran, full-stack engineer at ETQAN: AI platforms, Quran academy SaaS, e-commerce automation, Arabic-first stores and mobile apps.';

  return {
    path: '/work/',
    title: 'Work — Web, Mobile & AI Case Studies',
    description,
    priority: 0.9,
    bodyClass: 'page-work',
    styles: ['work.css'],
    scripts: ['work.js'],
    head: raw(`<style>${noJsCss}</style>`),
    jsonLd: [
      {
        '@type': 'CollectionPage',
        '@id': abs('/work/') + '#page',
        url: abs('/work/'),
        name: 'Work — Islam Badran',
        description,
        isPartOf: { '@id': websiteId },
        author: { '@id': personId },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: projects.length,
          itemListElement: projects.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: abs(`/work/${p.slug}/`),
            name: p.title,
          })),
        },
      },
      breadcrumbLd(trail),
    ],
    body: html`
<section class="page-hero work-hero container">
  ${crumbs(trail)}
  <p class="eyebrow work-hero__eyebrow">Selected work · ETQAN ++</p>
  <h1 class="display display--xl">Things I’ve <span class="script">built</span></h1>
  <p class="lead">Web platforms, mobile apps and AI products, designed and built end to end at ETQAN. Each one has a short case study on what it does and the problem it solves.</p>
  <ul class="work-hero__stats" aria-label="At a glance">
    <li><b>${projects.length}</b> case studies</li>
    <li><b>${projects.filter((p) => p.kind === 'web').length}</b> web products</li>
    ${projects.some((p) => p.kind === 'mobile') ? html`<li><b>${projects.filter((p) => p.kind === 'mobile').length}</b> mobile apps</li>` : ''}
  </ul>
</section>

<section class="work-index" id="projects" aria-label="Projects">
  <div class="container">
    ${cats.map((c) => html`<span class="work-target" id="filter-${c.slug}"></span>`)}
    <nav class="work-filter" aria-label="Filter projects by category" data-work-filter>
      <ul>
        <li><a class="work-filter__btn" href="#projects" data-filter="all" aria-current="true">All <span class="work-filter__n">${projects.length}</span></a></li>
        ${cats.map((c) => html`<li><a class="work-filter__btn" href="#filter-${c.slug}" data-filter="${c.slug}">${c.name} <span class="work-filter__n">${c.n}</span></a></li>`)}
      </ul>
    </nav>
    <p class="sr-only" id="work-status" role="status" aria-live="polite"></p>
    <ul class="work-grid">
      ${projects.map((p) => projectCard(p))}
    </ul>
  </div>
</section>

<section class="work-private" aria-labelledby="private-title">
  <div class="container">
    <div class="work-private__head">
      <p class="eyebrow">Client &amp; private work</p>
      <h2 class="display display--m" id="private-title">Behind <span class="script">closed</span> doors</h2>
      <p class="lead">Products built for clients under NDA or still in development, and ideas we prototyped. No public links.</p>
    </div>
    <ul class="work-private__grid">
      ${privateWork.map((w, i) => privateCard(w, i))}
    </ul>
  </div>
</section>`,
  };
};
