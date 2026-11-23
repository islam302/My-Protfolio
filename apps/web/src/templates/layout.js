import { html, raw, cx } from '../lib/html.js';
import { site, nav, links } from '../data/site.js';
import { abs, pageTitle, ldScript, personLd, websiteLd } from '../lib/seo.js';

/**
 * Page contract (what every module in src/pages returns, one object per URL):
 * {
 *   path:        '/work/agentopia/'         // always leading + trailing slash ('/' for home, '/404.html' allowed)
 *   title:       'Agentopia — AI case study' // " — Islam Badran" is appended automatically
 *   description: '…'                         // 140–160 chars, unique per page
 *   body:        html`…`                     // page content (inside <main>)
 *   image?:      '/images/…'                 // Open Graph / Twitter image, defaults to site.ogImage
 *   imageAlt?:   '…'
 *   ogType?:     'website' | 'article' | 'profile'
 *   styles?:     ['work.css']                // extra files from src/styles, after site.css
 *   scripts?:    ['work.js']                 // extra files from src/scripts (loaded as type=module, deferred)
 *   jsonLd?:     [node, …]                   // schema.org nodes; Person + WebSite are always included
 *   bodyClass?:  'page-work'
 *   layout?:     'site' | 'bare'             // 'bare' = no shared header/footer (home page)
 *   head?:       html`…`                     // extra <head> markup (preloads etc.)
 *   noindex?:    true                        // excluded from sitemap + robots meta noindex
 *   priority?:   0.0–1.0                     // sitemap priority
 * }
 */

const CSS_VERSION = Date.now().toString(36);

export function header(currentPath = '') {
  const isCurrent = (href) => currentPath === href || (href !== '/' && currentPath.startsWith(href));
  return html`
<header class="site-header">
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="site-header__inner">
    <a class="brand" href="/" aria-label="${site.name} — home">ISLAM BADRAN</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
      <span class="nav-toggle__bars" aria-hidden="true"></span><span class="sr-only">Menu</span>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="Primary">
      <ul>
        ${nav.map((n) => html`<li><a class="${cx('tag', isCurrent(n.href) && 'is-current')}" href="${n.href}"${raw(isCurrent(n.href) ? ' aria-current="page"' : '')}>${n.label}</a></li>`)}
        <li><a class="tag tag--accent" href="${links.whatsapp()}" target="_blank" rel="noopener">discuss a project</a></li>
      </ul>
    </nav>
  </div>
</header>`;
}

export function footer() {
  const year = new Date().getFullYear();
  return html`
<footer class="site-footer">
  <div class="container site-footer__grid">
    <div class="site-footer__cta">
      <p class="eyebrow">Have something to build?</p>
      <p class="site-footer__big">Let’s talk about your <span class="script">project</span>.</p>
      <div class="btn-row">
        <a class="btn btn--light" href="${links.whatsapp()}" target="_blank" rel="noopener">Message on WhatsApp</a>
        <a class="btn btn--ghost" href="${links.email}">${site.email}</a>
      </div>
    </div>
    <nav class="site-footer__nav" aria-label="Footer">
      <p class="eyebrow">Site</p>
      <ul>
        <li><a href="/">Home</a></li>
        ${nav.map((n) => html`<li><a href="${n.href}">${n.label[0].toUpperCase() + n.label.slice(1)}</a></li>`)}
      </ul>
    </nav>
    <div class="site-footer__nav">
      <p class="eyebrow">Elsewhere</p>
      <ul>
        <li><a href="${links.instagram}" target="_blank" rel="noopener">Instagram</a></li>
        <li><a href="${links.whatsapp()}" target="_blank" rel="noopener">WhatsApp</a></li>
        <li><a href="${site.company.url}" target="_blank" rel="noopener">${site.company.name}</a></li>
      </ul>
    </div>
  </div>
  <div class="container site-footer__base">
    <span>© ${year} ${site.name}</span>
    <span>${site.role} · ${site.location.country}</span>
  </div>
</footer>`;
}

export function document(page) {
  const title = pageTitle(page.title);
  const canonical = abs(page.path === '/404.html' ? '/404.html' : page.path);
  const image = abs(page.image || site.ogImage);
  const styles = ['site.css', ...(page.styles || [])];
  const scripts = ['site.js', ...(page.scripts || [])];
  const ld = [personLd(), websiteLd(), ...(page.jsonLd || [])];
  const bare = page.layout === 'bare';

  return `<!DOCTYPE html>
<html lang="${site.lang}" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${html`<title>${title}</title>
<meta name="description" content="${page.description}">
<link rel="canonical" href="${canonical}">
${page.noindex ? raw('<meta name="robots" content="noindex,follow">\n') : ''}<meta name="author" content="${site.name}">
<meta name="theme-color" content="${site.themeColor}">
<meta property="og:type" content="${page.ogType || 'website'}">
<meta property="og:site_name" content="${site.name}">
<meta property="og:locale" content="${site.locale}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${page.description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta property="og:image:alt" content="${page.imageAlt || title}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${page.description}">
<meta name="twitter:image" content="${image}">`}
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/fonts/inter-tight.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/anton.woff2" as="font" type="font/woff2" crossorigin>
${styles.map((s) => `<link rel="stylesheet" href="/css/${s}?v=${CSS_VERSION}">`).join('\n')}
${page.head || ''}
${ldScript(ld)}
<script>document.documentElement.classList.add('js')</script>
${scripts.map((s) => `<script type="module" src="/js/${s}?v=${CSS_VERSION}"></script>`).join('\n')}
</head>
<body class="${cx(bare ? 'layout-bare' : 'layout-site', page.bodyClass)}">
${bare ? '' : header(page.path)}
<main id="main">
${page.body}
</main>
${bare ? '' : footer()}
</body>
</html>
`;
}
