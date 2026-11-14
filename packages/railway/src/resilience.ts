/**
 * @nexus/railway — resilience primitives: circuit breaker + backoff policy.
 *
 * Directive §12: exponential backoff, retry limits, request timeouts,
 * circuit breakers, graceful degradation. Time and randomness are injectable
 * so tests are deterministic.
 */

export type BreakerState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening. */
  failureThreshold?: number;
  /** How long the breaker stays open before a half-open probe. */
  cooldownMs?: number;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private halfOpenProbes = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, opts.failureThreshold ?? 5);
    this.cooldownMs = Math.max(1_000, opts.cooldownMs ?? 30_000);
  }

  /** May a request pass right now? */
  canPass(now: number = Date.now()): boolean {
    const s = this.state(now);
    if (s === "closed") return true;
    if (s === "half_open") return this.halfOpenProbes < 1; // single probe while half-open
    return false;
  }

  /** Register that a half-open probe is being attempted. */
  beginProbe(): void {
    this.halfOpenProbes++;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.halfOpenProbes = 0;
  }

  recordFailure(now: number = Date.now()): void {
    this.failures++;
    this.halfOpenProbes = 0;
    if (this.failures >= this.failureThreshold) this.openedAt = now;
  }

  state(now: number = Date.now()): BreakerState {
    if (this.openedAt === null) return "closed";
    if (now - this.openedAt >= this.cooldownMs) return "half_open";
    return "open";
  }

  snapshot(): { state: BreakerState; failures: number } {
    return { state: this.state(), failures: this.failures };
  }
}

/**
 * Exponential backoff with full jitter, capped, honouring server-provided
 * `Retry-After` when it demands a longer wait. Pure function (testable).
 */
export function computeBackoffMs(
  attempt: number,
  opts: { baseMs?: number; capMs?: number; retryAfterMs?: number; jitter?: () => number } = {},
): number {
  const baseMs = opts.baseMs ?? 400;
  const capMs = opts.capMs ?? 20_000;
  const jitter = opts.jitter ?? Math.random;
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const withJitter = Math.floor(exp * (0.5 + 0.5 * jitter()));
  if (opts.retryAfterMs !== undefined) return Math.min(60_000, Math.max(withJitter, opts.retryAfterMs));
  return withJitter;
}
