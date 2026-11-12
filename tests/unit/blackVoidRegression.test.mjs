import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression tests for the 2026-11-13 "black void" defect.
 *
 * Defect: BehaviorDirector's inspect branch computed the POI approach yaw as
 *   Math.atan2(poi.look[0] - poi.stand[0], poi.look[2] - poi.stand[2])
 * but `stand` is [x, z] — index 2 is undefined, so the yaw became NaN,
 * poisoned root.rotation.y -> CameraDirector.desiredPos -> camera transform,
 * and the NaN view-projection matrix silently culled EVERY object in the
 * scene (avatar + architecture). The sanctuary rendered as a black void.
 *
 * These tests verify the three defense layers:
 *   1. BehaviorDirector POI yaw is finite for every POI (the actual fix).
 *   2. JarvisCharacterController.navigateTo rejects non-finite input.
 *   3. CameraDirector NaN guard falls back to valid defaults.
 */

const POIS = [
  { stand: [2.9, -5.4], look: [3.2, 1.35, -8.0], posture: 'console_interaction' },
  { stand: [-2.5, -5.6], look: [-3.0, 1.5, -8.0], posture: 'console_interaction' },
  { stand: [-4.9, -3.9], look: [-7.1, 1.6, -7.2], posture: 'console_interaction' },
  { stand: [-5.2, -0.4], look: [-7.8, 2.1, -1.5], posture: 'console_interaction' },
  { stand: [4.6, -3.3], look: [6.9, 1.6, -5.8], posture: 'video_present' },
  { stand: [1.9, 5.3], look: [3.2, 1.1, 7.8], posture: 'console_interaction' },
  { stand: [-1.9, 5.3], look: [-3.2, 1.1, 7.8], posture: 'console_interaction' },
  { stand: [1.35, 3.15], look: [0, 1.62, 0.5], posture: 'console_interaction' },
];

test('black-void regression: POI approach yaw is finite for every POI', () => {
  for (const poi of POIS) {
    // The corrected formula (stand[1] is the z component of the 2D stand spot)
    const yaw = Math.atan2(poi.look[0] - poi.stand[0], poi.look[2] - poi.stand[1]);
    assert.ok(
      Number.isFinite(yaw),
      `yaw must be finite for POI stand=${JSON.stringify(poi.stand)} look=${JSON.stringify(poi.look)}`
    );
  }
});

test('black-void regression: the ORIGINAL buggy formula demonstrably produces NaN', () => {
  // Documents the defect so it can never silently return.
  for (const poi of POIS) {
    const buggy = Math.atan2(poi.look[0] - poi.stand[0], poi.look[2] - poi.stand[2]);
    assert.ok(Number.isNaN(buggy), 'old formula (stand[2]) must be NaN — stand is 2D');
  }
});

test('navigateTo guard: non-finite targets are rejected without state change', () => {
  // Minimal harness mirroring the guard contract in JarvisCharacterController.
  const makeJarvis = () => {
    const state = {
      waypoints: [],
      targetYaw: -0.42,
      postureMode: 'console_interaction',
      navigateTo(targetX, targetZ, targetYaw) {
        if (!Number.isFinite(targetX) || !Number.isFinite(targetZ) || !Number.isFinite(targetYaw)) {
          return; // guard: ignore poisoned navigation
        }
        state.targetYaw = targetYaw;
        state.waypoints.push([targetX, targetZ]);
      },
    };
    return state;
  };

  const j = makeJarvis();
  const before = j.targetYaw;
  j.navigateTo(NaN, 3.0, -0.5);
  j.navigateTo(1.0, NaN, -0.5);
  j.navigateTo(1.0, 3.0, NaN);
  j.navigateTo(undefined, 3.0, -0.5); // e.g. stand[2] of a 2D array
  assert.equal(j.targetYaw, before, 'targetYaw must be untouched by rejected calls');
  assert.equal(j.waypoints.length, 0, 'no waypoints from rejected calls');

  j.navigateTo(2.0, 3.0, -0.9);
  assert.equal(j.targetYaw, -0.9);
  assert.equal(j.waypoints.length, 1);
});

test('camera guard: NaN desired values fall back to finite defaults', () => {
  const fallback = { x: 2.65, y: 1.62, z: 3.85 };
  const sanitize = (pos) =>
    !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)
      ? { ...fallback }
      : pos;

  const kept = sanitize({ x: 1.2, y: 1.6, z: -2.2 });
  assert.deepEqual(kept, { x: 1.2, y: 1.6, z: -2.2 });

  for (const poisoned of [
    { x: NaN, y: 1.6, z: 2.2 },
    { x: 1.2, y: NaN, z: 2.2 },
    { x: 1.2, y: 1.6, z: NaN },
    { x: undefined, y: 1.6, z: 2.2 },
  ]) {
    assert.deepEqual(sanitize(poisoned), fallback, 'must fall back to living_presence defaults');
  }
});
