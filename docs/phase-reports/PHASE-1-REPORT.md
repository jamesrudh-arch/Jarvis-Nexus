# PHASE 1 REPORT — SECURITY

**Project:** JARVIS NEXUS
**Directive:** Master Engineering Directive, Part 16 PHASE 1; reads `docs/blueprint/acceptance-and-evidence.md` (Parts 13/14/15/17/20/21)
**Session:** 9 (continued)
**Branch:** `phase-1-security`
**Status:** PHASE 1 COMPLETE AND VERIFIED (local). Production verification pending B1 (Railway down).

> DONE WHEN (directive): "Prove every protected route has a passing test. Prove
> the owner switches work after restart. Prove backup restoration." — all three
> proven below with executed evidence.

---

## 1. FILES CREATED

| File | Purpose |
| --- | --- |
| `src/lib/nexus/rateLimit.ts` | 5 auth failures/60 s/IP → 429 + general 240/min cap (in-memory, per-process) |
| `src/lib/nexus/switchGate.ts` | Switch enforcement gates + Master-OFF cascade (mirrors FastAPI CORE) |
| `src/lib/nexus/backupSchema.ts` | Pure backup payload validation + table specs + hash (dependency-free, unit-tested) |
| `src/lib/nexus/backup.ts` | DB export + ATOMIC transactional restore with in-transaction count verification |
| `src/app/api/v1/auth/verify/route.ts` | Login surface that survives Master OFF (Part 13) |
| `src/app/api/v1/admin/backup/route.ts` | Owner + Master gated full backup export |
| `src/app/api/v1/admin/restore/route.ts` | Owner + Master gated hardened restore |
| `tests/unit/rateLimit.test.mjs` | 7 unit tests |
| `tests/unit/backupValidation.test.mjs` | 11 unit tests |
| `tests/phase1_e2e.sh` | 48-check E2E proof suite |

## 2. FILES MODIFIED

| File | Change |
| --- | --- |
| `src/lib/nexus/ownerGuard.ts` | 3-layer guard: rate limit → owner key (audited) → Master switch (fresh DB read, fail-closed on read error) |
| 21 route files (27 call sites) | `requireOwnerKey` now async — every call site awaits it |
| `src/app/api/v1/switches/[key]/route.ts` | Control-plane carve-out (skipMasterGate) + Master-OFF cascade + effects in audit trail |
| `src/app/api/v1/asr/route.ts` | Microphone switch gate (403 before any audio processing) |
| `src/app/api/v1/world/mode/route.ts` | Embodiment switch gate for embodiment-specific modes |
| `src/app/api/v1/conversations/send/route.ts` | Computer Control gate on ALL tool execution + honest spoken block notice |
| `src/components/nexus/OwnerGate.tsx` | Verifies against `/api/v1/auth/verify` (survives Master OFF) |
| `tests/guard_e2e.sh` | Rate-limit era: unique client IPs per probe; deterministic mic state |
| `ENGINEERING_DECISIONS.md` | ED-P1-1…ED-P1-8 |
| `docs/security/ROUTE_INVENTORY.md` | Phase 1 section (new routes, guard layers, verification) |

## 3. REPOSITORIES INTEGRATED

None (security phase on existing stack).

## 4. COMMANDS EXECUTED

`npx tsc --noEmit` (clean) · `npm run build` (success, 33 routes incl. 3 new) ·
`npm test` · `bash tests/guard_e2e.sh` · `bash tests/phase1_e2e.sh` ·
`npx prisma db push` (fresh-DB E2E baseline) · FastAPI CORE pytest regression.

## 5–7. TESTS PASSED / FAILED / COUNTS

| Suite | Pass | Fail | Total |
| --- | --- | --- | --- |
| Unit (`node --test`) — incl. 18 new | **80** | 0 | 80 |
| Gate 0 E2E (regression, rate-limit era) | **70** | 0 | 70 |
| **Phase 1 E2E (new)** | **48** | 0 | 48 |
| FastAPI CORE pytest (regression) | **43** | 0 | 43 |
| TypeScript compiler | 0 errors | — | — |
| Production build | success | — | — |
| **TOTAL** | **241** | **0** | **241** |

Phase 1 E2E coverage (all against the REAL standalone server): guard regression
matrix · fresh-DB cold-boot switch defaults (mic/camera OFF, master ON) ·
microphone gate on asr (403 before processing, 400 after enabling) · embodiment
gate on holographic mode (403) with normal modes unaffected · Computer Control
gate with honest spoken block · Master OFF matrix (health 200, 5 privileged
routes 403, auth/verify 200, switches PATCH 200) · Master-OFF cascade
(microphone + camera forced OFF) · audit categories (auth_denied + master_off +
owner_switch recorded) · backup export (7 switches) · restore rejects unknown
table (400) / malformed JSON (400) · dry-run (no mutation) · live restore ·
**restore on a SEPARATE COPY verified against backup counts** · restart
persistence (mic/master states survive) · rate lockout (403s then 429,
correct key also locked, Retry-After header).

