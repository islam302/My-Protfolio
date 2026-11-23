/**
 * Single source of truth for every project on the site.
 * The home-page laptop reel, /work, each /work/<slug>/ case study, the
 * sitemap and structured data are all generated from this list.
 *
 * Images live in /public/images/projects/<slug>/. `-800.webp` siblings exist
 * for wide screenshots and are used for cards (see `img.card()` below).
 *
 * Content rules: describe only what the product does and what can be seen in
 * its screenshots. No invented metrics, clients, dates or tech stack.
 */

import { existsSync } from 'node:fs';

const dir = (slug) => `/images/projects/${slug}`;

export const projects = [
  {
    slug: 'agentopia',
    title: 'Agentopia',
    category: 'AI',
    kind: 'web',
    label: 'AI · Agent orchestration',
    platform: 'Web app',
    tagline: 'Your AI team, with an org chart.',
    summary:
      'AI agents organised like a company: roles, tasks and output that gets reviewed before it ships.',
    chips: ['AI agents', 'Roles & tasks', 'Reviewed output'],
    theme: { bg: '#120d2a', ac: '#9b8cff', fg: '#ffffff' },
    images: {
      cover: { src: `${dir('agentopia')}/cover.webp`, w: 1600, h: 891, alt: 'Agentopia landing page: “Build your own AI company. Then watch it work.” with AI employees working in a virtual office' },
      logo: `${dir('agentopia')}/logo.webp`,
      gallery: [],
    },
  },
  {
    slug: 'etqan-tutor',
    title: 'Etqan Tutor',
    category: 'Education',
    kind: 'web',
    label: 'Education · SaaS',
    platform: 'Web platform',
    tagline: 'Run an online Quran school from one dashboard.',
    summary:
      'A Quran academy platform that runs a whole online school and tracks every student surah by surah.',
    chips: ['SaaS', 'Progress tracking', 'Scheduling'],
    theme: { bg: '#082219', ac: '#f2c14e', fg: '#ffffff' },
    images: {
      cover: { src: `${dir('etqan-tutor')}/cover.webp`, w: 1600, h: 893, alt: 'Etqan Tutor home page: “Your entire academy, beautifully organized”' },
      logo: `${dir('etqan-tutor')}/logo.webp`,
      gallery: [
        { src: `${dir('etqan-tutor')}/quran.webp`, w: 1600, h: 879, kind: 'desktop', alt: 'Etqan Tutor feature section: tracking Quran memorisation surah by surah, verse by verse' },
      ],
    },
  },
  {
    slug: 'original-software',
    title: 'Original Software',
    category: 'E-commerce',
    kind: 'web',
    label: 'E-commerce · UI/UX',
    platform: 'Arabic-first web store',
    tagline: 'Genuine licences, sold the Arabic-first way.',
    summary:
      'An Arabic-first store for genuine software licences, built for companies, banks and government buyers.',
    chips: ['E-commerce', 'UI/UX', 'RTL'],
    theme: { bg: '#081230', ac: '#3fd0ff', fg: '#ffffff' },
    images: {
      cover: { src: `${dir('original-software')}/cover.webp`, w: 1600, h: 891, alt: 'Original Software Arabic store home page: a welcome banner for genuine software with the gold Original Software mascot' },
      logo: `${dir('original-software')}/logo.webp`,
      gallery: [
        { src: `${dir('original-software')}/home.webp`, w: 1600, h: 891, kind: 'desktop', alt: 'Original Software hero slide: software for companies, banks and government institutions, with the three-step buying flow below' },
      ],
    },
  },
  {
    slug: 'lmfoundry',
    title: 'LMFoundry',
    category: 'AI',
    kind: 'web',
    label: 'AI · LLM platform',
    platform: 'Cloud · On-prem · Edge',
    tagline: 'Build, fine-tune and run your own models.',
    summary:
      'One place to build, fine-tune and run language models and AI agents, in the cloud, on-premise or at the edge.',
    chips: ['Fine-tuning', 'Agents', 'On-prem'],
    theme: { bg: '#0b0b0b', ac: '#ff7a1a', fg: '#ffffff' },
    images: {
      cover: { src: `${dir('lmfoundry')}/cover.webp`, w: 1600, h: 891, alt: 'LMFoundry landing page: “AI. Anywhere. Enterprise-Ready.”' },
      logo: `${dir('lmfoundry')}/logo.webp`,
      gallery: [],
    },
  },
  {
    slug: 'qalamy-academy',
    title: 'Qalamy Academy',
    category: 'Education',
    kind: 'web',
    label: 'Education · Live lessons',
    platform: 'Runs on Etqan Tutor',
    tagline: 'Live one-to-one Quran & Arabic lessons.',
    summary:
      'A Quran and Arabic academy with live one-to-one lessons, running on top of Etqan Tutor.',
    chips: ['Live classes', '1:1', 'Etqan Tutor'],
    theme: { bg: '#1d0f28', ac: '#ffcf70', fg: '#ffffff' },
    images: {
      cover: { src: `${dir('qalamy-academy')}/cover.webp`, w: 1600, h: 893, alt: 'Qalamy Academy home page: “Learn the Quran with mastery — from home”' },
      logo: `${dir('qalamy-academy')}/logo.webp`,
      gallery: [],
    },
    related: ['etqan-tutor'],
  },
  {
    slug: 'teslla-study',
    title: 'Teslla Study',
    category: 'Education',
    kind: 'web',
    label: 'Education · Admissions',
    platform: 'Bilingual website',
    tagline: 'Your route into a Turkish university.',
    summary:
      'A bilingual Arabic/English guide for students applying to universities in Türkiye.',
    chips: ['Bilingual', 'AR / EN', 'Admissions'],
    theme: { bg: '#f7f3ee', ac: '#d7263d', fg: '#141414', light: true },
    images: {
      cover: { src: `${dir('teslla-study')}/cover.webp`, w: 1600, h: 894, alt: 'Teslla Study Arabic home page with Istanbul imagery and the Teslla Study wordmark' },
      logo: `${dir('teslla-study')}/logo.webp`,
      gallery: [
        { src: `${dir('teslla-study')}/hero.webp`, w: 1200, h: 750, kind: 'desktop', alt: 'Teslla Study English hero: “Study in Türkiye, without the guesswork” with a free consultation form' },
        { src: `${dir('teslla-study')}/universities.webp`, w: 1200, h: 750, kind: 'desktop', alt: 'Teslla Study partner universities grid: İstanbul Kent, İstanbul Gelişim, Fenerbahçe, Işık and İstanbul Topkapı' },
        { src: `${dir('teslla-study')}/phone.webp`, w: 840, h: 1050, kind: 'phone', alt: 'Teslla Study on mobile in Arabic: “Study in Türkiye in clear steps”, a free consultation button and the partner universities' },
      ],
    },
  },
  {
    slug: 'alreef',
    title: 'Alreef E-commerce',
    category: 'E-commerce',
    kind: 'web',
    label: 'E-commerce · Full stack',
    platform: 'Arabic-first web store',
    tagline: 'Egyptian honey, ordered online.',
    summary:
      'An Arabic-first online store for an Egyptian honey brand, with its own API and an operations dashboard behind it.',
    chips: ['E-commerce', 'RTL', 'Store + dashboard'],
    theme: { bg: '#0c2c21', ac: '#e2a940', fg: '#f5f1e7' },
    images: {
      cover: { src: `${dir('alreef')}/cover.webp`, w: 1600, h: 891, alt: 'Alreef Arabic store home page: “Bee honey and its products from the Egyptian countryside” over a honey-dipper video, with a limited-time offer card' },
      logo: `${dir('alreef')}/logo.webp`,
      gallery: [],
    },
  },
  {
    slug: 'etqan',
    title: 'ETQAN',
    category: 'Web',
    kind: 'web',
    label: 'Company website',
    platform: 'Website · Dashboard',
    tagline: 'Software products & digital solutions.',
    summary:
      'The ETQAN company website and its admin dashboard: services, projects and a clear path to start a project.',
    chips: ['Website', 'Dashboard', 'Lead capture'],
    theme: { bg: '#0d1530', ac: '#4f8cff', fg: '#ffffff' },
    images: {
      cover: { src: `${dir('etqan')}/cover.webp`, w: 1600, h: 871, alt: 'ETQAN website hero: “Software products & digital solutions.”' },
      logo: `${dir('etqan')}/logo.webp`,
      gallery: [
        { src: `${dir('etqan')}/hero.webp`, w: 1200, h: 750, kind: 'desktop', alt: 'ETQAN dark hero variant: “Software & AI, built properly.”' },
        { src: `${dir('etqan')}/dashboard.webp`, w: 1200, h: 750, kind: 'desktop', alt: 'ETQAN admin dashboard overview with leads by week and recent projects' },
      ],
    },
  },
];

