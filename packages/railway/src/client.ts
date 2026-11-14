/**
 * @nexus/railway — Railway GraphQL client.
 *
 * Verified behaviours this client is built on (official docs + live probes,
 * 2026-11-15):
 *  - Endpoint: https://backboard.railway.com/graphql/v2 (POST, JSON body).
 *  - Rate limits are advertised on every response: RateLimit-Policy,
 *    X-RateLimit-Limit / -Remaining / -Reset, and Retry-After on 429.
 *  - Reads are safe to retry; writes (mutations) must only be retried when
 *    no response was received (network error) — otherwise effects may double.
 *  - Auth failures arrive as HTTP 200 + errors[] "Not Authorized" (or 401/403).
 *  - Workspace/account tokens use `Authorization: Bearer`; project tokens use
 *    `Project-Access-Token`.
 *
 * Everything failure-prone is injectable (fetchFn, sleepFn, now) so tests are
 * deterministic and no test ever touches the network.
 */
import { CredentialManager } from "./credentials";
import { RailwayApiError, redactSecrets } from "./errors";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import { CircuitBreaker, computeBackoffMs } from "./resilience";

export const RAILWAY_ENDPOINT = "https://backboard.railway.com/graphql/v2";

export interface RateLimitInfo {
  policy?: string;
  limit?: number;
  remaining?: number;
  reset?: string;
  retryAfterMs?: number;
}

/** Structured, redacted client events for observability (directive §14). */
export type ClientEvent =
  | { kind: "request"; operation: "query" | "mutation"; ms: number; status?: number }
  | { kind: "retry"; attempt: number; reason: string; waitMs: number }
  | { kind: "rate_limited"; remaining?: number; waitMs: number }
  | { kind: "budget_guard"; remaining?: number; floor: number }
  | { kind: "breaker_open"; failures: number }
  | { kind: "auth_failure"; message: string }
  | { kind: "cache_hit"; ageMs: number }
  | { kind: "contract_drift"; message: string };

export interface RailwayClientOptions {
  credentials: CredentialManager;
  endpoint?: string;
  timeoutMs?: number;          // per-attempt timeout (default 15s)
  maxRetries?: number;         // retries per request (default 3)
  backoffBaseMs?: number;
  backoffCapMs?: number;
  rateBudgetFloor?: number;    // refuse non-critical calls below this remaining (default 50)
  cacheTtlMs?: number;         // query cache TTL (default 30s)
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  now?: () => number;
  breaker?: CircuitBreaker;
  onEvent?: (e: ClientEvent) => void;
}

interface CacheEntry { data: unknown; rate: RateLimitInfo; at: number }

export interface ClientStats {
  requests: number;
  failures: number;
  retries: number;
  cacheHits: number;
  avgLatencyMs: number;
  breaker: { state: string; failures: number };
  lastRate: RateLimitInfo | null;
}

export class RailwayClient {
  private readonly endpoint: string;
  private readonly credentials: CredentialManager;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;
  private readonly rateBudgetFloor: number;
  private readonly cacheTtlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly now: () => number;
  readonly breaker: CircuitBreaker;
  private readonly onEvent?: (e: ClientEvent) => void;

  private readonly cache = new Map<string, CacheEntry>();
  private statsReq = 0;
  private statsFail = 0;
  private statsRetry = 0;
  private statsCacheHits = 0;
  private latencyTotalMs = 0;
  private lastRate: RateLimitInfo | null = null;

  constructor(opts: RailwayClientOptions) {
    this.endpoint = opts.endpoint ?? RAILWAY_ENDPOINT;
    this.credentials = opts.credentials;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffBaseMs = opts.backoffBaseMs ?? 400;
    this.backoffCapMs = opts.backoffCapMs ?? 20_000;
    this.rateBudgetFloor = opts.rateBudgetFloor ?? 50;
    this.cacheTtlMs = opts.cacheTtlMs ?? 30_000;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleepFn = opts.sleepFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.breaker = opts.breaker ?? new CircuitBreaker();
    this.onEvent = opts.onEvent;
  }

  lastRateInfo(): RateLimitInfo | null {
    return this.lastRate;
  }