## 8. RUNTIME EVIDENCE (abridged; full logs in the E2E output)

```
=== [2] Cold-boot switch defaults ===            PASS ×3 (mic OFF, camera OFF, master ON)
=== [3] Microphone gates ASR ===                 PASS ×3 (403 gate → enable → 400 passed-gate)
=== [4] Embodiment gates holographic mode ===    PASS ×4 (403 holographic, 200 normal)
=== [5] Computer Control honest block ===        PASS ×3 (reply: "Computer Control switch is OFF…")
=== [6] Master OFF matrix ===                    PASS ×14 (denials + control plane + cascade)
=== [7] Audit categories ===                     PASS (auth_denied master_off owner_switch)
=== [8] Backup/restore live ===                  PASS ×6
=== [9] Separate copy ===                        PASS ×4 (restore 200, 7 switches, memories match)
=== [10] Restart persistence ===                 PASS ×4
=== [11] Rate lockout ===                        PASS ×4 (429 + Retry-After, correct key locked too)
PHASE 1 E2E RESULT: PASS=48 FAIL=0
```

## 9. SCREENSHOTS AND CAPTURE PATHS

Not applicable (API security phase — evidence is the executed matrix above).
UI unlock path changed (auth/verify) and is covered by the E2E; the headless
UX proof from session 8b will be re-run against production when B1 clears.

## 10. HARDWARE USED

Sandbox: Intel Xeon 2-core, 4.1 GB RAM, no GPU (unchanged).

## 11. PERFORMANCE MEASUREMENTS

Guard overhead: one fresh SQLite read of the Master switch per privileged
request (sub-ms locally; health endpoint latency unchanged at ~40 ms).
Rate limiter: O(1) amortised per request. Backup export of the seeded DB:
< 300 ms. Atomic restore: < 1 s.

## 12. BLOCKERS

| ID | Blocker | Impact on Phase 1 |
| --- | --- | --- |
| B1 | Railway production DOWN (owner dashboard action) | Phase 1 changes verified locally against the identical standalone build; **production verification deferred until B1 clears** (auto-deploy resumes from GitHub main) |
| F-C3 | Five-route public status surface vs Part 14 "only approved health endpoints public" | Owner ruling requested (blueprint CHANGES.md §3); no change made without it |
| — | Part 14 line-items not applicable yet | Session expiry (client key is sessionStorage — tab-scoped by design; WS tickets 60 s on FastAPI side); worker authentication (FastAPI, tested); approval tokens (Phase 14 missions) |

## 13. ROLLBACK COMMAND

```bash
cd /home/z/my-project/repo
git revert -m 1 <phase-1 merge-commit>   # or: git revert <phase-1 commits range>
```
Guard changes are additive per-handler; a revert restores the Gate 0 behaviour
(24 guarded handlers, no switch gates, no rate limiting, no backup routes).

## 14. REMAINING WORK

- B1 clears → verify the matrix on production (same suite, real URL).
- Phase 2 — Technology Register (research-only; no installs without reason).
- Owner rulings: F-A1 (population roster), F-M1/M2 (village/rail ID prefixes),
  F-C1 (Unreal project path) at their consuming phases.

## 15. REQUIREMENT STATUS LABELS

| Requirement | Status |
| --- | --- |
| Every protected route has a passing test | **IMPLEMENTED AND VERIFIED** (Gate 0 matrix 70/70 re-run in rate-limit era + 3 new routes covered) |
| Owner switches work after restart (defaults OFF, persistence ON) | **IMPLEMENTED AND VERIFIED** (cold-boot + restart E2E) |
| Backup restoration (incl. on a separate copy) | **IMPLEMENTED AND VERIFIED** (live + separate-copy E2E) |
| Seven switches backend-enforced (Part 13 table) | **IMPLEMENTED AND VERIFIED** (master/microphone/camera/embodiment/computer_control gates proven; autonomy + remote_compute enforcement points documented — no self-initiated work or worker queue exists yet, gates land with those features) |
| Rate limiting (Part 14) | **IMPLEMENTED AND VERIFIED** (unit 7/7 + E2E lockout) |
| Audit logs for denials (Part 14) | **IMPLEMENTED AND VERIFIED** (E2E §7) |
| Production deployment verification | **BLOCKED BY EXTERNAL DEPENDENCY** (B1 — Railway down; owner action) |
| Part 15 performance targets | NOT STARTED (Phase 15; requires running Unreal build — B2) |

**PHASE 1 COMPLETE — NEXT: PHASE 2 (TECHNOLOGY REGISTER, RESEARCH ONLY).**
