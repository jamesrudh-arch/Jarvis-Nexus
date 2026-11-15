# STAGE 2.4B — LOCKOUT REMEDIATION IMPLEMENTATION REPORT (F-2.4A-01)

**Commit:** `6b21787` on `stage2.4b-remediation` (fix + backstop + tests + probe tooling).
**Files touched for this fix:** `apps/nexus-api/src/index.ts` (lockout section, clock seam, observability accessor), `tests/integration/auth-lockout.test.ts` (new, 12 tests), `scripts/stage24b/repro_f24a01.ts` (new, time-real reproduction probe).

---

## 1. The lockout fix (requireOwner)

```ts
const afKey = `authfail:${ip}`;
const af = authFailBuckets.get(afKey);
if (af) {
  if (nowMs - af.windowStart < AUTH_WINDOW_MS) {          // window LIVE
    if (af.count >= AUTH_FAIL_LIMIT_PER_MIN) {
      // fail-closed: even a VALID token is refused while the window is live
      const retry = Math.max(1, Math.ceil((af.windowStart + AUTH_WINDOW_MS - nowMs) / 1000));
      return c.json({ error: "rate_limited" }, 429,
        { "Retry-After": String(retry), "x-lockout-scope": "identity" });
    }
  } else {
    authFailBuckets.delete(afKey);                        // expired → safe reset
  }
}
```

- Locked **iff** the window is live AND the count is at the limit. After expiry the bucket is deleted in one synchronous pass; a later failed attempt re-opens a fresh window through `hitBucket` (which already resets expired windows on the increment path).
- Because the whole section contains no `await` between read and delete, concurrent requests (single event loop) can never observe a half-reset state — the concurrency tests assert exact outcome distributions (3×401 + 27×429 for a 30-request parallel flood; exactly the limit ever passes as 401).
- `Retry-After` is now always a truthful live-window value (boundary tests assert **30** at +30 s and **1** at +59 999 ms; unlock at exactly +60 000 ms).

## 2. The global auth-fail backstop (new, F-2.4A-02 mitigation)

`AUTH_FAIL_GLOBAL_LIMIT_PER_MIN` (default **300**, `Math.max(1, …)` like every other limit) counts failed owner-auth attempts across **all** identities in a shared budget, enforced in `requireOwner` after the per-identity check, with identical expiry semantics:

- Purpose: the rate-limit identity is the **first X-Forwarded-For entry**, a client-controlled header (F-2.4A-02). Whatever the Railway edge does with it (official docs say overwrite; a community report says append — **neither is proven**, see SECURITY_REASSESSMENT), rotation can no longer multiply the brute-force budget: total failed-auth throughput is bounded at 300/min by construction.
- Availability trade-off, stated honestly: while the global window is live, protected routes answer 429 to every identity, including valid tokens (fail-closed, `x-lockout-scope: global`). Maximum global lockout per exhausted window: 60 s. Public routes are never collateral (unchanged).
- Reserved key `authfail:__global__`. A client literally sending `__global__` as its XFF identity aliases the shared entry — every consequence of that alias is **stricter** (its failures double-count), never looser; documented in-source so it is not rediscovered as a mystery.
- `x-lockout-scope: identity|global` on 429s: operational transparency. An attacker learning that a shared backstop exists gains nothing — it cannot be bypassed; the per-identity budget remains independently enforced.

## 3. Deterministic time control (directive requirement)

`NexusApiConfig.nowFn?: () => number` — an injectable clock used by the rate-limit middleware, `requireOwner`, and the lockout tests. Production wiring (`main.ts`) never sets it → `Date.now()`. This is the same class of test seam as the existing `railwayFetchFn` (production code, test-only usage, labelled in-source); V1 fabrication checks remain green.

## 4. Memory-bound hardening

- Expired **locked** buckets — the exact F-2.4A-01 population — are now deleted when touched after expiry (the fix path itself).
- The opportunistic sweep (trigger ≥ 10 000 entries, deletes ≥ 120 s-stale) is retained unchanged: a burst can grow the map past the trigger by at most the burst size; the flood test (12 000 identities) proves reclamation — after 130 s on the fake clock and one request, `authFail` map size returned to ≤ 100 (observed ~0) and `rate` to ≤ 100 (observed ~1). `debugBucketSizes()` (counts only, no identities) is the read-only observability accessor added for that regression test.

## 5. Contracts preserved (verified by the 35/35 E2E matrix + 239-pass suite)

- 401 on invalid/missing/mangled credentials while unlocked (AUTH-01..06, SEC-04..06).
- 429 + truthful `Retry-After` while locked; valid tokens refused during the live window (SEC-10) — fail-closed preserved.
- Public routes never collateral (SEC-11).
- Constant-time token comparison; header-only key transport (no query-string keys — AUTH-05).
- No existing test was weakened: the pre-fix suite (206 tests at Stage 2.4A) passes in full; 12 new deterministic tests added; the 12 credential-gated skips are the unchanged environmental set.

## 6. Proof the original defect is dead

1. **Time-real, identical scenario, pre-fix tree** (`evidence/repro-f24a01-pre.json`, worktree pinned to `6a788348`): valid key → 429 after 70 s. DEFECT REPRODUCED.
2. **Same probe, remediated tree** (`evidence/repro-f24a01-post.json`): valid key → 200 after 70 s; wrong key → honest 401; public routes 200 throughout. DEFECT NOT REPRODUCED.
3. **Deterministic regression suite** (`tests/integration/auth-lockout.test.ts`, 12 tests, zero real sleeps): activation, in-window behaviour (valid+invalid+public), post-expiry valid (the fix), post-expiry invalid with re-lock, boundary timestamps (59 999 ms locked with Retry-After 1; 60 000 ms exactly unlocked), exact Retry-After values, 20-request parallel lockout, 30-request parallel flood with exact counts, multi-identity isolation, global backstop, restart behaviour (fresh instance unlocked; same instance recovers by expiry — restart no longer needed), 12 000-identity memory reclaim. All pass.
