import { existsSync } from 'node:fs';
import { html, raw, cx } from '../lib/html.js';
import { abs, breadcrumbLd, personId } from '../lib/seo.js';
import { site, links } from '../data/site.js';
import { projects, getProject } from '../data/projects.js';
import { projectCard, logoBadge } from './work.js';
import { webpSize } from '../lib/images.js';
import { crumbs } from '../templates/partials.js';

/* ---------------------------------------------------------------- colour */

const SITE_BG = '#141936'; // --navy-900, the page background below the hero
const SKY = '#d3e6f5';

function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** Accent if it is readable as text on `bg` (WCAG AA), else the fallback. */
const readable = (color, bg, fallback) => (contrast(color, bg) >= 4.5 ? color : fallback);

function themeVars(p) {
  const { bg, ac, fg } = p.theme;
  return [
    `--p-bg:${bg}`,
    `--p-fg:${fg}`,
    `--p-ac:${ac}`,
    `--p-ac-on-bg:${readable(ac, bg, fg)}`, // accent text inside the themed hero
    `--p-ac-text:${readable(ac, SITE_BG, SKY)}`, // accent text on the navy page
    `--p-on-ac:${contrast('#141936', ac) >= contrast('#ffffff', ac) ? '#141936' : '#ffffff'}`,
  ].join(';');
}

/* ---------------------------------------------------------------- images */

/** srcset string when a -800 sibling exists. */
function srcset(img) {
  const small = img.src.replace(/\.webp$/, '-800.webp');
  if (!existsSync(new URL(`../../public${small}`, import.meta.url))) return null;
  const s = webpSize(small);
  return s ? `${small} ${s.w}w, ${img.src} ${img.w}w` : null;
}

function picture(img, { sizes, eager = false, cls } = {}) {
  const set = srcset(img);
  return html`<img${raw(cls ? ` class="${cls}"` : '')} src="${img.src}"${raw(set ? ` srcset="${set}" sizes="${sizes}"` : '')} width="${img.w}" height="${img.h}" alt="${img.alt}"${raw(
    eager ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"',
  )}>`;
}

const browser = (img, opts) => html`<div class="browser"><div class="browser__bar" aria-hidden="true"><i></i><i></i><i></i></div>${picture(img, opts)}</div>`;

/** The big cover on the project's colour. Returns markup + which gallery images it already used. */
function stage(p) {
  const { cover, gallery } = p.images;
  const mode = p.stage || (p.kind === 'mobile' ? 'shots' : 'browser');

  if (mode === 'shots') {
    const shots = [cover, ...gallery.filter((g) => g.kind === 'phone')];
    return {
      used: shots.slice(1),
      markup: html`<div class="case-shots case-shots--${shots.length}">
        ${shots.map((s, i) => html`<div class="${cx('case-shot', i === 0 && 'case-shot--lead')}">${picture(s, { sizes: '(min-width: 900px) 340px, 70vw', eager: i === 0 })}</div>`)}
      </div>`,
    };
  }
  if (mode === 'phone') {
    return { used: [], markup: html`<div class="phone case-phone">${picture(cover, { sizes: '300px', eager: true })}</div>` };
  }
  return {
    used: [],
    markup: html`<div class="case-browser">${browser(cover, { sizes: '(min-width: 1180px) 1100px, calc(100vw - 32px)', eager: true })}</div>`,
  };
}

function galleryFigure(img) {
  const desktop = img.kind === 'desktop';
  return html`<figure class="${cx('case-fig', `case-fig--${img.kind || 'desktop'}`)}" data-reveal>
    ${desktop
      ? browser(img, { sizes: '(min-width: 1000px) 600px, calc(100vw - 32px)' })
      : html`<div class="case-fig__tile">${picture(img, { sizes: '(min-width: 1000px) 420px, 80vw', cls: 'case-fig__img' })}</div>`}
    <figcaption>${img.alt}</figcaption>
  </figure>`;
}

/* ---------------------------------------------------------------- related */

