/**
 * STAGE 2.4B / F-2.4A-01 — authentication-lockout regression tests.
 *
 * Deterministic time control: the app is built with the `nowFn` seam, so every
 * window/expiry assertion runs on a FAKE clock. No real-time sleeps anywhere in
 * this file — the only waits are 0 ms-ordering helpers. This is the fast,
 * complete regression suite for the lockout defect; the time-real reproduction
 * probe (scripts/stage24b/repro_f24a01.ts) exists separately as evidence.
 *
 * Covers (directive §2, F-2.4A-01):
 *   1. lockout activation (fail-closed, even valid tokens)
 *   2. requests during lockout (protected 429, public 200)
 *   3. valid credentials after expiry — THE defect fix
 *   4. invalid credentials after expiry (fresh window, then re-lock)
 *   5. boundary timestamps (59,999 ms locked; 60,000 ms exactly unlocked; exact Retry-After)
 *   6. concurrent requests cannot corrupt state
 *   7. multiple client identities + the global backstop (identity rotation bounded)
 *   8. restart behaviour (state is process-local; restart always clears — and is
 *      no longer REQUIRED, which is the point of the fix)
 *   9. memory cleanup (expired buckets are reclaimed; maps stay bounded)
 */
import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { createApp } from "@nexus/api";

const TMP = `/tmp/stage24b_lockout_${Date.now()}`;
mkdirSync(`${TMP}`, { recursive: true });

const OWNER_KEY = "lockout-owner-key-stage24b";

// ---- deterministic clock ----------------------------------------------------
let fakeNow = 1_736_000_000_000; // fixed arbitrary epoch (ms)
const tick = (ms: number) => { fakeNow += ms; };
const clock = () => fakeNow;

const app = createApp({
  dbPath: `${TMP}/nexus.db`,
  workspaceRoot: `${TMP}/ws`,
  env: {
    OWNER_KEY,
    NEXUS_ALLOW_ECHO: "true",
    NEXUS_BACKUP_INTERVAL_HOURS: "0",
    RATE_LIMIT_PER_MIN: "100000",       // the global request limiter must never interfere here
    AUTH_FAIL_LIMIT_PER_MIN: "3",       // tight identity budget -> fast deterministic tests
    AUTH_FAIL_GLOBAL_LIMIT_PER_MIN: "6", // tight global backstop (2x the identity budget)
  } as Record<string, string>,
  nowFn: clock,
});

const req = (path: string, init: RequestInit = {}) => app.app.request(new Request(`http://lock.test${path}`, init));
const wrong = (ip: string) => ({ headers: { "X-Forwarded-For": ip, Authorization: "Bearer wrong-key" } });
const valid = (ip: string) => ({ headers: { "X-Forwarded-For": ip, Authorization: `Bearer ${OWNER_KEY}` } });
const pub = (ip: string) => ({ headers: { "X-Forwarded-For": ip } });

