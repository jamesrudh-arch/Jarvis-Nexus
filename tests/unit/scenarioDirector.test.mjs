import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ScenarioDirector3D } from '../../src/nexus/world/ScenarioDirector3D.js';

/** Minimal but structurally faithful cryo scenario definition (mirrors seed.ts). */
function cryoDef() {
  return {
    id: 'cryo_manifold_forensic',
    title: 'Cryo Manifold Forensic Reconstruction',
    classification: 'measured_fact',
    summary: 'Reconstruction of the B-4 flange rupture.',
    duration_sec: 20,
    variables: [
      { key: 'line_pressure_mpa', label: 'Line Pressure', min: 120, max: 260, default: 210, step: 1, unit: 'MPa' },
      { key: 'relief_valve_ms', label: 'Relief Valve Delay', min: 40, max: 200, default: 125, step: 1, unit: 'ms' },
    ],
    branches: [
      { id: 'rupture', condition: 'line_pressure_mpa >= 185 and relief_valve_ms > 70', label: 'Rupture', outcome: 'Flange B-4 fractures', severity: 'critical' },
      { id: 'contained', condition: 'otherwise', label: 'Contained', outcome: 'Early venting prevents fracture', severity: '' },
    ],
    timeline: [
      { t: 0, phase: 'Baseline', camera: 'scenario_wide', narration: 'n' },
      { t: 11.2, phase: 'Stress Spike', camera: 'scenario_origin_closeup', narration: 'n' },
    ],
    actors_props: { voxel_structure: 'cryo_manifold_riser' },
    evidence_notes: [],
  };
}

test('B3 regression: Media Wall feed branch now matches the rupture reality', () => {
  const director = new ScenarioDirector3D(new THREE.Scene());
  director.loadScenario(cryoDef(), {
    variables: { line_pressure_mpa: 210, relief_valve_ms: 125 },
    playing: true,
    current_time: 0,
    playback_rate: 1,
  });

  // Rupture conditions: the stage fractures AND the feed must say so too.
  // (Before the fix, the `and` condition never parsed, so the wall always
  // showed the safe/contained branch while the stage publicly ruptured.)
  let feed = director.getMediaFeedState();
  assert.equal(feed.branch.id, 'rupture');
  assert.equal(feed.branch.severity, 'critical');

  // Mitigated: early valve actuation flips both stage math and feed branch.
  director.updateVariables({ relief_valve_ms: 60 });
  feed = director.getMediaFeedState();
  assert.equal(feed.branch.id, 'contained');

  // Back to rupture by pressure alone.
  director.updateVariables({ line_pressure_mpa: 250, relief_valve_ms: 125 });
  feed = director.getMediaFeedState();
  assert.equal(feed.branch.id, 'rupture');

  director.clearStage();
  assert.equal(director.activeScenario, null);
  assert.equal(director.getMediaFeedState(), null);
});

test('clearStage fully disposes geometry and materials (no leaks)', () => {
  const director = new ScenarioDirector3D(new THREE.Scene());
  director.loadScenario(cryoDef(), { variables: {}, playing: false });
  assert.ok(director.stageRoot.children.length > 0, 'stage should be populated');

  const geometries = [];
  const materials = [];
  director.stageRoot.traverse((o) => {
    if (o.geometry) geometries.push(o.geometry);
    if (o.material) materials.push(...(Array.isArray(o.material) ? o.material : [o.material]));
  });
  assert.ok(geometries.length > 0 && materials.length > 0);

  // three.js signals GPU-side disposal via a 'dispose' event — count them.
  let geoDisposed = 0;
  let matDisposed = 0;
  for (const g of geometries) g.addEventListener('dispose', () => { geoDisposed++; });
  for (const m of materials) m.addEventListener('dispose', () => { matDisposed++; });

  director.clearStage();
  assert.equal(director.stageRoot.children.length, 0);
  // >= because the stage builders also add deferred/emitter children after
  // loadScenario() returns; every collected object must be disposed.
  assert.ok(geoDisposed >= geometries.length, `geometry disposals (${geoDisposed}) < collected (${geometries.length})`);
  assert.ok(matDisposed >= materials.length, `material disposals (${matDisposed}) < collected (${materials.length})`);
  assert.equal(director.holoMats.length, 0);
  assert.equal(director.worldAnchors.length, 0);
});
