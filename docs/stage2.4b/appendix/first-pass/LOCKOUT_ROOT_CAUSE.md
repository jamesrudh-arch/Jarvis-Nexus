# STAGE 2.4B — AUTHENTICATION LOCKOUT ROOT-CAUSE ANALYSIS (F-2.4A-01)

**Defect class:** availability, fail-closed (never a confidentiality/integrity risk).
**Reported behaviour (owner, confirmed):** 60 invalid attempts → HTTP 429 for everything from that client identity; a VALID credential remains blocked after the intended 60 s window; recovery required a process restart.

---

## 1. The exact implementation under investigation

`apps/nexus-api/src/index.ts` at main `6a788348` (pre-fix), two cooperating pieces:

```ts
// budget bookkeeping — the ONLY place a window is ever reset
const hitBucket = (buckets, key, limit, nowMs) => {
  const WINDOW_MS = 60_000;
  let b = buckets.get(key);
  if (!b || nowMs - b.windowStart >= WINDOW_MS) {   // expired → fresh bucket
    b = { windowStart: nowMs, count: 0 };
    buckets.set(key, b);
  }
  if (b.count >= limit) return { allowed: false, retryAfterSec: ... };
  b.count += 1;
  return { allowed: true, retryAfterSec: 0 };
};

// the locked check — the defective site
const requireOwner = async (c, next) => {
  const af = authFailBuckets.get(`authfail:${ip}`);
  if (af && af.count >= AUTH_FAIL_LIMIT_PER_MIN) {   // ← NO expiry clause
    const retry = Math.max(1, Math.ceil((af.windowStart + 60_000 - nowMs) / 1000));
    return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(retry) });
  }
  ...token check; on failure: hitBucket(authFailBuckets, `authfail:${ip}`, ...) → 401
};
```

## 2. The causal chain (why the lockout could never expire)

1. Sixty failures within one window leave the bucket at `{ windowStart: T0, count: 60 }`.
2. Every subsequent request from that identity enters `requireOwner`, sees `count >= limit`, and returns 429 **before the token check** — so `hitBucket` is never called again for that key.
3. The **only** code that ever resets an expired window is step 1 of `hitBucket` — which is reachable exclusively on the failed-auth path, which is now unreachable (the locked check returns first, always).
4. `sweepBuckets` (the only other deleter) runs solely when the map reaches **10 000 entries** — a single locked identity never triggers it.
5. `Retry-After` is computed as `max(1, windowStart+60s−now)`; long after expiry this is negative → clamped to **1 s** — actively misleading: the server promises a recovery in 1 s that never comes.

**Conclusion: the lockout is permanent for the life of the process.** The Stage 2.4A one-line diagnosis ("window-expiry check missing in requireOwner") was correct; the deeper cause is that expiry lived exclusively inside the increment path while the lock check is a separate reader that never resets.

## 3. Independent reproduction (this session, pre-fix tree == main `6a788348`)

`scripts/stage24b/repro_f24a01.ts --label pre-fix`, real 70 s wait (window 60 s + 10 s margin), identity `10.24.42.10` — identical to the Stage 2.4A evidence capture. Machine evidence: `evidence/repro-f24a01-pre.json`.

| Step | Expected (correct impl) | Observed (pre-fix) |
|---|---|---|
| 60 wrong-key requests | 401 ×60 | 401 ×60 ✓ |
| 61st wrong key | 429 (lockout activates) | 429 ✓ |
| Valid key while locked | 429 (fail-closed by design) | 429 ✓ |
| Public /health while locked | 200 | 200 ✓ |
| **Valid key after 70 s** | **200** | **429 — DEFECT** |
| Wrong key after 70 s | 401 | 429 (also stuck) |
| Fresh app instance, same DB (restart stand-in) | 200 | 200 — restart was the only recovery |

## 4. Why the defect survived Stage 2.4A

The existing test (`tests/integration/phase3-security.test.ts`, "failed-auth lockout") exercises activation and in-window behaviour only — both of which worked pre-fix. No test ever crossed the window boundary, because doing so with real time costs ≥60 s per case and there was no clock seam. Stage 2.4A's own E2E boundary sweep (SEC-10/11) likewise stayed inside the window. **Lesson recorded: time-dependent security logic without an injectable clock is untestable at its boundaries — that gap is closed this stage** (`nowFn` seam + 12 deterministic tests, zero real sleeps).

## 5. Blast-radius assessment (honest)

- Only protected (owner-gated) routes were affected; public routes never were (verified pre-fix, line 3 of the table above).
- The locked identity is per-process in-memory state; no persistence, no cross-instance effect (single-instance deployment).
- Exploitable for: sustained denial of the owner's programmatic API from one identity (a misconfigured client that fails 60 times locks itself out until the next deploy). NOT exploitable for breach: the fail-closed direction means the defect could only refuse work, never accept it.
- Aggravating case documented in Stage 2.4A: a shared-NAT or attacker who can *cause* 60 failures attributed to the owner's IP could lock the owner out — likelihood low, impact owner-API availability until restart.

## 6. Requirement mapping for the fix (directive §2)

| # | Requirement | Where it is addressed |
|---|---|---|
| 1 | Correct window-expiry logic | `requireOwner`: locked only if `now − windowStart < 60 000` AND `count ≥ limit` |
| 2 | Expired buckets reset safely | single synchronous delete on the expiry path (no `await` between read and delete → no torn state); next failure re-opens a fresh window via `hitBucket` |
| 3 | No bypass by identifier manipulation | new `AUTH_FAIL_GLOBAL_LIMIT_PER_MIN` backstop (default 300/min across ALL identities) — rotation of the client-controlled XFF identity cannot exceed the shared budget; per-identity lockout unchanged |
| 4 | Fail-closed during active lockout | unchanged semantics (valid tokens refused while the window is live) — regression-tested |
| 5 | Valid credentials usable after the window | the fix itself; probe + SEC-12 prove it |
| 6 | Concurrent requests cannot corrupt state | whole lockout section is synchronous (event-loop atomicity); 20- and 30-request parallel tests with exact outcome counts |
| 7 | No unbounded in-memory growth | expired-locked buckets deleted on the expiry path + the existing 10 000-entry sweep; 12 000-identity flood test proves reclamation (map returns to ≤ tiny size) |
| 8 | Existing auth/authz contracts preserved | 401 on bad token (unlocked), 429 while locked, public routes never collateral, constant-time compare, header-only key transport — all re-verified in the 35/35 E2E matrix |

Post-fix proof: `evidence/repro-f24a01-post.json` — same scenario, valid key → **200** after 70 s, honest 401 for wrong keys; the identical full-suite run passes with zero regressions.
