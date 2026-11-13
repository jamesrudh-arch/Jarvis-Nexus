import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOwnerKey, ownerKeyFromRequest } from '../../src/lib/nexus/ownerAuth.ts';

/**
 * Gate 0 — owner-key guard unit tests (production Next.js app).
 *
 * The guard must: deny by default when OWNER_KEY is unset; accept the key via
 * X-Owner-Key OR Authorization: Bearer; reject missing and wrong keys; never
 * echo key material in rejection reasons.
 */

const SECRET = 'unit-test-owner-key-3f9a';

function req(headers) {
  return new Request('http://localhost:3000/api/v1/memories', { method: 'POST', headers });
}

test('deny-by-default: no OWNER_KEY configured means privileged ops stay locked', () => {
  delete process.env.OWNER_KEY;
  const r = checkOwnerKey(req({ 'X-Owner-Key': SECRET }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /locked/i);
});

test('missing key rejected with instructive reason (never leaks the secret)', () => {
  process.env.OWNER_KEY = SECRET;
  const r = checkOwnerKey(req({}));
  assert.equal(r.ok, false);
  assert.match(r.reason, /owner key required/i);
  assert.ok(!r.reason.includes(SECRET));
});

test('correct key via X-Owner-Key accepted', () => {
  process.env.OWNER_KEY = SECRET;
  assert.deepEqual(checkOwnerKey(req({ 'X-Owner-Key': SECRET })), { ok: true });
});

test('correct key via Authorization: Bearer accepted', () => {
  process.env.OWNER_KEY = SECRET;
  assert.deepEqual(checkOwnerKey(req({ Authorization: `Bearer ${SECRET}` })), { ok: true });
});

test('wrong key rejected, reason never contains either key value', () => {
  process.env.OWNER_KEY = SECRET;
  const r = checkOwnerKey(req({ 'X-Owner-Key': 'attacker-guess-000' }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /invalid owner key/i);
  assert.ok(!r.reason.includes('attacker-guess-000'));
  assert.ok(!r.reason.includes(SECRET));
});

test('Bearer with wrong key rejected', () => {
  process.env.OWNER_KEY = SECRET;
  assert.equal(checkOwnerKey(req({ Authorization: 'Bearer nope' })).ok, false);
});

test('ownerKeyFromRequest prefers X-Owner-Key, falls back to Bearer, else null', () => {
  assert.equal(ownerKeyFromRequest(req({ 'X-Owner-Key': 'k1', Authorization: 'Bearer k2' })), 'k1');
  assert.equal(ownerKeyFromRequest(req({ Authorization: 'Bearer k2' })), 'k2');
  assert.equal(ownerKeyFromRequest(req({ Authorization: 'bearer k2' })), 'k2');
  assert.equal(ownerKeyFromRequest(req({})), null);
  assert.equal(ownerKeyFromRequest(req({ Authorization: 'Basic abc' })), null);
  assert.equal(ownerKeyFromRequest(req({ 'X-Owner-Key': '   ' })), null);
});

test('key with surrounding whitespace is trimmed before comparison', () => {
  process.env.OWNER_KEY = SECRET;
  assert.deepEqual(checkOwnerKey(req({ 'X-Owner-Key': `  ${SECRET}  ` })), { ok: true });
});

test('length-mismatched key still rejected cleanly (constant-time path)', () => {
  process.env.OWNER_KEY = SECRET;
  const r = checkOwnerKey(req({ 'X-Owner-Key': 'short' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'Invalid owner key.');
});

// Restore a clean env for other tests in this process.
test('teardown', () => {
  delete process.env.OWNER_KEY;
});
