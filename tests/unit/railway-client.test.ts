/**
 * Railway client unit tests — MOCKED transport (no network).
 * Covers: error classification matrix, retries/backoff, rate budget, circuit
 * breaker, cache, timeout semantics, credential redaction.
 */
import { describe, expect, test } from "bun:test";
import { RailwayClient, CredentialManager } from "@nexus/railway";
import type { ClientEvent } from "@nexus/railway";
import { CircuitBreaker } from "@nexus/railway";

const TOKEN = "rlwy_wksp_mocktoken_mocktoken_mocktoken1234";

function gqlResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

interface Harness {
  client: RailwayClient;
  events: ClientEvent[];
  sleeps: number[];
  fetches: Array<{ query: string; headers: Record<string, string> }>;
  setNext: (fn: () => Promise<Response>) => void;
}

function makeClient(opts: { responses?: Array<() => Promise<Response>>; breaker?: CircuitBreaker; maxRetries?: number; budgetFloor?: number; cacheTtl?: number } = {}): Harness {
  const credentials = new CredentialManager({ RAILWAY_API_TOKEN: TOKEN });
  const events: ClientEvent[] = [];
  const sleeps: number[] = [];
  const fetches: Harness["fetches"] = [];
  let queue = opts.responses ?? [];
  const fetchFn = (async (_input: unknown, init?: any) => {
    fetches.push({ query: JSON.parse(String(init?.body)).query, headers: init?.headers ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("mock queue empty");
    return next();
  }) as unknown as typeof fetch;
  const client = new RailwayClient({
    credentials,
    fetchFn,
    sleepFn: async (ms: number) => { sleeps.push(ms); },
    maxRetries: opts.maxRetries ?? 3,
    rateBudgetFloor: opts.budgetFloor ?? 5,
    cacheTtlMs: opts.cacheTtl ?? 30_000,
    breaker: opts.breaker ?? new CircuitBreaker({ failureThreshold: 100, cooldownMs: 1000 }),
    onEvent: (e) => events.push(e),
  });
  return { client, events, sleeps, fetches, setNext: (fn) => { queue = [fn]; } };
}

describe("railway client — error classification (mocked transport)", () => {
  test("success returns data and captures rate headers", async () => {
    const h = makeClient({ responses: [() => Promise.resolve(gqlResponse({ data: { x: 1 } }, 200, { "x-ratelimit-remaining": "950" }))] });
    const r = await h.client.request<{ x: number }>("query T { x }");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.data.x).toBe(1);
      expect(r.value.rate.remaining).toBe(950);
    }
  });

  test("HTTP 200 + 'Not Authorized' is an AUTH error (200 is not success)", async () => {
    const h = makeClient({ responses: [() => Promise.resolve(gqlResponse({ errors: [{ message: "Not Authorized" }] }))] });
    const r = await h.client.request("query T { me { id } }");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("AUTH");
  });

  test("HTTP 401 is an AUTH error without retry", async () => {
    const h = makeClient({ responses: [() => Promise.resolve(gqlResponse({ errors: [{ message: "nope" }] }, 401))] });
    const r = await h.client.request("query T { x }");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("AUTH");
    expect(h.fetches.length).toBe(1);
  });

  test("HTTP 400 'Cannot query field' is a CONTRACT error (schema drift signal)", async () => {
    const h = makeClient({ responses: [() => Promise.resolve(gqlResponse({ errors: [{ message: 'Cannot query field "workspaces" on type "Query"' }] }, 400))] });
    const r = await h.client.request("query T { x }");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("CONTRACT");
    expect(h.events.some((e) => e.kind === "contract_drift")).toBe(true);
  });

  test("HTTP 200 + non-auth GraphQL error is a GRAPHQL error", async () => {
    const h = makeClient({ responses: [() => Promise.resolve(gqlResponse({ errors: [{ message: "something exploded" }] }))] });
    const r = await h.client.request("query T { x }");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("GRAPHQL");
  });

  test("HTTP 200 without data or errors is an unexpected-structure error", async () => {
    const h = makeClient({ responses: [() => Promise.resolve(gqlResponse(null))] });
    const r = await h.client.request("query T { x }");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("GRAPHQL");
  });
});

