// @ts-check
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError, DEFAULT_RATE_LIMITS } from '../../src/config.js';

const SECRET = 's'.repeat(32);
const PROD = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db:5432/app', IP_HASH_SECRET: SECRET, PUBLIC_ORIGIN: 'https://islambadran.com' };

describe('loadConfig', () => {
  test('development defaults', () => {
    const c = loadConfig({});
    assert.equal(c.env, 'development');
    assert.equal(c.port, 3000);
    assert.equal(c.host, '0.0.0.0');
    assert.equal(c.databasePoolMax, 10);
    assert.equal(c.trustProxy, 0);
    assert.deepEqual(c.corsOrigins, []);
    assert.equal(c.cookieSecure, false);
    assert.equal(c.cookieName, 'pf_session');
    assert.equal(c.apiDocs, true);
    assert.equal(c.bodyLimit, 16 * 1024);
    assert.deepEqual(c.rateLimits, DEFAULT_RATE_LIMITS);
    assert.equal(c.session.idleMs, 30 * 60_000);
    assert.equal(c.session.absoluteMs, 8 * 3_600_000);
    assert.deepEqual(c.lockout, { maxFailures: 10, durationMs: 15 * 60_000 });
  });

  test('production requires DATABASE_URL, IP_HASH_SECRET and PUBLIC_ORIGIN', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /DATABASE_URL/);
      assert.match(err.message, /IP_HASH_SECRET/);
      assert.match(err.message, /PUBLIC_ORIGIN/);
      return true;
    });
  });

  test('production forces a Secure __Host- cookie and disables docs by default', () => {
    const c = loadConfig({ ...PROD, SESSION_COOKIE_SECURE: 'false' });
    assert.equal(c.cookieSecure, true);
    assert.equal(c.cookieName, '__Host-pf_session');
    assert.equal(c.apiDocs, false);
    assert.equal(loadConfig({ ...PROD, API_DOCS: 'true' }).apiDocs, true);
  });

  test('IP_HASH_SECRET shorter than 32 chars is rejected', () => {
    assert.throws(() => loadConfig({ ...PROD, IP_HASH_SECRET: 'short' }), /at least 32/);
    assert.throws(() => loadConfig({ IP_HASH_SECRET: 'short' }), ConfigError);
  });

  test('rejects malformed values with a readable message', () => {
    assert.throws(() => loadConfig({ PORT: 'eighty' }), /PORT/);
    assert.throws(() => loadConfig({ DATABASE_URL: 'mysql://x' }), /DATABASE_URL/);
    assert.throws(() => loadConfig({ PUBLIC_ORIGIN: 'javascript:alert(1)' }), /PUBLIC_ORIGIN/);
    assert.throws(() => loadConfig({ CORS_ORIGINS: 'https://ok.com,not a url' }), /CORS_ORIGINS/);
    assert.throws(() => loadConfig({ NODE_ENV: 'staging' }), /NODE_ENV/);
    assert.throws(() => loadConfig({ SESSION_COOKIE_SECURE: 'maybe' }), /SESSION_COOKIE_SECURE/);
    assert.throws(() => loadConfig({ TRUST_PROXY: '-1' }), /TRUST_PROXY/);
  });

  test('parses lists, origins and numbers', () => {
    const c = loadConfig({
      CORS_ORIGINS: ' http://localhost:5173/ , https://a.example.com ',
      PUBLIC_ORIGIN: 'https://islambadran.com/some/path',
      TRUST_PROXY: '1',
      DATABASE_POOL_MAX: '25',
      SESSION_COOKIE_SECURE: 'true',
      API_DOCS: 'false',
      REDIS_URL: 'redis://cache:6379',
    });
    assert.deepEqual(c.corsOrigins, ['http://localhost:5173', 'https://a.example.com']);
    assert.equal(c.publicOrigin, 'https://islambadran.com');
    assert.equal(c.trustProxy, 1);
    assert.equal(c.databasePoolMax, 25);
    assert.equal(c.cookieSecure, true);
    assert.equal(c.cookieName, '__Host-pf_session');
    assert.equal(c.apiDocs, false);
    assert.equal(c.redisUrl, 'redis://cache:6379');
  });

  test('empty strings mean unset', () => {
    const c = loadConfig({ DATABASE_URL: '', REDIS_URL: '', IP_HASH_SECRET: '' });
    assert.equal(c.databaseUrl, undefined);
    assert.equal(c.redisUrl, undefined);
    assert.equal(c.ipHashSecret, undefined);
  });
});