  stats(): ClientStats {
    return {
      requests: this.statsReq,
      failures: this.statsFail,
      retries: this.statsRetry,
      cacheHits: this.statsCacheHits,
      avgLatencyMs: this.statsReq === 0 ? 0 : Math.round(this.latencyTotalMs / this.statsReq),
      breaker: this.breaker.snapshot(),
      lastRate: this.lastRate,
    };
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  /** Cache key: stable hash of document + variables (no token material). */
  private cacheKey(query: string, variables: Record<string, unknown>): string {
    return `${query}::${JSON.stringify(variables)}`;
  }

  /** Light authentication probe — one cheap query, no assumptions about `me`
   *  (workspace tokens are not entitled to personal resources). */
  async authCheck(): Promise<RailwayResult<{ ok: true; note: string }>> {
    const r = await this.request<{ projects: { edges: Array<{ node: { id: string } }> } }>(
      "query AuthCheck { projects(first: 1) { edges { node { id } } } }",
      {},
      { critical: true },
    );
    if (!r.ok) return { ok: false, error: r.error };
    const tokenType = this.credentials.status().tokenType;
    return railwayOk({
      ok: true,
      note: `authenticated as ${tokenType} token; projects accessible`,
    });
  }

  async request<T>(
    query: string,
    variables: Record<string, unknown> = {},
    opts: { skipCache?: boolean; critical?: boolean; operation?: "query" | "mutation" } = {},
  ): Promise<RailwayResult<{ data: T; rate: RateLimitInfo }>> {
    const operation: "query" | "mutation" = opts.operation ?? (query.trimStart().startsWith("mutation") ? "mutation" : "query");

    // Queries served from cache (mutations are never cached).
    if (operation === "query" && !opts.skipCache) {
      const hit = this.cache.get(this.cacheKey(query, variables));
      if (hit && this.now() - hit.at < this.cacheTtlMs) {
        this.statsCacheHits++;
        this.onEvent?.({ kind: "cache_hit", ageMs: this.now() - hit.at });
        return railwayOk({ data: hit.data as T, rate: hit.rate });
      }
    }

    const tokenResult = this.credentials.getActiveToken();
    if (!tokenResult.ok) return { ok: false, error: tokenResult.error };
    const token = tokenResult.value;
    const credStatus = this.credentials.status();

    // Circuit breaker guard (graceful degradation instead of stampedes).
    if (!this.breaker.canPass(this.now())) {
      this.onEvent?.({ kind: "breaker_open", failures: this.breaker.snapshot().failures });
      return {
        ok: false,
        error: new RailwayApiError({
          kind: "NETWORK",
          message: "circuit breaker open — Railway API temporarily unreachable, degrading gracefully",
          retryable: true,
        }),
      };
    }
    if (this.breaker.state(this.now()) === "half_open") this.breaker.beginProbe();

    // Rate-budget protection: refuse non-critical calls when remaining is low.
    if (
      !opts.critical &&
      this.lastRate?.remaining !== undefined &&
      this.lastRate.remaining < this.rateBudgetFloor
    ) {
      this.onEvent?.({ kind: "budget_guard", remaining: this.lastRate.remaining, floor: this.rateBudgetFloor });
      return {
        ok: false,
        error: new RailwayApiError({
          kind: "BUDGET",
          message: `rate budget guard: ${this.lastRate.remaining} requests remaining (floor ${this.rateBudgetFloor}); non-critical call refused to protect the workspace quota`,
          retryable: true,
        }),
      };
    }

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt++;
      const started = this.now();
      let res: Response;
      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (credStatus.authHeader === "project-access-token") {
          headers["Project-Access-Token"] = token;
        } else {
          headers.authorization = `Bearer ${token}`;
        }
        res = await this.fetchFn(this.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        const isAbort = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
        const error = new RailwayApiError({
          kind: isAbort ? "TIMEOUT" : "NETWORK",
          message: isAbort ? `request timed out after ${this.timeoutMs}ms` : `network failure: ${String(e).slice(0, 160)}`,
        });
        this.statsFail++;
        this.breaker.recordFailure(this.now());
        // Safe-retry rule (official docs): queries retry on any transport
        // failure; MUTATIONS retry only when no connection was established —
        // a timed-out mutation may already have executed server-side, so
        // retrying it could double the effect.
        const mutationSafeRetry = operation === "mutation" && error.kind === "NETWORK";
        if (error.retryable && attempt <= this.maxRetries && (operation === "query" || mutationSafeRetry)) {
          const waitMs = computeBackoffMs(attempt, { baseMs: this.backoffBaseMs, capMs: this.backoffCapMs });
          this.statsRetry++;
          this.onEvent?.({ kind: "retry", attempt, reason: error.kind, waitMs });
          await this.sleepFn(waitMs);
          continue;
        }
        return { ok: false, error };
      }

      const ms = this.now() - started;
      this.statsReq++;
      this.latencyTotalMs += ms;

      const rate: RateLimitInfo = {
        policy: res.headers.get("ratelimit-policy") ?? undefined,
        limit: numOrNull(res.headers.get("x-ratelimit-limit")),
        remaining: numOrNull(res.headers.get("x-ratelimit-remaining")),
        reset: res.headers.get("x-ratelimit-reset") ?? undefined,
        retryAfterMs: secsToMs(res.headers.get("retry-after")),
      };
      this.lastRate = rate;

      type GqlBody = { data?: unknown; errors?: Array<{ message?: string; extensions?: { code?: string; traceId?: string } }> } | null;
      let body: GqlBody = null;
      try {
        body = (await res.json()) as GqlBody;
      } catch {
        body = null;
      }

      this.onEvent?.({ kind: "request", operation, ms, status: res.status });

      // ---- classification (independent HTTP and GraphQL validation) --------
      if (res.status === 429) {
        this.statsFail++;
        this.breaker.recordFailure(this.now());
        const waitMs = rate.retryAfterMs ?? computeBackoffMs(attempt, { baseMs: this.backoffBaseMs, capMs: this.backoffCapMs });
        this.onEvent?.({ kind: "rate_limited", remaining: rate.remaining, waitMs });
        if (attempt <= this.maxRetries) {
          this.statsRetry++;
          this.onEvent?.({ kind: "retry", attempt, reason: "RATE_LIMIT", waitMs });
          await this.sleepFn(waitMs);
          continue;
        }
        return {
          ok: false,
          error: new RailwayApiError({
            kind: "RATE_LIMIT", httpStatus: 429,
            message: "Railway API rate limit exceeded and retry budget exhausted",
            detail: rate,
          }),
        };
      }

      if (res.status === 401 || res.status === 403) {
        this.statsFail++;
        this.breaker.recordFailure(this.now());
        const message = redactSecrets(body?.errors?.[0]?.message ?? `HTTP ${res.status}`);
        this.onEvent?.({ kind: "auth_failure", message });
        return {
          ok: false,
          error: new RailwayApiError({
            kind: "AUTH", httpStatus: res.status, message,
            traceId: body?.errors?.[0]?.extensions?.traceId,
          }),
        };
      }

      if (res.status >= 500) {
        this.statsFail++;
        this.breaker.recordFailure(this.now());
        if (operation === "query" && attempt <= this.maxRetries) {
          const waitMs = computeBackoffMs(attempt, { baseMs: this.backoffBaseMs, capMs: this.backoffCapMs });
          this.statsRetry++;
          this.onEvent?.({ kind: "retry", attempt, reason: `HTTP_${res.status}`, waitMs });
          await this.sleepFn(waitMs);
          continue;
        }
        return {
          ok: false,
          error: new RailwayApiError({
            kind: "HTTP", httpStatus: res.status,
            message: `Railway API server error (HTTP ${res.status})`,
          }),
        };
      }

      if (res.status === 400 || res.status === 422) {
        this.statsFail++;
        this.breaker.recordFailure(this.now());
        const first = body?.errors?.[0]?.message ?? "unspecified validation error";
        const looksLikeSchema = /Cannot query field|Unknown argument|must be defined|Expected type/i.test(first);
        if (looksLikeSchema) this.onEvent?.({ kind: "contract_drift", message: first.slice(0, 160) });
        return {
          ok: false,
          error: new RailwayApiError({
            kind: looksLikeSchema ? "CONTRACT" : "VALIDATION",
            httpStatus: res.status,
            message: redactSecrets(first),
            traceId: body?.errors?.[0]?.extensions?.traceId,
          }),
        };
      }

      if (res.status !== 200) {
        this.statsFail++;
        this.breaker.recordFailure(this.now());
        return {
          ok: false,
          error: new RailwayApiError({
            kind: "HTTP", httpStatus: res.status,
            message: `unexpected HTTP status ${res.status} from Railway API`,
          }),
        };
      }

      // HTTP 200 — validate GraphQL level INDEPENDENTLY (200 != success).
      const errors = body?.errors ?? [];
      if (errors.length > 0) {
        this.statsFail++;
        this.breaker.recordFailure(this.now());
        const first = errors[0]!;
        const message = redactSecrets(first.message ?? "unspecified GraphQL error");
        if (/not authorized|unauthorized|forbidden/i.test(message)) {
          this.onEvent?.({ kind: "auth_failure", message });
          return {
            ok: false,
            error: new RailwayApiError({ kind: "AUTH", httpStatus: 200, message, traceId: first.extensions?.traceId }),
          };
        }
        return {
          ok: false,
          error: new RailwayApiError({
            kind: "GRAPHQL", httpStatus: 200, message,
            traceId: first.extensions?.traceId,
          }),
        };
      }

      if (!body || body.data === undefined || body.data === null) {
        this.statsFail++;
        this.breaker.recordFailure(this.now());
        return {
          ok: false,
          error: new RailwayApiError({
            kind: "GRAPHQL", httpStatus: 200,
            message: "Railway API returned HTTP 200 without data or errors — unexpected response structure",
          }),
        };
      }

      // success
      this.breaker.recordSuccess();
      if (operation === "query") {
        this.cache.set(this.cacheKey(query, variables), { data: body.data, rate, at: this.now() });
      }
      return railwayOk({ data: body.data as T, rate });
    }
  }
}

function numOrNull(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function secsToMs(v: string | null): number | undefined {
  const n = numOrNull(v);
  return n === undefined ? undefined : n * 1000;
}
