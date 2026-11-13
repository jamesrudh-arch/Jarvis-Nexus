/**
 * JARVIS NEXUS — ResidentDirector: living residents of the sanctuary
 * (directive §4 "NEXUS WORLD: living residents + autonomous behaviour").
 *
 * Four holographic residents share the sanctuary with JARVIS. Each has a
 * deterministic personality (seeded PRNG), autonomous wander/idle/inspect
 * behaviour, physics-lite steering (acceleration, separation from each
 * other and from JARVIS, floor-bounds clamping) integrated on a REAL-TIME
 * clock (the session-2 lesson: never dt-capped slow-motion — waypoints
 * must complete even at low fps), and a state that serializes to the
 * server for world-state persistence.
 *
 * Materials are additive/transparent per-resident hues; bodies are simple
 * procedural capsules + heads + foot rings (stylised holograms — they are
 * residents of a holographic sanctuary, not clones of the Avaturn avatar;
 * the realistic digital human remains JARVIS herself).
 */

import * as THREE from 'three';

export const RESIDENT_ROSTER = [
  { id: 'echo',   name: 'Echo',   role: 'Archivist',    hue: 0.55, home: [6.5, -3.2],  pace: 0.85 },
  { id: 'vector', name: 'Vector', role: 'Analyst',      hue: 0.08, home: [-6.8, 2.4],  pace: 1.15 },
  { id: 'mira',   name: 'Mira',   role: 'Cartographer', hue: 0.78, home: [3.8, 5.6],   pace: 0.95 },
  { id: 'delta',  name: 'Delta',  role: 'Sentinel',     hue: 0.42, home: [-4.6, -5.8], pace: 0.70 },
];

const FLOOR_RADIUS = 12.6;      // wander bound (disc is 14.5 — margin for architecture)
const BASE_SPEED = 0.62;        // m/s (gentle residents; JARVIS walks ~1.2)
const SEPARATION_RADIUS = 1.35; // residents keep personal space
const JARVIS_AVOID_RADIUS = 1.9;
const IDLE_MIN_S = 2.5, IDLE_MAX_S = 7.5;

/** Deterministic PRNG (mulberry32) — reproducible personalities. */
export function makeRng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i += 1) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Steering: separation vector away from close neighbours (pure, testable). */
export function separationForce(selfPos, others, radius) {
  let fx = 0, fz = 0;
  for (const p of others) {
    const dx = selfPos.x - p.x;
    const dz = selfPos.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1e-6 && d2 < radius * radius) {
      const d = Math.sqrt(d2);
      const strength = (radius - d) / radius; // 1 at contact → 0 at edge
      fx += (dx / d) * strength;
      fz += (dz / d) * strength;
    }
  }
  return { x: fx, z: fz };
}

/** Clamp a position into the wander disc (pure, testable). */
export function clampToFloor(x, z, radius = FLOOR_RADIUS) {
  const d = Math.hypot(x, z);
  if (d <= radius) return { x, z };
  const s = radius / d;
  return { x: x * s, z: z * s };
}

class Resident {
  constructor(spec, rng) {
    this.spec = spec;
    this.rng = rng;
    this.pos = new THREE.Vector2(spec.home[0], spec.home[1]);
    this.vel = new THREE.Vector2(0, 0);
    this.yaw = rng() * Math.PI * 2;
    this.targetYaw = this.yaw;
    this.state = 'idle';           // idle | walking
    this.idleTimer = 1 + rng() * 4;
    this.walkTarget = null;
    this.bobPhase = rng() * Math.PI * 2;
    this.headTilt = 0;
    this.group = new THREE.Group();
    this._buildBody();
  }

