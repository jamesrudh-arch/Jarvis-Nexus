# STAGE 2.4B — AUTHENTICATION LOCKOUT REMEDIATION (F-2.4A-01)

**Defect (Stage 2.4A, confirmed):** after 60 invalid owner-auth attempts, the identity received HTTP 429 for *everything*, and a VALID owner key remained blocked after the 60 s window expired — recovery required a process restart. Availability defect, fail-closed direction (could refuse work, never accept it).

**Status: FIXED AND VERIFIED** — reproduced pre-fix and dead post-fix in **two independent sessions** (first pass 2026-11-15T18:13Z; re-verification pass 2026-11-15T20:36Z, concurrent twin probes on one clock), plus 12 deterministic regression tests in both passes.

**Fix commit:** `6b21787` (`stage2.4b-remediation`); probe tooling `scripts/stage24b/repro_f24a01.ts`; tests `tests/integration/auth-lockout.test.ts`.

**Evidence:** first pass `evidence/repro-f24a01-{pre,post}.json` + `evidence/suite-output.txt`; re-verification pass `evidence/reverify/repro-f24a01-{pre,post}.json` + `evidence/reverify/suite-output.txt` (all in this directory tree; SHA256SUMS covers both). Full first-pass analyses: `appendix/first-pass/LOCKOUT_ROOT_CAUSE.md`, `appendix/first-pass/LOCKOUT_REMEDIATION.md`.

---

## 1. Root cause (why the lockout could never expire)

Pre-fix `requireOwner` in `apps/nexus-api/src/index.ts` (main `6a788348`):

```ts
const af = authFailBuckets.get(`authfail:${ip}`);
if (af && af.count >= AUTH_FAIL_LIMIT_PER_MIN) {   // ← NO expiry clause
  const retry = Math.max(1, Math.ceil((af.windowStart + 60_000 - nowMs) / 1000));
  return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(retry) });
}
```

Causal chain: (1) 60 failures leave the bucket `{windowStart: T0, count: 60}`; (2) every later request hits the locked check and returns 429 **before** the token check, so `hitBucket` — the only code that resets an expired window — is never reached again; (3) the 10 000-entry sweep is the only other deleter and a single identity never triggers it; (4) `Retry-After` is clamped to `max(1, …)`, so long after expiry the server promised recovery in 1 s that never came. **The lockout was permanent for the life of the process.** Deeper cause: expiry lived exclusively inside the increment path while the lock check was a separate reader that never reset.

## 2. The fix (expiry semantics, safe reset, no threshold reduction)

```ts
const af = authFailBuckets.get(afKey);
if (af) {
  if (nowMs - af.windowStart < AUTH_WINDOW_MS) {          // window LIVE
    if (af.count >= AUTH_FAIL_LIMIT_PER_MIN) {
      // fail-closed while live: even a VALID token is refused
      const retry = Math.max(1, Math.ceil((af.windowStart + AUTH_WINDOW_MS - nowMs) / 1000));
      return c.json({ error: "rate_limited" }, 429,
        { "Retry-After": String(retry), "x-lockout-scope": "identity" });
    }
  } else {
    authFailBuckets.delete(afKey);                        // expired → safe synchronous reset
  }
}
```

