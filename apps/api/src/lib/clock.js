// @ts-check

/** @typedef {{ now(): Date }} Clock */

/** @type {Clock} */
export const systemClock = { now: () => new Date() };
