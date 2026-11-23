import { html, raw } from '../lib/html.js';
import { abs, breadcrumbLd, personId } from '../lib/seo.js';
import { site, links } from '../data/site.js';
import { getProject } from '../data/projects.js';
import { crumbs, projectLink, ctaBand } from '../templates/partials.js';



/* ---------- page content ---------- */

const trail = [
  { name: 'Home', path: '/' },
  { name: 'About', path: '/about/' },
];

const themes = [
  {
    name: 'AI products',
    line: 'Platforms where language models and AI agents do real work, with people still in control.',
    slugs: ['agentopia', 'lmfoundry'],
  },
  {
    name: 'Education',
    line: 'Online schools, live lessons and admissions guides for Arabic-speaking students and families.',
    slugs: ['etqan-tutor', 'qalamy-academy', 'teslla-study'],
  },
  {
    name: 'E-commerce & automation',
    line: 'Stores, supplier integrations and onboarding that take repetitive work off a seller’s plate.',
    slugs: ['original-software'],
  },
  {
    name: 'Company platforms',
    line: 'Marketing websites with their own admin dashboard, so the team can run them without a developer.',
    slugs: ['etqan'],
  },
];

const capabilities = [
  { t: 'Web platforms & SaaS', d: 'Multi-user web apps with accounts, roles, scheduling and the business logic that makes them useful.', ex: 'etqan-tutor' },
  { t: 'Mobile apps', d: 'Cross-platform iOS and Android apps with React Native and Expo, from first screen to store-ready build.' },
  { t: 'AI products', d: 'Products built around language models and agents: orchestration, review steps and interfaces people trust.', ex: 'agentopia' },
  { t: 'E-commerce & integrations', d: 'Online stores and the plumbing behind them: connecting stores, suppliers and orders so they stay in sync.', ex: 'original-software' },
  { t: 'Arabic-first & bilingual UI', d: 'Right-to-left layouts done properly, and Arabic/English interfaces that feel native in both languages.', ex: 'teslla-study' },
  { t: 'Dashboards & admin tools', d: 'Back offices that let a team manage content, leads, students or orders on their own.', ex: 'etqan' },
];

const principles = [
  { t: 'Start from the business goal', d: 'Before any code, I want to know what the product has to change for you: more leads, less manual work, a new revenue line.' },
  { t: 'Ship something real, early', d: 'A working first version in your hands beats a perfect plan. Feedback from real users shapes what comes next.' },
  { t: 'Arabic is not an afterthought', d: 'When your audience reads Arabic, the layout, typography and copy are designed right-to-left from day one.' },
  { t: 'Own the whole thing', d: 'Front end, back end, mobile and the admin side are built as one product, so nothing falls between the cracks.' },
  { t: 'Leave it easy to run', d: 'Clear dashboards and tidy code, so your team can manage the product and it can keep growing after launch.' },
];

const description =
  'About Islam Badran, full-stack software engineer at ETQAN: web platforms, React Native mobile apps and AI products, often Arabic-first, for Egypt and the Gulf.';

