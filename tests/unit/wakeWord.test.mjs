import test from 'node:test';
import assert from 'node:assert/strict';

// Session-7 voice tests: wake-word decision core (pure function, extracted
// from the browser-bound engine so the behavioural contract is testable
// without a microphone) + switch-gate semantics documented against the API.

import { classifyTranscript } from '../../src/nexus/wakeWord.ts';

test('STANDBY: "Hey JARVIS" variants activate the engine', () => {
  for (const phrase of [
    'Hey JARVIS', 'hey jarvis', 'Hey Jervis', 'OK jarvis', 'Okay Jarvis',
    '你好贾维斯', '贾维斯', '  hey   jarvis  ',
  ]) {
    const d = classifyTranscript(phrase, 'standby');
    assert.equal(d.action, 'wake', `"${phrase}" should wake`);
  }
});

test('STANDBY: wake phrase with an inline instruction carries the tail', () => {
  const d = classifyTranscript('Hey JARVIS what is the turbine status', 'standby');
  assert.equal(d.action, 'wake');
  assert.match(d.payload, /turbine status/);
});

test('STANDBY: non-wake speech is ignored (no network, no activation)', () => {
  for (const phrase of ['what is the weather', 'hello there', '', '   ']) {
    const d = classifyTranscript(phrase, 'standby');
    assert.equal(d.action, 'ignore', `"${phrase}" must be ignored in standby`);
  }
});

test('ACTIVE: sleep phrases stand down', () => {
  for (const phrase of ['go to sleep', 'stand by', 'standby', 'that will be all', '休眠']) {
    const d = classifyTranscript(phrase, 'active');
    assert.equal(d.action, 'sleep', `"${phrase}" should stand down`);
  }
});

test('ACTIVE: instructions pass through with the wake prefix stripped', () => {
  const d = classifyTranscript('Hey jarvis run the diagnostic on manifold B-4', 'active');
  assert.equal(d.action, 'utterance');
  assert.equal(d.payload, 'run the diagnostic on manifold B-4');
  const plain = classifyTranscript('run the diagnostic', 'active');
  assert.equal(plain.action, 'utterance');
  assert.equal(plain.payload, 'run the diagnostic');
});

test('noise-robust normalization: punctuation and case do not defeat matching', () => {
  const d = classifyTranscript('Hey, JARVIS! ...', 'standby');
  assert.equal(d.action, 'wake');
});
