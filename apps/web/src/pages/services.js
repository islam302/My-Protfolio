import { html, raw } from '../lib/html.js';
import { abs, breadcrumbLd, personId } from '../lib/seo.js';
import { site, links } from '../data/site.js';
import { getProject } from '../data/projects.js';
import { crumbs, projectLink, ctaBand } from '../templates/partials.js';

const trail = [
  { name: 'Home', path: '/' },
  { name: 'Services', path: '/services/' },
];

/**
 * `type` matches the <select> values on /contact/ so "Start this project"
 * links pre-fill the brief form.
 */
export const services = [
  {
    id: 'web-platforms',
    type: 'web',
    name: 'Web platforms & SaaS dashboards',
    short: 'Web platforms',
    intro: 'A web app your customers log into and your team runs from a dashboard: bookings, courses, memberships, internal tools.',
    who: 'Businesses that have outgrown spreadsheets and WhatsApp groups, or founders turning a service into a product.',
    get: ['Customer-facing web app with accounts and roles', 'Admin dashboard to manage users, content and data', 'Hosting, deployment and a handover walkthrough'],
    examples: ['etqan-tutor', 'qalamy-academy'],
  },
  {
    id: 'mobile-apps',
    type: 'mobile',
    name: 'Mobile apps for iOS & Android',
    short: 'Mobile apps',
    intro: 'One React Native and Expo codebase that ships to both stores, so you reach iPhone and Android users without paying for two apps.',
    who: 'Brands and communities that need to be on their customers’ home screen, with reminders and daily use in mind.',
    get: ['iOS and Android app from a single codebase', 'Notifications, accounts and the screens your users need', 'Help preparing and submitting the store builds'],
    examples: [],
  },
  {
    id: 'ai-products',
    type: 'ai',
    name: 'AI products & agents',
    short: 'AI products',
    intro: 'Products built around language models: assistants, AI agents that take on tasks, and the tools to run and review them.',
    who: 'Teams that want AI to do real work inside their product, not just a chatbot bolted onto the homepage.',
    get: ['A focused AI feature or full AI product, scoped to one clear job', 'Review and approval steps so people stay in control', 'An interface your users understand without a manual'],
    examples: ['agentopia', 'lmfoundry'],
  },
  {
    id: 'ecommerce-automation',
    type: 'ecommerce',
    name: 'E-commerce & automation',
    short: 'E-commerce & automation',
    intro: 'Online stores and the automation behind them: connecting stores, suppliers and orders so nobody copies data by hand.',
    who: 'Sellers and retailers whose growth is limited by manual order handling, stock updates or disconnected tools.',
    get: ['Store build or integration with the platforms you already use', 'Automated flows for products, orders and fulfilment', 'Onboarding content so your team or customers get started fast'],
    examples: ['original-software'],
  },
  {
    id: 'arabic-bilingual',
    type: 'arabic',
    name: 'Arabic-first & bilingual websites',
    short: 'Arabic & bilingual sites',
    intro: 'Websites designed right-to-left from the start, or fully bilingual Arabic/English sites that read naturally in both.',
    who: 'Companies in Egypt and the Gulf whose customers read Arabic first, and brands serving Arabic and English speakers.',
    get: ['Proper RTL layout and Arabic typography', 'Arabic/English language switching without broken pages', 'Lead capture, so visitors become conversations'],
    examples: ['teslla-study', 'etqan'],
  },
  {
    id: 'product-design',
    type: 'design',
    name: 'UI/UX for products',
    short: 'UI/UX design',
    intro: 'Interface and flow design for your product, done by the person who will build it, so the design survives contact with code.',
    who: 'Founders with an idea that needs shaping, or products that work but confuse their users.',
    get: ['User flows and screens for the key journeys', 'A consistent visual style across web and mobile', 'Designs that go straight into development'],
    examples: ['original-software'],
  },
];

const steps = [
  { t: 'Discover', d: 'A short call to understand your business, your users and what success looks like. You come away with a clear scope.' },
  { t: 'Design', d: 'Flows and key screens first, in Arabic, English or both, so you see the product before it is built.' },
  { t: 'Build', d: 'Development in small, visible steps. You get working versions to click through, not just status updates.' },
  { t: 'Launch', d: 'Deployment, store submission for mobile apps, and a walkthrough so your team knows how to run it.' },
  { t: 'Support', d: 'Fixes, improvements and new features after launch, as the product and your business grow.' },
];

const faq = [
  {
    q: 'How long does a project take?',
    a: 'It depends on the scope. A focused website is a very different job from a SaaS platform or a mobile app. Every project is scoped after a short call, and you get a timeline with clear milestones before any work starts.',
  },
  {
    q: 'How much does it cost?',
    a: 'There are no fixed packages, because no two projects are the same. After we talk through what you need, you get a proposal based on the actual scope, and we can plan a smaller first version if you want to start lean.',
  },
  {
    q: 'Can you build in Arabic and right-to-left?',
    a: 'Yes. Arabic-first and bilingual Arabic/English interfaces are a big part of the work, from right-to-left layouts to language switching. Projects like Original Software and Teslla Study show how that looks in practice.',
    links: ['original-software', 'teslla-study'],
  },
  {
    q: 'Do you work with clients in the Gulf?',
    a: 'Yes. Work is done remotely from Egypt for companies in Egypt and across the Gulf. Calls, WhatsApp and email keep things moving, and you see progress through working versions you can open yourself.',
  },
  {
    q: 'Do you design too, or only develop?',
    a: 'Both. I can design the user flows and screens and then build them, or work from your existing designs and brand if you already have them.',
  },
  {
    q: 'What happens after launch?',
    a: 'Software needs care after it goes live. Ongoing maintenance, fixes and new features can be arranged as part of the project or as a separate agreement, whichever suits you.',
  },
  {
    q: 'Do I get a dashboard to manage things myself?',
    a: 'Usually, yes. Most projects include an admin side so your team can update content, manage users or follow orders and leads without waiting on a developer.',
  },
  {
    q: 'How do we start?',
    a: 'Send a message on WhatsApp or fill in the short project brief on the contact page. Tell me what you want to build and for whom, and we will set up a call to scope it.',
  },
];

