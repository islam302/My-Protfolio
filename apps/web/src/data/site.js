/**
 * Site-wide facts. Everything about Islam that appears on more than one page
 * lives here, so it is changed in one place.
 *
 * SITE_URL must be the real production origin (no trailing slash) — it drives
 * canonical URLs, Open Graph tags and sitemap.xml. Override at build time:
 *   SITE_URL=https://example.com npm run build
 */
export const site = {
  url: (process.env.SITE_URL || 'https://islambadran.com').replace(/\/$/, ''),
  name: 'Islam Badran',
  shortName: 'Badran',
  role: 'Full-stack software engineer',
  tagline: 'Web platforms, mobile apps and AI products.',
  description:
    'Islam Badran is a full-stack software engineer at ETQAN building web platforms, mobile apps and AI products for companies in Egypt and the Gulf.',
  locale: 'en_US',
  lang: 'en',
  themeColor: '#141936',
  location: { country: 'Egypt', countryCode: 'EG' },
  company: { name: 'ETQAN', url: 'https://www.etqanpp.com' },
  email: 'admin@etqanpp.com',
  whatsapp: '201505858198',
  instagram: 'islam__badran',
  ogImage: '/images/og-default.jpg',
};

export const links = {
  email: `mailto:${site.email}`,
  whatsapp: (text = 'Hi Islam, I’d like to discuss a project.') =>
    `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`,
  instagram: `https://www.instagram.com/${site.instagram}/`,
};

/** Primary navigation — rendered as the white "tag" stickers in the header. */
export const nav = [
  { label: 'about', href: '/about/' },
  { label: 'work', href: '/work/' },
  { label: 'services', href: '/services/' },
  { label: 'contact', href: '/contact/' },
];
