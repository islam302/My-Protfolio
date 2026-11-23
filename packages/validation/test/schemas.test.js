import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inquiryCreateSchema, inquiryUpdateSchema, inquiryListQuerySchema, loginSchema, LIMITS } from '../src/index.js';

const valid = { name: 'Sara', type: 'web', budget: '', timeline: 'In 3–6 months', message: 'A booking site for my clinic, Arabic first.', channel: 'whatsapp' };

test('accepts a valid brief and normalises empty selects to null', () => {
  const r = inquiryCreateSchema.parse(valid);
  assert.equal(r.budget, null);
  assert.equal(r.timeline, 'In 3–6 months');
});

test('rejects unknown keys (mass assignment)', () => {
  assert.equal(inquiryCreateSchema.safeParse({ ...valid, status: 'replied' }).success, false);
});

test('rejects values outside the enums', () => {
  assert.equal(inquiryCreateSchema.safeParse({ ...valid, type: 'hack' }).success, false);
  assert.equal(inquiryCreateSchema.safeParse({ ...valid, budget: '$1' }).success, false);
  assert.equal(inquiryCreateSchema.safeParse({ ...valid, channel: 'sms' }).success, false);
});

test('enforces message length after trimming and strips control chars', () => {
  assert.equal(inquiryCreateSchema.safeParse({ ...valid, message: '   short    ' }).success, false);
  assert.equal(inquiryCreateSchema.safeParse({ ...valid, message: 'x'.repeat(LIMITS.messageMax + 1) }).success, false);
  const r = inquiryCreateSchema.parse({ ...valid, name: 'Sa\u0000ra\u001b' });
  assert.equal(r.name, 'Sara');
});

test('update requires at least one field', () => {
  assert.equal(inquiryUpdateSchema.safeParse({}).success, false);
  assert.equal(inquiryUpdateSchema.safeParse({ status: 'read' }).success, true);
  assert.equal(inquiryUpdateSchema.safeParse({ status: 'deleted' }).success, false);
});

test('list query coerces and bounds pagination', () => {
  const q = inquiryListQuerySchema.parse({ page: '2', pageSize: '50' });
  assert.deepEqual([q.page, q.pageSize, q.sort], [2, 50, '-createdAt']);
  assert.equal(inquiryListQuerySchema.safeParse({ pageSize: '1000' }).success, false);
});

test('login lowercases email', () => {
  assert.equal(loginSchema.parse({ email: ' Admin@Example.COM ', password: 'x' }).email, 'admin@example.com');
});
