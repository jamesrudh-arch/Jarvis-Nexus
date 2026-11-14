/**
 * @nexus/core — foundational primitives shared by every NEXUS subsystem.
 * No dependencies on other workspace packages (dependency root).
 */
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Prefixed, sortable-enough unique id: nexus_<domain>_<uuid> */
export function nexusId(domain: string): string {
  const d = domain.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12);
  return `nexus_${d}_${randomUUID()}`;
}

export const ID_PREFIXES = {
  task: "task",
  agent: "agent",
  world: "world",
  resident: "res",
  vehicle: "veh",
  property: "prop",
  event: "evt",
  memory: "mem",
  business: "biz",
  account: "acct",
  txn: "txn",
  mcp: "mcp",
  req: "req",
  audit: "aud",
  snapshot: "snap",
  workspace: "ws",
} as const;

// ---------------------------------------------------------------------------
// Clock — injectable time source (deterministic tests, sim time)
// ---------------------------------------------------------------------------

export interface Clock {
  now(): Date;
  nowMs(): number;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
};

/** Fixed clock for deterministic tests. */
export function fixedClock(at: Date | number): Clock {
  const t = typeof at === "number" ? at : at.getTime();
  return { now: () => new Date(t), nowMs: () => t };
}

/** Mutable reference clock — simulation time advances explicitly. */
export function simulationClock(startMs?: number): Clock & { set(ms: number): void; advance(ms: number): void } {
  let t = startMs ?? Date.now();
  return {
    now: () => new Date(t),
    nowMs: () => t,
    set: (ms) => { t = ms; },
    advance: (ms) => { t += ms; },
  };
}

// ---------------------------------------------------------------------------
// Result type — explicit, exhaustive error handling
// ---------------------------------------------------------------------------

export type Result<T, E = NexusError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Errors — classified, machine-readable
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "TOOL_ERROR"
  | "SCHEMA_ERROR"
  | "DEPENDENCY_ERROR"
  | "BUDGET_EXCEEDED"
  | "INTERNAL_ERROR";

export class NexusError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly retryable: boolean;
  constructor(code: ErrorCode, message: string, opts?: { details?: unknown; retryable?: boolean; cause?: unknown }) {
    super(message);
    this.name = "NexusError";
    this.code = code;
    this.details = opts?.details;
    this.retryable = opts?.retryable ?? (code === "TIMEOUT" || code === "PROVIDER_ERROR");
    if (opts?.cause) this.cause = opts.cause;
  }
}

export function asNexusError(e: unknown): NexusError {
  if (e instanceof NexusError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new NexusError("INTERNAL_ERROR", msg, { cause: e });
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

export function safeJsonParse<T>(raw: string): Result<T> {
  try {
    return ok(JSON.parse(raw) as T);
  } catch (e) {
    return err(new NexusError("SCHEMA_ERROR", "Invalid JSON", { details: String(e).slice(0, 300) }));
  }
}

export function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v === undefined ? null : v));
}

// ---------------------------------------------------------------------------
// Retry with backoff
// ---------------------------------------------------------------------------

export interface RetryOpts {
  attempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: NexusError) => void;
}

export async function withRetry<T>(fn: () => Promise<Result<T>>, opts: RetryOpts): Promise<Result<T>> {
  const base = opts.baseDelayMs ?? 250;
  const max = opts.maxDelayMs ?? 5_000;
  let last: NexusError = new NexusError("INTERNAL_ERROR", "not attempted");
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    const r = await fn();
    if (r.ok) return r;
    last = r.error;
    if (!r.error.retryable || attempt === opts.attempts) return r;
    opts.onRetry?.(attempt, r.error);
    const delay = Math.min(max, base * 2 ** (attempt - 1));
    await new Promise((res) => setTimeout(res, delay));
  }
  return err(last);
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic PRNG (mulberry32) — reproducible simulation decisions. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weightedPick<T>(rng: () => number, options: Array<{ value: T; weight: number }>): T {
  const total = options.reduce((s, o) => s + Math.max(0, o.weight), 0);
  if (total <= 0) return options[0]!.value;
  let roll = rng() * total;
  for (const o of options) {
    roll -= Math.max(0, o.weight);
    if (roll <= 0) return o.value;
  }
  return options[options.length - 1]!.value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