/* ---------------------------------------------------------------------------
 * Case-study content for /work/<slug>/ — merged into each project below.
 * Added fields (all optional):
 *   seo:          { title, description }  unique <title> + 140–160 char meta description
 *   facts:        [[label, value], …]      extra rows on the case-study ticket card
 *   overview:     [paragraph, …]
 *   problem:      [paragraph, …]
 *   features:     [{ title, text }, …]     “What was built”, grounded in the screenshots
 *   role:         [paragraph, …]           “My role” — generic and honest, no invented stack
 *   deliverables: [string, …]
 *   stage:        'browser' | 'phone' | 'shots'   how the cover is framed on the case study
 *   appCategory:  schema.org applicationCategory (mobile apps only)
 *   logoBg:       sticker colour behind the logo when the mark is white (default white)
 * ------------------------------------------------------------------------- */
const caseStudies = {
  agentopia: {
    seo: {
      title: 'Agentopia — AI Agent Orchestration Platform Case Study',
      description: 'How Agentopia organises AI agents like a company: AI employees in a virtual office, a manager that plans the work, and output reviewed before it ships.',
    },
    facts: [['Works with', 'Claude Code · OpenAI Codex']],
    overview: [
      'Agentopia turns a group of AI agents into something everyone already understands: a company. You hire AI employees, give them an office, and hand the manager a task. The landing page puts it plainly: “Build your own AI company. Then watch it work.”',
      'Instead of a chat window, the work happens on an office floor split into departments, with Development, Design, Research and QA each visible at a glance. One place shows who is doing what, and every piece of output goes through review before it counts.',
    ],
    problem: [
      'A single AI agent is easy to follow. Several of them working at once is not: it gets hard to tell who picked up which task, what was handed to whom, and whether anyone checked the result before it was used.',
      'Agentopia answers that with structure people already trust: roles, a manager, hand-offs and a review step, so running a team of agents feels like running a team.',
    ],
    features: [
      { title: 'Hire AI employees', text: 'Create your company and staff it with AI employees, each with a role and a seat in a department such as Development, Design, Research or QA.' },
      { title: 'A manager that plans', text: 'Hand the manager a task and it plans the work, then the pieces are started and handed between team members.' },
      { title: 'A live office view', text: 'An illustrated office floor shows the whole company at once. A gold lamp means an agent is working, so activity is visible without opening anything.' },
      { title: 'A running activity log', text: 'Plans, started tasks, hand-offs and review requests stream into one feed, so you can follow the work as it moves.' },
      { title: 'Review before it ships', text: 'Agents ask for a review and output is checked before it counts, keeping a person in the loop on what actually goes out.' },
      { title: 'Your own model access', text: 'Agentopia works with Claude Code and OpenAI Codex through your own sign-in. Nothing runs on a model until you connect one.' },
    ],
    role: [
      'I designed and built Agentopia at ETQAN ++ as a full-stack engineer, working across the front end, the back end and the integrations that connect the product to the AI tools it runs on.',
      'That meant shaping the office metaphor into a working interface: the company and department structure, the task and hand-off flow, the activity feed, the review step and the sign-in flow that connects your own model access.',
    ],
    deliverables: ['Product UI', 'Landing page', 'Task & review flow', 'AI tool integrations'],
  },

  'etqan-tutor': {
    seo: {
      title: 'Etqan Tutor — Quran Academy Management SaaS Case Study',
      description: 'Etqan Tutor runs a whole online Quran school in one platform: students, teachers, lessons, attendance, payments and progress tracked surah by surah.',
    },
    facts: [['Languages', 'English · Arabic']],
    overview: [
      'Etqan Tutor is a SaaS platform built for online Quran academies. Its promise is on the first screen: “Your entire academy, beautifully organized.” Students, teachers, lessons, attendance, payments and academic progress live in one place instead of across spreadsheets and group chats.',
      'The platform is designed around how Quran teaching actually works. All 114 surahs are built in, so any lesson can be linked to a surah and a verse range, and progress is recorded in the same terms teachers and parents already use.',
    ],
    problem: [
      'Online Quran academies juggle a lot: timetables across families, teachers in different places, video links, fees and, most importantly, memorisation progress that parents want to see. Generic school tools do not speak in surahs and verses, so that progress often ends up in notebooks and messages.',
      'Etqan Tutor brings the whole operation into one dashboard and makes memorisation progress something parents can follow from their own account.',
    ],
    features: [
      { title: 'One dashboard for the academy', text: 'Students, teachers, lessons, attendance and payments are managed together, so the academy runs from a single place.' },
      { title: 'Surah-by-surah progress', text: 'Every lesson links to a surah and verse range. The platform records what each student completes, with memorisation progress by level.' },
      { title: 'Progress parents can see', text: 'Parents follow their child’s progress from their own account, and monthly reports summarise what was memorised.' },
      { title: 'Online classes built in', text: 'Two ways to teach online, Zoom or Jitsi, with the meeting links created automatically for each lesson.' },
      { title: 'Four alert channels', text: 'Notifications go out in-app, by email, on WhatsApp and as device push, so families and teachers get reminders where they actually look.' },
      { title: 'A separate database per academy', text: 'Each academy gets its own database, keeping every school’s students and records apart.' },
    ],
    role: [
      'I designed and built Etqan Tutor at ETQAN ++ as a full-stack engineer, working on the front end, the back end and the integrations behind it, from the academy dashboard to video-class links and notifications.',
      'A large part of the work was modelling Quran study properly: surahs, verse ranges and memorisation levels as first-class data, so progress tracking and parent reports fall out of the everyday workflow rather than being typed up by hand.',
    ],
    deliverables: ['SaaS platform', 'Academy dashboard', 'Progress tracking', 'Notifications & video integrations'],
  },

  'original-software': {
    seo: {
      title: 'Original Software — Arabic-First Software Licence Store Case Study',
      description: 'Original Software is an Arabic-first web store for genuine software licences, built for companies, banks and government buyers, with a three-step buying flow.',
    },
    facts: [['Languages', 'Arabic · English']],
    overview: [
      'Original Software is an Arabic-first online store for genuine software licences. It welcomes visitors to “the world of original software” and offers all the original computer software they need from one trusted place, with fast service, professional support and guaranteed activation.',
      'Beyond individual buyers, the store speaks directly to organisations: one hero slide presents software specialised for companies, banks and government institutions, with trusted, certified solutions that meet security and quality standards.',
    ],
    problem: [
      'Buying software licences should be simple, but buyers often cannot tell genuine keys from grey-market ones, and many stores are built in English first with Arabic added as an afterthought. For businesses and public institutions, getting that wrong is a real risk.',
      'Original Software needed a store that feels native in Arabic, signals trust from the first screen, and makes buying, downloading and activating a licence obvious.',
    ],
    features: [
      { title: 'Arabic-first, right to left', text: 'The whole store is laid out right to left in Arabic, with an English switch for buyers who prefer it.' },
      { title: 'A three-step buying flow', text: '“The easiest way to buy original software”: buy, download, activate, each step illustrated with the store’s mascot.' },
      { title: 'Built for organisations', text: 'Hero content aimed at companies, banks and government institutions sits alongside the consumer catalogue.' },
      { title: 'Full store navigation', text: 'Home, products, offers, about and contact pages, plus a wishlist, cart and notifications in the header.' },
      { title: 'Currency and theme options', text: 'A currency selector and a light/dark switch let each buyer shop the way they prefer.' },
      { title: 'Help one tap away', text: 'A floating chat button keeps support close on every page.' },
    ],
    role: [
      'I designed and built Original Software at ETQAN ++ as a full-stack engineer, covering the UI/UX, the storefront and the back end behind the catalogue, cart and account features.',
      'The focus throughout was getting the Arabic-first experience right: a true right-to-left layout, clear trust signals and a buying flow short enough to explain in three pictures.',
    ],
    deliverables: ['UI/UX design', 'Arabic RTL storefront', 'Cart & accounts', 'Bilingual content'],
  },

  lmfoundry: {
    seo: {
      title: 'LMFoundry — Enterprise LLM & AI Agent Platform Case Study',
      description: 'LMFoundry is one place to build, fine-tune and run language models and AI agents, deployed in the cloud, on-premise or at the edge. An enterprise AI case study.',
    },
    overview: [
      'LMFoundry is an enterprise platform for building, fine-tuning and running your own language models and AI agents. It is positioned in one line on its landing page: “AI. Anywhere. Enterprise-Ready. Your AI. Your stack. No compromises.”',
      'The key idea is choice of where AI runs. Models and agents can be deployed in the cloud, on-premise or at the edge, so organisations can keep sensitive data and workloads where they need them.',
    ],
    problem: [
      'Many organisations want AI built on their own data, but cannot simply send everything to a public API. They need to fine-tune models, run agents and keep control over where those workloads live, and that usually means stitching together several separate tools.',
      'LMFoundry brings the full cycle, from building and fine-tuning to running models and agents, into one platform that fits the customer’s own stack.',
    ],
    features: [
      { title: 'Build your own models', text: 'Build language models of your own instead of relying only on shared, generic ones.' },
      { title: 'Fine-tuning', text: 'Fine-tune models for specific tasks and domains from the same platform.' },
      { title: 'AI agents', text: 'Build and run AI agents alongside your models, on the same platform.' },
      { title: 'Cloud, on-prem or edge', text: 'Deploy where it makes sense: in the cloud, inside your own infrastructure, or at the edge.' },
      { title: 'Insight from your AI', text: 'The product story focuses on watching your models turn data into action.' },
      { title: 'An enterprise front door', text: 'A product and solutions site with pricing, demo booking and a light/dark theme.' },
    ],
    role: [
      'I designed and built LMFoundry at ETQAN ++ as a full-stack engineer, working across the front end, the back end and the integrations that connect the platform to the models and environments it runs on.',
      'The challenge was making a deep technical product feel approachable: clear product and solution pages for decision-makers, backed by a platform that engineers can actually use.',
    ],
    deliverables: ['Platform UI', 'Product & solutions site', 'Model & agent workflows', 'Deployment integrations'],
  },

  'qalamy-academy': {
    seo: {
      title: 'Qalamy Academy — Live Online Quran & Arabic Academy Case Study',
      description: 'Qalamy Academy offers live one-to-one Quran, tajweed and Arabic lessons for children and adults, running on top of the Etqan Tutor academy platform.',
    },
    facts: [['Languages', 'English · Arabic']],
    overview: [
      'Qalamy Academy is an online Quran and Arabic academy built around one idea: “Master the Quran and Arabic, one live lesson at a time.” Students learn from home in live one-to-one lessons in tajweed, memorisation and Arabic, with dedicated teachers and flexible times for both children and adults.',
      'Behind the scenes it runs on Etqan Tutor, the academy platform built at ETQAN, so scheduling, lessons and progress tracking come from a proven foundation while the academy keeps its own brand.',
    ],
    problem: [
      'A new academy needs two things at once: a warm, trustworthy public face that convinces families to book a first lesson, and the operational tools to run classes, teachers and progress once they do. Building both from scratch is slow and expensive.',
      'Qalamy pairs a dedicated, bilingual website with the Etqan Tutor platform underneath, so it can focus on teaching.',
    ],
    features: [
      { title: 'A warm, focused home page', text: '“Learn the Quran with mastery — from home”, with a rotating hero that shows what a live lesson looks like.' },
      { title: 'Free trial booking', text: 'A clear “Book your free trial” call to action turns interest into a first lesson.' },
      { title: 'Accounts for students', text: 'Visitors can create an account and sign in to manage their learning.' },
      { title: 'Content that answers questions', text: 'Articles, an FAQ and a dedicated Ramadan programme page help families decide.' },
      { title: 'English and Arabic', text: 'An Arabic switch sits in the header, so families can use the site in either language.' },
      { title: 'Powered by Etqan Tutor', text: 'Lessons, schedules and memorisation progress are handled by the Etqan Tutor platform.' },
    ],
    role: [
      'I designed and built Qalamy Academy at ETQAN ++ as a full-stack engineer, from the public website and sign-up flow to connecting it with Etqan Tutor, the platform that runs its classes.',
      'Having built Etqan Tutor as well, the work here was about giving one academy its own identity on top of a shared platform, without duplicating the parts that already work.',
    ],
    deliverables: ['Academy website', 'Accounts & sign-up', 'Free trial booking', 'Etqan Tutor integration'],
  },

  'teslla-study': {
    seo: {
      title: 'Teslla Study — Bilingual Turkish University Admissions Case Study',
      description: 'Teslla Study is a bilingual Arabic and English website that guides students into Turkish universities, from free consultation to the acceptance letter.',
    },
    facts: [['Languages', 'Arabic · English']],
    overview: [
      'Teslla Study is a bilingual Arabic and English website for students who want to study at a university in Türkiye. In English its promise is “Study in Türkiye, without the guesswork”; in Arabic, “we accompany you every step until your seat at a Turkish university.”',
      'The service goes beyond advice: helping students pick the right university and programme in Istanbul, preparing their documents, submitting the application and following it up until the acceptance letter arrives, then staying with them through their first weeks of study.',
    ],
    problem: [
      'Applying to a university abroad is confusing: which universities, which programmes, which documents, and in which order. Most information is scattered, and much of it is not available in Arabic.',
      'Teslla Study needed a site that explains the route clearly in both languages and turns a curious visitor into a free consultation as quickly as possible.',
    ],
    features: [
      { title: 'Arabic and English, properly', text: 'A full right-to-left Arabic site and an English version, with a language switch and a dark mode.' },
      { title: 'Free consultation form', text: 'Full name, WhatsApp number and the programme you want, with a promise of a reply within one working day.' },
      { title: 'Partner universities', text: 'İstanbul Kent, İstanbul Gelişim, Fenerbahçe, Işık and İstanbul Topkapı, each with undergraduate and graduate programmes to browse.' },
      { title: 'The journey, visualised', text: 'The Arabic hero shows a university shortlist, an application tracker from documents to acceptance, and a Cairo-to-Istanbul boarding pass.' },
      { title: '“Not sure which one fits?”', text: 'Students who cannot choose can share their grades and budget and ask an advisor.' },
      { title: 'Mobile first', text: 'On phones, the Arabic site leads with “Study in Türkiye in clear steps”, a consultation button and the partner list.' },
    ],
    role: [
      'I designed and built Teslla Study at ETQAN ++ as a full-stack engineer, covering the bilingual front end, the consultation and enquiry flow, and the content structure for universities and programmes.',
      'The goal was a site that feels equally native in Arabic and English and keeps every page pointing toward one next step: talking to an advisor.',
    ],
    deliverables: ['Bilingual website', 'Arabic RTL layout', 'Consultation form', 'University listings'],
  },

  alreef: {
    seo: {
      title: 'Alreef E-commerce — Arabic-First Honey Store & Operations Case Study',
      description: 'Alreef is an Arabic-first online store for an Egyptian honey brand: a React storefront, a Django REST API with FEFO stock, and an operations dashboard.',
    },
    facts: [['Language', 'Arabic (RTL)'], ['Built with', 'React · Django REST Framework']],
    overview: [
      'Alreef (عسل نحل الريف) is an Egyptian brand of bee honey and bee products that sells online and ships to every governorate in Egypt. The storefront opens with “Bee honey and its products from the Egyptian countryside” and one simple invitation: pick the type that suits you and see the offers before you order.',
      'The project is the whole platform behind the shop: an Arabic-first, right-to-left storefront, an internal operations dashboard, and the API both of them run on.',
    ],
    problem: [
      'Honey is hard to buy online. Types differ in taste, texture and price, the same product comes in several weights, and many customers simply do not know which one to pick. Behind the counter, stock has expiry dates and orders need to be confirmed, shipped and tracked.',
      'Alreef needed a store that explains its products in plain Arabic and makes comparing them easy, backed by tools that keep stock, offers and orders under control.',
    ],
    features: [
      { title: 'Arabic-first, right to left', text: 'The storefront is built in Arabic from the start, with a true right-to-left layout and every product shown with its type, weight and price.' },
      { title: '“Not sure what to choose?”', text: 'A help-me-choose flow asks how you like the taste or what you will use the honey for, then recommends from what is in stock.' },
      { title: 'Offers with clear prices', text: 'Bundles and offers show the price before and after the discount and how much you save, with a weight picker on each product.' },
      { title: 'A buying guide', text: 'Short guides compare honey types by taste, texture and use, and explain why colour and texture vary.' },
      { title: 'Checkout, delivery and tracking', text: 'Cash on delivery, shipping to all governorates and an order-tracking page, with WhatsApp one tap away and customer messages on the home page.' },
      { title: 'An API and an operations dashboard', text: 'A Django REST API handles the catalogue, cart, promotions, coupons, checkout and FEFO (first-expiry-first-out) stock, and an internal dashboard runs orders, products, stock and coupons.' },
    ],
    role: [
      'I built Alreef at ETQAN ++ as a full-stack engineer, across the React storefront, the Django REST API and the operations dashboard.',
      'The focus was making an Arabic-first shop that helps people choose, and pairing it with a back end that keeps prices, offers and stock honest from the product page to the delivered order.',
    ],
    deliverables: ['Arabic RTL storefront', 'REST API', 'Operations dashboard', 'Checkout & order tracking'],
  },

  etqan: {
    seo: {
      title: 'ETQAN — Software Company Website & Admin Dashboard Case Study',
      description: 'The ETQAN company website and admin dashboard: services, projects and a clear path to start a project, with leads, clients and projects managed in one place.',
    },
    facts: [['Languages', 'English · Arabic']],
    overview: [
      'ETQAN designs and builds websites, mobile apps and custom business software for companies in Egypt and the Gulf, from first idea to launch and support. This project is the company’s own home on the web: the public website and the admin dashboard behind it.',
      'The site leads with “Software products & digital solutions.” and a single call to action, a free consultation. A darker hero variant, “Software & AI, built properly.”, presents ETQAN as a Cairo studio for web platforms, multi-tenant SaaS and AI features.',
    ],
    problem: [
      'A software company’s website has to prove the team can build, and then make it effortless to start a conversation. Behind the scenes, enquiries, clients and projects also need somewhere better to live than an inbox.',
      'The answer was a clear, bilingual public site with a direct path to “Start a project”, backed by a dashboard that turns those enquiries into leads the team can follow up.',
    ],
    features: [
      { title: 'A clear public website', text: 'About, services, projects and contact pages, with “Start a project” and “Book a free consultation” always in reach.' },
      { title: 'English and Arabic', text: 'An Arabic switch in the header serves clients across Egypt and the Gulf.' },
      { title: 'Two hero directions', text: 'A light hero and a dark variant highlighting web apps, SaaS, AI agents, DevOps and Arabic-first work.' },
      { title: 'Admin dashboard overview', text: 'Active projects, new leads, uptime and open tickets on one screen, with a leads-by-week chart.' },
      { title: 'Projects, clients and leads', text: 'Dedicated sections for projects, clients, leads, services, team, blog and settings, with search across projects and clients.' },
      { title: 'Project status at a glance', text: 'Recent projects are listed with their status, such as live, in review or building.' },
    ],
    role: [
      'I designed and built the ETQAN website and admin dashboard at ETQAN ++ as a full-stack engineer, covering the public site, the dashboard and the back end that connects enquiries to leads and projects.',
      'It is the company I work for, so the brief was personal: present ETQAN’s work honestly and make starting a project as easy as one click.',
    ],
    deliverables: ['Company website', 'Admin dashboard', 'Lead capture', 'Bilingual content'],
  },
};

for (const p of projects) Object.assign(p, caseStudies[p.slug]);

export const categories = [...new Set(projects.map((p) => p.category))];

export const getProject = (slug) => projects.find((p) => p.slug === slug);

/** Smaller card-sized variant of a screenshot when one exists, else the original. */
export function cardSrc(src) {
  const small = src.replace(/\.webp$/, '-800.webp');
  return existsSync(new URL(`../../public${small}`, import.meta.url)) ? small : src;
}

/** The 2× (2560 px) sibling of a screenshot, captured from the live site, when one exists. */
export function retinaSrc(src) {
  const big = src.replace(/\.webp$/, '@2x.webp');
  return existsSync(new URL(`../../public${big}`, import.meta.url)) ? big : null;
}
