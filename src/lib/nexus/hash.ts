/**
 * NEXUS WORLD — deterministic hash primitives (port of NEXUS_WORLD Python).
 *
 * Philosophy (ADR-002): every "random" choice in the world is a pure
 * function of (seed, identifiers) via SHA-256 — no RNG state, no
 * wall-clock. Same inputs ⇒ identical world, forever replayable.
 */
import { createHash } from "crypto";

/** Engine hash: ":"-joined parts → first 16 hex chars as int (Python _h). */
export function h(...parts: (string | number)[]): number {
  const blob = parts.map(String).join(":");
  return parseInt(createHash("sha256").update(blob).digest("hex").slice(0, 16), 16);
}

/** Autonomy hash: "|"-joined parts → first 8 digest bytes big-endian
 *  (Python: int.from_bytes(sha256(key).digest()[:8], "big")). Returns a
 *  BigInt to preserve full 64-bit range; pair with mod(). */
export function ha(...parts: (string | number)[]): bigint {
  const blob = parts.map(String).join("|");
  return createHash("sha256").update(blob).digest().readBigUInt64BE(0);
}

/** Deterministic modulo for BigInt hashes. */
export function mod(v: bigint, n: number): number {
  return Number(v % BigInt(n));
}

/** Deterministic float in [0,1) (Python _unit in geography/spatial.py). */
export function unit(...parts: (string | number)[]): number {
  const blob = parts.map(String).join(":");
  return (
    parseInt(createHash("sha256").update(blob).digest("hex").slice(0, 12), 16) /
    Math.pow(16, 12)
  );
}

export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Canonical JSON with sorted keys (matches Python json.dumps(sort_keys=True)). */
export function canonical(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === "object") {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, sort(val)])
      );
    }
    return x;
  };
  return JSON.stringify(sort(v));
}

/** Deterministic fingerprint of a state blob (Python state_hash shape). */
export function stateHash(blob: unknown): string {
  return createHash("sha256").update(canonical(blob)).digest("hex").slice(0, 16);
}