- Locked **iff** window live AND count at limit. The brute-force threshold (60/min) and lockout semantics are untouched — the fix repairs the *clock*, not the *limit*.
- The reset is one synchronous pass (no `await` between read and delete): concurrent requests on the single event loop can never observe a half-reset state.
- The next failed attempt after expiry re-opens a **fresh** window through `hitBucket` (which already resets expired windows on the increment path) — a stale counter can never perpetuate a lockout.
- `Retry-After` is now always a truthful live-window value.
- New `AUTH_FAIL_GLOBAL_LIMIT_PER_MIN` backstop (default 300/min across **all** identities, identical expiry semantics) closes the F-2.4A-02 amplification: rotating the client-controlled XFF identity cannot multiply the brute-force budget — total failed-auth throughput is bounded by construction. Availability trade-off stated honestly: while the shared window is live, protected routes answer 429 to every identity (≤ 60 s per exhausted window); public routes are never collateral.
- Deterministic time control: `NexusApiConfig.nowFn` injectable clock (production wiring never sets it → `Date.now()`); same test-seam class as the existing `railwayFetchFn`. V1 fabrication checks stay green.
- Memory bound: expired locked buckets — the exact F-2.4A-01 population — are deleted when touched after expiry; the ≥ 10 000-entry sweep is retained; 12 000-identity flood test proves reclamation (map returns to ≤ tiny size after 130 s staleness + one request).

## 3. Mandatory tests (directive §3) — all present, all passing in both passes

| # | Directive requirement | Test (12 in `auth-lockout.test.ts` + E2E) | Result |
|---|---|---|---|
| 1 | Invalid attempts reach the intended threshold | activation test: 60×401 | PASS |
| 2 | The next prohibited attempt receives 429 | 61st wrong key → 429 with truthful Retry-After | PASS |
| 3 | A valid key is rejected while lockout is active | valid key in-window → 429 (fail-closed; SEC-10) | PASS |
| 4 | Lockout cannot be extended indefinitely (no documented policy of extension) | in-window attempts never touch the bucket (the locked check returns before `hitBucket`); window length is fixed at 60 s from first failure — boundary tests assert Retry-After 30 at +30 s, 1 at +59 999 ms, unlock at exactly +60 000 ms | PASS |
| 5 | Access recovers automatically after expiration | valid key → 200 after expiry, same instance, no restart (SEC-12 through real HTTP; probe post-fix: 200 after real 70 s) | PASS |
| 6 | A new failure window behaves correctly | invalid after expiry: honest 401, fresh window, re-lock at the limit | PASS |
| 7 | Concurrent attempts do not bypass the threshold | 20-parallel during live lockout: all 429, none leak; 30-parallel flood: exactly 3×401 + 27×429 (atomic, no over/under-counting) | PASS |
| 8 | Multiple client identities remain isolated | locked identity does not lock others; global backstop bounds the total (SEC-13: 6 rotating identities exhaust the shared budget; a fresh identity with a VALID token is refused while the shared window is live, scope `global`, recovers at expiry) | PASS |
| 9 | Existing auth/authz tests continue passing | the 206-test Stage 2.4A set passes unmodified; 35/35 E2E matrix | PASS |

Exact timings, counts and response codes (time-real probe, re-verification pass, both probes launched on one clock at 2026-11-15T20:36:45Z):

| Step | Pre-fix (main `6a788348`) | Post-fix (remediation) |
|---|---|---|
| 60 wrong-key requests | 401 ×60 | 401 ×60 |
| 61st wrong key | 429 (Retry-After 60) | 429 (Retry-After 60) |
| Valid key while locked | 429 | 429 (fail-closed by design) |
| Public `/health` while locked | 200 | 200 |
| Wait 70 s (real time; window 60 s) — measured 70 006 ms | — | — |
| **Valid key after 70 s** | **429 — DEFECT REPRODUCED** | **200 — DEFECT NOT REPRODUCED** |
| Wrong key after 70 s | 429 (also stuck) | 401 (honest) |
| Fresh app instance (restart stand-in) | 200 (restart was the only recovery) | 200 (restart no longer needed) |

## 4. Contracts preserved (nothing weakened to make tests pass)

- 401 on invalid/missing/mangled credentials while unlocked; constant-time compare; header-only key transport (query-string keys rejected).
- 429 + truthful `Retry-After` while locked; valid tokens refused during the live window (fail-closed preserved).
- Public routes never collateral.
- The pre-existing 206-test Stage 2.4A suite passes **unmodified**; no existing test was edited for this fix; the 12 credential-gated skips are the unchanged environmental set.
