/**
 * JARVIS NEXUS — Audio2Face-3D facial-animation provider (Directive §14, D6).
 *
 * Research facts this implementation is built on (RESEARCH_REGISTER.md, 2026-11-12):
 *  - NVIDIA open-sourced Audio2Face in Sep 2025 (models + SDK, MIT-style):
 *    github.com/NVIDIA/Audio2Face-3D — the repo the Master Directive names.
 *    It converts speech audio (+ optional emotion params) into ARKit
 *    blendshape keyframes. Our rig carries ARKit morphs, so the output maps
 *    1:1 onto her face.
 *  - The hosted NIM on build.nvidia.com is DEPRECATED (labelled as such in
 *    the API catalog). It is gRPC-only (grpc.nvcf.nvidia.com:443, function-id
 *    per model). We therefore do NOT depend on it.
 *  - Integration shape: a self-hosted gateway (scripts/a2f_gateway.py) wraps
 *    NVIDIA's official open-source client (Audio2Face-3D-Samples, gRPC) and
 *    exposes a tiny JSON-over-HTTP contract this provider consumes. That
 *    keeps gRPC and the NVIDIA wheel OUT of the Next.js dependency tree
 *    (Directive §3: no unnecessary dependencies) while the actual animation
 *    is produced by the real NVIDIA model wherever the owner hosts it.
 *
 * Honest degradation: with no A2F_SERVICE_URL configured, available() is
 * false, the registry chain falls through, and the client keeps using the
 * local LipsyncZh/LipsyncEn engines. Nothing is fabricated.
 */
import type {
  FacialAnimationProvider,
  FacialAnimationRequest,
  FacialAnimationResult,
} from './types';

const DEFAULT_TIMEOUT_MS = 4000;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

/** Minimal shape check — deep validation happens client-side (faceCurve.mjs). */
function looksLikeTrack(payload: unknown): payload is Omit<FacialAnimationResult, 'providerId'> {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (!Number.isFinite(Number(p.fps)) || Number(p.fps) <= 0) return false;
  if (!Number.isFinite(Number(p.durationMs)) || Number(p.durationMs) <= 0) return false;
  if (!p.curves || typeof p.curves !== 'object') return false;
  return Object.values(p.curves as Record<string, unknown>).some(
    (a) => Array.isArray(a) && a.length >= 2
  );
}

class Audio2FaceProvider implements FacialAnimationProvider {
  readonly id = 'audio2face_local';

  available(): Promise<boolean> {
    return Promise.resolve(Boolean(env('A2F_SERVICE_URL')));
  }

  async animate(req: FacialAnimationRequest): Promise<FacialAnimationResult | null> {
    const base = env('A2F_SERVICE_URL');
    if (!base) return null;
    const url = base.replace(/\/+$/, '') + '/v1/facial_animation';

    const controller = new AbortController();
    const timeoutMs = Number(env('A2F_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env('A2F_API_KEY') ? { authorization: `Bearer ${env('A2F_API_KEY')}` } : {}),
        },
        body: JSON.stringify({
          audio_base64: req.audio.toString('base64'),
          mime: req.mime,
          emotion: req.emotion || 'neutral',
          // The rig speaks ARKit; the gateway maps NVIDIA's native output to it.
          format: 'arkit',
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const payload = await res.json();
      if (!looksLikeTrack(payload)) return null;
      // Normalize to plain JSON-safe records (Buffer->base64 arrays etc).
      const curves: Record<string, number[]> = {};
      for (const [name, arr] of Object.entries(payload.curves as Record<string, unknown>)) {
        if (Array.isArray(arr)) {
          curves[name] = arr.map((v) => Number(v)).filter((v) => Number.isFinite(v));
        }
      }
      return {
        providerId: this.id,
        fps: Number(payload.fps),
        durationMs: Number(payload.durationMs),
        curves,
      };
    } catch {
      return null; // unreachable gateway / timeout → local engines continue
    } finally {
      clearTimeout(timer);
    }
  }
}

export const a2fFace: FacialAnimationProvider = new Audio2FaceProvider();
