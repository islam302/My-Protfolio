// @ts-check

/**
 * Escape LIKE/ILIKE metacharacters so user input is matched literally.
 * Use with `ILIKE $n ESCAPE '\'`.
 * @param {string} input
 */
export function escapeLike(input) {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
