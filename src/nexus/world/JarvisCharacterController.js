/**
 * JARVIS NEXUS — Embodied Adult Female Character Controller.
 *
 * Implements:
 * - Licensed 66-bone humanoid rig (jarvis_avaturn.glb) + 72 ARKit/Oculus morph targets.
 * - Runtime PBR wardrobe & skin tailoring matching approved pre-production baseline.
 * - Collision-aware navigation around central holo-table, smooth turn-in-place,
 *   walk (1.32 m/s), urgent run (3.25 m/s), damped acceleration/deceleration, zero foot-skating.
 * - Gaze-first head/eye tracking, natural Poisson asymmetric blinking, subtle breathing,
 *   contextual console/scenario/presentation poses, and synchronized viseme lip-sync
 *   with instant mid-speech interruption.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { retarget } from '../vendor/retargeter.mjs';
import { LipsyncEn } from '../vendor/lipsync-en.mjs';
import { LipsyncZh, hasCJK } from '../vendor/lipsync-zh.mjs';
import { validateFaceTrack, sampleCurveValues, isCurveDriven } from '../vendor/faceCurve.mjs';
import {
  detectSkeletonConvention,
  aliasBoneName,
  VISEME_ARKIT_FALLBACK,
} from '../vendor/skeletonMaps.mjs';
import {
  tailorSuitAlbedoTexture,
  createMicroNormalTexture,
  createSoftContactShadowTexture,
} from './ProceduralTextures.js';

const AVATURN_RETARGET = {
  Hips: { y: 0.03 },
  Spine: { y: 0.02 },
  Spine1: { y: 0.02, z: 0.01 },
  Spine2: { y: 0.02, z: 0.01 },
  Neck: { z: 0.02, y: 0.01 },
  Head: { z: 0.02 },
  LeftShoulder: { rx: -0.45 },
  RightShoulder: { rx: -0.45 },
  scaleToHipsLevel: 1.0,
};

const VISEME_NAMES = [
  'viseme_sil', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD',
  'viseme_kk', 'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR',
  'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U',
];

function timeline_lastEnd(timeline) {
  return timeline.length ? timeline[timeline.length - 1].endMs : 1;
}

export class JarvisCharacterController {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'JARVIS_Embodiment_Root';
    this.root.position.set(1.45, 0, 0.95);
    this.root.rotation.y = -0.42;
    this.scene.add(this.root);

    this.armature = null;
    this.mixer = null;
    this.actions = {};
    this.activeActionName = null;
    this.bones = {};
    this.morphMeshes = [];
    this.gestureWorldTarget = null; // when set (scenario directing), she POINTS here
    this._armAimWeight = 0;
    this._audioCtx = null;
    this.voiceAnalyser = null;
    this.activeAudioSource = null;

    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth <= 860;

    // Dedicated character 3-point motivated lighting rig — repositioned every frame
    // RELATIVE TO THE CAMERA so the cyan rim always separates her from the scene
    // and the warm key always flatters the face toward the viewer. (Rig lives in
    // world space, not under root, so it never rotates with her body.)
    this.lightRig = new THREE.Group();
    this.keyLight = new THREE.SpotLight(0xffe4c8, 7.5, 8.5, Math.PI * 0.24, 0.8, 1.4);
    this.keyLight.castShadow = !isSmallScreen; // real contact grounding on desktop-class GPUs
    if (this.keyLight.castShadow) {
      this.keyLight.shadow.mapSize.set(1024, 1024);
      this.keyLight.shadow.bias = -0.0022;
      this.keyLight.shadow.camera.near = 0.4;
      this.keyLight.shadow.camera.far = 8.0;
    }
    this.keyTarget = new THREE.Object3D();
    this.lightRig.add(this.keyTarget);
    this.keyLight.target = this.keyTarget;

    this.fillLight = new THREE.PointLight(0xf5cbb0, 0.5, 5.5, 1.6); // LOW fill — ~3.5:1 key ratio sculpts the face
    this.rimLight = new THREE.PointLight(0x62e6f2, 3.0, 5.5, 1.5);
    // (Light diet E1: the cyan holo-table bounce light was removed — at 0.6
    // intensity it contributed little beyond shader cost, and cyan spill on
    // chest/skin already read as a bad comp. The warm fill absorbs it.)
    // Dedicated soft warm face light — her face is ALWAYS readable, never a dark wax mask
    this.faceLight = new THREE.PointLight(0xffe9d8, 2.4, 3.4, 1.8);
    // Warm low kicker from the key-opposite side — models the dark torso so the
    // outfit keeps form instead of reading as a black cardboard cutout.
    this.kickerLight = new THREE.PointLight(0xffd9b0, 1.5, 6.5, 1.6);
    this.lightRig.add(this.keyLight, this.fillLight, this.rimLight, this.faceLight, this.kickerLight);
    this.scene.add(this.lightRig);

    // Subtle ground contact shadow disc beneath feet (soft radial falloff)
    const contactGeo = new THREE.CircleGeometry(0.4, 40);
    const contactMat = new THREE.MeshBasicMaterial({
      map: createSoftContactShadowTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const contactDisc = new THREE.Mesh(new THREE.CircleGeometry(0.52, 40), contactMat);
    contactMat.opacity = 0.78;
    contactDisc.rotation.x = -Math.PI / 2;
    contactDisc.position.y = 0.006;
    this.root.add(contactDisc);
    // Dense inner core — grounded feet, never a floating mannequin
    const coreDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 32),
      new THREE.MeshBasicMaterial({
        map: createSoftContactShadowTexture(),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      })
    );
    coreDisc.rotation.x = -Math.PI / 2;
    coreDisc.position.y = 0.007;
    this.root.add(coreDisc);

    // Locomotion & Navigation state
    this.waypoints = [];
    this.targetYaw = -0.42;
    this.currentSpeed = 0;
    this.urgentRun = false;
    this.postureMode = 'console_interaction'; // console_interaction | conversational_focus | scenario_construct | scenario_direct | video_present | standby
    this.emotionalState = 'attentive'; // neutral | listening | focused | concerned | urgent
    this.lookWorldTarget = new THREE.Vector3(0, 1.4, 3.5);
    this.focusCamera = true;

    // Blinking & Breathing timers
    this.blinkTimer = 2.4;
    this.blinkPhase = -1;
    this.breathClock = 0;

    // Lip-sync & Speech Engine (mixed-language: En rule engine + Zh pinyin engine)
    this.lipsync = new LipsyncEn();
    this.lipsyncZh = new LipsyncZh();
    this.isSpeaking = false;
    this.speechTimeline = []; // [{ viseme, startMs, endMs }]
    this.speechStartPerf = 0;
    this.activeUtterance = null;
    this.onSpeechEndCallback = null;
    // ARKit blendshape track (Audio2Face-3D chain, §14): when present it is
    // AUTHORITATIVE for mouth/jaw/brow shapes; the local rule engines are the
    // fallback when it is null. Cleared with the visemes on every speech end.
    this.speechFaces = null;

    // Aliveness layer: speech energy envelope, beat-gesture clock, eye saccades.
    // (This is what separates "present person" from "rendered mannequin".)
    this._speechEnergy = 0;        // smoothed RMS 0..1
    this._speechEnergyPeak = 0;     // decaying peak for onset detection
    this._beatPhase = 0;            // beat-gesture oscillator
    this._beatSide = 1;             // alternating gesture side
    this._headAccent = 0;           // impulsive nod on speech stress onsets
    this._saccadeTimer = 1.0;
    this._saccadeOffset = new THREE.Vector3();
    this._saccadeTarget = new THREE.Vector3();

    this.loaded = false;
  }

  async load(onProgress) {
    // Warm the Mandarin lipsync engine (lazy pinyin chunk) alongside assets so
    // the first Chinese utterance never waits on a cold dynamic import.
    this.lipsyncZh.init().catch(() => {});

    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();

    const [avatarGltf, xbotGltf, walkFbx] = await Promise.all([
      gltfLoader.loadAsync('/models/jarvis_avaturn.glb', onProgress),
      gltfLoader.loadAsync('/models/xbot_locomotion.glb'),
      fbxLoader.loadAsync('/models/walking.fbx'),
    ]);

    this.armature = avatarGltf.scene.getObjectByName('Armature') || avatarGltf.scene;
    this.armature.scale.setScalar(1);

    // Skeleton convention: Mixamo-style (Avaturn, today) or UE5/MetaHuman-style
    // (metahuman-to-glb output — Directive §14 upgrade track). Bones are
    // ALIASED to Mixamo names so every downstream system (retarget tables,
    // postures, gaze, fingers) works unchanged across conventions.
    const rawBoneNames = new Set();
    this.armature.traverse((o) => { if (o.isBone) rawBoneNames.add(o.name); });
    this.skeletonConvention = detectSkeletonConvention((n) => rawBoneNames.has(n));
    const convention = this.skeletonConvention;

    // Calibrate skeleton to standard Mixamo coordinate rolls & scale
    // (Avaturn-specific rest-pose calibration — a MetaHuman GLB arrives
    // already calibrated from UE, and applying Avaturn rolls would wreck it.)
    if (convention === 'mixamo') {
      retarget(this.armature, AVATURN_RETARGET);
    }

    // --- Cross-rig quaternion retargeting tables -------------------------------
    // The Avaturn rig's leg bones rest ~180deg (Z) away from the Mixamo
    // convention, so raw Mixamo clip quaternions would flip the legs upward.
    // Every clip quaternion is therefore converted delta-from-rest:
    //   q_target = q_targetRest * inverse(q_sourceRest) * q_sourceAnim
    const captureRest = (root) => {
      const rest = {};
      root.traverse((o) => {
        if (o.isBone) {
          const clean = aliasBoneName(o.name, convention);
          if (!rest[clean]) rest[clean] = o.quaternion.clone();
        }
      });
      return rest;
    };
    const targetRest = captureRest(this.armature); // post-retarget bind pose
    const xbotRest = captureRest(xbotGltf.scene);
    const walkRest = captureRest(walkFbx);
    this._retargetTables = { targetRest, xbotRest, walkRest };

    // Tailor PBR materials to match approved Storyboard Character Direction
    const microNormalSkin = createMicroNormalTexture({ size: 256, scale: 42, strength: 1.15, seed: 811 });
    microNormalSkin.repeat.set(6, 6);
    const weaveNormal = createMicroNormalTexture({ size: 256, scale: 30, strength: 1.0, weave: true, seed: 313 });
    weaveNormal.repeat.set(4, 4);
    // High-frequency strand breakup for the hair surface (kills the carved-slab read)
    const strandNormal = createMicroNormalTexture({ size: 256, scale: 68, strength: 1.5, seed: 77 });
    strandNormal.repeat.set(7, 7);

    const injectFresnelRim = (mat, rimColor, strength, power = 2.8) => {
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float rimFres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), ${power.toFixed(2)});
            totalEmissiveRadiance += vec3(${rimColor[0]}, ${rimColor[1]}, ${rimColor[2]}) * rimFres * ${strength.toFixed(3)};
          }`
        );
      };
      mat.needsUpdate = true;
    };

    this.armature.traverse((obj) => {
      if (obj.isBone) {
        this.bones[aliasBoneName(obj.name, convention)] = obj;
      }
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.frustumCulled = false;

        if (obj.morphTargetDictionary && obj.morphTargetInfluences) {
          this.morphMeshes.push(obj);
        }

        const mat = obj.material;
        if (mat) {
          const mName = (mat.name || obj.name || '').toLowerCase();
          const objName = (obj.name || '').toLowerCase();
          if (mName.includes('look')) {
            // Tailored suit: woven micro normal + cool fresnel rim so cloth separates from the dark room
            mat.map = tailorSuitAlbedoTexture(mat.map);
            mat.normalMap = weaveNormal;
            mat.normalScale = new THREE.Vector2(0.42, 0.42);
            mat.roughness = 0.72;
            mat.metalness = 0.06;
            mat.envMapIntensity = 0.6;
            injectFresnelRim(mat, [0.18, 0.42, 0.48], 0.42);
            mat.needsUpdate = true;
          } else if (mName.includes('hair')) {
            // Hair v4: deep espresso, matte fiber feel, STRAND-LEVEL normal breakup
            // so the mass reads as thousands of fibers, not carved slabs.
            const hairPhys = new THREE.MeshPhysicalMaterial({
              map: mat.map,
              normalMap: strandNormal,
              normalScale: new THREE.Vector2(0.85, 0.85),
              color: 0x1d130d,
              roughness: 0.58,
              metalness: 0.02,
              sheen: 0.35,
              sheenRoughness: 0.55,
              sheenColor: new THREE.Color(0x3d5a66),
              clearcoat: 0.08,
              clearcoatRoughness: 0.5,
              envMapIntensity: 0.75,
            });
            injectFresnelRim(hairPhys, [0.28, 0.62, 0.72], 0.35, 3.2);
            obj.material = hairPhys;
          } else if (mName.includes('shoe')) {
            mat.color = new THREE.Color(0x12161c);
            mat.roughness = 0.42;
            mat.metalness = 0.12;
            mat.needsUpdate = true;
          } else if (mName === 'eyes') {
            // Wet, living eyes: mirror-gloss clearcoat + strong env reflection
            obj.material = new THREE.MeshPhysicalMaterial({
              map: mat.map,
              color: 0xffffff,
              roughness: 0.05,
              metalness: 0.0,
              clearcoat: 1.0,
              clearcoatRoughness: 0.03,
              envMapIntensity: 2.6,
            });
          } else if (mName === 'eyelash') {
            mat.roughness = 0.55;
            mat.envMapIntensity = 0.5;
            mat.needsUpdate = true;
          } else if (mName === 'teeth' && objName.includes('tongue')) {
            obj.material = new THREE.MeshPhysicalMaterial({
              map: mat.map,
              color: 0xc4736a,
              roughness: 0.32,
              clearcoat: 0.35,
              clearcoatRoughness: 0.3,
              envMapIntensity: 0.6,
            });
          } else if (mName === 'teeth') {
            obj.material = new THREE.MeshPhysicalMaterial({
              map: mat.map,
              color: 0xf6f2ea,
              roughness: 0.2,
              clearcoat: 0.55,
              clearcoatRoughness: 0.25,
              envMapIntensity: 0.9,
            });
          } else if (mName === 'head' || mName === 'body') {
            // Body skin gets a gentle warm tint so the neck/chest tone matches
            // the face (kills the jawline seam between Head and Body meshes).
            const isBody = mName === 'body';
            const phys = new THREE.MeshPhysicalMaterial({
              map: mat.map,
              normalMap: mat.normalMap,
              roughnessMap: mat.roughnessMap,
              color: isBody ? 0xffdcc8 : 0xffffff,
              roughness: 0.4,
              metalness: 0.0,
              sheen: 0.55,
              sheenRoughness: 0.55,
              sheenColor: new THREE.Color(0xd98a76),
              clearcoat: 0.08,
              clearcoatRoughness: 0.38,
              ior: 1.38,
              specularIntensity: 0.75,
              envMapIntensity: 0.55,
              emissive: new THREE.Color(0x0e0704), // faint warm scatter bleed in the shadow side
            });
            // Pore-level specular breakup so skin never reads as airbrushed wax
            phys.normalMap = microNormalSkin;
            phys.normalScale = new THREE.Vector2(isBody ? 0.34 : 0.5, isBody ? 0.34 : 0.5);
            obj.material = phys;
          }
        }
      }
    });

    this.root.add(this.armature);

    // Living eyes: camera-facing catchlight sprites parented to the head bone
    this._buildEyeCatchlights();
    // Sanctuary tech accents: emissive wrist cuffs + collar light
    this._buildSuitAccents();

    // Initialize AnimationMixer & retarget locomotion clips cleanly (removing X/Z root drift)
    this.mixer = new THREE.AnimationMixer(this.armature);

    const walkClip = this._prepareMixamoClip(walkFbx.animations[0], 'female_walk', 0.01, true, walkRest, targetRest);
    this.actions.walk = this.mixer.clipAction(walkClip);

    // Natural arm carry for the xbot ready-stance clips (idle/agree/headshake hold
    // arms out from the T-pose bind; walk & run are authored with natural arms).
    // The legacy Euler carry alone left arms splayed ~60-80° from vertical (A-pose
    // remnant), so an additional X-axis swing drops the hands to a relaxed
    // hip-level stance (calibrated live against the rig's world-space arm angles).
    const ARM_CARRY = {
      left: new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(0.2, 0, -0.62))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.1)),
      right: new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(0.2, 0, -0.34))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.25)),
    };

    for (const rawClip of xbotGltf.animations) {
      const cname = rawClip.name.toLowerCase();
      if (['idle', 'run', 'agree', 'headshake'].includes(cname)) {
        const carry = ['idle', 'agree', 'headshake'].includes(cname) ? ARM_CARRY : null;
        const prepped = this._prepareMixamoClip(rawClip.clone(), cname, 0.01, true, xbotRest, targetRest, carry);
        this.actions[cname] = this.mixer.clipAction(prepped);
      }
    }

    this._fadeToAction('idle', 0.01);

    // Capture the right-arm bind orientation for the pointing aim-solver
    // (before any animation ticks — this is the parent-space rest direction).
    if (this.bones.RightArm) {
      this._rightArmRestQuat = this.bones.RightArm.quaternion.clone();
    }
    this.loaded = true;
  }

  /**
   * Camera-facing catchlight sprites on both eyes — the single cheapest trick that
   * turns "painted dead eyes" into a living gaze. Parented to the head bone with
   * offsets calibrated against the Avaturn rig; modulated during blinks.
   */
  _buildEyeCatchlights() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    // Hard corneal glint core + faint ambient halo — the two-part catchlight
    // that real wet eyes have (a hard key glint + a soft broad reflection).
    const halo = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    halo.addColorStop(0, 'rgba(235,250,255,0.34)');
    halo.addColorStop(0.4, 'rgba(190,235,248,0.1)');
    halo.addColorStop(1, 'rgba(160,225,240,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.arc(25, 25, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(245,253,255,0.92)';
    ctx.beginPath();
    ctx.arc(40, 37, 3.6, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);

    const head = this.bones.Head;
    if (!head) return;
    this.catchlights = [];
    for (const sideSign of [-1, 1]) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: sideSign < 0 ? 1.0 : 0.82, // asymmetric — the far eye catches less key
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(sideSign < 0 ? 0.038 : 0.03);
      sp.position.set(sideSign * 0.031, 0.052, 0.093);
      head.add(sp);
      this.catchlights.push(sp);
      this._catchlightBase = this._catchlightBase || [];
      this._catchlightBase.push(sp.scale.x);

      // Lower-lid tear-film glint — a thin wet streak under each eye. The
      // classic VFX tell of moist, living eyes.
      const wetMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: sideSign < 0 ? 0.55 : 0.4,
        depthWrite: false,
      });
      const wet = new THREE.Sprite(wetMat);
      wet.scale.set(sideSign < 0 ? 0.026 : 0.02, 0.0065, 1);
      wet.position.set(sideSign * 0.031, 0.036, 0.093);
      head.add(wet);
    }
  }

  /** Emissive sanctuary tech accents: wrist cuffs + collar filament. */
  _buildSuitAccents() {
    const accentMat = new THREE.MeshBasicMaterial({
      color: 0x62e6f2,
      transparent: true,
      opacity: 0.6, // restrained — her FACE owns the exposure hierarchy, not her cuffs
    });
    const attachments = [
      { bone: 'LeftHand', geo: new THREE.TorusGeometry(0.045, 0.0075, 8, 24) },
      { bone: 'RightHand', geo: new THREE.TorusGeometry(0.045, 0.0075, 8, 24) },
      { bone: 'Neck', geo: new THREE.TorusGeometry(0.056, 0.006, 8, 26) },
    ];
    for (const a of attachments) {
      const bone = this.bones[a.bone];
      if (!bone) continue;
      const ring = new THREE.Mesh(a.geo, accentMat);
      ring.rotation.x = Math.PI / 2;
      if (a.bone === 'Neck') ring.position.y = 0.075;
      bone.add(ring);
    }
  }

  /**
   * Reposition the 3-point rig around her head relative to the ACTIVE camera:
   * warm key from the viewer's side, cool fill opposite, cyan rim from the room
   * behind her — so she is always separated from the background and never looks
   * composited with a private frontal light.
   */
  _updateCameraRelativeLighting(cameraWorldPos) {
    if (!this.keyLight) return;
    const head = this.getHeadWorldPosition(this._tmpHead || (this._tmpHead = new THREE.Vector3()));
    const toCam = this._tmpDir || (this._tmpDir = new THREE.Vector3());
    toCam.copy(cameraWorldPos).sub(head);
    toCam.y = Math.max(toCam.y, 0.15); // keep the geometry stable when camera dips
    toCam.normalize();
    const side = this._tmpSide || (this._tmpSide = new THREE.Vector3());
    side.crossVectors(toCam, THREE.Object3D.DEFAULT_UP);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();

    this.keyLight.position.copy(head).addScaledVector(toCam, 1.45).addScaledVector(side, 1.35);
    this.keyLight.position.y += 1.0;
    this.keyTarget.position.copy(head);

    // Camera-distance light compensation: a fixed intensity that flatters the
    // wide shot clips to pure white in a 65mm closeup. Map the key & face lights
    // down as the camera approaches so skin always lands in the filmic rolloff.
    // (Distance is measured BEFORE toCam is normalized below.)
    const camDist = cameraWorldPos.distanceTo(head);
    this.keyLight.intensity = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(camDist, 1.4, 6.5), 1.4, 6.5, 4.8, 7.8),
      4.8, 7.8
    );
    this.faceLight.intensity = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(camDist, 1.4, 6.5), 1.4, 6.5, 0.7, 2.0),
      0.7, 2.0
    );
    // Face light leans to the KEY side (never frontal) so it lifts without
    // flattening the sculpt.
    this.faceLight.position.copy(head).addScaledVector(toCam, 0.62).addScaledVector(side, 0.4);
    this.faceLight.position.y += 0.18;

    // Warm kicker: low, key-opposite — carves her body's dark edge.
    this.kickerLight.position.copy(head).addScaledVector(toCam, 1.2).addScaledVector(side, -1.35);
    this.kickerLight.position.y -= 0.75;
    this.kickerLight.intensity = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(camDist, 1.4, 6.5), 1.4, 6.5, 0.9, 1.9),
      0.9, 1.9
    );

    // Crossed backlight rim: opposite the key side so it CARVES the silhouette
    // instead of flattening it with a uniform teal halo.
    this.rimLight.position.copy(head).addScaledVector(toCam, -1.35).addScaledVector(side, -0.85);
    this.rimLight.position.y += 0.6;

    this.fillLight.position.copy(head).addScaledVector(toCam, 1.1).addScaledVector(side, -0.6);
    this.fillLight.position.y -= 0.55;
  }

  _prepareMixamoClip(clip, newName, posScale = 0.01, stripXZRoot = true, srcRest = null, tgtRest = null, armCarry = null) {
    clip.name = newName;
    const keptTracks = [];
    const tmpQ = new THREE.Quaternion();
    for (const t of clip.tracks) {
      t.name = t.name.replaceAll('mixamorig:', '').replaceAll('mixamorig', '');
      const [boneName, prop] = t.name.split('.');
      if (!this.bones[boneName]) continue;

      if (prop === 'quaternion') {
        // Delta-from-rest conversion between source rig and Avaturn bind pose
        const qa = srcRest ? srcRest[boneName] : null;
        const qb = tgtRest ? tgtRest[boneName] : null;
        if (qa && qb) {
          const qaInv = qa.clone().invert();
          for (let i = 0; i < t.values.length; i += 4) {
            tmpQ.set(t.values[i], t.values[i + 1], t.values[i + 2], t.values[i + 3]);
            tmpQ.premultiply(qaInv).premultiply(qb);
            t.values[i] = tmpQ.x;
            t.values[i + 1] = tmpQ.y;
            t.values[i + 2] = tmpQ.z;
            t.values[i + 3] = tmpQ.w;
          }
        }
        // Optional natural arm carry (post-multiplied local rotation)
        if (armCarry) {
          const carry = boneName === 'LeftArm' ? armCarry.left : (boneName === 'RightArm' ? armCarry.right : null);
          if (carry) {
            for (let i = 0; i < t.values.length; i += 4) {
              tmpQ.set(t.values[i], t.values[i + 1], t.values[i + 2], t.values[i + 3]);
              tmpQ.multiply(carry);
              t.values[i] = tmpQ.x;
              t.values[i + 1] = tmpQ.y;
              t.values[i + 2] = tmpQ.z;
              t.values[i + 3] = tmpQ.w;
            }
          }
        }
        keptTracks.push(t);
        continue;
      }

      if (prop === 'position') {
        if (boneName !== 'Hips') continue;
        const baseY = t.values[1] * (t.values[1] > 3 ? posScale : 1.0);
        const factor = t.values[1] > 3 ? posScale : 1.0;
        for (let i = 0; i < t.values.length; i += 3) {
          t.values[i] = stripXZRoot ? 0 : t.values[i] * factor;
          t.values[i + 1] = Math.max(0.92, t.values[i + 1] * factor || baseY);
          t.values[i + 2] = stripXZRoot ? 0 : t.values[i + 2] * factor;
        }
      }
      keptTracks.push(t);
    }
    clip.tracks = keptTracks;
    return clip;
  }

  _fadeToAction(name, duration = 0.32) {
    if (!this.actions[name] || this.activeActionName === name) return;
    const next = this.actions[name];
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
    if (this.activeActionName && this.actions[this.activeActionName]) {
      this.actions[this.activeActionName].fadeOut(duration);
    }
    this.activeActionName = name;
  }

  /**
   * Navigate smoothly around the central holo-table obstacle (radius 2.15m at origin)
   * so JARVIS never clips through consoles or slides sideways.
   */
  navigateTo(targetX, targetZ, targetYaw, { urgent = false, posture = 'console_interaction', emotion = 'focused' } = {}) {
    this.urgentRun = Boolean(urgent);
    this.postureMode = posture;
    this.emotionalState = emotion;
    this.targetYaw = targetYaw;

    const start = new THREE.Vector2(this.root.position.x, this.root.position.z);
    const goal = new THREE.Vector2(targetX, targetZ);
    const dist = start.distanceTo(goal);
    if (dist < 0.14) {
      this.waypoints = [];
      return;
    }

    // Check if straight segment intersects central circular holo-table (r = 1.95m)
    const seg = goal.clone().sub(start);
    const segLenSq = seg.lengthSq();
    const tProj = Math.max(0, Math.min(1, (-start.x * seg.x - start.z * seg.y) / segLenSq));
    const closest = start.clone().addScaledVector(seg, tProj);
    const clearanceRadius = 2.15;

    this.waypoints = [];
    if (closest.length() < clearanceRadius && start.length() > 1.2 && goal.length() > 1.2) {
      // Compute tangent arc waypoint around the central ring
      const a1 = Math.atan2(start.y, start.x);
      const a2 = Math.atan2(goal.y, goal.x);
      let delta = a2 - a1;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const midAng = a1 + delta * 0.5;
      this.waypoints.push(new THREE.Vector2(Math.cos(midAng) * 2.55, Math.sin(midAng) * 2.55));
    }
    this.waypoints.push(goal);
  }

  acknowledgeInterruption(cameraWorldPos) {
    this.waypoints = [];
    this.currentSpeed = 0;
    this.urgentRun = false;
    this.postureMode = 'conversational_focus';
    this.emotionalState = 'listening';
    this.focusCamera = true;
    this.interruptSpeech();

    const dx = cameraWorldPos.x - this.root.position.x;
    const dz = cameraWorldPos.z - this.root.position.z;
    this.targetYaw = Math.atan2(dx, dz);
  }

  /**
   * Speak with real-time phoneme-to-Oculus-viseme facial synchronization.
   * Primary voice: server-synthesized audio (base64) with the viseme timeline
   * elastically scaled to the real audio duration. Fallback: browser SpeechSynthesis.
   */
  speak(text, { onStart, onEnd, audio } = {}) {
    this.interruptSpeech();
    if (!text) return;

    const clean = text.replace(/\[.*?\]/g, '').trim();
    if (!clean) return;

    // ARKit blendshape track (Audio2Face-3D chain, §14): validated here so a
    // malformed payload can never reach the face — null falls back to the
    // local rule engines below.
    this.speechFaces = audio && audio.faces ? validateFaceTrack(audio.faces) : null;

    // Build the phoneme/viseme schedule — mixed-language aware:
    // CJK runs go through the Mandarin pinyin engine (syllable → initial +
    // final + tone), latin runs through the English rule engine, and
    // punctuation between runs becomes breathing pauses.
    const timeline = [];
    let cursorMs = 60;
    const runs = clean.split(/([\u4e00-\u9fff\u3400-\u4dbf]+)/).filter(Boolean);

    for (const run of runs) {
      if (hasCJK(run)) {
        const { segments } = this.lipsyncZh.buildTimeline(run, cursorMs);
        if (segments.length) {
          for (const seg of segments) {
            timeline.push({ viseme: seg.viseme, startMs: seg.startMs, endMs: seg.endMs });
          }
          cursorMs = segments[segments.length - 1].endMs + 24;
        }
      } else if (/[A-Za-z]/.test(run)) {
        for (const rawWord of run.split(/\s+/).filter(Boolean)) {
          const upper = this.lipsync.preProcessText(rawWord);
          const oculusSeq = this.lipsync.wordsToVisemes(upper);
          const wordDurMs = Math.max(150, Math.min(540, rawWord.length * 58));

          if (oculusSeq && oculusSeq.visemes && oculusSeq.visemes.length > 0) {
            const totalRel = oculusSeq.durations.reduce((a, b) => a + b, 0) || 1;
            for (let i = 0; i < oculusSeq.visemes.length; i++) {
              const vCode = oculusSeq.visemes[i];
              const segMs = (oculusSeq.durations[i] / totalRel) * wordDurMs;
              timeline.push({
                viseme: `viseme_${vCode}`,
                startMs: cursorMs,
                endMs: cursorMs + segMs,
              });
              cursorMs += segMs;
            }
          } else {
            timeline.push({ viseme: 'viseme_aa', startMs: cursorMs, endMs: cursorMs + wordDurMs * 0.7 });
            cursorMs += wordDurMs;
          }
          cursorMs += 42;
        }
      } else {
        // pure punctuation / whitespace between language runs
        for (const ch of run) {
          if ('。！？；!?;…'.includes(ch)) cursorMs += 400;
          else if ('，、,：:'.includes(ch)) cursorMs += 210;
          else if (/\S/.test(ch)) cursorMs += 60;
          else cursorMs += 30;
        }
      }
    }

    this.speechTimeline = timeline;
    this.speechStartPerf = performance.now();
    this.isSpeaking = true;
    this.onSpeechEndCallback = onEnd || null;
    if (onStart) onStart();

    // Primary: server voice decoded through a WebAudio AnalyserNode — the mouth
    // is driven by the REAL waveform (true sync incl. pauses & emphasis), and the
    // viseme clock starts the instant the buffer starts playing (zero drift).
    if (audio && audio.data) {
      this._playVoiceThroughAnalyser(audio).then((ok) => {
        if (!ok) this._playVoiceElement(audio, clean);
      });
      return;
    }

    this._browserTtsFallback(clean);
  }

  _ensureAudioCtx() {
    if (!this._audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this._audioCtx = new AC();
    }
    return this._audioCtx;
  }

  /** Decode + play her voice through an AnalyserNode so lip-sync reads the actual
   *  audio. The phoneme timeline is elastically rescaled to the real duration and
   *  started together with the source. Falls back to <audio> if decode fails. */
  async _playVoiceThroughAnalyser({ data, mime }) {
    try {
      const ctx = this._ensureAudioCtx();
      if (!ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume();
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const audioBuf = await ctx.decodeAudioData(bytes.buffer);

      const lastEndMs = timeline_lastEnd(this.speechTimeline);
      const durMs = audioBuf.duration * 1000;
      if (durMs > 400 && lastEndMs > 0) {
        const factor = durMs / lastEndMs;
        for (const seg of this.speechTimeline) {
          seg.startMs *= factor;
          seg.endMs *= factor;
        }
      }

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.45;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      this.voiceAnalyser = analyser;
      this._freqBins = new Uint8Array(analyser.frequencyBinCount);
      this._timeSamples = new Float32Array(analyser.fftSize);
      this._binHz = ctx.sampleRate / analyser.fftSize; // for formant band mapping
      this.activeAudioSource = src;
      this.speechStartPerf = performance.now(); // mouth clock starts WITH the sound
      src.onended = () => this._onVoiceSourceEnded();
      src.start();
      return true;
    } catch {
      this.voiceAnalyser = null;
      this.activeAudioSource = null;
      return false;
    }
  }

  _onVoiceSourceEnded() {
    if (this.activeAudioSource === null) return; // already handled by interrupt
    this.activeAudioSource = null;
    this.voiceAnalyser = null;
    this.isSpeaking = false;
    this._clearVisemes();
    if (this.onSpeechEndCallback) {
      const cb = this.onSpeechEndCallback;
      this.onSpeechEndCallback = null;
      cb();
    }
  }

  /** Legacy <audio> element path (only if WebAudio decode fails). The viseme
   *  clock now starts on the real 'playing' event, killing start drift. */
  _playVoiceElement({ data, mime }, clean) {
    try {
      const snd = new Audio(`data:${mime || 'audio/wav'};base64,${data}`);
      this.activeAudioEl = snd;
      snd.addEventListener('playing', () => { this.speechStartPerf = performance.now(); });
      snd.onended = () => {
        this.activeAudioEl = null;
        this.isSpeaking = false;
        this._clearVisemes();
        if (this.onSpeechEndCallback) {
          const cb = this.onSpeechEndCallback;
          this.onSpeechEndCallback = null;
          cb();
        }
      };
      snd.play().catch(() => this._browserTtsFallback(clean));
    } catch {
      this._browserTtsFallback(clean);
    }
  }

  _browserTtsFallback(clean) {
    // Synthesize audible voice via browser SpeechSynthesis when server audio is unavailable
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(clean);
        const voices = window.speechSynthesis.getVoices();
        // Language-aware voice pick: Mandarin replies must never be read by an
        // English voice (the old /en/ pick garbled or silenced every 中文 reply).
        const isZh = hasCJK(clean);
        const femaleVoice = isZh
          ? voices.find((v) => /zh[-_]CN/i.test(v.lang) && /female|xiaoxiao|yaoyao|huihui|tingting|meijia|yunyi/i.test(v.name))
            || voices.find((v) => /zh/i.test(v.lang))
          : voices.find((v) =>
            /en/i.test(v.lang) && /samantha|victoria|kate|serena|sonia|aria|jenny|female|uk/i.test(v.name)
          ) || voices.find((v) => /en-GB|en-US/i.test(v.lang));
        if (femaleVoice) utt.voice = femaleVoice;
        utt.lang = isZh ? 'zh-CN' : (femaleVoice ? femaleVoice.lang : undefined);
        utt.rate = isZh ? 0.96 : 1.02;
        utt.pitch = 0.96;
        utt.onend = () => {
          this.isSpeaking = false;
          this._clearVisemes();
          if (this.onSpeechEndCallback) this.onSpeechEndCallback();
        };
        this.activeUtterance = utt;
        window.speechSynthesis.speak(utt);
      } catch {
        // Fallback purely to timed viseme timeline
      }
    }
  }

  interruptSpeech() {
    if (this.activeAudioSource) {
      try {
        this.activeAudioSource.onended = null;
        this.activeAudioSource.stop();
      } catch { /* noop */ }
      this.activeAudioSource = null;
      this.voiceAnalyser = null;
    }
    if (this.activeAudioEl) {
      try { this.activeAudioEl.pause(); } catch { /* noop */ }
      this.activeAudioEl = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    this.isSpeaking = false;
    this.speechTimeline = [];
    this.activeUtterance = null;
    this._clearVisemes();
    if (this.onSpeechEndCallback) {
      const cb = this.onSpeechEndCallback;
      this.onSpeechEndCallback = null;
      cb();
    }
  }

  _setMorph(name, value, lerpAlpha = 0.25) {
    let applied = false;
    for (const mesh of this.morphMeshes) {
      const idx = mesh.morphTargetDictionary[name];
      if (idx !== undefined) {
        applied = true;
        const cur = mesh.morphTargetInfluences[idx] || 0;
        mesh.morphTargetInfluences[idx] = cur + (value - cur) * lerpAlpha;
      }
    }
    // Rigs without Oculus visemes (MetaHuman GLB exports ARKit-51 only):
    // degrade the viseme to its ARKit shape mix so the local rule engines
    // still produce legible speech on the upgraded model.
    if (!applied && name.startsWith('viseme_')) {
      const fallback = VISEME_ARKIT_FALLBACK[name];
      if (fallback) {
        for (const [target, weight] of Object.entries(fallback)) {
          this._setMorph(target, value * weight, lerpAlpha);
        }
      }
    }
  }

  _clearVisemes() {
    for (const v of VISEME_NAMES) {
      this._setMorph(v, 0, 1.0);
    }
    this._setMorph('jawOpen', 0, 1.0);
    this._setMorph('mouthOpen', 0, 1.0);
    this.speechFaces = null; // face track dies with the utterance
  }

  getHeadWorldPosition(target = new THREE.Vector3()) {
    if (this.bones.Head) {
      this.bones.Head.getWorldPosition(target);
      return target;
    }
    return target.set(this.root.position.x, 1.62, this.root.position.z);
  }

  update(dt, cameraWorldPos, reducedMotion = false) {
    if (!this.loaded) return;
    // Real-time integration clock. At low frame rates (weak iGPUs, throttled
    // tabs, headless/software rendering) a hard dt clamp would put her in
    // slow motion — legs frozen, root crawling, waypoints never clearing.
    // Locomotion, the mixer, and blink/gaze integrate REAL elapsed time
    // (capped at 0.5s to avoid teleporting after tab switches); only the
    // facial morph lerps use the tight clamped dt for smoothing.
    const nowMs = performance.now();
    const realDt = this._lastUpdateMs !== undefined
      ? Math.min(0.5, (nowMs - this._lastUpdateMs) / 1000)
      : Math.min(dt, 0.05);
    this._lastUpdateMs = nowMs;
    const animDt = Math.min(realDt, 0.1); // mixer: near-real-time, jump-safe
    this.breathClock += realDt;

    // 1. Grounded Waypoint Locomotion (zero foot-skating!)
    // In conversational focus she turns her WHOLE BODY toward you — natural
    // posture for a face-to-face, and the head never tracks at its limits.
    if (this.focusCamera && this.postureMode === 'conversational_focus' && this.waypoints.length === 0) {
      const dx = cameraWorldPos.x - this.root.position.x;
      const dz = cameraWorldPos.z - this.root.position.z;
      if (Math.hypot(dx, dz) > 0.35) {
        this.targetYaw = Math.atan2(dx, dz);
      }
    }
    if (this.waypoints.length > 0) {
      const wp = this.waypoints[0];
      const dx = wp.x - this.root.position.x;
      const dz = wp.y - this.root.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.12) {
        this.waypoints.shift();
      } else {
        const desiredYaw = Math.atan2(dx, dz);
        this.root.rotation.y = this._lerpAngle(this.root.rotation.y, desiredYaw, realDt * 7.5);

        const maxSpeed = this.urgentRun ? 3.25 : 1.32;
        const decelFactor = this.waypoints.length === 1 ? Math.min(1, dist / 0.75) : 1;
        const targetSpeed = maxSpeed * Math.max(0.32, decelFactor);
        this.currentSpeed += (targetSpeed - this.currentSpeed) * Math.min(1, realDt * 8.0);

        const step = Math.min(dist, this.currentSpeed * realDt);
        this.root.position.x += (dx / dist) * step;
        this.root.position.z += (dz / dist) * step;

        const clipName = this.urgentRun && this.actions.run ? 'run' : 'walk';
        this._fadeToAction(clipName, 0.22);
        if (this.actions[clipName]) {
          const refSpeed = clipName === 'run' ? 3.25 : 1.32;
          this.actions[clipName].setEffectiveTimeScale(Math.max(0.55, this.currentSpeed / refSpeed));
        }
      }
    } else {
      this.currentSpeed *= Math.max(0, 1 - realDt * 10);
      this._fadeToAction('idle', 0.35);
      this.root.rotation.y = this._lerpAngle(this.root.rotation.y, this.targetYaw, realDt * 5.0);
    }

    // 2. Advance skeletal mixer
    this.mixer.update(animDt);

    // 2b. Camera-relative cinematic relight (key/fill/rim around her head)
    this._updateCameraRelativeLighting(cameraWorldPos);

    // 3. Subtle additive posture & hand interaction layering (only when standing still)
    if (this.waypoints.length === 0 && !reducedMotion) {
      this._applyPostureLayer();
    }

    // 3b. Procedural pointing at holographic evidence + living fingers
    this._updateArmAim();
    this._updateFingerLife(reducedMotion);

    // 3c. Aliveness layer: speech energy envelope → beat gestures & head
    // accents; arm/wrist micro-life; eye saccades. (reducedMotion keeps a
    // minimal saccade/energy subset so she never reads as a wax figure.)
    this._updateSpeechEnergy(realDt);
    if (!reducedMotion) this._applyAliveness(realDt);

    // 4. Head & Eye Gaze Tracking (rotates eyes/head naturally rather than spinning whole body!)
    const gazeTarget = this.focusCamera ? cameraWorldPos : this.lookWorldTarget;
    this._updateSaccades(realDt);
    this._applyGazeTracking(gazeTarget);

    // 5. Asymmetric Natural Blinking
    this._updateBlinking(realDt);

    // 6. Emotional Facial Expression Morphs
    this._updateExpressions();

    // 7. Synchronized Phoneme/Viseme Lip-Sync
    this._updateLipSync();
  }

  _applyPostureLayer() {
    const t = this.breathClock;
    if (this.bones.Spine1) {
      this.bones.Spine1.rotation.x += Math.sin(t * 1.45) * 0.012;
    }

    // Living weight-shift: slow hips sway with counter-rotating spine + head
    // micro-drift, so the idle never reads as a frozen mannequin.
    const sway = Math.sin(t * 0.31);
    if (this.bones.Hips) {
      this.bones.Hips.rotation.z += sway * 0.022;
      this.bones.Hips.position.x += sway * 0.011;
    }
    if (this.bones.Spine) {
      this.bones.Spine.rotation.z -= sway * 0.013;
    }
    if (this.bones.Head) {
      this.bones.Head.rotation.y += Math.sin(t * 0.47 + 1.3) * 0.013;
      this.bones.Head.rotation.z += Math.sin(t * 0.23) * 0.006;
    }

    const rArm = this.bones.RightArm;
    const rFore = this.bones.RightForeArm;
    const lArm = this.bones.LeftArm;
    const lFore = this.bones.LeftForeArm;
    if (!rArm || !rFore || !lArm || !lFore) return;

    if (this.postureMode === 'console_interaction') {
      // Right hand raised gently manipulating volumetric assembly above holo-table
      rArm.rotation.x -= 0.42 + Math.sin(t * 1.1) * 0.04;
      rArm.rotation.z -= 0.12;
      rFore.rotation.x -= 0.55 + Math.cos(t * 1.3) * 0.05;
    } else if (this.postureMode === 'reflect') {
      // Thinking pose: right hand toward the chin, weight settles, tiny
      // contemplative sway (gaze is driven by BehaviorDirector's recall target)
      rArm.rotation.x -= 0.74 + Math.sin(t * 0.9) * 0.018;
      rArm.rotation.z -= 0.20;
      rFore.rotation.x -= 1.34 + Math.cos(t * 1.05) * 0.022;
      if (this.bones.RightHand) this.bones.RightHand.rotation.x -= 0.18;
      if (this.bones.Head) this.bones.Head.rotation.z += 0.028; // slight tilt
    } else if (this.postureMode === 'scenario_construct') {
      // Symmetrical restrained two-hand volumetric expansion gesture
      rArm.rotation.x -= 0.48;
      rFore.rotation.x -= 0.52;
      lArm.rotation.x -= 0.48;
      lFore.rotation.x -= 0.52;
    } else if (this.postureMode === 'scenario_direct' || this.postureMode === 'video_present') {
      // Measured explanatory presentation gesture toward 3D evidence
      // (skipped when the aim-solver owns the arm — she POINTS at the hologram)
      if (!this.gestureWorldTarget) {
        rArm.rotation.x -= 0.54;
        rArm.rotation.y += 0.22;
        rFore.rotation.x -= 0.38;
      }
    } else if (this.isSpeaking) {
      // Restrained conversational gesture (not on every word!)
      const env = Math.max(0, Math.sin(t * 0.85));
      rArm.rotation.x -= 0.22 * env;
      rFore.rotation.x -= 0.38 * env;
    }
  }

  /**
   * Procedural right-arm aiming: during scenario_direct / video_present she
   * POINTS at the live holographic evidence (gestureWorldTarget, world space).
   * A quaternion slerp layered over the mixer output; ramps in/out smoothly.
   */
  _updateArmAim() {
    const arm = this.bones.RightArm;
    if (!arm || !this._rightArmRestQuat) return;
    // Cache the last valid target so the ramp-down keeps a direction after the
    // scenario clears gestureWorldTarget (prevents a null deref mid-blend).
    if (this.gestureWorldTarget) {
      (this._lastGestureTarget || (this._lastGestureTarget = new THREE.Vector3())).copy(this.gestureWorldTarget);
    }
    const target = this.gestureWorldTarget || this._lastGestureTarget;
    const aiming = (this.postureMode === 'scenario_direct' || this.postureMode === 'video_present')
      && target;
    this._armAimWeight = aiming
      ? Math.min(1, this._armAimWeight + 0.035)
      : Math.max(0, this._armAimWeight - 0.05);
    const w = this._armAimWeight;
    if (w <= 0.001 || !target) return;

    arm.updateWorldMatrix(true, false);
    const shoulderW = arm.getWorldPosition(this._aimP || (this._aimP = new THREE.Vector3()));
    const dir = this._aimD || (this._aimD = new THREE.Vector3());
    // Gentle living sway so the pointing never reads as a frozen laser beam
    const sway = Math.sin(this.breathClock * 1.1) * 0.035;
    dir.copy(target);
    dir.y += sway;
    dir.sub(shoulderW).normalize();

    const parentQ = this._aimQ0 || (this._aimQ0 = new THREE.Quaternion());
    arm.parent.getWorldQuaternion(parentQ);
    const invParentQ = this._aimQInv || (this._aimQInv = new THREE.Quaternion());
    invParentQ.copy(parentQ).invert();
    const localDir = this._aimL || (this._aimL = new THREE.Vector3());
    localDir.copy(dir).applyQuaternion(invParentQ).normalize();

    const restDir = this._aimR || (this._aimR = new THREE.Vector3(0, 1, 0).applyQuaternion(this._rightArmRestQuat).normalize());
    const aimQuat = this._aimQ1 || (this._aimQ1 = new THREE.Quaternion());
    aimQuat.setFromUnitVectors(restDir, localDir).multiply(this._rightArmRestQuat);
    arm.quaternion.slerp(aimQuat, w * 0.22);

    if (this.bones.RightForeArm) {
      this.bones.RightForeArm.rotation.x -= 0.1 * w;
    }

    // Presenting hand: index extended, remaining fingers softly curled
    this._curlFingers('Right', ['Index'], -0.02, w);
    this._curlFingers('Right', ['Middle', 'Ring', 'Pinky'], 0.42, w);
  }

  _curlFingers(side, names, curl, w) {
    for (const n of names) {
      for (const j of [1, 2, 3]) {
        const b = this.bones[`${side}Hand${n}${j}`];
        if (b) b.rotation.x += curl * w * (j === 1 ? 0.7 : 1.0);
      }
    }
  }

  /** Micro finger motion so her hands never read as frozen mannequin mitts. */
  _updateFingerLife(reducedMotion) {
    if (reducedMotion || !this.loaded) return;
    if (this._armAimWeight > 0.2) return; // pointing hand stays clean
    const t = this.breathClock;
    const base = this.waypoints.length === 0 ? 1 : 0.4;
    const names = ['Index', 'Middle', 'Ring', 'Pinky'];
    for (const side of ['Left', 'Right']) {
      for (let f = 0; f < names.length; f++) {
        const b = this.bones[`${side}Hand${names[f]}1`];
        if (b) {
          const phase = side === 'Left' ? 0 : 2.2;
          b.rotation.x += (0.09 + Math.sin(t * 0.9 + f * 1.4 + phase) * 0.05) * base * 0.5;
        }
      }
    }
  }

  /**
   * Speech energy envelope from the live voice waveform: fast attack, slow
   * release; stress onsets (energy jumping the recent peak floor) fire a head
   * accent and flip the beat-gesture side. Drives everything conversational
   * that must feel REACTIVE to her actual voice, not scripted.
   */
  _updateSpeechEnergy(dt) {
    let target = 0;
    if (this.voiceAnalyser && this.isSpeaking && this._timeSamples) {
      this.voiceAnalyser.getFloatTimeDomainData(this._timeSamples);
      let sum = 0;
      for (let i = 0; i < this._timeSamples.length; i++) {
        sum += this._timeSamples[i] * this._timeSamples[i];
      }
      const rms = Math.sqrt(sum / this._timeSamples.length);
      target = Math.min(1, rms * 4.2);
    }
    const k = target > this._speechEnergy ? 18 : 6;
    this._speechEnergy += (target - this._speechEnergy) * Math.min(1, dt * k);

    const floor = Math.max(0.06, this._speechEnergyPeak * 0.55);
    if (this._speechEnergy > floor + 0.15 && this._speechEnergy > 0.2) {
      this._headAccent = Math.min(1, this._speechEnergy * 1.3);
      this._beatSide *= -1;
      this._speechEnergyPeak = this._speechEnergy; // re-arm after firing
    } else {
      this._speechEnergyPeak = Math.max(this._speechEnergy, this._speechEnergyPeak - dt * 0.5);
    }
    this._headAccent *= Math.max(0, 1 - dt * 6.5);
    this._beatPhase += dt * (0.7 + this._speechEnergy * 2.4);
  }

  /**
   * Aliveness gestures layered over the mixer output:
   *  - living arms: continuous micro-sway + never-dead elbows/wrists
   *  - speech beats: energy-driven forearm lifts alternating sides
   *  - head accents: small nods on stress onsets
   */
  _applyAliveness(dt) {
    const t = this.breathClock;

    if (this.waypoints.length === 0 && this._armAimWeight < 0.5) {
      for (const side of ['Left', 'Right']) {
        const sign = side === 'Left' ? -1 : 1;
        const arm = this.bones[`${side}Arm`];
        const fore = this.bones[`${side}ForeArm`];
        const hand = this.bones[`${side}Hand`];
        const ph = sign > 0 ? 1.7 : 0;
        if (arm) {
          arm.rotation.z += sign * Math.sin(t * 0.42 + ph) * 0.02;
          arm.rotation.x += Math.sin(t * 0.35 + ph) * 0.016;
        }
        if (fore) {
          fore.rotation.x -= 0.05 + Math.sin(t * 0.5 + ph + 0.6) * 0.035; // elbows never lock straight
        }
        if (hand) {
          hand.rotation.z += Math.sin(t * 0.44 + ph + 1.2) * 0.03;
          hand.rotation.y += Math.sin(t * 0.31 + ph) * 0.02;
        }
      }
    }

    // Conversational beat gestures while speaking: restrained, energy-scaled,
    // alternating sides on stress onsets — never a windmill robot.
    if (this.isSpeaking && this._speechEnergy > 0.1 && this.waypoints.length === 0) {
      const lift = this._speechEnergy * (0.55 + 0.45 * Math.sin(this._beatPhase));
      const side = this._beatSide > 0 ? 'Right' : 'Left';
      const sign = side === 'Left' ? -1 : 1;
      const arm = this.bones[`${side}Arm`];
      const fore = this.bones[`${side}ForeArm`];
      // the scenario aim-solver owns the right arm while pointing
      if (arm && fore && !(side === 'Right' && this._armAimWeight > 0.2)) {
        arm.rotation.x -= lift * 0.26;
        arm.rotation.z -= sign * lift * 0.09;
        fore.rotation.x -= lift * 0.34;
      }
      // head accent: a small nod lands ON the stress
      if (this._headAccent > 0.01 && this.bones.Head) {
        this.bones.Head.rotation.x += this._headAccent * 0.055;
      }
    } else {
      // idle listening: subtle head accent decays naturally (kept above)
    }
  }

  /** Eye saccades: quick micro-darts around the gaze target. Humans make
   *  2-4 per second; damped to ~1 per 0.7-2.6s here for composure, and
   *  reduced while she speaks (she holds YOUR gaze while talking). */
  _updateSaccades(dt) {
    this._saccadeTimer -= dt;
    if (this._saccadeTimer <= 0) {
      this._saccadeTimer = 0.7 + Math.random() * 1.9;
      const speakingScale = this.isSpeaking ? 0.35 : 1;
      const amp = (0.018 + Math.random() * 0.04) * speakingScale;
      const ang = Math.random() * Math.PI * 2;
      this._saccadeTarget.set(Math.cos(ang) * amp, Math.sin(ang) * amp * 0.6, 0);
    }
    this._saccadeOffset.lerp(this._saccadeTarget, Math.min(1, dt * 13));
  }

  _applyGazeTracking(worldTarget) {
    if (!this.bones.Head || !this.bones.Neck) return;
    const headPos = this.getHeadWorldPosition(new THREE.Vector3());
    const localDir = worldTarget.clone().sub(headPos);
    localDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.root.rotation.y).normalize();

    const yaw = THREE.MathUtils.clamp(
      Math.atan2(localDir.x, localDir.z) + this._saccadeOffset.x, -0.58, 0.58
    );
    const pitch = THREE.MathUtils.clamp(
      -Math.asin(THREE.MathUtils.clamp(localDir.y, -0.8, 0.8)) + this._saccadeOffset.y, -0.32, 0.32
    );

    this.bones.Neck.rotation.y += yaw * 0.32;
    this.bones.Neck.rotation.x += pitch * 0.28;
    this.bones.Head.rotation.y += yaw * 0.52;
    this.bones.Head.rotation.x += pitch * 0.42;

    // Subtle ocular look morphs
    const eyeX = THREE.MathUtils.clamp(yaw * 0.85, -0.5, 0.5);
    const eyeY = THREE.MathUtils.clamp(-pitch * 0.85, -0.4, 0.4);
    this._setMorph('eyeLookOutLeft', Math.max(0, eyeX), 0.3);
    this._setMorph('eyeLookInRight', Math.max(0, eyeX), 0.3);
    this._setMorph('eyeLookInLeft', Math.max(0, -eyeX), 0.3);
    this._setMorph('eyeLookOutRight', Math.max(0, -eyeX), 0.3);
    this._setMorph('eyeLookUpLeft', Math.max(0, eyeY), 0.3);
    this._setMorph('eyeLookUpRight', Math.max(0, eyeY), 0.3);
    this._setMorph('eyeLookDownLeft', Math.max(0, -eyeY), 0.3);
    this._setMorph('eyeLookDownRight', Math.max(0, -eyeY), 0.3);
  }

  _updateBlinking(dt) {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkPhase < 0) {
      this.blinkPhase = 0;
      this.blinkTimer = 3.1 + Math.random() * 2.8;
    }
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt / 0.15;
      const w = this.blinkPhase < 0.5 ? this.blinkPhase * 2 : Math.max(0, (1 - this.blinkPhase) * 2);
      this._setMorph('eyeBlinkLeft', w, 0.85);
      this._setMorph('eyeBlinkRight', w * 0.96, 0.85);
      // Catchlights fade with the lids
      if (this.catchlights) {
        const cl = Math.max(0, 1 - w * 1.4);
        this.catchlights.forEach((sp, i) => {
          sp.scale.setScalar((this._catchlightBase?.[i] ?? 0.017) * cl);
        });
      }
      if (this.blinkPhase >= 1) {
        this.blinkPhase = -1;
        this._setMorph('eyeBlinkLeft', 0, 0.85);
        this._setMorph('eyeBlinkRight', 0, 0.85);
        if (this.catchlights) {
          this.catchlights.forEach((sp, i) => sp.scale.setScalar(this._catchlightBase?.[i] ?? 0.017));
        }
      }
    }
  }

  _updateExpressions() {
    const e = this.emotionalState;
    // When an ARKit face track is playing (Audio2Face-3D), the track owns the
    // brow/mouth shapes — our layer only adds the ocular expression cues.
    const curveActive = Boolean(this.speechFaces);
    if (!curveActive) {
      this._setMorph('browInnerUp', e === 'listening' ? 0.18 : (e === 'concerned' ? 0.36 : (e === 'urgent' ? 0.24 : 0.04)), 0.14);
      this._setMorph('browDownLeft', e === 'focused' ? 0.24 : (e === 'concerned' ? 0.22 : (e === 'urgent' ? 0.3 : 0.0)), 0.14);
      this._setMorph('browDownRight', e === 'focused' ? 0.24 : (e === 'concerned' ? 0.22 : (e === 'urgent' ? 0.3 : 0.0)), 0.14);
      // Composed poise — never a frozen customer-support grin
      this._setMorph('mouthSmileLeft', e === 'listening' ? 0.06 : 0.02, 0.12);
      this._setMorph('mouthSmileRight', e === 'listening' ? 0.06 : 0.02, 0.12);
    }
    this._setMorph('eyeSquintLeft', e === 'focused' ? 0.18 : 0.04, 0.14);
    this._setMorph('eyeSquintRight', e === 'focused' ? 0.18 : 0.04, 0.14);
    this._setMorph('eyeWideLeft', e === 'urgent' ? 0.22 : 0.0, 0.18);
    this._setMorph('eyeWideRight', e === 'urgent' ? 0.22 : 0.0, 0.18);
  }

  _updateLipSync() {
    if (!this.isSpeaking || (this.speechTimeline.length === 0 && !this.speechFaces)) {
      for (const v of VISEME_NAMES) this._setMorph(v, 0, 0.28);
      this._setMorph('jawOpen', 0, 0.3);
      this._setMorph('mouthOpen', 0, 0.3);
      return;
    }

    const elapsed = performance.now() - this.speechStartPerf;

    // --- Layer 0: ARKit blendshape track (Audio2Face-3D chain, §14) ---
    // Neural audio→face output sampled at the SAME clock origin as the voice
    // buffer; authoritative for mouth/jaw/brow/cheek shapes. Blink + gaze stay
    // local (isCurveDriven) — a generic audio model cannot know where she is
    // looking. The waveform energy layer still drives her beat gestures.
    if (this.speechFaces) {
      const sampled = sampleCurveValues(this.speechFaces, elapsed);
      let jaw = 0;
      for (const [name, value] of Object.entries(sampled)) {
        if (!isCurveDriven(name)) continue;
        this._setMorph(name, value, 0.55);
        if (name === 'jawOpen') jaw = value;
      }
      // Extra lip aperture so articulation reads at conversational distance
      this._setMorph('mouthOpen', jaw * 0.55, 0.5);
      // the viseme rule engine stays silent while the track is authoritative
      for (const v of VISEME_NAMES) this._setMorph(v, 0, 0.4);

      // End-of-speech detection (same contract as the timeline path below)
      if (this.activeAudioSource) return;
      if (elapsed > this.speechFaces.durationMs + 260) {
        const audioStillPlaying = this.activeAudioEl && !this.activeAudioEl.paused;
        if (!audioStillPlaying && (!('speechSynthesis' in window) || !window.speechSynthesis.speaking)) {
          this.isSpeaking = false;
          this._clearVisemes();
          if (this.onSpeechEndCallback) {
            const cb = this.onSpeechEndCallback;
            this.onSpeechEndCallback = null;
            cb();
          }
        }
      }
      return;
    }

    const lastEnd = timeline_lastEnd(this.speechTimeline);

    // --- Layer 1: phoneme timeline ("which sound") ---
    let timelineV = 'viseme_sil';
    for (const seg of this.speechTimeline) {
      if (elapsed >= seg.startMs && elapsed <= seg.endMs) {
        timelineV = seg.viseme;
        break;
      }
    }

    // --- Layer 2: live waveform analysis ("how open, which shape") ---
    let audioJaw = null;
    let audioV = null;
    if (this.voiceAnalyser && this.activeAudioSource && this._freqBins) {
      this.voiceAnalyser.getFloatTimeDomainData(this._timeSamples);
      this.voiceAnalyser.getByteFrequencyData(this._freqBins);
      let sum = 0;
      for (let i = 0; i < this._timeSamples.length; i++) {
        sum += this._timeSamples[i] * this._timeSamples[i];
      }
      const rms = Math.sqrt(sum / this._timeSamples.length);
      audioJaw = Math.min(0.72, rms * 3.6);
      // Formant-plane vowel estimate: F1 band (180-950 Hz ≈ jaw aperture) vs
      // F2 band (950-2900 Hz ≈ tongue fronting) — far more accurate than a
      // raw spectral centroid for both Mandarin and English vowels.
      let f1 = 0;
      let f2 = 0;
      let total = 0;
      const binHz = this._binHz || 46.9;
      const i1 = Math.max(2, Math.floor(180 / binHz));
      const i2 = Math.floor(950 / binHz);
      const i3 = Math.floor(2900 / binHz);
      for (let i = 2; i < this._freqBins.length; i++) {
        const mag = this._freqBins[i] / 255;
        total += mag;
        if (i >= i1 && i < i2) f1 += mag;
        else if (i >= i2 && i < i3) f2 += mag;
      }
      if (rms < 0.018) {
        audioV = 'viseme_sil';
      } else {
        const norm = total + 1e-4;
        const f1n = f1 / norm;
        const f2n = f2 / norm;
        audioV = f1n > 0.16 && f2n < 0.20 ? 'viseme_aa' // low tongue, open jaw
          : f2n > 0.22 && f1n < 0.12 ? 'viseme_I'       // fronted tongue, closed
          : f1n < 0.10 && f2n < 0.14 ? 'viseme_U'       // rounded, closed
          : f1n > 0.12 && f2n > 0.16 ? 'viseme_E'       // mid-open front
          : f1n > 0.14 ? 'viseme_O' : 'viseme_DD';
      }
    }

    // Text timeline is authoritative for the SHAPE (phoneme identity from
    // pinyin / English rules); the live waveform refines the shape during
    // timeline gaps and drives the actual jaw aperture.
    const activeV = timelineV !== 'viseme_sil'
      ? timelineV
      : (audioV && audioV !== 'viseme_sil' ? audioV : timelineV);
    const peak = 0.62 + Math.min(0.38, (audioJaw ?? 0) * 0.5);
    for (const v of VISEME_NAMES) {
      this._setMorph(v, v === activeV ? peak : 0.0, 0.5);
    }

    let jaw = timelineV === 'viseme_sil' ? 0
      : (['viseme_aa', 'viseme_O', 'viseme_E'].includes(timelineV) ? 0.3 : 0.12);
    if (audioJaw !== null) jaw = Math.max(jaw, audioJaw);
    this._setMorph('jawOpen', jaw, 0.55);
    // Extra lip aperture so articulation reads at conversational distance
    this._setMorph('mouthOpen', jaw * 0.55, 0.5);

    // End-of-speech detection (element / browser-TTS paths; WebAudio ends via onended)
    if (this.activeAudioSource) return;
    if (elapsed > lastEnd + 260) {
      const audioStillPlaying = this.activeAudioEl && !this.activeAudioEl.paused;
      if (!audioStillPlaying && (!('speechSynthesis' in window) || !window.speechSynthesis.speaking)) {
        this.isSpeaking = false;
        this._clearVisemes();
        if (this.onSpeechEndCallback) {
          const cb = this.onSpeechEndCallback;
          this.onSpeechEndCallback = null;
          cb();
        }
      }
    }
  }

  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * Math.min(1, t);
  }
}
