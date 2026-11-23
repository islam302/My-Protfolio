// @ts-check
/**
 * Dependency-free contact-form rules. Imported by the static web build (to render
 * the <select> options and length attributes) and by the API schema, so the
 * browser and the server always agree.
 */

/** Project types: the `type` of each service on /services/ plus "other". Order is not significant. */
export const PROJECT_TYPES = /** @type {const} */ (['web', 'mobile', 'ai', 'ecommerce', 'arabic', 'design', 'other']);

/** Budget ranges shown on /contact/ (option text is the value). */
export const BUDGETS = /** @type {const} */ (['Under $1,000', '$1,000 – $5,000', '$5,000 – $15,000', 'Over $15,000', 'Not sure yet']);

/** Timelines shown on /contact/ (option text is the value). */
export const TIMELINES = /** @type {const} */ (['As soon as possible', 'Within 1–3 months', 'In 3–6 months', 'Flexible / just exploring']);

/** How the visitor chose to hand the brief off. */
export const CHANNELS = /** @type {const} */ (['whatsapp', 'email']);

/** Admin workflow states for a stored inquiry. */
export const INQUIRY_STATUSES = /** @type {const} */ (['new', 'read', 'replied', 'archived']);

export const LIMITS = Object.freeze({
  nameMax: 80,
  messageMin: 20,
  messageMax: 2000,
  notesMax: 4000,
  emailMax: 254,
  passwordMin: 12,
  passwordMax: 256,
});

/** Name of the hidden honeypot input. Bots fill it; people never see it. */
export const HONEYPOT_FIELD = 'website';
