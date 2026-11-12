import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METAHUMAN_TO_MIXAMO,
  REQUIRED_MIXAMO_BONES,
  detectSkeletonConvention,
  aliasBoneName,
  VISEME_ARKIT_FALLBACK,
  METAHUMAN_ARKIT_51,
} from '../../src/nexus/vendor/skeletonMaps.mjs';

test('MetaHuman map covers every core bone the controller dereferences', () => {
  // The controller/retargeter/posture/gaze code looks up Mixamo names; if the
  // map missed one, the MetaHuman model would silently lose that joint.
  const mapped = new Set(Object.values(METAHUMAN_TO_MIXAMO));
  for (const bone of REQUIRED_MIXAMO_BONES) {
    assert.ok(mapped.has(bone), `missing mapping for ${bone}`);
  }
});

test('MetaHuman map is one-to-one (no alias collisions)', () => {
  const values = Object.values(METAHUMAN_TO_MIXAMO);
  assert.equal(new Set(values).size, values.length);
  // raw names are unique keys by construction; verify none maps to another key
  for (const [raw, mix] of Object.entries(METAHUMAN_TO_MIXAMO)) {
    assert.notEqual(raw, mix);
  }
});

test('convention detection: UE5 names vs Mixamo names', () => {
  const ue5Bones = (n) => ['pelvis', 'spine_01', 'upperarm_l', 'thigh_l', 'head'].includes(n);
  assert.equal(detectSkeletonConvention(ue5Bones), 'metahuman');
  const mixamoBones = (n) => ['Hips', 'Spine', 'LeftArm', 'LeftUpLeg', 'Head'].includes(n);
  assert.equal(detectSkeletonConvention(mixamoBones), 'mixamo');
  // an empty/unknown rig must never claim the MetaHuman path
  assert.equal(detectSkeletonConvention(() => false), 'mixamo');
});

test('aliasBoneName maps UE5 names, strips mixamorig prefixes, passes unknowns through', () => {
  assert.equal(aliasBoneName('pelvis', 'metahuman'), 'Hips');
  assert.equal(aliasBoneName('upperarm_l', 'metahuman'), 'LeftArm');
  assert.equal(aliasBoneName('thumb_02_r', 'metahuman'), 'RightHandThumb2');
  // twist bones have no Mixamo equivalent → passed through untouched
  assert.equal(aliasBoneName('lowerarm_twist_l', 'metahuman'), 'lowerarm_twist_l');
  // mixamo convention: prefix stripping only
  assert.equal(aliasBoneName('mixamorig:Hips', 'mixamo'), 'Hips');
  assert.equal(aliasBoneName('mixamorigLeftArm', 'mixamo'), 'LeftArm');
  assert.equal(aliasBoneName('Hips', 'mixamo'), 'Hips');
  // source rigs (xbot/walk FBX) keep Mixamo names under either convention
  assert.equal(aliasBoneName('mixamorig:Hips', 'metahuman'), 'Hips');
});

test('every viseme has a valid ARKit fallback mix (rigs without Oculus visemes)', () => {
  const arkit = new Set(METAHUMAN_ARKIT_51);
  const visemes = [
    'viseme_sil', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD',
    'viseme_kk', 'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR',
    'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U',
  ];
  for (const v of visemes) {
    const mix = VISEME_ARKIT_FALLBACK[v];
    assert.ok(mix, `missing fallback for ${v}`);
    assert.ok(Object.keys(mix).length > 0, `${v} fallback is empty`);
    for (const [name, weight] of Object.entries(mix)) {
      assert.ok(arkit.has(name), `${v} fallback targets non-ARKit shape '${name}'`);
      assert.ok(weight > 0 && weight <= 1, `${v}.${name} weight out of range: ${weight}`);
    }
  }
  // silence must not yank the jaw open
  assert.deepEqual(VISEME_ARKIT_FALLBACK.viseme_sil, { mouthClose: 0.5 });
});

test('ARKit-51 list matches the metahuman-to-glb export (51 unique shapes)', () => {
  assert.equal(METAHUMAN_ARKIT_51.length, 51);
  assert.equal(new Set(METAHUMAN_ARKIT_51).size, 51);
  // canonical naming (lowerCamel, left/right pairs)
  assert.ok(METAHUMAN_ARKIT_51.includes('jawOpen'));
  assert.ok(METAHUMAN_ARKIT_51.includes('mouthSmileLeft'));
  assert.ok(METAHUMAN_ARKIT_51.includes('noseSneerRight'));
  // tongueOut intentionally absent upstream without a non-default rig variant
  assert.ok(!METAHUMAN_ARKIT_51.includes('tongueOut'));
});