const description =
  'Hire Islam Badran for web platforms, iOS & Android apps, AI products, e-commerce automation, Arabic-first sites and UI/UX, for businesses in Egypt and the Gulf.';

const areaServed = [
  { '@type': 'Country', name: 'Egypt' },
  { '@type': 'Place', name: 'Gulf Cooperation Council (GCC) countries' },
];

export default () => ({
  path: '/services/',
  title: 'Services — web, mobile & AI development',
  description,
  styles: ['pages.css'],
  bodyClass: 'page-services',
  priority: 0.8,
  jsonLd: [
    {
      '@type': 'WebPage',
      '@id': abs('/services/#page'),
      url: abs('/services/'),
      name: `Services — ${site.name}`,
      description,
      isPartOf: { '@id': `${site.url}/#website` },
      about: { '@id': personId },
    },
    ...services.map((s) => ({
      '@type': 'Service',
      '@id': abs(`/services/#${s.id}`),
      name: s.name,
      serviceType: s.short,
      description: s.intro,
      url: abs(`/services/#${s.id}`),
      provider: { '@id': personId },
      areaServed,
      audience: { '@type': 'BusinessAudience', name: s.who },
    })),
    {
      '@type': 'FAQPage',
      '@id': abs('/services/#faq'),
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    breadcrumbLd(trail),
  ],
  body: html`
<div class="container pg-crumbs">${crumbs(trail)}</div>

<section class="page-hero container">
  <p class="eyebrow">Services</p>
  <h1 class="display display--xl">Software that <span class="script">works</span> for your business</h1>
  <p class="lead">Web platforms, mobile apps and AI products, designed and built end to end, in Arabic, English or both. Here is what you can hire me for.</p>
  <div class="btn-row pg-hero-cta">
    <a class="btn btn--light" href="${links.whatsapp('Hi Islam, I’d like to discuss a project with you.')}" target="_blank" rel="noopener">Discuss a project</a>
    <a class="btn btn--ghost" href="#process">How it works</a>
  </div>
  <nav class="pg-jump" aria-label="Services on this page">
    <ul class="pg-jump__list">
      ${services.map((s) => html`<li><a class="tag" href="#${s.id}">${s.short}</a></li>`)}
    </ul>
  </nav>
</section>

<section class="section section--paper" aria-labelledby="services-title">
  <div class="container">
    <h2 id="services-title" class="sr-only">Services</h2>
    <div class="pg-services">
      ${services.map((s, i) => html`
      <article class="pg-service" id="${s.id}" data-reveal aria-labelledby="${s.id}-t">
        <div class="pg-service__main">
          <span class="pg-service__n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
          <h3 id="${s.id}-t" class="pg-service__title">${s.name}</h3>
          <p class="pg-service__intro">${s.intro}</p>
          <p class="pg-service__who"><strong>Good for:</strong> ${s.who}</p>
        </div>
        <div class="pg-service__side">
          <h4 class="pg-label">What you get</h4>
          <ul class="pg-checks">${s.get.map((g) => html`<li>${g}</li>`)}</ul>
          ${s.examples.length ? html`<h4 class="pg-label">See it in</h4>
          <div class="pg-proj-list">${s.examples.map((e) => projectLink(e))}</div>` : ''}
          <a class="link-arrow pg-service__cta" href="/contact/?type=${s.type}#brief">Start a project like this <span aria-hidden="true">→</span></a>
        </div>
      </article>`)}
    </div>
  </div>
</section>

<section class="section" id="process" aria-labelledby="process-title">
  <div class="container">
    <div class="pg-head" data-reveal>
      <p class="eyebrow">Process</p>
      <h2 id="process-title" class="display display--l">From idea to <span class="script">launch</span></h2>
      <p class="lead">Five clear steps, with something you can see and click at every stage.</p>
    </div>
    <ol class="pg-steps" role="list">
      ${steps.map((p, i) => html`<li class="pg-step" data-reveal style="--d:${i * 0.06}s">
        <span class="pg-step__n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <h3 class="pg-step__t">${p.t}</h3>
        <p class="muted">${p.d}</p>
      </li>`)}
    </ol>
  </div>
</section>

<section class="section section--deep" id="faq" aria-labelledby="faq-title">
  <div class="container pg-faq-wrap">
    <div class="pg-head" data-reveal>
      <p class="eyebrow">FAQ</p>
      <h2 id="faq-title" class="display display--l">Good <span class="script">questions</span></h2>
      <p class="muted">Something else on your mind? <a href="/contact/">Ask me directly</a>.</p>
    </div>
    <div class="pg-faq">
      ${faq.map((f) => html`<details class="pg-faq__item" data-reveal>
        <summary><h3 class="pg-faq__q">${f.q}</h3><span class="pg-faq__icon" aria-hidden="true"></span></summary>
        <div class="pg-faq__a">
          <p>${f.a}</p>
          ${f.links ? html`<p class="pg-faq__links">${f.links.map((s) => html`<a class="link-arrow" href="/work/${s}/">${getProject(s).title} case study <span aria-hidden="true">↗</span></a>`)}</p>` : ''}
        </div>
      </details>`)}
    </div>
  </div>
</section>

${ctaBand(raw('Ready when <br>you are.'))}
`,
});