  _buildBody() {
    const hue = this.spec.hue;
    const color = new THREE.Color().setHSL(hue, 0.75, 0.62);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.34, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.sharedMat = mat;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 4, 10), mat);
    torso.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), mat);
    head.position.y = 1.48;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.015, 8, 28), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    this.headMesh = head;
    this.group.add(torso, head, ring);
    this.group.position.set(this.pos.x, 0, this.pos.y);
  }

  _pickTarget(jarvisPos) {
    // wander toward a random point, biased away from JARVIS's current spot
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ang = this.rng() * Math.PI * 2;
      const rad = 2.0 + this.rng() * (FLOOR_RADIUS - 2.5);
      const p = clampToFloor(Math.cos(ang) * rad, Math.sin(ang) * rad);
      if (!jarvisPos || Math.hypot(p.x - jarvisPos.x, p.z - jarvisPos.z) > JARVIS_AVOID_RADIUS + 1.2) {
        return new THREE.Vector2(p.x, p.z);
      }
    }
    const home = this.spec.home;
    return new THREE.Vector2(home[0] * 0.7, home[1] * 0.7);
  }

  update(dt, neighbours, jarvisPos, reducedMotion) {
    // real-time integration, capped per frame — locomotion never slows with fps
    const step = Math.min(dt, 0.5);
    if (reducedMotion) {
      // accessibility: residents settle into place, gentle bob only
      this._applyVisual(0.02);
      return;
    }
    if (this.state === 'idle') {
      this.idleTimer -= step;
      this.headTilt = Math.sin(this.bobPhase + performance.now() * 0.0004) * 0.22;
      if (this.idleTimer <= 0) {
        this.walkTarget = this._pickTarget(jarvisPos);
        this.state = 'walking';
      }
    } else {
      const to = this.walkTarget.clone().sub(this.pos);
      const dist = to.length();
      if (dist < 0.16) {
        this.state = 'idle';
        this.idleTimer = IDLE_MIN_S + this.rng() * (IDLE_MAX_S - IDLE_MIN_S);
      } else {
        to.normalize();
        const maxSpeed = BASE_SPEED * this.spec.pace;
        // desired velocity + separation steering
        const others = neighbours
          .filter((n) => n !== this)
          .map((n) => ({ x: n.pos.x, z: n.pos.y }));
        if (jarvisPos) others.push({ x: jarvisPos.x, z: jarvisPos.z });
        const sep = separationForce({ x: this.pos.x, z: this.pos.y }, others, SEPARATION_RADIUS);
        // NB: separationForce returns {x, z} keys — map z onto the Vector2's
        // y slot (Vector2.y == world z here). (Bug caught by the unit suite:
        // reading sep.y gave undefined -> NaN velocity -> NaN position.)
        const desired = new THREE.Vector2(
          to.x * maxSpeed + sep.x * maxSpeed * 1.6,
          to.y * maxSpeed + sep.z * maxSpeed * 1.6);
        if (desired.length() > maxSpeed) desired.setLength(maxSpeed);
        // smooth accel/decel
        this.vel.lerp(desired, Math.min(1, step * 3.2));
        this.pos.addScaledVector(this.vel, step);
        const clamped = clampToFloor(this.pos.x, this.pos.y);
        this.pos.set(clamped.x, clamped.z);
        if (this.vel.lengthSq() > 0.003) {
          this.targetYaw = Math.atan2(this.vel.x, this.vel.y);
        }
      }
    }
    // yaw smoothing (shortest arc)
    let dy = this.targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, step * 5.0);
    this._applyVisual(step);
  }

  _applyVisual(step) {
    const t = performance.now() * 0.001;
    this.bobPhase += step * 2.1;
    this.group.position.set(this.pos.x, Math.sin(this.bobPhase * 0.5) * 0.022, this.pos.y);
    this.group.rotation.y = this.yaw;
    if (this.headMesh) {
      this.headMesh.rotation.z = this.state === 'idle' ? this.headTilt : 0;
    }
    // hologram flicker (subtle, deterministic per resident)
    this.sharedMat.opacity = 0.30 + 0.05 * Math.sin(t * (1.3 + this.spec.pace) + this.bobPhase);
  }

  serialize() {
    return {
      id: this.spec.id, x: Math.round(this.pos.x * 100) / 100,
      z: Math.round(this.pos.y * 100) / 100, yaw: Math.round(this.yaw * 100) / 100,
      activity: this.state === 'walking' ? 'wandering' : 'observing',
    };
  }

  applyState(saved) {
    if (!saved) return;
    if (Number.isFinite(saved.x)) this.pos.x = saved.x;
    if (Number.isFinite(saved.z)) this.pos.y = saved.z;
    if (Number.isFinite(saved.yaw)) {
      this.yaw = saved.yaw;
      this.targetYaw = saved.yaw;
    }
    this.state = 'idle';
    this.idleTimer = 1 + this.rng() * 3;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.sharedMat.dispose();
  }
}

export class ResidentDirector {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'ResidentsGroup';
    this.residents = RESIDENT_ROSTER.map((spec) => {
      const r = new Resident(spec, makeRng(`${spec.id}-nexus`));
      this.group.add(r.group);
      return r;
    });
    scene.add(this.group);
    this.jarvisPosRef = opts.jarvisPos || null;
    this.enabled = opts.enabled !== false;
  }

  setJarvisPosition(vec3) { this.jarvisPosRef = vec3; }

  update(dt, reducedMotion = false) {
    if (!this.enabled) return;
    for (const r of this.residents) {
      r.update(dt, this.residents, this.jarvisPosRef, reducedMotion);
    }
  }

  serialize() { return this.residents.map((r) => r.serialize()); }

  applyState(list) {
    if (!Array.isArray(list)) return;
    const byId = new Map(list.map((s) => [s.id, s]));
    for (const r of this.residents) r.applyState(byId.get(r.spec.id));
  }

  dispose() {
    for (const r of this.residents) r.dispose();
    this.scene.remove(this.group);
  }
}
