import { readFileSync } from 'node:fs';

const cache = new Map();

/**
 * Intrinsic size of a WebP under /public, read from its header (VP8, VP8L, VP8X),
 * so every <img> can carry width/height. Returns { w, h } or null.
 */
export function webpSize(src) {
  if (cache.has(src)) return cache.get(src);
  let size = null;
  try {
    const b = readFileSync(new URL(`../../public${src}`, import.meta.url));
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') size = { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    else if (chunk === 'VP8 ') size = { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    else if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      size = { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
  } catch { /* missing or not a WebP */ }
  cache.set(src, size);
  return size;
}
