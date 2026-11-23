// @ts-check
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';
import { generateToken, hashToken, safeEqual, hashIp } from '../../src/lib/tokens.js';
import { escapeLike } from '../../src/lib/sql.js';
import { toErrorResponse } from '../../src/plugins/errors.js';
import { AppError } from '../../src/lib/errors.js';
import { inquiryCreateSchema } from '@portfolio/validation';

const FAST = { N: 2 ** 10, r: 8, p: 1 };

describe('password hashing', () => {
  test('hash has the documented format and verifies', async () => {
    const h = await hashPassword('a long enough password', FAST);
    assert.match(h, /^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.equal(await verifyPassword('a long enough password', h), true);
  });

  test('wrong password fails', async () => {
    const h = await hashPassword('a long enough password', FAST);
    assert.equal(await verifyPassword('a long enough passworD', h), false);
    assert.equal(await verifyPassword('', h), false);
  });

  test('salted: same password gives different hashes', async () => {
    const [a, b] = await Promise.all([hashPassword('same password here', FAST), hashPassword('same password here', FAST)]);
    assert.notEqual(a, b);
  });

  test('default parameters are N=2^15', async () => {
    const h = await hashPassword('default cost password');
    assert.ok(h.startsWith('scrypt$32768$8$1$'));
    assert.equal(await verifyPassword('default cost password', h), true);
  });

  test('malformed or hostile hashes are rejected without throwing', async () => {
    for (const bad of ['', 'plain', 'scrypt$1024$8$1$abc', 'bcrypt$1$2$3$4$5', 'scrypt$1000$8$1$c2FsdHNhbHQ=$aGFzaA==', `scrypt$${2 ** 24}$8$1$c2FsdHNhbHQ=$${Buffer.alloc(64).toString('base64')}`]) {
      assert.equal(await verifyPassword('x', bad), false, bad);
    }
  });

  test('unicode passwords are NFKC-normalised', async () => {
    const h = await hashPassword('ﬁne password ok', FAST); // U+FB01 ligature
    assert.equal(await verifyPassword('fine password ok', h), true);
  });
});

describe('tokens', () => {
  test('generateToken is 256-bit base64url and unique', () => {
    const a = generateToken();
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, generateToken());
  });

  test('hashToken is SHA-256 (32 bytes) and deterministic', () => {
    const h = hashToken('abc');
    assert.equal(h.length, 32);
    assert.equal(h.toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.deepEqual(hashToken('abc'), h);
  });

  test('safeEqual compares regardless of length', () => {
    assert.equal(safeEqual('same', 'same'), true);
    assert.equal(safeEqual('same', 'different-length'), false);
    assert.equal(safeEqual('', 'x'), false);
  });

  test('hashIp is a keyed HMAC', () => {
    const a = hashIp('k'.repeat(32), '203.0.113.7');
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, hashIp('k'.repeat(32), '203.0.113.7'));
    assert.notEqual(a, hashIp('j'.repeat(32), '203.0.113.7'));
    assert.ok(!a.includes('203'));
  });
});

describe('escapeLike', () => {
  test('escapes %, _ and backslash', () => {
    assert.equal(escapeLike('100%'), '100\\%');
    assert.equal(escapeLike('a_b'), 'a\\_b');
    assert.equal(escapeLike('c:\\path'), 'c:\\\\path');
    assert.equal(escapeLike('%_\\'), '\\%\\_\\\\');
  });

  test('leaves other characters (incl. quotes) untouched; parameters handle those', () => {
    assert.equal(escapeLike("O'Brien; DROP TABLE x;--"), "O'Brien; DROP TABLE x;--");
  });
});

describe('toErrorResponse', () => {
  test('AppError passes through', () => {
    assert.deepEqual(toErrorResponse(new AppError(404, 'NOT_FOUND', 'nope')), { status: 404, code: 'NOT_FOUND', message: 'nope', details: undefined });
  });

  test('ZodError becomes VALIDATION_ERROR with field details', () => {
    const r = inquiryCreateSchema.safeParse({ name: '', type: 'nope' });
    assert.equal(r.success, false);
    const out = toErrorResponse(r.error);
    assert.equal(out.status, 400);
    assert.equal(out.code, 'VALIDATION_ERROR');
    const fields = /** @type {any[]} */ (out.details).map((d) => d.field);
    assert.ok(fields.includes('name') && fields.includes('type') && fields.includes('message'));
  });

  test('unknown errors become a generic 500 without internals', () => {
    const err = Object.assign(new Error('relation "secret_table" does not exist'), { code: '42P01' });
    const out = toErrorResponse(err);
    assert.deepEqual(out, { status: 500, code: 'INTERNAL', message: 'Internal server error' });
  });

  test('fastify parser errors map to contract codes', () => {
    assert.equal(toErrorResponse({ statusCode: 413, code: 'FST_ERR_CTP_BODY_TOO_LARGE' }).code, 'PAYLOAD_TOO_LARGE');
    assert.equal(toErrorResponse({ statusCode: 415, code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE' }).code, 'UNSUPPORTED_MEDIA_TYPE');
    assert.equal(toErrorResponse({ statusCode: 400, code: 'FST_ERR_CTP_INVALID_JSON_BODY' }).code, 'VALIDATION_ERROR');
    assert.equal(toErrorResponse({ statusCode: 418 }).status, 400);
  });
});