afterAll(() => {
  app.stopBackupScheduler();
  app.db.close();
  rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1+2. activation and behaviour during the live window
// ---------------------------------------------------------------------------
describe("lockout activation (fail-closed while the window is live)", () => {
  const ip = "203.0.113.101";

  test("budget exhaustion locks the identity: 401s then 429 with a truthful Retry-After", async () => {
    tick(61_000); // start from a clean window for this identity set
    for (let i = 0; i < 3; i++) {
      const r = await req("/mcp/audit", wrong(ip));
      expect(r.status).toBe(401);
    }
    const lockedWrong = await req("/mcp/audit", wrong(ip));
    expect(lockedWrong.status).toBe(429);
    expect(lockedWrong.headers.get("x-lockout-scope")).toBe("identity");
    expect(Number(lockedWrong.headers.get("Retry-After"))).toBe(60); // whole window ahead (no time passed)

    // fail-closed: a VALID token is refused while locked (that is the point)
    const lockedValid = await req("/mcp/audit", valid(ip));
    expect(lockedValid.status).toBe(429);
    expect(lockedValid.headers.get("x-lockout-scope")).toBe("identity");
  });

  test("public routes are never collateral damage of an identity lockout", async () => {
    expect((await req("/health", pub(ip))).status).toBe(200);
    expect((await req("/world/state", pub(ip))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 5. boundary timestamps (run while .101 is still locked from the block above)
// ---------------------------------------------------------------------------
describe("boundary timestamps", () => {
  const ip = "203.0.113.101";

  test("mid-window: locked with the exact remaining seconds in Retry-After", async () => {
    tick(30_000); // window started at the first failure of the previous block
    const r = await req("/mcp/audit", valid(ip));
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("Retry-After"))).toBe(30); // 60s window - 30s elapsed
  });

  test("at 59,999 ms: still locked, Retry-After === 1", async () => {
    tick(29_999);
    const r = await req("/mcp/audit", valid(ip));
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("Retry-After"))).toBe(1);
  });

  test("at exactly 60,000 ms: UNLOCKED — the fix (pre-fix this stayed 429 forever)", async () => {
    tick(1);
    const r = await req("/mcp/audit", valid(ip));
    expect(r.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 3+4. the original defect scenario, and post-expiry invalid credentials
// ---------------------------------------------------------------------------
describe("valid credentials after expiry — the F-2.4A-01 scenario (70 s real-equivalent)", () => {
  const ip = "203.0.113.102";

  test("valid credential works again after the window — WITHOUT any restart", async () => {
    tick(61_000); // clean window
    for (let i = 0; i < 3; i++) expect((await req("/mcp/audit", wrong(ip))).status).toBe(401);
    expect((await req("/mcp/audit", valid(ip))).status).toBe(429); // locked
    tick(70_000); // the exact Stage 2.4A condition: 60 s window + 10 s margin
    // pre-fix (main 6a788348): still 429 here, forever, until a process restart
    expect((await req("/mcp/audit", valid(ip))).status).toBe(200);
    // public routes were available throughout
    expect((await req("/health", pub(ip))).status).toBe(200);
  });

  test("invalid credentials after expiry: honest 401, fresh window, then re-lock at the limit", async () => {
    tick(61_000); // clean window
    expect((await req("/mcp/audit", wrong(ip))).status).toBe(401); // fresh bucket, count 1
    expect((await req("/mcp/audit", wrong(ip))).status).toBe(401); // count 2
    expect((await req("/mcp/audit", wrong(ip))).status).toBe(401); // count 3 (limit reached)
    expect((await req("/mcp/audit", wrong(ip))).status).toBe(429); // re-locked
    tick(60_000);
    expect((await req("/mcp/audit", valid(ip))).status).toBe(200); // and recovers again
  });
});

// ---------------------------------------------------------------------------
// 7. multiple identities + the global backstop
// ---------------------------------------------------------------------------
describe("multiple client identities + global backstop (identity rotation is bounded)", () => {
  test("a locked identity does not lock others; exhausting the GLOBAL budget locks everyone (protected only)", async () => {
    tick(61_000); // clean window for the whole block
    const a = "203.0.113.103";
    const b = "203.0.113.104";
    const c = "203.0.113.105";

    for (let i = 0; i < 3; i++) expect((await req("/mcp/audit", wrong(a))).status).toBe(401);
    expect((await req("/mcp/audit", valid(a))).status).toBe(429); // a locked (identity scope)

    // b is NOT collateral damage of a's lockout
    expect((await req("/mcp/audit", valid(b))).status).toBe(200);

    // b burns its own identity budget too -> global budget now exhausted (6)
    for (let i = 0; i < 3; i++) expect((await req("/mcp/audit", wrong(b))).status).toBe(401);

    // a COMPLETELY FRESH identity with a VALID token is refused while the
    // global window is live: rotating the client-controlled identity header
    // cannot buy more brute-force budget (F-2.4A-02 bound)
    const r = await req("/mcp/audit", valid(c));
    expect(r.status).toBe(429);
    expect(r.headers.get("x-lockout-scope")).toBe("global");
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);

    // public routes remain available for everyone
    expect((await req("/health", pub(c))).status).toBe(200);

    // identity-scope lockouts answer "identity" even when global is also full
    const ra = await req("/mcp/audit", valid(a));
    expect(ra.status).toBe(429);
    expect(ra.headers.get("x-lockout-scope")).toBe("identity");

    // after the window: everyone recovers without a restart
    tick(60_000);
    expect((await req("/mcp/audit", valid(c))).status).toBe(200);
    expect((await req("/mcp/audit", valid(a))).status).toBe(200);
    expect((await req("/mcp/audit", valid(b))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 6. concurrency
// ---------------------------------------------------------------------------
describe("concurrent requests cannot corrupt lockout state", () => {
  test("20 parallel requests during a live lockout: all 429, none leak through", async () => {
    tick(61_000);
    const ip = "203.0.113.106";
    for (let i = 0; i < 3; i++) expect((await req("/mcp/audit", wrong(ip))).status).toBe(401);
    const mix = Array.from({ length: 20 }, (_, i) => req("/mcp/audit", i % 2 === 0 ? valid(ip) : wrong(ip)));
    const rs = await Promise.all(mix);
    for (const r of rs) {
      expect(r.status).toBe(429); // no valid-token leak, no 500
      expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
    }
  });

  test("30 parallel failures from one identity: exactly the limit passes as 401, the rest 429 (no over-counting, no lost updates)", async () => {
    tick(61_000);
    const ip = "203.0.113.107";
    const rs = await Promise.all(Array.from({ length: 30 }, () => req("/mcp/audit", wrong(ip))));
    const byStatus = { "401": 0, "429": 0 } as Record<string, number>;
    for (const r of rs) byStatus[String(r.status)] = (byStatus[String(r.status)] ?? 0) + 1;
    expect(byStatus["401"]).toBe(3); // the limit — never more (over-count would still show 3 here only if atomic)
    expect(byStatus["429"]).toBe(27);
    // state is coherent afterwards: locked now, recovered after the window
    expect((await req("/mcp/audit", valid(ip))).status).toBe(429);
    tick(60_000);
    expect((await req("/mcp/audit", valid(ip))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 8. restart behaviour (lockout state is process-local by design)
// ---------------------------------------------------------------------------
describe("restart behaviour", () => {
  test("a fresh instance (process-restart stand-in) starts unlocked; the SAME instance recovers by expiry — no restart needed", async () => {
    tick(61_000);
    const ip = "203.0.113.108";
    for (let i = 0; i < 3; i++) expect((await req("/mcp/audit", wrong(ip))).status).toBe(401);
    expect((await req("/mcp/audit", valid(ip))).status).toBe(429);

    // fresh app instance = what a process restart would see (buckets are in-memory)
    const app2 = createApp({
      dbPath: `${TMP}/nexus.db`,
      workspaceRoot: `${TMP}/ws`,
      env: {
        OWNER_KEY, NEXUS_ALLOW_ECHO: "true", NEXUS_BACKUP_INTERVAL_HOURS: "0",
        RATE_LIMIT_PER_MIN: "100000", AUTH_FAIL_LIMIT_PER_MIN: "3", AUTH_FAIL_GLOBAL_LIMIT_PER_MIN: "6",
      } as Record<string, string>,
      nowFn: clock,
    });
    const r2 = await app2.app.request(new Request("http://lock.test/mcp/audit", { method: "GET", headers: { "X-Forwarded-For": ip, Authorization: `Bearer ${OWNER_KEY}` } }));
    expect(r2.status).toBe(200); // restart always cleared lockouts — historical recovery path
    app2.stopBackupScheduler();
    app2.db.close();

    // the ORIGINAL instance recovers purely by window expiry (the fix)
    tick(60_000);
    expect((await req("/mcp/audit", valid(ip))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 9. memory cleanup — the maps cannot grow without bound
// ---------------------------------------------------------------------------
describe("memory cleanup (unbounded in-memory bucket growth is prevented)", () => {
  // FINAL-EXECUTION FIX (test-only, no assertion changed): the 12,000-request
  // loop is compute-bound (~0.6-0.7 ms/request on GitHub Actions runners =
  // 7-10 s wall clock) and bun's DEFAULT 5 s per-test timeout is a latent
  // environment-speed defect — it intermittently failed CI on slower runners
  // (runs 43829303613 + rerun on commit 453e355) while passing on faster ones
  // (run 43826898376 on 250ca25, identical code). The test's intent is memory
  // reclamation under a FAKE clock; the wall-clock budget is incidental.
  // Explicit 60 s budget removes the environment sensitivity.
  test("a 12,000-identity flood is reclaimed once stale; maps return to a tiny size", async () => {
    // dedicated instance: generous auth budgets so the flood measures MEMORY,
    // not lockout (1 failure per identity, no identity or global trip)
    const app2 = createApp({
      dbPath: `${TMP}/flood.db`,
      workspaceRoot: `${TMP}/ws-flood`,
      env: {
        OWNER_KEY, NEXUS_ALLOW_ECHO: "true", NEXUS_BACKUP_INTERVAL_HOURS: "0",
        RATE_LIMIT_PER_MIN: "100000", AUTH_FAIL_LIMIT_PER_MIN: "3", AUTH_FAIL_GLOBAL_LIMIT_PER_MIN: "1000000",
      } as Record<string, string>,
      nowFn: clock,
    });
    const req2 = (path: string, init: RequestInit = {}) => app2.app.request(new Request(`http://flood.test${path}`, init));

    let lastStatus = 0;
    for (let i = 0; i < 12_000; i++) {
      const ip = `198.18.${(i >> 8) & 0xff}.${i & 0xff}`;
      const r = await req2("/mcp/audit", { headers: { "X-Forwarded-For": ip, Authorization: "Bearer wrong" } });
      lastStatus = r.status;
    }
    expect(lastStatus).toBe(401); // every failure was processed (none silently dropped)

    const during = app2.debugBucketSizes();
    expect(during.authFail).toBeGreaterThanOrEqual(10_000); // the burst grew the map past the sweep trigger
    expect(during.authFail).toBeLessThanOrEqual(12_001); // and only by the burst (one entry per identity)

    // all entries become stale on the fake clock; one more request triggers the sweep
    tick(130_000);
    expect((await req2("/mcp/audit", { headers: { "X-Forwarded-For": "198.19.0.1", Authorization: `Bearer ${OWNER_KEY}` } })).status).toBe(200);

    const after = app2.debugBucketSizes();
    // reclaimed: everything expired was deleted; only the last request's own
    // rate bucket (and nothing auth-fail) remains
    expect(after.authFail).toBeLessThanOrEqual(100);
    expect(after.rate).toBeLessThanOrEqual(100);

    // expired LOCKED buckets are also deleted by requireOwner's expiry path:
    // lock one identity (limit 3 on this instance), let it expire, touch it —
    // the request succeeds and the stale bucket is gone
    tick(61_000);
    const ipLocked = "198.19.0.2";
    for (let i = 0; i < 3; i++) expect((await req2("/mcp/audit", { headers: { "X-Forwarded-For": ipLocked, Authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await req2("/mcp/audit", { headers: { "X-Forwarded-For": ipLocked, Authorization: `Bearer ${OWNER_KEY}` } })).status).toBe(429);
    tick(60_000);
    expect((await req2("/mcp/audit", { headers: { "X-Forwarded-For": ipLocked, Authorization: `Bearer ${OWNER_KEY}` } })).status).toBe(200);

    app2.stopBackupScheduler();
    app2.db.close();
  }, 60_000);
});
