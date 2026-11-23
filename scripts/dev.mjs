#!/usr/bin/env node
/**
 * Start the whole monorepo for local development:
 *   - API on :3000 (needs DATABASE_URL; see .env.example)
 *   - web on :4321 built with PUBLIC_API_URL=http://localhost:3000/api
 * Only the web dev server starts when DATABASE_URL is missing.
 * Ctrl+C stops both.
 */
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];

/** @param {string} name @param {string[]} args @param {NodeJS.ProcessEnv} env */
function run(name, args, env) {
  const child = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  const prefix = (/** @type {Buffer} */ chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => `[${name}] ${l}`)
      .join('\n') + '\n';
  child.stdout.on('data', (c) => process.stdout.write(prefix(c)));
  child.stderr.on('data', (c) => process.stderr.write(prefix(c)));
  child.on('exit', (code) => {
    console.log(`[${name}] exited with ${code}`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

let stopping = false;
/** @param {number} code */
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (process.env.DATABASE_URL) {
  run('api', ['run', 'dev', '-w', '@portfolio/api'], { CORS_ORIGINS: 'http://localhost:4321', PUBLIC_ORIGIN: 'http://localhost:4321' });
  run('web', ['run', 'dev', '-w', '@portfolio/web'], { PUBLIC_API_URL: 'http://localhost:3000/api' });
} else {
  console.log('DATABASE_URL not set: starting the static site only (contact form hands off to WhatsApp/email).');
  run('web', ['run', 'dev', '-w', '@portfolio/web'], {});
}
