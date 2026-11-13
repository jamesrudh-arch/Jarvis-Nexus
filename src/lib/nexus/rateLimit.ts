/**
 * JARVIS NEXUS — in-memory rate limiting (Phase 1, Part 14).
 *
 * Mirrors the FastAPI CORE policy: 5 authentication failures per 60 s per IP
 * → 429 with Retry-After; plus a general abuse cap on privileged routes.
 *
 * Scope note (documented in ENGINEERING_DECISIONS ED-P1-2): the counters are
 * per-process. The production deployment is a single Railway instance, so
 * this matches the enforced behaviour there; a multi-instance deployment
 * would need a shared store (upgrade path noted, not needed today).
 *
 * Pure time logic is injected via `now` so unit tests drive the clock.
 */

export interface RateWindow {
  failures: number[];
  requests: number[];
}

const AUTH_FAILURE_LIMIT = 5;
const AUTH_FAILURE_WINDOW_MS = 60_000;
const GENERAL_LIMIT = 240;
const GENERAL_WINDOW_MS = 60_000;

const buckets = new Map<string, RateWindow>();

function bucket(ip: string): RateWindow {
  let w = buckets.get(ip);
  if (!w) {
    w = { failures: [], requests: [] };
    buckets.set(ip, w);
  }
  return w;
}

function prune(list: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  while (list.length && list[0] < cutoff) list.shift();
  return list;
}

export function clientIpFromRequest(req: Request): string {
  // Single-instance deployment behind Railway's proxy: prefer the forwarded
  // header, fall back to direct socket info if present.
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

/** Record one authentication failure for an IP. */
export function registerAuthFailure(ip: string, now = Date.now()): void {
  const w = bucket(ip);
  w.failures.push(now);
  prune(w.failures, now, AUTH_FAILURE_WINDOW_MS);
}

/** True when the IP is inside the general request budget. Records the request. */
export function consumeGeneralRequest(ip: string, now = Date.now()): boolean {
  const w = bucket(ip);
  w.requests.push(now);
  prune(w.requests, now, GENERAL_WINDOW_MS);
  return w.requests.length <= GENERAL_LIMIT;
}

/** True when the IP has exceeded the auth-failure budget (→ 429). */
export function authFailuresExceeded(ip: string, now = Date.now()): boolean {
  const w = buckets.get(ip);
  if (!w) return false;
  return prune(w.failures, now, AUTH_FAILURE_WINDOW_MS).length >= AUTH_FAILURE_LIMIT;
}

/** Seconds until the auth-failure lockout lifts (for Retry-After). */
export function authRetryAfterSec(ip: string, now = Date.now()): number {
  const w = buckets.get(ip);
  if (!w) return 0;
  const live = prune(w.failures, now, AUTH_FAILURE_WINDOW_MS);
  if (live.length < AUTH_FAILURE_LIMIT) return 0;
  const oldest = live[0];
  return Math.max(1, Math.ceil((oldest + AUTH_FAILURE_WINDOW_MS - now) / 1000));
}

/** Test/maintenance hook: clear all counters. */
export function resetRateLimits(): void {
  buckets.clear();
}
