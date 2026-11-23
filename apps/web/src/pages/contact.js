import { html } from '../lib/html.js';
import { publicApiUrl } from '../lib/api.js';
import { abs, breadcrumbLd, personId } from '../lib/seo.js';
import { site, links } from '../data/site.js';
import { crumbs, projectLink } from '../templates/partials.js';
import { services } from './services.js';
import { BUDGETS, TIMELINES, HONEYPOT_FIELD } from '@portfolio/validation/constants';

const trail = [
  { name: 'Home', path: '/' },
  { name: 'Contact', path: '/contact/' },
];

/** "+20 101 391 9821" from "201013919821". */
const pretty = (n) => `+${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}`;
/** Both numbers (phone + WhatsApp), primary first, one per line so a number never breaks. */
const phonesHtml = site.phones.map((n) => html`<span class="pg-channel__num">${pretty(n)}</span>`);

const budgets = BUDGETS;
const timelines = TIMELINES;

const description =
  'Contact Islam Badran about a website, mobile app or AI product: WhatsApp, email or Instagram, or send a short project brief. Every project starts with a call.';

const icon = {
  whatsapp: html`<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.5 3.9 1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.3-.3-.3-.5-.4Z"/></svg>`,
  email: html`<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 5.5h18v13H3z M3.5 6l8.5 7 8.5-7"/></svg>`,
  instagram: html`<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor"/></svg>`,
  linkedin: html`<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.2" cy="7.9" r="1.2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M8.2 10.8V17M12 17v-6.2M12 13.6a2.6 2.6 0 0 1 5.2 0V17"/></svg>`,
  facebook: html`<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.4 21v-7.3h2.4l.4-2.9h-2.8V9c0-.8.3-1.4 1.4-1.4h1.5V5a20 20 0 0 0-2.2-.1c-2.2 0-3.7 1.3-3.7 3.8v2.1H8v2.9h2.4V21Z"/></svg>`,
};

const channels = [
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    value: phonesHtml,
    note: 'Fastest way to reach me. Say hi and tell me what you have in mind.',
    href: links.whatsapp(),
    external: true,
    cta: 'Open WhatsApp',
  },
  {
    key: 'email',
    label: 'Email',
    value: site.email,
    note: 'Best for longer briefs, documents and anything you want in writing.',
    href: `${links.email}?subject=${encodeURIComponent('Project enquiry')}`,
    cta: 'Write an email',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    value: `@${site.instagram}`,
    note: 'Follow along, or send a DM if that’s where you already are.',
    href: links.instagram,
    external: true,
    cta: 'Open Instagram',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    value: site.name,
    note: 'Experience, projects and the professional side. Connect or message me there.',
    href: links.linkedin,
    external: true,
    cta: 'Open LinkedIn',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    value: site.name,
    note: 'Updates and behind-the-scenes. Messages are open here too.',
    href: links.facebook,
    external: true,
    cta: 'Open Facebook',
  },
];

const field = (id, label, control, { hint, optional } = {}) => html`
  <div class="pg-field">
    <label for="${id}">${label}${optional ? html` <span class="pg-field__opt">(optional)</span>` : ''}</label>
    ${hint ? html`<p class="pg-field__hint" id="${id}-hint">${hint}</p>` : ''}
    ${control}
    <p class="pg-field__err" id="${id}-err" hidden></p>
  </div>`;