export default () => ({
  path: '/about/',
  title: 'About Islam Badran — full-stack engineer at ETQAN',
  description,
  ogType: 'profile',
  image: '/images/og-default.jpg',
  imageAlt: 'Islam Badran, full-stack software engineer',
  styles: ['pages.css'],
  bodyClass: 'page-about',
  priority: 0.8,
  jsonLd: [
    {
      '@type': 'ProfilePage',
      '@id': abs('/about/#page'),
      url: abs('/about/'),
      name: `About ${site.name}`,
      description,
      inLanguage: site.lang,
      isPartOf: { '@id': `${site.url}/#website` },
      mainEntity: { '@id': personId },
      about: { '@id': personId },
    },
    breadcrumbLd(trail),
  ],
  body: html`
<div class="container pg-crumbs">${crumbs(trail)}</div>

<section class="container pg-about-hero">
  <div class="pg-about-hero__text">
    <p class="eyebrow">About · ${site.role}</p>
    <h1 class="display display--xl">Islam <span class="pg-nowrap">Badran</span></h1>
    <p class="pg-scribble script" aria-hidden="true">web · mobile · AI</p>
    <p class="lead">I’m a full-stack software engineer at ${site.company.name}. I build web platforms, mobile apps and AI products, often Arabic-first, for companies in Egypt and the Gulf.</p>
    <div class="btn-row">
      <a class="btn btn--light" href="${links.whatsapp()}" target="_blank" rel="noopener">Discuss a project</a>
      <a class="btn btn--ghost" href="/work/">See the work</a>
    </div>
  </div>
  <figure class="pg-about-hero__photo">
    <img src="/images/hero/cut.webp?v=2" alt="Islam Badran in a black leather jacket and tie, holding a laptop and an old brick phone" width="2048" height="1374" fetchpriority="high" decoding="async">
  </figure>
</section>

<section class="section section--paper" aria-labelledby="who">
  <div class="container pg-split">
    <div class="prose" data-reveal>
      <p class="eyebrow">Who I am</p>
      <h2 id="who" class="display display--m">One engineer, the <span class="script">whole</span> product</h2>
      <p>I work at <a href="${site.company.url}" target="_blank" rel="noopener">${site.company.name}</a>, a software company that builds websites, mobile apps and custom business software for companies in Egypt and the Gulf, and ships its own product line under the <strong>ETQAN ++</strong> name.</p>
      <p>My job is to take an idea from a conversation to something people use every day. That means the parts customers see, like the website, the app and the checkout, and the parts they don’t: the database, the integrations and the dashboard your team runs it from.</p>
      <p>A lot of what I build is for Arabic-speaking audiences, so right-to-left layouts and bilingual Arabic/English interfaces are part of the everyday work, not a special request. You can see that across <a href="/work/">the portfolio</a>, from <a href="/work/original-software/">Original Software</a> to <a href="/work/teslla-study/">Teslla Study</a>.</p>
    </div>
    <aside class="pg-devcard" data-reveal style="--d:.1s" aria-label="Quick facts">
      <div class="ticket-card">
        <div class="pg-devcard__head">
          <p class="pg-devcard__title">Developer card</p>
          <p class="pg-devcard__sub">Full-stack // software engineer</p>
        </div>
        <dl class="rows">
          <div><dt>Name</dt><dd>I. Badran</dd></div>
          <div><dt>Role</dt><dd>Full-stack engineer</dd></div>
          <div><dt>Company</dt><dd><a href="${site.company.url}" target="_blank" rel="noopener">${site.company.name}</a></dd></div>
          <div><dt>Focus</dt><dd>Web · Mobile · AI</dd></div>
          <div><dt>Based in</dt><dd>${site.location.country}</dd></div>
          <div><dt>IG</dt><dd><a href="${links.instagram}" target="_blank" rel="noopener">@${site.instagram}</a></dd></div>
          <div><dt>Email</dt><dd><a href="${links.email}">${site.email}</a></dd></div>
        </dl>
      </div>
    </aside>
  </div>
</section>

<section class="section" aria-labelledby="themes">
  <div class="container">
    <div class="pg-head" data-reveal>
      <p class="eyebrow">What I work on</p>
      <h2 id="themes" class="display display--l">Eleven products, <span class="script">five</span> themes</h2>
      <p class="lead">Every project below has its own case study with screenshots and what it does.</p>
    </div>
    <div class="pg-themes">
      ${themes.map((t, i) => html`
      <article class="pg-theme" data-reveal style="--d:${(i % 3) * 0.06}s">
        <header>
          <span class="pg-theme__n" aria-hidden="true">0${i + 1}</span>
          <h3 class="h3">${t.name}</h3>
          <p class="muted">${t.line}</p>
        </header>
        <div class="pg-proj-list">${t.slugs.map((s) => projectLink(s))}</div>
      </article>`)}
    </div>
  </div>
</section>

<section class="section section--deep" aria-labelledby="caps">
  <div class="container">
    <div class="pg-head" data-reveal>
      <p class="eyebrow">Capabilities</p>
      <h2 id="caps" class="display display--l">What I can <span class="script">build</span></h2>
    </div>
    <ul class="grid grid--3 pg-caps" role="list">
      ${capabilities.map((c, i) => {
        const p = getProject(c.ex);
        return html`<li class="pg-cap" data-reveal style="--d:${(i % 3) * 0.06}s">
          <h3 class="h3">${c.t}</h3>
          <p class="muted">${c.d}</p>
          ${p ? html`<a class="link-arrow" href="/work/${p.slug}/">Example: ${p.title} <span aria-hidden="true">↗</span></a>` : ''}
        </li>`;
      })}
    </ul>
    <p class="pg-more" data-reveal>Looking to hire for one of these? <a class="link-arrow" href="/services/">See services <span aria-hidden="true">→</span></a></p>
  </div>
</section>

<section class="section section--paper" aria-labelledby="how">
  <div class="container">
    <div class="pg-head" data-reveal>
      <p class="eyebrow">How I work</p>
      <h2 id="how" class="display display--l">Five <span class="script">principles</span></h2>
    </div>
    <ol class="pg-principles" role="list">
      ${principles.map((p, i) => html`<li data-reveal style="--d:${(i % 3) * 0.06}s">
        <span class="pg-principles__n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <div><h3 class="h3">${p.t}</h3><p>${p.d}</p></div>
      </li>`)}
    </ol>
  </div>
</section>

${ctaBand(raw('Got an idea? <br>Let’s build it.'))}
`,
});
