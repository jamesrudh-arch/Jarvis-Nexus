/**
 * JARVIS NEXUS — Autonomous Behavior Director.
 *
 * Gives NEXUS a life of her own between server commands: she works the central
 * holo-table, strolls to perimeter stations to inspect them, returns to her
 * post, and periodically GLANCES AT YOU — social presence, not a mannequin.
 *
 * Yield rules (she never fights higher-priority intent):
 *  - pauses instantly while she is speaking or walking (server-driven)
 *  - paused by the client during conversations / scenario direction
 *  - only runs when the autonomy switch is ON and the world mode is ambient
 */
import * as THREE from 'three';

/** Points of interest: [x, z] stand spot + a look target + posture. */
const POIS = [
  { stand: [2.9, -5.4], look: [3.2, 1.35, -8.0], posture: 'console_interaction' },   // agent table
  { stand: [-2.5, -5.6], look: [-3.0, 1.5, -8.0], posture: 'console_interaction' },  // goals DAG
  { stand: [-4.9, -3.9], look: [-7.1, 1.6, -7.2], posture: 'console_interaction' },  // research alcove
  { stand: [-5.2, -0.4], look: [-7.8, 2.1, -1.5], posture: 'console_interaction' },  // memory colonnade
  { stand: [4.6, -3.3], look: [6.9, 1.6, -5.8], posture: 'video_present' },          // media wall
  { stand: [1.9, 5.3], look: [3.2, 1.1, 7.8], posture: 'console_interaction' },      // compute bay
  { stand: [-1.9, 5.3], look: [-3.2, 1.1, 7.8], posture: 'console_interaction' },    // owner switches
  { stand: [1.35, 3.15], look: [0, 1.62, 0.5], posture: 'console_interaction' },   // central holo-table (outside stage ring)
];

const HOME = { stand: [1.45, 0.95], yaw: -0.42, look: [0, 1.62, 0.5] };

export class BehaviorDirector {
  constructor(jarvis) {
    this.jarvis = jarvis;
    this.enabled = false;
    this.serverPermitted = false;
    this._pauseUntil = 0;
    this._stateTime = 5 + Math.random() * 5;
    this._lastPoi = -1;
    this._arrivedLook = null;
  }

  /** The client grants permission (autonomy switch ON + ambient mode + no scenario). */
  setServerPermitted(v) {
    this.serverPermitted = Boolean(v);
  }

  /** Temporarily yield control (conversation round-trip, interrupts, scenario start). */
  pause(seconds = 10) {
    this._pauseUntil = Math.max(this._pauseUntil, performance.now() + seconds * 1000);
  }

  get active() {
    return this.enabled && this.serverPermitted && performance.now() >= this._pauseUntil;
  }

  update(dt, cameraWorldPos) {
    const j = this.jarvis;
    if (!this.enabled || !j || !j.loaded) return;

    // Never fight speech, active navigation, or a hold window.
    if (j.isSpeaking || j.waypoints.length > 0 || performance.now() < this._pauseUntil || !this.serverPermitted) {
      this._stateTime = Math.max(this._stateTime, 2.5);
      return;
    }

    this._stateTime -= dt;
    if (this._stateTime > 0) return;

    const roll = Math.random();

    if (roll < 0.40) {
      // Wander to a new point of interest and inspect it
      let idx = Math.floor(Math.random() * POIS.length);
      if (idx === this._lastPoi) idx = (idx + 1) % POIS.length;
      this._lastPoi = idx;
      const poi = POIS[idx];
      const yaw = Math.atan2(poi.look[0] - poi.stand[0], poi.look[2] - poi.stand[2]);
      j.lookWorldTarget.set(poi.look[0], poi.look[1], poi.look[2]);
      j.focusCamera = false;
      j.emotionalState = 'focused';
      j.navigateTo(poi.stand[0], poi.stand[1], yaw, {
        posture: poi.posture,
        emotion: 'focused',
      });
      this._stateTime = 9 + Math.random() * 8; // inspection time after arrival
    } else if (roll < 0.66) {
      // Notice the viewer — turn and hold eye contact for a few seconds
      const dx = cameraWorldPos.x - j.root.position.x;
      const dz = cameraWorldPos.z - j.root.position.z;
      j.targetYaw = Math.atan2(dx, dz);
      j.focusCamera = true;
      j.postureMode = 'conversational_focus';
      j.emotionalState = 'attentive';
      this._stateTime = 4 + Math.random() * 4;
    } else if (roll < 0.84) {
      // Return to the central operations post (her home base)
      j.lookWorldTarget.set(HOME.look[0], HOME.look[1], HOME.look[2]);
      j.focusCamera = false;
      j.navigateTo(HOME.stand[0], HOME.stand[1], HOME.yaw, {
        posture: 'console_interaction',
        emotion: 'focused',
      });
      this._stateTime = 10 + Math.random() * 8;
    } else {
      // Stay put, shift focus around the room (gaze wander — no locomotion)
      const poi = POIS[Math.floor(Math.random() * POIS.length)];
      j.lookWorldTarget.set(poi.look[0], poi.look[1], poi.look[2]);
      j.focusCamera = Math.random() < 0.35;
      j.emotionalState = 'neutral';
      this._stateTime = 5 + Math.random() * 5;
    }
  }
}
