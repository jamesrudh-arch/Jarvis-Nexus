import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFaceTrack,
  sampleCurveValues,
  isCurveDriven,
} from '../../src/nexus/vendor/faceCurve.mjs';

const goodTrack = {
  fps: 30,
  durationMs: 4000,
  curves: {
    jawOpen: [0, 0.5, 1, 0.5, 0],
    mouthClose: [1, 0.5, 0, 0.5, 1],
    browInnerUp: [0.1, 0.2, 0.3, 0.2, 0.1],
    cheekPuff: [0, 0, 0, 0, 0],
  },
};

test('validateFaceTrack accepts a well-formed track and keeps every curve', () => {
  const t = validateFaceTrack(goodTrack);
  assert.ok(t);
  assert.equal(t.fps, 30);
  assert.equal(t.durationMs, 4000);
  assert.equal(Object.keys(t.curves).length, 4);
  assert.ok(t.curves.jawOpen instanceof Float32Array);
});

test('validateFaceTrack rejects malformed payloads (fail-safe to local engines)', () => {
  assert.equal(validateFaceTrack(null), null);
  assert.equal(validateFaceTrack(undefined), null);
  assert.equal(validateFaceTrack({}), null);
  assert.equal(validateFaceTrack({ fps: 30, durationMs: 100, curves: {} }), null);
  // fps out of sane bounds
  assert.equal(validateFaceTrack({ ...goodTrack, fps: 2 }), null);
  assert.equal(validateFaceTrack({ ...goodTrack, fps: 999 }), null);
  // non-positive duration
  assert.equal(validateFaceTrack({ ...goodTrack, durationMs: 0 }), null);
  // fewer than 4 shapes is not a real neural track
  assert.equal(
    validateFaceTrack({ fps: 30, durationMs: 4000, curves: { jawOpen: [0, 1], mouthClose: [1, 0] } }),
    null
  );
  // curves containing non-finite entries are dropped individually
  const t = validateFaceTrack({
    fps: 30,
    durationMs: 4000,
    curves: { ...goodTrack.curves, badShape: [0, 'x', 1, 0.5, 0] },
  });
  assert.ok(t);
  assert.equal(Object.keys(t.curves).length, 4); // badShape dropped, rest kept
});

test('validateFaceTrack clamps overscan and negative values into [0, 1.5]', () => {
  const t = validateFaceTrack({
    fps: 30,
    durationMs: 1000,
    curves: { a: [0, 3, -2, 0.5], b: [0, 1, 0, 0.5], c: [0, 0.2, 0.4, 0.6], d: [1, 0.8, 0.6, 0.4] },
  });
  assert.ok(t);
  assert.equal(t.curves.a[1], 1.5); // clamped high
  assert.equal(t.curves.a[2], 0);   // clamped low
});

test('sampleCurveValues interpolates linearly between frames', () => {
  const t = validateFaceTrack(goodTrack);
  const at0 = sampleCurveValues(t, 0);
  assert.equal(at0.jawOpen, 0);
  // frame 0.5 at 30fps → 16.667ms → halfway between 0 and 0.5
  const atHalf = sampleCurveValues(t, 1000 / 30 / 2);
  assert.ok(Math.abs(atHalf.jawOpen - 0.25) < 1e-6);
  // exact frame 1 → 33.333ms
  const at1 = sampleCurveValues(t, 1000 / 30);
  assert.ok(Math.abs(at1.jawOpen - 0.5) < 1e-6);
});

test('sampleCurveValues clamps out-of-range times to the track ends', () => {
  const t = validateFaceTrack(goodTrack);
  assert.equal(sampleCurveValues(t, -50).jawOpen, 0);           // before start
  assert.equal(sampleCurveValues(t, 60_000).jawOpen, 0);        // after end → last frame value
  assert.equal(sampleCurveValues(t, 60_000).mouthClose, 1);     // last frame of mouthClose
});

test('isCurveDriven: blink and gaze stay LOCAL, mouth/jaw/brow are track-driven', () => {
  // the ownership contract with the local blink/gaze systems
  assert.equal(isCurveDriven('eyeBlinkLeft'), false);
  assert.equal(isCurveDriven('eyeBlinkRight'), false);
  assert.equal(isCurveDriven('eyeLookOutLeft'), false);
  assert.equal(isCurveDriven('eyeLookInRight'), false);
  assert.equal(isCurveDriven('eyeLookUpLeft'), false);
  // driven by the neural track
  assert.equal(isCurveDriven('jawOpen'), true);
  assert.equal(isCurveDriven('jawLeft'), true);
  assert.equal(isCurveDriven('mouthClose'), true);
  assert.equal(isCurveDriven('mouthSmileLeft'), true);
  assert.equal(isCurveDriven('browInnerUp'), true);
  assert.equal(isCurveDriven('cheekPuff'), true);
  assert.equal(isCurveDriven('noseSneerLeft'), true);
  // ambiguous shapes default to local control (fail-safe)
  assert.equal(isCurveDriven('eyeWideLeft'), false);
  assert.equal(isCurveDriven('eyeSquintLeft'), false);
});

test('sampleCurveValues handles degenerate tracks without throwing', () => {
  assert.deepEqual(sampleCurveValues(null, 100), {});
  assert.deepEqual(sampleCurveValues({ fps: 30, durationMs: 10, curves: {} }, 100), {});
  const single = { fps: 30, durationMs: 100, curves: { jawOpen: new Float32Array([0.7]) } };
  assert.ok(Math.abs(sampleCurveValues(single, 0).jawOpen - 0.7) < 1e-6);
  assert.ok(Math.abs(sampleCurveValues(single, 999).jawOpen - 0.7) < 1e-6);
});
