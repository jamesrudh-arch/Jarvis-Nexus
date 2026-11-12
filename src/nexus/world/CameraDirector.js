/**
 * JARVIS NEXUS — Deliberate Cinema Camera Director.
 *
 * Implements:
 * - Calibrated cinema prime focal lengths (24mm, 28mm, 35mm, 40mm, 50mm, 65mm).
 * - Critically damped spring movement, wall-boundary clamping, zero character clipping.
 * - Automatic reframing when JARVIS walks across the sanctuary.
 * - User OrbitControls inspection with non-fighting manual override.
 * - Full Reduced-Motion accessibility support (gentle immediate cuts, zero drift).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function focalLengthToVerticalFov(focalMm, sensorHeightMm = 24) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(sensorHeightMm / (2 * focalMm)));
}

export class CameraDirector {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 1.25;
    this.controls.maxDistance = 13.5;
    this.controls.maxPolarAngle = Math.PI * 0.495; // Never dip below floor!
    this.controls.target.set(0.6, 1.38, 0.4);

    this.manualUserHoldSec = 0;
    this.controls.addEventListener('start', () => {
      this.manualUserHoldSec = 6.0;
    });

    this.mode = 'auto';
    this.activePreset = 'living_presence';
    this.desiredPos = new THREE.Vector3(2.55, 1.58, 3.85);
    this.desiredTarget = new THREE.Vector3(0.85, 1.42, 0.65);
    this.desiredFov = focalLengthToVerticalFov(40);
    this._breathSeed = Math.random() * 97;
    this._orbitPhase = Math.random() * Math.PI * 2;

    this.camera.position.copy(this.desiredPos);
    this.camera.fov = this.desiredFov;
    this.camera.updateProjectionMatrix();
  }

  setPreset(presetName, reducedMotion = false) {
    this.activePreset = presetName;
    this.scenarioFocus = null;
    this.manualUserHoldSec = 0;
    if (reducedMotion) {
      this._snapImmediately();
    }
  }

  /**
   * Reset View (session 7, owner directive): snap the camera back to the
   * active preset's calibrated framing, clearing any manual orbit offset,
   * stuck manual-hold, or NaN-corrupted state. Safe to call any time —
   * every field is re-derived from the preset table, so a poisoned camera
   * position / target / fov always lands back on a valid composition.
   */
  resetView(jarvis) {
    this.manualUserHoldSec = 0;
    this.scenarioFocus = null;
    this.mode = 'auto';
    if (!Number.isFinite(this.desiredPos.x) || !Number.isFinite(this.desiredPos.y)
      || !Number.isFinite(this.desiredPos.z)
      || !Number.isFinite(this.desiredTarget.x) || !Number.isFinite(this.desiredTarget.y)
      || !Number.isFinite(this.desiredTarget.z)) {
      this.desiredPos.set(2.55, 1.58, 3.85);
      this.desiredTarget.set(0.85, 1.42, 0.65);
      this.desiredFov = focalLengthToVerticalFov(40);
    }
    this._computeComposition(jarvis);
    this._sanitize();
    this._snapImmediately();
  }

  /** NaN armor (session 7): recover any non-finite camera state to the last
   *  valid desired composition. Called every update — cheap (six isFinite
   *  checks) and the difference between a one-frame glitch and a scene that
   *  stays black forever. */
  _sanitize() {
    if (!Number.isFinite(this.camera.position.x) || !Number.isFinite(this.camera.position.y)
      || !Number.isFinite(this.camera.position.z)) {
      this.camera.position.copy(this.desiredPos);
    }
    if (!Number.isFinite(this.controls.target.x) || !Number.isFinite(this.controls.target.y)
      || !Number.isFinite(this.controls.target.z)) {
      this.controls.target.copy(this.desiredTarget);
    }
    if (!Number.isFinite(this.camera.fov)) {
      this.camera.fov = this.desiredFov;
      this.camera.updateProjectionMatrix();
    }
    if (!Number.isFinite(this.desiredPos.x) || !Number.isFinite(this.desiredPos.y)
      || !Number.isFinite(this.desiredPos.z)) {
      this.desiredPos.set(2.55, 1.58, 3.85);
    }
    if (!Number.isFinite(this.desiredTarget.x) || !Number.isFinite(this.desiredTarget.y)
      || !Number.isFinite(this.desiredTarget.z)) {
      this.desiredTarget.set(0.85, 1.42, 0.65);
    }
    if (!Number.isFinite(this.desiredFov)) this.desiredFov = focalLengthToVerticalFov(40);
  }

  setManualSelect(value, reducedMotion = false) {
    this.mode = value;
    this.scenarioFocus = null;
    this.manualUserHoldSec = 0;
    if (value !== 'auto') {
      this.activePreset = value;
      if (reducedMotion) this._snapImmediately();
    }
  }

  /**
   * Documentary camera choreography driven by scenario timeline cues.
   * kind: scenario_wide | scenario_origin_closeup | scenario_actor_track
   */
  setScenarioCue(kind, originPoint, actorObject) {
    this.scenarioFocus = { kind, origin: originPoint || new THREE.Vector3(0.15, 1.4, 1.85), actor: actorObject || null };
    this.activePreset = 'scenario_dynamic';
    this.mode = 'auto'; // documentary override — cue choreography owns the camera
    this.manualUserHoldSec = 0;
  }

  _computeScenarioComposition() {
    const f = this.scenarioFocus;
    if (f.kind === 'scenario_origin_closeup') {
      this.desiredFov = focalLengthToVerticalFov(50);
      this.desiredPos.set(f.origin.x + 1.0, f.origin.y + 0.34, f.origin.z + 1.3);
      this.desiredTarget.copy(f.origin);
    } else if (f.kind === 'scenario_actor_track' && f.actor) {
      this.desiredFov = focalLengthToVerticalFov(40);
      const a = f.actor.position;
      this.desiredPos.set(a.x + 1.3, 1.62, a.z + 1.85);
      this.desiredTarget.set(a.x, 1.18, a.z);
    } else {
      // scenario_wide (default) — 24mm pulled back so BOTH the holographic
      // reconstruction AND NEXUS at her presenter's mark share the frame.
      this.desiredFov = focalLengthToVerticalFov(24);
      this.desiredPos.set(0.35, 1.75, 6.4);
      this.desiredTarget.set(0.1, 1.55, 1.6);
    }
  }

  _computeComposition(jarvis) {
    const jPos = jarvis.root.position;
    // NaN armor (session 7): a poisoned character yaw used to flow straight
    // into the camera composition and brick the render. Treat non-finite
    // yaw as forward-facing and non-finite position as the home mark.
    let jYaw = jarvis.root.rotation.y;
    if (!Number.isFinite(jYaw)) {
      jYaw = Number.isFinite(jarvis.targetYaw) ? jarvis.targetYaw : -0.42;
    }
    if (!Number.isFinite(jPos.x) || !Number.isFinite(jPos.z)) {
      jPos.x = 1.45;
      jPos.z = 0.95;
    }
    const fwd = new THREE.Vector3(Math.sin(jYaw), 0, Math.cos(jYaw));
    const right = new THREE.Vector3(Math.cos(jYaw), 0, -Math.sin(jYaw));
    const preset = this.mode === 'auto' ? this.activePreset : this.mode;

    // Scenario documentary focus overrides everything (until user grabs the camera)
    if (this.scenarioFocus && this.mode === 'auto') {
      this._computeScenarioComposition();
      const radialSF = Math.hypot(this.desiredPos.x, this.desiredPos.z);
      if (radialSF > 10.4) {
        const s = 10.4 / radialSF;
        this.desiredPos.x *= s;
        this.desiredPos.z *= s;
      }
      this.desiredPos.y = THREE.MathUtils.clamp(this.desiredPos.y, 0.95, 5.5);
      return;
    }

    // If JARVIS is actively walking/running across the hall in auto mode, smoothly track her!
    if (this.mode === 'auto' && jarvis.waypoints.length > 0 && preset !== 'wide_sanctuary') {
      this.desiredFov = focalLengthToVerticalFov(35);
      this.desiredPos.set(jPos.x + fwd.x * 2.9 + right.x * 1.15, 1.62, jPos.z + fwd.z * 2.9 + right.z * 1.15);
      this.desiredTarget.set(jPos.x, 1.38, jPos.z);
      return;
    }

    switch (preset) {
      case 'arrival_wake':
        this.desiredFov = focalLengthToVerticalFov(35);
        this.desiredPos.set(2.9, 1.68, 4.6);
        this.desiredTarget.set(0.45, 1.38, 0.35);
        break;

      case 'conversation':
        // Intimate 65mm conversational portrait — close enough to read her eyes
        // and lips, far enough to stay respectful (chest-up framing).
        this.desiredFov = focalLengthToVerticalFov(65);
        this.desiredPos.set(
          jPos.x + fwd.x * 1.42 + right.x * 0.18,
          1.57,
          jPos.z + fwd.z * 1.42 + right.z * 0.18
        );
        this.desiredTarget.set(jPos.x, 1.54, jPos.z);
        break;

      case 'follow_jarvis':
        this.desiredFov = focalLengthToVerticalFov(35);
        this.desiredPos.set(jPos.x + fwd.x * 2.85 + right.x * 0.9, 1.6, jPos.z + fwd.z * 2.85 + right.z * 0.9);
        this.desiredTarget.set(jPos.x, 1.38, jPos.z);
        break;

      case 'scenario_stage':
        // Wide 28mm volumetric stage framing capturing both JARVIS and room-scale 3D reconstruction
        this.desiredFov = focalLengthToVerticalFov(28);
        this.desiredPos.set(0.25, 1.78, 5.65);
        this.desiredTarget.set(0.0, 1.42, 1.65);
        break;

      case 'video_presentation':
        // Places Media Wall cleanly on left/center and JARVIS beside it on right (never blocking!)
        this.desiredFov = focalLengthToVerticalFov(35);
        this.desiredPos.set(2.55, 1.65, -1.65);
        this.desiredTarget.set(5.65, 1.58, -5.2);
        break;

      case 'memory_archive':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(-3.4, 1.62, 0.65);
        this.desiredTarget.set(-6.8, 1.5, -1.35);
        break;

      case 'research':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(-3.1, 1.6, -3.2);
        this.desiredTarget.set(-5.9, 1.48, -6.3);
        break;

      case 'goals_projects':
        this.desiredFov = focalLengthToVerticalFov(38);
        this.desiredPos.set(-1.3, 1.62, -4.1);
        this.desiredTarget.set(-2.8, 1.5, -7.6);
        break;

      case 'collaboration':
        this.desiredFov = focalLengthToVerticalFov(38);
        this.desiredPos.set(1.3, 1.62, -4.0);
        this.desiredTarget.set(3.0, 1.45, -7.5);
        break;

      case 'security_alert':
        this.desiredFov = focalLengthToVerticalFov(35);
        this.desiredPos.set(3.6, 1.6, 2.2);
        this.desiredTarget.set(7.2, 1.5, 0.5);
        break;

      case 'vision_station':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(3.2, 1.58, 2.6);
        this.desiredTarget.set(6.2, 1.48, 4.9);
        break;

      case 'diagnostics':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(-3.2, 1.58, 2.6);
        this.desiredTarget.set(-6.2, 1.48, 4.9);
        break;

      case 'compute_connections':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(1.1, 1.6, 4.1);
        this.desiredTarget.set(2.9, 1.45, 7.2);
        break;

      case 'owner_switches':
        this.desiredFov = focalLengthToVerticalFov(42);
        this.desiredPos.set(-1.1, 1.58, 4.1);
        this.desiredTarget.set(-2.9, 1.38, 7.2);
        break;

      case 'hologram_prism':
        this.desiredFov = focalLengthToVerticalFov(45);
        this.desiredPos.set(jPos.x + fwd.x * 2.95, 1.35, jPos.z + fwd.z * 2.95);
        this.desiredTarget.set(jPos.x, 1.08, jPos.z);
        break;

      case 'wide_sanctuary':
        this.desiredFov = focalLengthToVerticalFov(24);
        this.desiredPos.set(0.0, 2.65, 9.2);
        this.desiredTarget.set(0.0, 1.35, -0.5);
        break;

      case 'living_presence':
      default:
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(2.65, 1.62, 3.85);
        this.desiredTarget.set(0.65, 1.38, 0.45);
        break;
    }

    // Clamp inside architectural walls (radius <= 10.6m, height >= 0.95m) to prevent wall clipping
    const radial = Math.hypot(this.desiredPos.x, this.desiredPos.z);
    if (radial > 10.4) {
      const s = 10.4 / radial;
      this.desiredPos.x *= s;
      this.desiredPos.z *= s;
    }
    this.desiredPos.y = THREE.MathUtils.clamp(this.desiredPos.y, 0.95, 5.5);
  }

  _snapImmediately() {
    this.camera.position.copy(this.desiredPos);
    this.controls.target.copy(this.desiredTarget);
    this.camera.fov = this.desiredFov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  update(dt, jarvis, reducedMotion = false) {
    this._sanitize();
    this._computeComposition(jarvis);
    this._sanitize();

    if (this.manualUserHoldSec > 0) {
      this.manualUserHoldSec -= dt;
      this.controls.update();
      return;
    }

    // Cinematic life: subtle operator breathing + a very slow orbital drift on
    // the presence preset — even stillness should feel filmed, not frozen.
    if (!reducedMotion) {
      const t = performance.now() / 1000;
      const bx = Math.sin(t * 0.42 + this._breathSeed) * 0.035;
      const by = Math.sin(t * 0.31 + this._breathSeed * 2.0) * 0.024;
      const bz = Math.cos(t * 0.38 + this._breathSeed) * 0.032;

      if (this.mode === 'auto' && !this.scenarioFocus && (this.activePreset === 'living_presence' || this.activePreset === 'arrival_wake')) {
        // Slow ±0.16 rad orbital sway around her
        this._orbitPhase += dt * 0.055;
        const ang = Math.sin(this._orbitPhase) * 0.16;
        const dx = this.desiredPos.x - this.desiredTarget.x;
        const dz = this.desiredPos.z - this.desiredTarget.z;
        const r = Math.hypot(dx, dz);
        const baseAng = Math.atan2(dx, dz) + ang - Math.asin(Math.sin(ang) || 0.0001) * 0; // rotate offset
        this.desiredPos.x = this.desiredTarget.x + Math.sin(baseAng) * r;
        this.desiredPos.z = this.desiredTarget.z + Math.cos(baseAng) * r;
      }
      this.desiredPos.x += bx;
      this.desiredPos.y += by;
      this.desiredPos.z += bz;
    }

    const alpha = reducedMotion ? 1.0 : 1.0 - Math.exp(-dt * 2.8);
    this.camera.position.lerp(this.desiredPos, alpha);
    this.controls.target.lerp(this.desiredTarget, alpha);

    if (Math.abs(this.camera.fov - this.desiredFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.desiredFov, alpha);
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
  }
}