describe("railway client — resilience (mocked)", () => {
  test("429 retries honouring Retry-After, then succeeds", async () => {
    const h = makeClient({
      responses: [
        () => Promise.resolve(gqlResponse({ errors: [{ message: "rate limited" }] }, 429, { "retry-after": "2" })),
        () => Promise.resolve(gqlResponse({ data: { x: 2 } })),
      ],
    });
    const r = await h.client.request<{ x: number }>("query T { x }");
    expect(r.ok).toBe(true);
    expect(h.sleeps.length).toBe(1);
    expect(h.sleeps[0]).toBeGreaterThanOrEqual(2000); // Retry-After: 2s honoured
    expect(h.events.some((e) => e.kind === "rate_limited")).toBe(true);
  });

  test("network failure on a QUERY is retried with backoff, then succeeds", async () => {
    const h = makeClient({
      responses: [
        () => Promise.reject(new Error("ECONNREFUSED")),
        () => Promise.resolve(gqlResponse({ data: { x: 3 } })),
      ],
    });
    const r = await h.client.request<{ x: number }>("query T { x }");
    expect(r.ok).toBe(true);
    expect(h.fetches.length).toBe(2);
    expect(h.sleeps.length).toBe(1);
    expect(h.sleeps[0]!).toBeGreaterThan(0);
  });

  test("TIMEOUT on a MUTATION is NOT retried (may have executed server-side)", async () => {
    const h = makeClient({
      responses: [() => Promise.reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }))],
    });
    const r = await h.client.request("mutation M { deploymentRestart(id: \"x\") }", {}, { operation: "mutation" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("TIMEOUT");
    expect(h.fetches.length).toBe(1); // no retry
  });

  test("NETWORK failure on a MUTATION is retried (no connection was established)", async () => {
    const h = makeClient({
      responses: [
        () => Promise.reject(new Error("ECONNREFUSED")),
        () => Promise.resolve(gqlResponse({ data: { deploymentRestart: true } })),
      ],
    });
    const r = await h.client.request("mutation M { deploymentRestart(id: \"x\") }", {}, { operation: "mutation" });
    expect(r.ok).toBe(true);
    expect(h.fetches.length).toBe(2);
  });

  test("circuit breaker opens after consecutive failures and blocks calls", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
    const h = makeClient({ breaker, responses: [
      () => Promise.reject(new Error("ECONNREFUSED")),
      () => Promise.reject(new Error("ECONNREFUSED")),
      () => Promise.reject(new Error("ECONNREFUSED")),
    ] });
    await h.client.request("query A { x }", {}, { operation: "query" }); // fail 1
    await h.client.request("query B { x }", {}, { operation: "query" }); // fail 2 -> breaker opens
    const r = await h.client.request("query C { x }", {}, { operation: "query" }); // blocked
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("circuit breaker open");
    expect(h.events.some((e) => e.kind === "breaker_open")).toBe(true);
  });

  test("rate budget guard refuses non-critical calls below the floor", async () => {
    const h = makeClient({
      budgetFloor: 50,
      responses: [
        () => Promise.resolve(gqlResponse({ data: { x: 1 } }, 200, { "x-ratelimit-remaining": "40" })),
        () => Promise.resolve(gqlResponse({ data: { x: 2 } })),
      ],
    });
    const first = await h.client.request("query A { x }", {}, { operation: "query" });
    expect(first.ok).toBe(true);
    const second = await h.client.request("query B { x }", {}, { operation: "query" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.kind).toBe("BUDGET");
    expect(h.fetches.length).toBe(1); // refused without a request
    const critical = await h.client.request("query C { x }", {}, { operation: "query", critical: true });
    expect(critical.ok).toBe(true); // critical calls bypass the floor
  });

  test("query cache serves repeats within TTL (one fetch)", async () => {
    const h = makeClient({ responses: [() => Promise.resolve(gqlResponse({ data: { x: 9 } }))] });
    await h.client.request("query T { x }");
    await h.client.request("query T { x }");
    expect(h.fetches.length).toBe(1);
    expect(h.client.stats().cacheHits).toBe(1);
  });

  test("mutations are never cached", async () => {
    const h = makeClient({ responses: [
      () => Promise.resolve(gqlResponse({ data: { deploymentRestart: true } })),
      () => Promise.resolve(gqlResponse({ data: { deploymentRestart: true } })),
    ] });
    await h.client.request("mutation M { deploymentRestart(id: \"x\") }", {}, { operation: "mutation" });
    await h.client.request("mutation M { deploymentRestart(id: \"x\") }", {}, { operation: "mutation" });
    expect(h.fetches.length).toBe(2);
  });
});

describe("railway client — credential hygiene (mocked)", () => {
  test("the raw token never appears in errors, events or stats", async () => {
    const h = makeClient({ responses: [() => Promise.resolve(gqlResponse({ errors: [{ message: `bad token ${TOKEN} rejected` }] }))] });
    const r = await h.client.request("query T { x }");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const serialized = JSON.stringify(r.error.toJSON());
      expect(serialized.includes(TOKEN)).toBe(false);
      expect(serialized.includes("rlwy_<redacted>")).toBe(true);
    }
    expect(JSON.stringify(h.events).includes(TOKEN)).toBe(false);
  });

  test("workspace token uses Bearer; project token uses Project-Access-Token header", async () => {
    const mk = (token: string) => {
      const credentials = new CredentialManager({ RAILWAY_API_TOKEN: token });
      const fetches: Array<Record<string, string>> = [];
      const fetchFn = (async (_i: unknown, init?: any) => {
        fetches.push(init?.headers ?? {});
        return gqlResponse({ data: { x: 1 } });
      }) as unknown as typeof fetch;
      const client = new RailwayClient({ credentials, fetchFn, sleepFn: async () => {} });
      return { client, fetches };
    };
    const ws = mk("rlwy_wksp_mocktoken_mocktoken_mocktoken1234");
    await ws.client.request("query T { x }");
    expect(ws.fetches[0]!.authorization).toBe(`Bearer ${TOKEN}`);
    const proj = mk("rlwy_proj_mocktoken_mocktoken_mocktoken123");
    await proj.client.request("query T { x }");
    expect(proj.fetches[0]!["Project-Access-Token"]).toBeDefined();
    expect(proj.fetches[0]!.authorization).toBeUndefined();
  });

  test("missing token fails closed with UNCONFIGURED (never faked)", async () => {
    const credentials = new CredentialManager({});
    const client = new RailwayClient({ credentials, fetchFn: (async () => { throw new Error("should not be called"); }) as unknown as typeof fetch, sleepFn: async () => {} });
    const r = await client.request("query T { x }");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("UNCONFIGURED");
  });
});