export default () => {
  // Optional inquiry API (PUBLIC_API_URL). Unset => markup identical to the original site.
  const api = publicApiUrl();
  const intro = api
    ? 'Your brief is saved so I can follow up, and it opens WhatsApp (or your email app) with your message ready to send.'
    : 'The form doesn’t store anything: it opens WhatsApp (or your email app) with your message ready to send.';
  // Honeypot: off-screen (.sr-only, out of the grid flow so no layout shift), hidden from
  // assistive tech (aria-hidden) and skipped by Tab (tabindex=-1). Bots that fill it are dropped by the API.
  const honeypot = api
    ? html`
      <div class="sr-only" aria-hidden="true"><label for="f-${HONEYPOT_FIELD}">Leave this empty</label><input id="f-${HONEYPOT_FIELD}" name="${HONEYPOT_FIELD}" type="text" tabindex="-1" autocomplete="off" value=""></div>`
    : '';
  return {
    path: '/contact/',
    title: 'Contact — start a project',
    description,
    styles: ['pages.css'],
    scripts: ['contact.js'],
    bodyClass: 'page-contact',
    priority: 0.8,
    jsonLd: [
      {
        '@type': 'ContactPage',
        '@id': abs('/contact/#page'),
        url: abs('/contact/'),
        name: `Contact ${site.name}`,
        description,
        isPartOf: { '@id': `${site.url}/#website` },
        about: { '@id': personId },
        mainEntity: {
          '@id': personId,
          contactPoint: [
            ...site.phones.map((n) => ({ '@type': 'ContactPoint', contactType: 'project enquiries', telephone: `+${n}`, email: site.email, availableLanguage: ['Arabic', 'English'] })),
          ],
        },
      },
      breadcrumbLd(trail),
    ],
    body: html`
<div class="container pg-crumbs">${crumbs(trail)}</div>

<section class="page-hero container">
  <p class="eyebrow">Contact</p>
  <h1 class="display display--xl">Let’s build <span class="script">something</span></h1>
  <p class="lead">Tell me about the website, app or AI product you have in mind. Every project starts with a short conversation, in Arabic or English.</p>
</section>

<section class="container pg-channels" aria-label="Contact channels">
  ${channels.map((c, i) => html`
  <a class="pg-channel pg-channel--${c.key}" href="${c.href}"${c.external ? html` target="_blank" rel="noopener"` : ''} data-reveal style="--d:${i * 0.06}s">
    <span class="pg-channel__icon">${icon[c.key]}</span>
    <span class="pg-channel__label">${c.label}</span>
    <span class="pg-channel__value"${c.key === 'whatsapp' ? html` dir="ltr"` : ''}>${c.value}</span>
    <span class="pg-channel__note">${c.note}</span>
    <span class="pg-channel__cta">${c.cta} <span aria-hidden="true">↗</span></span>
  </a>`)}
</section>

<section class="section section--paper" id="brief" aria-labelledby="brief-title">
  <div class="container pg-split pg-split--form">
    <div class="pg-brief-intro" data-reveal>
      <p class="eyebrow">Project brief</p>
      <h2 id="brief-title" class="display display--m">Send a quick <span class="script">brief</span></h2>
      <p class="muted">A few details help me come back with useful questions. ${intro}</p>
      <ol class="pg-next" role="list">
        <li><strong>You send the brief.</strong> A couple of lines is enough.</li>
        <li><strong>We have a short call</strong> to understand the goal and the users.</li>
        <li><strong>You get a clear scope</strong> and proposal for the first version.</li>
      </ol>
      <p class="muted">Not sure what you need yet? Browse the <a href="/services/">services</a> or the <a href="/work/">case studies</a> first.</p>
    </div>

    <form class="pg-form ticket-card" id="brief-form" action="mailto:${site.email}?subject=${encodeURIComponent('Project brief')}" method="post" enctype="text/plain" data-whatsapp="${site.whatsapp}" data-email="${site.email}"${api ? html` data-api="${api}"` : ''}>
      ${field('f-name', 'Your name', html`<input id="f-name" name="name" type="text" autocomplete="name" required maxlength="80" aria-describedby="f-name-err">`)}
      ${field('f-type', 'Project type', html`<select id="f-type" name="type" required aria-describedby="f-type-err">
        <option value="">Choose one…</option>
        ${services.map((s) => html`<option value="${s.type}">${s.name}</option>`)}
        <option value="other">Something else</option>
      </select>`)}
      <div class="pg-form__row">
        ${field('f-budget', 'Budget range', html`<select id="f-budget" name="budget" aria-describedby="f-budget-err">
          <option value="">Prefer not to say</option>
          ${budgets.map((b) => html`<option>${b}</option>`)}
        </select>`, { optional: true })}
        ${field('f-timeline', 'Timeline', html`<select id="f-timeline" name="timeline" aria-describedby="f-timeline-err">
          <option value="">No specific date</option>
          ${timelines.map((t) => html`<option>${t}</option>`)}
        </select>`, { optional: true })}
      </div>
      ${field('f-message', 'About the project', html`<textarea id="f-message" name="message" rows="6" required minlength="20" maxlength="2000" aria-describedby="f-message-hint f-message-err"></textarea>`, { hint: 'What do you want to build, who is it for, and is there anything already in place?' })}${honeypot}

      <div class="pg-form__actions">
        <button class="btn btn--dark" type="submit" value="whatsapp" data-via="whatsapp" hidden>${icon.whatsapp} Send on WhatsApp</button>
        <button class="btn pg-btn-outline" type="submit" value="email" data-via="email">Send by email</button>
      </div>
      <p class="pg-form__status" role="status" aria-live="polite"></p>
      <noscript><p class="pg-field__hint">JavaScript is off, so “Send by email” uses your email app. You can also message me directly on <a href="${links.whatsapp()}">WhatsApp</a>.</p></noscript>
    </form>
  </div>
</section>

<section class="section" aria-labelledby="examples-title">
  <div class="container">
    <div class="pg-head" data-reveal>
      <p class="eyebrow">Before you write</p>
      <h2 id="examples-title" class="display display--m">See what I’ve <span class="script">built</span></h2>
    </div>
    <div class="pg-proj-grid" data-reveal>
      ${['agentopia', 'etqan-tutor', 'original-software', 'lmfoundry', 'qalamy-academy', 'teslla-study'].map((s) => projectLink(s))}
    </div>
    <p class="pg-more"><a class="link-arrow" href="/work/">All case studies <span aria-hidden="true">→</span></a></p>
  </div>
</section>
`,
  };
};
