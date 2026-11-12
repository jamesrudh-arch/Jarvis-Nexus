/**
 * JARVIS NEXUS — Skeleton convention maps (Directive §14 asset preservation).
 *
 * The live controller speaks Mixamo bone names (the Avaturn rig and the
 * retargeted Mixamo clips share them). The MetaHuman upgrade track
 * (research: github.com/creategamecharacters/metahuman-to-glb — UE 5.7
 * MetaHuman → Draco GLB with 51 ARKit blendshapes, ~40 MB) exports with the
 * standard UE5 skeleton names instead. Rather than rewriting the controller,
 * bones are ALIASED at load time: whichever convention the GLB uses, the
 * controller keeps seeing Mixamo names.
 *
 * ARKit-51 set emitted by that pipeline is listed below for validation; the
 * 52nd ARKit shape (tongueOut) needs a non-default rig variant upstream.
 */

/** Controller/clip-facing (Mixamo) name → nothing needed; identity. */
export const SKELETON_MIXAMO = 'mixamo';
export const SKELETON_METAHUMAN = 'metahuman';

/** UE5 skeleton (metahuman-to-glb output) → Mixamo equivalent. */
export const METAHUMAN_TO_MIXAMO = {
  pelvis: 'Hips',
  spine_01: 'Spine',
  spine_02: 'Spine1',
  spine_03: 'Spine2',
  neck_01: 'Neck',
  head: 'Head',
  // left side
  clavicle_l: 'LeftShoulder',
  upperarm_l: 'LeftArm',
  lowerarm_l: 'LeftForeArm',
  hand_l: 'LeftHand',
  thumb_01_l: 'LeftHandThumb1',
  thumb_02_l: 'LeftHandThumb2',
  thumb_03_l: 'LeftHandThumb3',
  index_01_l: 'LeftHandIndex1',
  index_02_l: 'LeftHandIndex2',
  index_03_l: 'LeftHandIndex3',
  middle_01_l: 'LeftHandMiddle1',
  middle_02_l: 'LeftHandMiddle2',
  middle_03_l: 'LeftHandMiddle3',
  ring_01_l: 'LeftHandRing1',
  ring_02_l: 'LeftHandRing2',
  ring_03_l: 'LeftHandRing3',
  pinky_01_l: 'LeftHandPinky1',
  pinky_02_l: 'LeftHandPinky2',
  pinky_03_l: 'LeftHandPinky3',
  thigh_l: 'LeftUpLeg',
  calf_l: 'LeftLeg',
  foot_l: 'LeftFoot',
  ball_l: 'LeftToeBase',
  // right side
  clavicle_r: 'RightShoulder',
  upperarm_r: 'RightArm',
  lowerarm_r: 'RightForeArm',
  hand_r: 'RightHand',
  thumb_01_r: 'RightHandThumb1',
  thumb_02_r: 'RightHandThumb2',
  thumb_03_r: 'RightHandThumb3',
  index_01_r: 'RightHandIndex1',
  index_02_r: 'RightHandIndex2',
  index_03_r: 'RightHandIndex3',
  middle_01_r: 'RightHandMiddle1',
  middle_02_r: 'RightHandMiddle2',
  middle_03_r: 'RightHandMiddle3',
  ring_01_r: 'RightHandRing1',
  ring_02_r: 'RightHandRing2',
  ring_03_r: 'RightHandRing3',
  pinky_01_r: 'RightHandPinky1',
  pinky_02_r: 'RightHandPinky2',
  pinky_03_r: 'RightHandPinky3',
  thigh_r: 'RightUpLeg',
  calf_r: 'RightLeg',
  foot_r: 'RightFoot',
  ball_r: 'RightToeBase',
};

/** Every bone name the controller/retargeter/posture code dereferences. */
export const REQUIRED_MIXAMO_BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
];
// fingers are a bonus layer (micro-life / pointing); required set above stays core.

/**
 * Detect the skeleton convention of a loaded rig.
 * @param {(name: string) => boolean} hasBone
 * @returns {'mixamo' | 'metahuman'}
 */
export function detectSkeletonConvention(hasBone) {
  // UE5-style: pelvis + laterality suffixes
  if (hasBone('pelvis') && (hasBone('upperarm_l') || hasBone('thigh_l'))) {
    return SKELETON_METAHUMAN;
  }
  return SKELETON_MIXAMO;
}

/**
 * Map a raw bone name to the controller-facing (Mixamo) name.
 * Unknown names (twist bones, IK targets, accessories) pass through as-is.
 */
export function aliasBoneName(rawName, convention) {
  const clean = String(rawName || '').replace(/^mixamorig:/, '').replace(/^mixamorig/, '');
  if (convention === SKELETON_METAHUMAN) {
    return METAHUMAN_TO_MIXAMO[clean] || clean;
  }
  return clean;
}

/**
 * Oculus viseme → ARKit approximation. Our Avaturn rig carries the 15 Oculus
 * visemes; a MetaHuman GLB carries ARKit-51 only. When a viseme morph is
 * missing on the loaded model, `_setMorph` degrades each viseme to this
 * ARKit shape mix so the local rule engines still produce legible speech.
 * (Shape names follow the UE/MetaHuman export convention — mouthFunnel and
 * mouthPucker are single shapes, no Left/Right variants.)
 */
export const VISEME_ARKIT_FALLBACK = {
  viseme_sil: { mouthClose: 0.5 },
  viseme_PP: { mouthClose: 1.0 },
  viseme_FF: { mouthFrownLeft: 0.4, mouthFrownRight: 0.4, jawOpen: 0.08 },
  viseme_TH: { jawOpen: 0.22 },
  viseme_DD: { jawOpen: 0.28 },
  viseme_kk: { jawOpen: 0.34 },
  viseme_CH: { mouthFunnel: 0.55, jawOpen: 0.2 },
  viseme_SS: { mouthFunnel: 0.4, jawOpen: 0.12 },
  viseme_nn: { jawOpen: 0.16 },
  viseme_RR: { mouthPucker: 0.35, jawOpen: 0.14 },
  viseme_aa: { jawOpen: 1.0 },
  viseme_E: { jawOpen: 0.45, mouthStretchLeft: 0.4, mouthStretchRight: 0.4 },
  viseme_I: { jawOpen: 0.2, mouthStretchLeft: 0.5, mouthStretchRight: 0.5 },
  viseme_O: { jawOpen: 0.55, mouthPucker: 0.6 },
  viseme_U: { jawOpen: 0.15, mouthPucker: 0.85 },
};

/**
 * ARKit-51 blendshape set emitted by the metahuman-to-glb pipeline and by
 * NVIDIA Audio2Face-3D (verified against the shipped config_mark/claire.yml
 * multipliers list). UE convention: mouthFunnel/mouthPucker are SINGLE
 * shapes; tongueOut requires a non-default rig variant upstream.
 */
export const METAHUMAN_ARKIT_51 = [
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight',
  'eyeLookUpLeft', 'eyeLookUpRight', 'eyeSquintLeft', 'eyeSquintRight',
  'eyeWideLeft', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel',
  'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthPressLeft',
  'mouthPressRight', 'mouthPucker', 'mouthRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight',
  'noseSneerLeft', 'noseSneerRight',
];
