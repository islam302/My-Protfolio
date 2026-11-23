import { site, links } from '../data/site.js';

/** Absolute URL for a site path ("/work/" -> "https://…/work/"). */
export const abs = (path = '/') => (/^https?:/.test(path) ? path : site.url + path);

/** Title pattern: "Page — Islam Badran"; the home page passes its full title. */
export const pageTitle = (title) =>
  !title ? `${site.name} — ${site.role}` : title.includes(site.name) ? title : `${title} — ${site.name}`;

/* ---------- JSON-LD builders ---------- */

export const personId = `${site.url}/#person`;
export const websiteId = `${site.url}/#website`;

export function personLd() {
  return {
    '@type': 'Person',
    '@id': personId,
    name: site.name,
    jobTitle: site.role,
    description: site.description,
    url: site.url + '/',
    image: abs('/images/hero/cut.webp'),
    email: `mailto:${site.email}`,
    worksFor: { '@type': 'Organization', name: site.company.name, url: site.company.url },
    address: { '@type': 'PostalAddress', addressCountry: site.location.countryCode },
    knowsAbout: ['Web development', 'Mobile app development', 'React Native', 'AI products', 'E-commerce', 'Arabic-first (RTL) interfaces'],
    sameAs: [links.instagram],
  };
}

export function websiteLd() {
  return {
    '@type': 'WebSite',
    '@id': websiteId,
    url: site.url + '/',
    name: site.name,
    description: site.description,
    inLanguage: site.lang,
    publisher: { '@id': personId },
  };
}

export function breadcrumbLd(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: abs(t.path) })),
  };
}

/** Wrap one or more JSON-LD nodes into a single @graph document. */
export function ldScript(nodes) {
  if (!nodes || !nodes.length) return '';
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}
