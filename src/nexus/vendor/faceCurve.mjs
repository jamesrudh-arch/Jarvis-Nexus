/**
 * JARVIS NEXUS — ARKit blendshape face-track utilities.
 *
 * A FaceTrack is the provider-neutral, JSON-safe contract for high-fidelity
 * facial animation (Directive §14: "NVIDIA Audio2Face-3D where compatible"):
 *
 *   { fps: 30, durationMs: 4800, curves: { jawOpen: [0, 0.12, ...], ... } }
 *
 * `curves` maps ARKit-52 blendshape names to per-frame scalar arrays sampled
 * at `fps`. Sources can be (D6 — local first, cloud optional):
 *   - a self-hosted NVIDIA Audio2Face-3D gateway (scripts/a2f_gateway.py,
 *     open-sourced by NVIDIA Sep 2025; the hosted build.nvidia.com NIM is
 *     DEPRECATED and must not become a dependency)
 *   - any future engine (metahuman DNA bakes, offline A2F batch runs)
 *   - absent → the local LipsyncZh/LipsyncEn rule engines remain authoritative
 *
 * Ownership split on the character: the face track drives jaw/mouth/brow/
 * cheek/nose/chin/tongue shapes. Blink and ocular gaze stay LOCAL (our
 * Poisson blink layer and gaze/saccade system) because a generic audio→face
 * model has no idea where she is looking.
 */

const FPS_MIN = 5;
const FPS_MAX = 120;

/**
 * ARKit shape prefixes the face track is allowed to drive. Anything outside
 * (blink + eyeLook*) is owned by the local gaze/blink systems.
 */
const CURVE_DRIVEN_PREFIXES = [
  'jaw', 'mouth', 'brow', 'cheek', 'nose', 'sneer', 'chin',
  'upperLip', 'lowerLip', 'tongue',
];

/** ARKit names owned locally — never overwritten by a face track. */
const LOCAL_OWNED = new Set([
  'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeLookUpLeft', 'eyeLookUpRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight',
]);

/** True when a face track may drive this ARKit blendshape name. */
export function isCurveDriven(name) {
  if (LOCAL_OWNED.has(name)) return false;
  return CURVE_DRIVEN_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * Validate/normalize a decoded face-track payload. Returns a clean
 * { fps, durationMs, curves } or null when the payload is unusable —
 * a bad track must never reach the face (fail safe to local engines).
 */
export function validateFaceTrack(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const fps = Number(payload.fps);
  const durationMs = Number(payload.durationMs);
  const rawCurves = payload.curves;
  if (!Number.isFinite(fps) || fps < FPS_MIN || fps > FPS_MAX) return null;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  if (!rawCurves || typeof rawCurves !== 'object') return null;

  const curves = {};
  let shapeCount = 0;
  for (const [name, arr] of Object.entries(rawCurves)) {
    if (!Array.isArray(arr) || arr.length < 2) continue;
    const vals = new Float32Array(arr.length);
    let ok = true;
    for (let i = 0; i < arr.length; i++) {
      const v = Number(arr[i]);
      if (!Number.isFinite(v)) { ok = false; break; }
      vals[i] = v < 0 ? 0 : v > 1.5 ? 1.5 : v; // clamp, tolerate slight overscan
    }
    if (!ok) continue;
    curves[name] = vals;
    shapeCount++;
  }
  if (shapeCount < 4) return null; // a real track carries dozens of shapes
  return { fps, durationMs, curves };
}

/**
 * Sample every curve at elapsedMs with linear interpolation between frames.
 * Returns { name: value }; out-of-range times clamp to the track ends.
 */
export function sampleCurveValues(track, elapsedMs) {
  const out = {};
  if (!track || !track.curves) return out;
  const t = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const frameFloat = (t / 1000) * track.fps;
  for (const [name, vals] of Object.entries(track.curves)) {
    const n = vals.length;
    if (n === 0) { out[name] = 0; continue; }
    if (n === 1 || frameFloat <= 0) { out[name] = vals[0]; continue; }
    const i0 = Math.floor(frameFloat);
    if (i0 >= n - 1) { out[name] = vals[n - 1]; continue; }
    const frac = frameFloat - i0;
    out[name] = vals[i0] + (vals[i0 + 1] - vals[i0]) * frac;
  }
  return out;
}
