import test from 'node:test';
import assert from 'node:assert/strict';

// Session-7 regression tests: the NaN death spiral that blanked the 3D scene
// (missing avatar / black screen) on ~30% of sanctuary entries.
//
// Root cause chain (all verified live with instrumentation):
//   BehaviorDirector inspect branch read poi.stand[2] (undefined on the
//   [x, z] stand arrays) → atan2(finite, NaN) = NaN → navigateTo(NaN yaw) →
//   targetYaw = NaN → _lerpAngle spread NaN into root.rotation.y →
//   CameraDirector composition (fwd/right from jYaw) made desiredPos NaN →
//   camera.position.lerp(NaN) → every vertex NaN → black screen forever.

import { POIS, computeInspectYaw } from '../../src/nexus/world/BehaviorDirector.js';
import { JarvisCharacterController } from '../../src/nexus/world/JarvisCharacterController.js';

test('every POI yields a finite inspect yaw (the original bug: stand[2] was undefined)', () => {
  assert.ok(POIS.length >= 8, `expected the POI table, got ${POIS.length} entries`);
  for (const poi of POIS) {
    const yaw = computeInspectYaw(poi);
    assert.ok(
      Number.isFinite(yaw),
      `yaw not finite for stand=${JSON.stringify(poi.stand)} look=${JSON.stringify(poi.look)}`
    );
  }
});

test('inspect yaw is a sensible facing angle (|yaw| <= π)', () => {
  for (const poi of POIS) {
    const yaw = computeInspectYaw(poi);
    assert.ok(Math.abs(yaw) <= Math.PI, `yaw ${yaw} out of range`);
  }
});

test('_lerpAngle never propagates NaN (armor)', () => {
  const lerp = JarvisCharacterController.prototype._lerpAngle;
  // healthy operation
  assert.ok(Math.abs(lerp.call(null, 0, Math.PI / 2, 0.5) - Math.PI / 4) < 1e-9);
  // poisoned target → keep current
  assert.equal(lerp.call(null, 1.2, NaN, 0.5), 1.2);
  // poisoned current → snap to target
  assert.equal(lerp.call(null, NaN, 0.7, 0.5), 0.7);
  // both poisoned → safe zero
  assert.equal(lerp.call(null, NaN, Infinity, 0.5), 0);
});

test('navigateTo rejects a NaN target yaw instead of poisoning the character', () => {
  // Minimal fake instance: navigateTo only touches the fields below.
  const fake = {
    urgentRun: false,
    postureMode: '',
    emotionalState: '',
    targetYaw: 0.5,
    root: { position: { x: 0, z: 0 } },
    waypoints: [],
  };
  JarvisCharacterController.prototype.navigateTo.call(
    fake, 2, 3, NaN, { posture: 'console_interaction' }
  );
  assert.equal(fake.targetYaw, 0.5, 'previous yaw must be kept when commanded yaw is NaN');
  // The walk itself is still planned — only the poisoned yaw is ignored, and
  // the locomotion turn recomputes a valid desiredYaw from the waypoint.
  assert.equal(fake.waypoints.length, 1, 'goal waypoint still planned');
});

test('navigateTo with non-finite coordinates is ignored entirely', () => {
  const fake = {
    urgentRun: false,
    postureMode: '',
    emotionalState: '',
    targetYaw: 0.5,
    root: { position: { x: 0, z: 0 } },
    waypoints: [],
  };
  JarvisCharacterController.prototype.navigateTo.call(
    fake, NaN, 3, 1.0, { posture: 'console_interaction' }
  );
  assert.equal(fake.targetYaw, 1.0, 'finite yaw is accepted');
  assert.equal(fake.waypoints.length, 0, 'no waypoint planned for a NaN destination');
});

test('navigateTo with finite values still plans a waypoint (no behavior regression)', () => {
  const fake = {
    urgentRun: false,
    postureMode: '',
    emotionalState: '',
    targetYaw: 0,
    root: { position: { x: 0, z: 0 } },
    waypoints: [],
  };
  JarvisCharacterController.prototype.navigateTo.call(
    fake, 4, 4, 1.0, { posture: 'console_interaction' }
  );
  assert.equal(fake.targetYaw, 1.0);
  assert.equal(fake.waypoints.length, 1, 'goal waypoint planned');
});