function relatedFor(p) {
  const out = [];
  const add = (q) => { if (q && q !== p && !out.includes(q)) out.push(q); };
  (p.related || []).forEach((s) => add(getProject(s)));
  projects.filter((q) => q.category === p.category).forEach(add);
  // Pad with the projects that follow this one, so every page offers three.
  const i = projects.indexOf(p);
  for (let k = 1; out.length < 3 && k < projects.length; k++) add(projects[(i + k) % projects.length]);
  return out.slice(0, 3);
}

/* ---------------------------------------------------------------- page */

function page(p, i) {
  const path = `/work/${p.slug}/`;
  const url = abs(path);
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  const { markup: stageMarkup, used } = stage(p);
  const rest = p.images.gallery.filter((g) => !used.includes(g));
  const isApp = Boolean(p.appCategory);

  const rows = [
    ['Type', p.label],
    ['Platform', p.platform],
    // skip Stack when the platform line already names it (e.g. “React Native · Expo”)
    ...(p.stack && !p.stack.every((t) => p.platform.includes(t)) ? [['Stack', p.stack.join(' · ')]] : []),
    ...(p.facts || []),
    ['Role', 'Full-stack engineer'],
    ['Built at', 'ETQAN ++'],
  ];

  const trail = [
    { name: 'Home', path: '/' },
    { name: 'Work', path: '/work/' },
    { name: p.title, path },
  ];

  const work = {
    '@type': isApp ? 'SoftwareApplication' : 'CreativeWork',
    '@id': `${url}#work`,
    name: p.title,
    description: p.summary,
    url,
    image: {
      '@type': 'ImageObject',
      url: abs(p.images.cover.src),
      width: p.images.cover.w,
      height: p.images.cover.h,
      caption: p.images.cover.alt,
    },
    creator: { '@id': personId },
    sourceOrganization: { '@type': 'Organization', name: site.company.name, url: site.company.url },
    genre: p.category,
    keywords: p.chips.join(', '),
    about: p.chips.map((name) => ({ '@type': 'Thing', name })),
    mainEntityOfPage: url,
    ...(isApp ? { operatingSystem: 'iOS, Android', applicationCategory: p.appCategory } : { headline: p.seo.title }),
  };

  const wa = links.whatsapp(`Hi Islam, I saw ${p.title} on your portfolio and I’d like to discuss something similar.`);

  const body = html`
<article class="case" style="${themeVars(p)}">
  <div class="${cx('case-head', p.theme.light && 'case-head--light')}">
    <div class="container">
      ${crumbs([{ name: 'Home', path: '/' }, { name: 'Work', path: '/work/' }, { name: p.title, path: `/work/${p.slug}/` }], 'case-crumbs')}
      <header class="case-hero">
        <div class="case-hero__text">
          <div class="case-hero__brand">${logoBadge(p)}<p class="eyebrow">${p.label}</p></div>
          <h1 class="display case-hero__title">${p.title}</h1>
          <p class="lead case-hero__lead">${p.tagline}</p>
          <p class="case-hero__summary">${p.summary}</p>
        </div>
        <aside class="ticket-card case-ticket" aria-label="Project facts">
          <p class="case-ticket__key">// ${p.title.toLowerCase()}</p>
          <dl class="rows">
            ${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
          </dl>
          <ul class="chips case-ticket__chips">${p.chips.map((c) => html`<li class="chip">${c}</li>`)}</ul>
        </aside>
      </header>
    </div>
  </div>

  <div class="${cx('case-stage', `case-stage--${p.stage || (p.kind === 'mobile' ? 'shots' : 'browser')}`)}">
    <div class="container">${stageMarkup}</div>
  </div>

  <section class="section case-story" aria-label="The story">
    <div class="container">
      <div class="case-block" data-reveal>
        <h2 class="case-h2" id="overview"><span class="case-h2__n">01</span>Overview</h2>
        <div class="prose case-prose">${p.overview.map((t) => html`<p>${t}</p>`)}</div>
      </div>
      <div class="case-block" data-reveal>
        <h2 class="case-h2" id="problem"><span class="case-h2__n">02</span>The problem</h2>
        <div class="prose case-prose">${p.problem.map((t) => html`<p>${t}</p>`)}</div>
      </div>
    </div>
  </section>

  <section class="section section--deep case-features" aria-labelledby="built">
    <div class="container">
      <div class="case-features__head">
        <p class="eyebrow">03 · What was built</p>
        <h2 class="display display--m" id="built">Inside <span class="case-accent">${p.title}</span></h2>
      </div>
      <ol class="grid grid--3 case-feature-list">
        ${p.features.map((f, n) => html`<li class="case-feature" data-reveal style="--d:${(n % 3) * 0.08}s">
          <span class="case-feature__n" aria-hidden="true">${String(n + 1).padStart(2, '0')}</span>
          <h3 class="case-feature__title">${f.title}</h3>
          <p>${f.text}</p>
        </li>`)}
      </ol>
    </div>
  </section>

  ${rest.length
    ? html`<section class="section case-gallery" aria-labelledby="screens">
    <div class="container">
      <p class="eyebrow">Screens</p>
      <h2 class="display display--m" id="screens">A closer <span class="script">look</span></h2>
      <div class="${cx('case-gallery__grid', rest.length === 1 && 'case-gallery__grid--single')}">
        ${rest.map(galleryFigure)}
      </div>
    </div>
  </section>`
    : ''}

  <section class="section section--paper case-role" aria-labelledby="role">
    <div class="container case-role__grid">
      <div data-reveal>
        <p class="eyebrow">My role</p>
        <h2 class="display display--m" id="role">Designed &amp; built at <span class="script">ETQAN</span></h2>
        <div class="prose case-prose">${p.role.map((t) => html`<p>${t}</p>`)}</div>
      </div>
      <div class="case-role__card" data-reveal>
        <p class="case-role__label">What the work covered</p>
        <ul class="case-role__list">${p.deliverables.map((d) => html`<li>${d}</li>`)}</ul>
        <p class="case-role__label">Across the stack</p>
        <ul class="chips"><li class="chip">Front end</li><li class="chip">Back end</li><li class="chip">Integrations</li></ul>
      </div>
    </div>
  </section>

  <section class="section case-related" aria-labelledby="related">
    <div class="container">
      <div class="case-related__head">
        <h2 class="display display--m" id="related">Related <span class="script">work</span></h2>
        <a class="link-arrow" href="/work/">All projects →</a>
      </div>
      <ul class="work-grid work-grid--related">${relatedFor(p).map((q) => projectCard(q, { level: 3 }))}</ul>
    </div>
  </section>

  <nav class="case-pager" aria-label="More case studies">
    <div class="container case-pager__grid">
      <a class="case-pager__link case-pager__link--prev" href="/work/${prev.slug}/" rel="prev">
        <span class="case-pager__dir">← Previous</span>
        <span class="case-pager__title">${prev.title}</span>
        <span class="case-pager__label">${prev.label}</span>
      </a>
      <a class="case-pager__link case-pager__link--next" href="/work/${next.slug}/" rel="next">
        <span class="case-pager__dir">Next →</span>
        <span class="case-pager__title">${next.title}</span>
        <span class="case-pager__label">${next.label}</span>
      </a>
    </div>
  </nav>

  <section class="cta-band case-cta" aria-labelledby="cta">
    <div class="container">
      <div>
        <p class="eyebrow">Your project next?</p>
        <h2 class="cta-band__title" id="cta">Planning something similar?</h2>
        <p class="case-cta__text">Tell me what you’re building. I’ll reply with honest next steps.</p>
      </div>
      <div class="btn-row">
        <a class="btn btn--dark" href="/contact/">Start a project</a>
        <a class="btn case-cta__wa" href="${wa}" target="_blank" rel="noopener">Message on WhatsApp</a>
      </div>
    </div>
  </section>
</article>`;

  return {
    path,
    title: p.seo.title,
    description: p.seo.description,
    image: p.images.cover.src,
    imageAlt: p.images.cover.alt,
    ogType: 'article',
    priority: 0.8,
    bodyClass: cx('page-case', `page-case--${p.slug}`),
    styles: ['work.css', 'project.css'],
    jsonLd: [work, breadcrumbLd(trail)],
    body,
  };
}

export default () => projects.map(page);
