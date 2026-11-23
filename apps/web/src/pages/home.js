/**
 * Home page: the full-screen hero (BADRAN wordmark, lanyard developer card,
 * photo plate + cutout) that "dives" into a laptop whose screen plays the
 * project reel. Motion lives in src/scripts/home.js, styles in home.css.
 *
 * Without JavaScript (and for crawlers / screen readers) the same page is a
 * plain document: an <h1>, a short intro, links to every page and to every
 * case study (see .home-index).
 */
import { html, raw } from '../lib/html.js';
import { site, links, nav } from '../data/site.js';
import { projects, retinaSrc } from '../data/projects.js';
import { abs } from '../lib/seo.js';

const HERO = '/images/hero';
const DIVE_CLIP = '/media/hero-dive.mp4';
const caseHref = (p) => `/work/${p.slug}/`;
const hrefOf = (label) => nav.find((n) => n.label === label).href;

/** "A Quran academy…" -> "a Quran academy…", but acronyms ("AI agents…") stay. */
const lowerFirst = (s) => (/^[A-Z](?![A-Z])/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** Only what the client needs to fill the ticket + description per case. */
const caseData = projects.map((p) => ({
  slug: p.slug,
  title: p.title,
  rows: ['ETQAN ++', p.label.toUpperCase(), p.platform.toUpperCase()],
  key: `// ${p.title.toLowerCase()}`,
  text: `— ${lowerFirst(p.summary)}`,
  href: caseHref(p),
}));
const json = (v) => raw(JSON.stringify(v).replace(/</g, '\\u003c'));

/* ---------- developer card on the lanyard ---------- */
// Rendered twice: once in the desktop frame (with mouse-only contact links)
// and once as the small mobile copy (plain text). The badge is decorative
// (aria-hidden); the same links exist, accessibly, in .home-index.
function badge({ id, cls = '', withLinks }) {
  const val = (text, href, external) =>
    withLinks
      ? html`<a href="${href}" tabindex="-1"${raw(external ? ' target="_blank" rel="noopener"' : '')}>${text}</a>`
      : html`<b>${text}</b>`;
  return html`
<div class="badge ${cls}"${raw(id ? ` id="${id}"` : '')} aria-hidden="true">
  <img src="${HERO}/badge.webp" alt="" width="816" height="1443" decoding="async">
  <div class="card">
    <div class="card-title">DEVELOPER<br>CARD</div>
    <div class="yr">${new Date().getFullYear()}</div>
    <div class="role">FULL-STACK // SOFTWARE ENGINEER</div>
    <div class="ph"></div>
    <div class="row"><span>NAME</span><b>I. BADRAN</b></div>
    <div class="row"><span>FOCUS</span><b>WEB · MOBILE · AI</b></div>
    <div class="row"><span>IG</span>${val(`@${site.instagram.toUpperCase()}`, links.instagram, true)}</div>
    <div class="row"><span>EMAIL</span>${val(site.email.toUpperCase(), links.email)}</div>
  </div>
  <div class="hit"></div>
</div>`;
}

/* ---------- the BADRAN wordmark (desktop + mobile variants) ---------- */
function wordmark({ id, cls, h, x, y, len, fade }) {
  return html`
<svg class="${cls} pre" id="${id}" viewBox="0 0 1440 ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
    <stop offset=".5" stop-color="#f1f4f9" stop-opacity=".9"/>
    <stop offset="1" stop-color="#d4deee" stop-opacity="${fade}"/>
  </linearGradient></defs>
  <text x="${x}" y="${y}" textLength="${len}" lengthAdjust="spacingAndGlyphs" fill="url(#${id}-g)">BADRAN</text>
</svg>`;
}

/* ---------- laptop screens: real screenshots ---------- */
// Only the first screen's image has a real src; the rest carry data-src and
// are loaded by home.js just before they are shown.
// When a 2× capture exists, a srcset lets 2× displays use it. The screen shows the
// image with object-fit: cover (cropped to the screen's height), so the displayed
// image is ~1.2× wider than the screen: hence 85vw rather than the screen's ~70vw.
const SHOT_SIZES = '(max-width: 820px) 100vw, 85vw';
function shot(img, i) {
  const hi = retinaSrc(img.src);
  const set = hi ? `${img.src} ${img.w}w, ${hi} 2560w` : '';
  const attrs = i === 0
    ? html`src="${img.src}"${set ? html` srcset="${set}" sizes="${SHOT_SIZES}"` : ''} fetchpriority="low"`
    : html`data-src="${img.src}"${set ? html` data-srcset="${set}" sizes="${SHOT_SIZES}"` : ''}`;
  return html`<img ${attrs} width="${img.w}" height="${img.h}" alt="${img.alt}" decoding="async">`;
}

function screen(p, i) {
  const { bg, ac, fg, light } = p.theme;
  const style = `--bg:${bg};--fg:${fg};--ac:${ac};--on:${light ? '#fff' : '#0b0b0b'}`;
  const bar = html`<div class="cs-bar"><i></i><i></i><i></i><span>etqanpp.com/projects/${p.slug}</span></div>`;

  if (p.kind === 'mobile') {
    // Cover + the first gallery image when it is also a phone screenshot.
    const second = p.images.gallery.find((g, k) => k === 0 && g.kind === 'phone');
    return html`
<div class="cs cs--mobile${light ? ' light' : ''}" style="${style}" aria-hidden="true">
  ${bar}
  <div class="cs-body">
    <div class="cs-copy">
      <small>${p.label}</small>
      <h3>${p.title}</h3>
      <p>${p.tagline}</p>
      <ul class="cs-chips">${p.chips.map((c) => html`<li>${c}</li>`)}</ul>
    </div>
    <div class="cs-phones">
      <div class="ph-f">${shot(p.images.cover, i)}</div>
      ${second ? html`<div class="ph-f ph-f--sm">${shot(second, i)}</div>` : ''}
    </div>
  </div>
  <div class="cs-marq" aria-hidden="true"><div>${`${p.title.toUpperCase()} ✦ ETQAN ++ ✦ ISLAM BADRAN ✦ `.repeat(6)}</div></div>
</div>`;
  }

  return html`
<div class="cs cs--web${light ? ' light' : ''}" style="${style}" aria-hidden="true">
  ${bar}
  <div class="cs-shot">${shot(p.images.cover, i)}</div>
</div>`;
}

/* ---------- page ---------- */
export default () => ({
  path: '/',
  title: `${site.name} — Full-stack Software Engineer | Web, Mobile & AI`,
  description:
    'Islam Badran is a full-stack software engineer at ETQAN. Explore his case studies: AI agent platforms, Quran-learning SaaS, e-commerce and mobile apps.',
  layout: 'bare',
  bodyClass: 'page-home',
  styles: ['home.css'],
  scripts: ['home.js'],
  priority: 1,
  head: html`<link rel="preload" href="${HERO}/plate.webp" as="image" fetchpriority="high">`,
  jsonLd: [
    {
      '@type': 'ItemList',
      name: `Case studies by ${site.name}`,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: projects.length,
      itemListElement: projects.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.title,
        url: abs(caseHref(p)),
      })),
    },
  ],
  body: html`
<h1 class="home-title">${site.name} <span>— full-stack software engineer</span></h1>

<div class="stage" id="stage">
  <div class="frame d-fade" id="frame">
    <img class="plate" id="plate" src="${HERO}/plate.webp" width="2048" height="1374" alt="" decoding="async" fetchpriority="high">
    ${wordmark({ id: 'wm', cls: 'wm', h: 260, x: 14, y: 214, len: 1412, fade: '.28' })}
    <img class="cut" id="cut" src="${HERO}/cut.webp" width="2048" height="1374" alt="Islam Badran holding a retro phone and an open laptop" decoding="async">
    ${badge({ id: 'badge', cls: 'pre', withLinks: true })}
    <div class="hero-script pre" id="script" aria-hidden="true">software-engineer</div>
    <video class="trans" id="trans" muted playsinline preload="auto" data-src="${DIVE_CLIP}" aria-hidden="true"></video>
    <img class="caseplate" id="caseplate" src="${HERO}/caseplate.webp" width="2048" height="1360" alt="" decoding="async">
    <div class="screen" id="screen">
      ${projects.map(screen)}
      <div class="flash" id="flash"></div>
    </div>
    <div class="screen-hit" id="screenHit" title="next case"></div>
  </div>
</div>

<div class="home-ui" id="ui">
  <div class="m-only" aria-hidden="true">
    ${wordmark({ id: 'mwm', cls: 'm-wm', h: 240, x: 10, y: 210, len: 1420, fade: '.3' })}
    <div class="m-script pre" id="mscript">software-engineer</div>
    <div class="m-badge pre" id="mbadge">${badge({ withLinks: false })}</div>
  </div>

  <nav aria-label="Primary">
    <a class="tag t1 pre" href="${hrefOf('about')}">about</a>
    <a class="tag t2 pre" id="tWork" href="${hrefOf('work')}">work</a>
    <a class="tag t3 pre" href="${hrefOf('services')}">services</a>
    <a class="tag t4 pre" href="${links.whatsapp()}" target="_blank" rel="noopener">discuss a project</a>
  </nav>

  <button class="logo" id="logo" type="button" aria-label="Back to start">ISLAM BADRAN</button>

  <div class="hint pre" id="hint" aria-hidden="true"><span class="line"></span><span>scroll into the work</span></div>
  <a class="hello tag pre" id="hello" href="${hrefOf('contact')}">say hello <span aria-hidden="true">→</span></a>

  <div class="ticket" id="ticket" aria-live="polite">
    <span class="hole h1"></span><span class="hole h2"></span><span class="hole h3"></span><span class="hole h4"></span>
    <h2 id="tTitle">${caseData[0].title}</h2>
    <div class="rows">${caseData[0].rows.map((r) => html`<div>${r}</div>`)}</div>
  </div>

  <div class="desc" id="desc">
    <div class="k" id="dKey">${caseData[0].key}</div>
    <p id="dText">${caseData[0].text}</p>
    <div class="links">
      <a class="go" id="dLink" href="${caseData[0].href}">view case study <span aria-hidden="true">→</span></a>
      <a class="all" href="${hrefOf('work')}">all projects</a>
    </div>
    <div class="num" id="dNum"></div>
  </div>

  <button class="nav-case prev" id="prev" type="button" aria-label="previous case">
    <span class="c"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></span>
    <span class="lb">previous <br>case</span>
  </button>
  <button class="nav-case next" id="next" type="button" aria-label="next case">
    <span class="c"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
    <span class="lb">next <br>case</span>
  </button>
</div>

<div class="home-index" id="home-index">
  <p class="home-index__intro">${site.description}</p>
  <nav aria-label="Site">
    <ul class="home-index__pages">
      ${nav.map((n) => html`<li><a class="tag" href="${n.href}">${n.label}</a></li>`)}
      <li><a class="tag tag--accent" href="${links.whatsapp()}" target="_blank" rel="noopener">discuss a project</a></li>
    </ul>
  </nav>
  <nav aria-labelledby="home-index-title">
    <h2 id="home-index-title">Case studies</h2>
    <ol class="home-index__cases">
      ${projects.map((p) => html`<li><a href="${caseHref(p)}"><b>${p.title}</b> <span>${p.label} — ${p.tagline}</span></a></li>`)}
    </ol>
  </nav>
</div>

<script type="application/json" id="cases-data">${json(caseData)}</script>`,
});
