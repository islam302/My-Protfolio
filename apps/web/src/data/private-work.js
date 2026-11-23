/**
 * Client & private work shown as text-only cards below the /work/ case-study grid.
 *
 * These products were built for clients under NDA, are still in development, or are
 * prototypes and ideas. They have no public link, screenshots or case study.
 *
 * Content rules: describe what the product does, nothing more. No client names, URLs,
 * credentials, cost figures or internal metrics.
 */

/**
 * @typedef {object} PrivateWork
 * @property {string} name     Product name (shown as the card title).
 * @property {string} [nameAr] Arabic name, shown next to the title.
 * @property {string} kind     Short kind label, e.g. "AI · SaaS".
 * @property {string} status   Status sticker, e.g. "Client work", "Prototype".
 * @property {string} summary  One or two sentences.
 * @property {string[]} stack  A short stack list.
 */

/** @type {PrivateWork[]} */
export const privateWork = [
  {
    name: 'click.ai',
    kind: 'AI · SaaS',
    status: 'Private product',
    summary:
      'A multi-tenant RAG chatbot that answers from a curated Q&A bank first, then from uploaded documents, with sources on every reply. It also answers on WhatsApp, and clients manage it from an English/Arabic console: analytics, knowledge sync and the bot’s tone.',
    stack: ['Django', 'PostgreSQL', 'Celery', 'React', 'TypeScript', 'Docker'],
  },
  {
    name: 'Meeting Tracker',
    kind: 'AI · Meeting intelligence',
    status: 'Client work',
    summary:
      'Arabic-first meeting notes without a bot in the call: it picks up the Google Meet or Zoom recording afterwards and turns it into a speaker-labelled transcript and a report of decisions, action items and risks, each linked back to the transcript.',
    stack: ['Python', 'TypeScript', 'OpenAI', 'Docker'],
  },
  {
    name: 'Saydaliatak',
    nameAr: 'صيدليتك',
    kind: 'Healthcare · ERP',
    status: 'In development',
    summary:
      'An ERP for pharmacy chains: a web point of sale that keeps selling offline, inventory and a full Arabic interface, with a companion mobile app.',
    stack: ['Fastify', 'TypeScript', 'PostgreSQL', 'React', 'Expo'],
  },
  {
    name: 'Etqan CRM',
    kind: 'CRM · Social inbox',
    status: 'Client demo',
    summary:
      'Every social-media conversation in one inbox, next to the customer’s store orders, with a rules-based auto-reply engine that answers in Arabic and English.',
    stack: ['Django', 'PostgreSQL', 'Tailwind', 'HTMX'],
  },
  {
    name: 'AI News Generator',
    kind: 'AI · Newsroom',
    status: 'Prototype',
    summary:
      'Editors fill in the event (place, source, participants, details) and get an Arabic news article written from a template, by an LLM, or both.',
    stack: ['React', 'MUI', 'Django REST', 'OpenAI'],
  },
  {
    name: 'News Forum',
    kind: 'Media · News portal',
    status: 'Idea',
    summary:
      'The front end of an Arabic news portal: categories, articles, authors, most-read, photo and video sections, prices and search, right to left throughout.',
    stack: ['Next.js', 'React', 'Tailwind', 'TypeScript'],
  },
  {
    name: 'Newsroom chatbots',
    kind: 'AI · Chatbots',
    status: 'Client work',
    summary:
      'Custom AI chatbots built for news organisations, the earlier work that click.ai grew out of.',
    stack: ['Python', 'React'],
  },
];
