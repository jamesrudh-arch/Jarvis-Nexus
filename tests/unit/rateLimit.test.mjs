import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authFailuresExceeded,
  authRetryAfterSec,
  consumeGeneralRequest,
  registerAuthFailure,
  resetRateLimits,
} from '../../src/lib/nexus/rateLimit.ts';

const IP = '203.0.113.7';

test('rateLimit: no failures → allowed', () => {
  resetRateLimits();
  assert.equal(authFailuresExceeded(IP), false);
});

test('rateLimit: 4 failures → still allowed, 5th → locked out', () => {
  resetRateLimits();
  const t = 1_000_000;
  for (let i = 0; i < 4; i++) registerAuthFailure(IP, t + i);
  assert.equal(authFailuresExceeded(IP, t + 10), false);
  registerAuthFailure(IP, t + 10);
  assert.equal(authFailuresExceeded(IP, t + 11), true);
});

test('rateLimit: lockout expires after the 60s window', () => {
  resetRateLimits();
  const t = 1_000_000;
  for (let i = 0; i < 5; i++) registerAuthFailure(IP, t + i);
  assert.equal(authFailuresExceeded(IP, t + 30_000), true);
  // 1 ms past the oldest failure + 60 s → window has moved on
  assert.equal(authFailuresExceeded(IP, t + 60_001), false);
});

test('rateLimit: Retry-After seconds computed from the oldest failure', () => {
  resetRateLimits();
  const t = 1_000_000;
  for (let i = 0; i < 5; i++) registerAuthFailure(IP, t);
  const retry = authRetryAfterSec(IP, t + 10_000);
  assert.equal(retry, 50);
  assert.equal(authRetryAfterSec('198.51.100.9', t), 0, 'unknown IP → 0');
});

test('rateLimit: general cap allows 240/min, blocks the 241st', () => {
  resetRateLimits();
  const t = 2_000_000;
  let ok = true;
  for (let i = 0; i < 240; i++) ok = consumeGeneralRequest(IP, t + i) && ok;
  assert.equal(ok, true);
  assert.equal(consumeGeneralRequest(IP, t + 240), false);
});

test('rateLimit: general window slides — old requests age out', () => {
  resetRateLimits();
  const t = 3_000_000;
  for (let i = 0; i < 240; i++) consumeGeneralRequest(IP, t + i);
  assert.equal(consumeGeneralRequest(IP, t + 60_001), true);
});

test('rateLimit: separate IPs have separate budgets', () => {
  resetRateLimits();
  const t = 4_000_000;
  for (let i = 0; i < 5; i++) registerAuthFailure(IP, t + i);
  assert.equal(authFailuresExceeded(IP, t + 1), true);
  assert.equal(authFailuresExceeded('198.51.100.1', t + 1), false);
});
