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

    // Dedicated character 3-point motivated lighting rig — repositioned every frame
    // RELATIVE TO THE CAMERA so the cyan rim always separates her from the scene
    // and the warm key always flatters the face toward the viewer. (Rig lives in
    // world space, not under root, so it never rotates with her body.)
    this.lightRig = new THREE.Group();
    this.keyLight = new THREE.SpotLight(0xffe4c8, 2.7, 8.5, Math.PI * 0.3, 0.7, 1.4);
    this.keyLight.castShadow = false;
    this.keyTarget = new THREE.Object3D();
    this.lightRig.add(this.keyTarget);
    this.keyLight.target = this.keyTarget;

    this.fillLight = new THREE.PointLight(0xf5cbb0, 0.55, 5.5, 1.6); // warm low "bounce board" lift
    this.rimLight = new THREE.PointLight(0x62e6f2, 2.3, 5.5, 1.5);
    // Cyan bounce from the holo-table side — the room's light kissing her front
    this.bounceLight = new THREE.PointLight(0x62e6f2, 0.65, 2.8, 1.8);
    this.lightRig.add(this.keyLight, this.fillLight, this.rimLight, this.bounceLight);
    this.scene.add(this.lightRig);

    // Subtle ground contact shadow disc beneath feet (soft radial falloff)
    const contactGeo = new THREE.CircleGeometry(0.4, 40);
    const contactMat = new THREE.MeshBasicMaterial({
      map: createSoftContactShadowTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const contactDisc = new THREE.Mesh(contactGeo, contactMat);
    contactDisc.rotation.x = -Math.PI / 2;
    contactDisc.position.y = 0.006;
    this.root.add(contactDisc);

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

    // Lip-sync & Speech Engine
    this.lipsync = new LipsyncEn();
    this.isSpeaking = false;
    this.speechTimeline = []; // [{ viseme, startMs, endMs }]
    this.speechStartPerf = 0;
    this.activeUtterance = null;
    this.onSpeechEndCallback = null;

    this.loaded = false;
  }

  async load(onProgress) {
    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();

    const [avatarGltf, xbotGltf, walkFbx] = await Promise.all([
      gltfLoader.loadAsync('/models/jarvis_avaturn.glb', onProgress),
      gltfLoader.loadAsync('/models/xbot_locomotion.glb'),
      fbxLoader.loadAsync('/models/walking.fbx'),
    ]);

    this.armature = avatarGltf.scene.getObjectByName('Armature') || avatarGltf.scene;
    this.armature.scale.setScalar(1);

    // Calibrate skeleton to standard Mixamo coordinate rolls & scale
    retarget(this.armature, AVATURN_RETARGET);

    // --- Cross-rig quaternion retargeting tables -------------------------------
    // The Avaturn rig's leg bones rest ~180deg (Z) away from the Mixamo
    // convention, so raw Mixamo clip quaternions would flip the legs upward.
    // Every clip quaternion is therefore converted delta-from-rest:
    //   q_target = q_targetRest * inverse(q_sourceRest) * q_sourceAnim
    const captureRest = (root) => {
      const rest = {};
      root.traverse((o) => {
        if (o.isBone) {
          const clean = o.name.replace(/^mixamorig:/, '').replace(/^mixamorig/, '');
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
        this.bones[obj.name] = obj;
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
          if (mName.includes('look')) {
            // Tailored suit: woven micro normal + cool fresnel rim so cloth separates from the dark room
            mat.map = tailorSuitAlbedoTexture(mat.map);
            mat.normalMap = weaveNormal;
            mat.normalScale = new THREE.Vector2(0.32, 0.32);
            mat.roughness = 0.8;
            mat.metalness = 0.06;
            injectFresnelRim(mat, [0.16, 0.38, 0.44], 0.24);
            mat.needsUpdate = true;
          } else if (mName.includes('hair')) {
            mat.color = new THREE.Color(0x241812);
            mat.roughness = 0.5;
            mat.metalness = 0.04;
            mat.envMapIntensity = 0.85;
            // Cyan environment kiss on the hair silhouette (kills the black-helmet read)
            injectFresnelRim(mat, [0.26, 0.62, 0.7], 0.6, 2.4);
            mat.needsUpdate = true;
          } else if (mName.includes('shoe')) {
            mat.color = new THREE.Color(0x12161c);
            mat.roughness = 0.42;
            mat.metalness = 0.12;
            mat.needsUpdate = true;
          } else if (mName === 'head' || mName === 'body') {
            const phys = new THREE.MeshPhysicalMaterial({
              map: mat.map,
              normalMap: mat.normalMap,
              roughnessMap: mat.roughnessMap,
              roughness: 0.52,
              metalness: 0.0,
              sheen: 0.34,
              sheenRoughness: 0.62,
              sheenColor: new THREE.Color(0xd99a82),
              clearcoat: 0.05,
              clearcoatRoughness: 0.5,
              ior: 1.38,
              specularIntensity: 0.52,
            });
            // Pore-level specular breakup so skin never reads as airbrushed wax
            phys.normalMap = microNormalSkin;
            phys.normalScale = new THREE.Vector2(0.3, 0.3);
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
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(0.25, 'rgba(235,250,255,0.85)');
    g.addColorStop(0.6, 'rgba(190,235,248,0.22)');
    g.addColorStop(1, 'rgba(160,225,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);

    const head = this.bones.Head;
    if (!head) return;
    this.catchlights = [];
    for (const sideSign of [-1, 1]) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: sideSign < 0 ? 0.92 : 0.72, // asymmetric — the far eye catches less key
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(sideSign < 0 ? 0.018 : 0.014);
      sp.position.set(sideSign * 0.031, 0.047, 0.093);
      head.add(sp);
      this.catchlights.push(sp);
      this._catchlightBase = this._catchlightBase || [];
      this._catchlightBase.push(sp.scale.x);
    }
  }

  /** Emissive sanctuary tech accents: wrist cuffs + collar filament. */
  _buildSuitAccents() {
    const accentMat = new THREE.MeshBasicMaterial({
      color: 0x62e6f2,
      transparent: true,
      opacity: 0.85,
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

    this.keyLight.position.copy(head).addScaledVector(toCam, 1.45).addScaledVector(side, 0.6);
    this.keyLight.position.y += 0.85;
    this.keyTarget.position.copy(head);

    this.rimLight.position.copy(head).addScaledVector(toCam, -1.3);
    this.rimLight.position.y += 0.55;

    this.fillLight.position.copy(head).addScaledVector(toCam, 1.1).addScaledVector(side, -0.6);
    this.fillLight.position.y -= 0.55;

    // Cyan bounce: from the central holo-table toward her (fixed world motivation)
    const tableDir = this._tmpTable || (this._tmpTable = new THREE.Vector3());
    tableDir.set(0, 1.48, 0).sub(head).normalize();
    this.bounceLight.position.copy(head).addScaledVector(tableDir, 1.15);
    this.bounceLight.position.y -= 0.25;
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

    // Build phoneme/viseme schedule using LipsyncEn
    const words = clean.split(/\s+/);
    const timeline = [];
    let cursorMs = 60;

    for (const rawWord of words) {
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

    this.speechTimeline = timeline;
    this.speechStartPerf = performance.now();
    this.isSpeaking = true;
    this.onSpeechEndCallback = onEnd || null;
    if (onStart) onStart();

    // Primary: server-synthesized NEXUS voice (base64 WAV) with elastic viseme scaling
    if (audio && audio.data) {
      try {
        const snd = new Audio(`data:${audio.mime || 'audio/wav'};base64,${audio.data}`);
        this.activeAudioEl = snd;
        const lastEndMs = timeline.length ? timeline[timeline.length - 1].endMs : 1;
        snd.onloadedmetadata = () => {
          const durMs = (snd.duration || 0) * 1000;
          if (durMs > 400 && lastEndMs > 0) {
            const factor = durMs / lastEndMs;
            for (const seg of this.speechTimeline) {
              seg.startMs *= factor;
              seg.endMs *= factor;
            }
          }
        };
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
        return;
      } catch {
        this.activeAudioEl = null;
      }
    }

    this._browserTtsFallback(clean);
  }

  _browserTtsFallback(clean) {
    // Synthesize audible voice via browser SpeechSynthesis when server audio is unavailable
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(clean);
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find((v) =>
          /en/i.test(v.lang) && /samantha|victoria|kate|serena|sonia|aria|jenny|female|uk/i.test(v.name)
        ) || voices.find((v) => /en-GB|en-US/i.test(v.lang));
        if (femaleVoice) utt.voice = femaleVoice;
        utt.rate = 1.02;
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
    for (const mesh of this.morphMeshes) {
      const idx = mesh.morphTargetDictionary[name];
      if (idx !== undefined) {
        const cur = mesh.morphTargetInfluences[idx] || 0;
        mesh.morphTargetInfluences[idx] = cur + (value - cur) * lerpAlpha;
      }
    }
  }

  _clearVisemes() {
    for (const v of VISEME_NAMES) {
      this._setMorph(v, 0, 1.0);
    }
    this._setMorph('jawOpen', 0, 1.0);
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
    const clampedDt = Math.min(dt, 0.05);
    this.breathClock += clampedDt;

    // 1. Grounded Waypoint Locomotion (zero foot-skating!)
    if (this.waypoints.length > 0) {
      const wp = this.waypoints[0];
      const dx = wp.x - this.root.position.x;
      const dz = wp.y - this.root.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.12) {
        this.waypoints.shift();
      } else {
        const desiredYaw = Math.atan2(dx, dz);
        this.root.rotation.y = this._lerpAngle(this.root.rotation.y, desiredYaw, clampedDt * 7.5);

        const maxSpeed = this.urgentRun ? 3.25 : 1.32;
        const decelFactor = this.waypoints.length === 1 ? Math.min(1, dist / 0.75) : 1;
        const targetSpeed = maxSpeed * Math.max(0.32, decelFactor);
        this.currentSpeed += (targetSpeed - this.currentSpeed) * Math.min(1, clampedDt * 8.0);

        const step = Math.min(dist, this.currentSpeed * clampedDt);
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
      this.currentSpeed *= Math.max(0, 1 - clampedDt * 10);
      this._fadeToAction('idle', 0.35);
      this.root.rotation.y = this._lerpAngle(this.root.rotation.y, this.targetYaw, clampedDt * 5.0);
    }

    // 2. Advance skeletal mixer
    this.mixer.update(clampedDt);

    // 2b. Camera-relative cinematic relight (key/fill/rim around her head)
    this._updateCameraRelativeLighting(cameraWorldPos);

    // 3. Subtle additive posture & hand interaction layering (only when standing still)
    if (this.waypoints.length === 0 && !reducedMotion) {
      this._applyPostureLayer();
    }

    // 4. Head & Eye Gaze Tracking (rotates eyes/head naturally rather than spinning whole body!)
    const gazeTarget = this.focusCamera ? cameraWorldPos : this.lookWorldTarget;
    this._applyGazeTracking(gazeTarget);

    // 5. Asymmetric Natural Blinking
    this._updateBlinking(clampedDt);

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
    } else if (this.postureMode === 'scenario_construct') {
      // Symmetrical restrained two-hand volumetric expansion gesture
      rArm.rotation.x -= 0.48;
      rFore.rotation.x -= 0.52;
      lArm.rotation.x -= 0.48;
      lFore.rotation.x -= 0.52;
    } else if (this.postureMode === 'scenario_direct' || this.postureMode === 'video_present') {
      //Measured explanatory presentation gesture toward 3D evidence
      rArm.rotation.x -= 0.54;
      rArm.rotation.y += 0.22;
      rFore.rotation.x -= 0.38;
    } else if (this.isSpeaking) {
      // Restrained conversational gesture (not on every word!)
      const env = Math.max(0, Math.sin(t * 0.85));
      rArm.rotation.x -= 0.22 * env;
      rFore.rotation.x -= 0.38 * env;
    }
  }

  _applyGazeTracking(worldTarget) {
    if (!this.bones.Head || !this.bones.Neck) return;
    const headPos = this.getHeadWorldPosition(new THREE.Vector3());
    const localDir = worldTarget.clone().sub(headPos);
    localDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.root.rotation.y).normalize();

    const yaw = THREE.MathUtils.clamp(Math.atan2(localDir.x, localDir.z), -0.58, 0.58);
    const pitch = THREE.MathUtils.clamp(-Math.asin(THREE.MathUtils.clamp(localDir.y, -0.8, 0.8)), -0.32, 0.32);

    this.bones.Neck.rotation.y += yaw * 0.32;
    this.bones.Neck.rotation.x += pitch * 0.28;
    this.bones.Head.rotation.y += yaw * 0.45;
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
    this._setMorph('browInnerUp', e === 'listening' ? 0.18 : (e === 'concerned' ? 0.36 : (e === 'urgent' ? 0.24 : 0.04)), 0.14);
    this._setMorph('browDownLeft', e === 'focused' ? 0.24 : (e === 'concerned' ? 0.22 : (e === 'urgent' ? 0.3 : 0.0)), 0.14);
    this._setMorph('browDownRight', e === 'focused' ? 0.24 : (e === 'concerned' ? 0.22 : (e === 'urgent' ? 0.3 : 0.0)), 0.14);
    this._setMorph('eyeSquintLeft', e === 'focused' ? 0.18 : 0.04, 0.14);
    this._setMorph('eyeSquintRight', e === 'focused' ? 0.18 : 0.04, 0.14);
    this._setMorph('eyeWideLeft', e === 'urgent' ? 0.22 : 0.0, 0.18);
    this._setMorph('eyeWideRight', e === 'urgent' ? 0.22 : 0.0, 0.18);
    // Composed poise — never a frozen customer-support grin
    this._setMorph('mouthSmileLeft', e === 'listening' ? 0.06 : 0.02, 0.12);
    this._setMorph('mouthSmileRight', e === 'listening' ? 0.06 : 0.02, 0.12);
  }

  _updateLipSync() {
    if (!this.isSpeaking || this.speechTimeline.length === 0) {
      for (const v of VISEME_NAMES) this._setMorph(v, 0, 0.25);
      this._setMorph('jawOpen', 0, 0.25);
      return;
    }

    const elapsed = performance.now() - this.speechStartPerf;
    const lastEnd = this.speechTimeline[this.speechTimeline.length - 1].endMs;

    if (elapsed > lastEnd + 180) {
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
      return;
    }

    let activeV = 'viseme_sil';
    for (const seg of this.speechTimeline) {
      if (elapsed >= seg.startMs && elapsed <= seg.endMs) {
        activeV = seg.viseme;
        break;
      }
    }

    for (const v of VISEME_NAMES) {
      this._setMorph(v, v === activeV ? 0.68 : 0.0, 0.42);
    }
    const openWeight = ['viseme_aa', 'viseme_O', 'viseme_E'].includes(activeV) ? 0.26 : 0.08;
    this._setMorph('jawOpen', activeV === 'viseme_sil' ? 0.0 : openWeight, 0.38);
  }

  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * Math.min(1, t);
  }
}
