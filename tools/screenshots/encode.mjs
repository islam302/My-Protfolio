#!/usr/bin/env node
/**
 * Encode the PNG masters in assets/source/projects/<slug>/<name>@2x.png into the
 * WebP files the site serves (requires ffmpeg with libwebp on PATH):
 *
 *   apps/web/public/images/projects/<slug>/<name>@2x.webp   2560 px  (laptop screen on 2× displays)
 *   apps/web/public/images/projects/<slug>/<name>.webp      1600 px  (1× displays, case-study pages)
 *   apps/web/public/images/projects/<slug>/<name>-800.webp   800 px  (cards; only if one existed)
 *
 * Every output is a DOWNscale of the master (never an upscale), Lanczos-filtered,
 * at high WebP quality so colours and small text stay crisp.
 *
 *   node tools/screenshots/encode.mjs            # every master
 *   node tools/screenshots/encode.mjs etqan      # one project
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'assets', 'source', 'projects');
const OUT = join(ROOT, 'apps', 'web', 'public', 'images', 'projects');

/** Width×height of an existing image (ffprobe), or null. @param {string} file */
function sizeOf(file) {
  if (!existsSync(file)) return null;
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [w, h] = r.stdout.trim().split(',').map(Number);
  return w && h ? { w, h } : null;
}

/**
 * When the output already exists, keep its exact pixel size: pages take <img> width/height
 * from the file, so even a 1 px change in height shifts the layout below it.
 * @param {string} input @param {string} output @param {number} width @param {number} quality
 */
function encode(input, output, width, quality) {
  const keep = sizeOf(output);
  const scale = keep && keep.w === width ? `${keep.w}:${keep.h}` : `${width}:-1`;
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-i', input,
    '-vf', `scale=${scale}:flags=lanczos`,
    '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', '-preset', 'picture',
    output,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${output}`);
  console.log(`  → ${output.slice(ROOT.length + 1)} (${width}px, q${quality})`);
}

const only = process.argv[2];
for (const slug of readdirSync(SRC).filter((d) => !only || d === only)) {
  for (const file of readdirSync(join(SRC, slug)).filter((f) => f.endsWith('@2x.png'))) {
    const name = file.replace(/@2x\.png$/, '');
    const master = join(SRC, slug, file);
    const dir = join(OUT, slug);
    console.log(`${slug}/${file}`);
    encode(master, join(dir, `${name}@2x.webp`), 2560, 88);
    encode(master, join(dir, `${name}.webp`), 1600, 90);
    if (existsSync(join(dir, `${name}-800.webp`))) encode(master, join(dir, `${name}-800.webp`), 800, 88);
  }
}
