import test from 'node:test';
import assert from 'node:assert/strict';

// Directive §4 "living residents": the steering/PRNG/clamp core is pure and
// unit-tested; the visual layer is verified in the headless scene audit.

import {
  makeRng,
  separationForce,
  clampToFloor,
  RESIDENT_ROSTER,
} from '../../src/nexus/world/ResidentDirector.js';

test('makeRng: deterministic per seed, distinct across seeds', () => {
  const a1 = makeRng('echo-nexus');
  const seq1 = [a1(), a1(), a1()];
  const a2 = makeRng('echo-nexus'); // fresh instance, same seed -> replay
  assert.deepEqual(seq1, [a2(), a2(), a2()], 'same seed -> same sequence');
  assert.notEqual(seq1[0], makeRng('vector-nexus')(), 'different seed -> different sequence');
});

test('separationForce: zero when far, pushes away under the radius', () => {
  const none = separationForce({ x: 0, z: 0 }, [{ x: 10, z: 10 }], 1.35);
  assert.equal(none.x, 0);
  assert.equal(none.z, 0);
  const near = separationForce({ x: 0, z: 0 }, [{ x: 0.5, z: 0 }], 1.35);
  assert.ok(near.x < 0, 'pushed away in -x (neighbour at +x)');
  assert.equal(near.z, 0);
  // strength grows as the neighbour closes in
  const closer = separationForce({ x: 0, z: 0 }, [{ x: 0.2, z: 0 }], 1.35);
  assert.ok(Math.abs(closer.x) > Math.abs(near.x));
});

test('separationForce: exact overlap does not divide by zero', () => {
  const overlap = separationForce({ x: 1, z: 1 }, [{ x: 1, z: 1 }], 1.35);
  assert.ok(Number.isFinite(overlap.x) && Number.isFinite(overlap.z));
});

test('clampToFloor: keeps in-disc points, projects out-disc points to the rim', () => {
  const keep = clampToFloor(1, 2, 12.6);
  assert.equal(keep.x, 1);
  assert.equal(keep.z, 2);
  const out = clampToFloor(30, 0, 12.6);
  assert.ok(Math.abs(Math.hypot(out.x, out.z) - 12.6) < 1e-9, 'projected to the rim');
  assert.ok(out.x > 0, 'same direction preserved');
});

test('resident roster: 4 residents, unique ids, sane homes inside the wander disc', () => {
  assert.equal(RESIDENT_ROSTER.length, 4);
  const ids = new Set(RESIDENT_ROSTER.map((r) => r.id));
  assert.equal(ids.size, RESIDENT_ROSTER.length, 'ids unique');
  for (const r of RESIDENT_ROSTER) {
    assert.ok(Math.hypot(r.home[0], r.home[1]) <= 12.6, `${r.id} home inside the disc`);
    assert.ok(r.pace > 0.3 && r.pace < 1.6, `${r.id} pace sane`);
  }
});

test('resident simulation integration: wander runs, state stays finite + in-bounds, serialize/apply round-trips', async () => {
  // three resolves from node_modules — the math/scene-graph classes work
  // headless (no WebGL until render). Fake scene records add() calls.
  const added = [];
  const fakeScene = { add: (o) => added.push(o), remove: () => {} };
  const { ResidentDirector } = await import('../../src/nexus/world/ResidentDirector.js');
  const rd = new ResidentDirector(fakeScene, {});
  assert.equal(added.length, 1, 'residents group added to the scene');
  assert.equal(rd.residents.length, 4);

  // 300 s of simulation in 0.5 s ticks with a jarvis stand-in
  const jarvis = { x: 1.45, z: 0.95 };
  let sawWalking = false;
  for (let i = 0; i < 600; i += 1) {
    rd.update(0.5, false);
    for (const r of rd.residents) {
      assert.ok(Number.isFinite(r.pos.x) && Number.isFinite(r.pos.y),
        'position finite (NaN would brick the scene graph)');
      assert.ok(Math.hypot(r.pos.x, r.pos.y) <= 12.6 + 1e-6,
        'resident stays inside the wander disc');
    }
    if (rd.residents.some((r) => r.state === 'walking')) sawWalking = true;
  }
  assert.ok(sawWalking, 'autonomous wandering actually happened');

  // serialization round-trip: move a resident, serialize, restore
  const mover = rd.residents[0];
  mover.pos.set(3.3, -4.4);
  const snap = rd.serialize();
  assert.equal(snap.length, 4);
  const echo = snap.find((r) => r.id === 'echo');
  assert.equal(echo.x, 3.3);
  mover.pos.set(0, 0);
  rd.applyState(snap);
  assert.equal(mover.pos.x, 3.3, 'position restored from persisted state');

  // separation from JARVIS: all residents keep distance after long simulation
  const minDist = Math.min(...rd.residents.map(
    (r) => Math.hypot(r.pos.x - jarvis.x, r.pos.y - jarvis.z)));
  assert.ok(minDist > 0.1, `residents do not stand inside JARVIS (min ${minDist.toFixed(2)} m)`);

  rd.dispose();
});
