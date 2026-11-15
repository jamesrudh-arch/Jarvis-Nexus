# STAGE 2.1 — RELEASE-RISK ASSESSMENT

**Document ID:** STAGE21-RISK-001
**Generated:** 2026-11-15T05:40Z (UTC)
**Candidate:** local `main` @ `35ae593` (20 unpushed commits) → Railway service `jarvis-nexus-production` (currently running `origin/main` @ `41092a3`)
**Scale:** Likelihood (L) and Impact (I) rated 1–5; Risk = L×I pre-mitigation. Ratings are engineering judgments grounded in the evidence cited.

---

## 1. Deployment delta (what actually ships)

- **Backend service:** +23 routes (56 total; all new routes owner-gated except `GET /world/layout`), migration 3 (INSERT-only tables `railway_events`/`railway_audit`/`railway_state`), phase-3 security hardening (CORS allowlist, rate limiting + auth-fail lockout, honest model health), phase-4 backup scheduler (24 h / 14 files on `/data`), final-closure repairs (honesty, aria-labels, per-request timeouts).
- **Frontend visual application:** NOT shipped by this service (hosting decision B-02 outstanding).
- **Not shipped anywhere yet:** CI repair (broken on origin), any off-site backup export.

## 2. Risk register

| ID | Risk | L | I | R | Evidence | Mitigation / gate |
|---|---|---|---|---|---|---|
| **R-01** | **Push executes no CI** — `.github/workflows/ci.yml` branch filter corrupted (`branches: ain]`, already live on origin since `945a78d`); the 20-commit push would land with zero automated verification. | 5 | 4 | 20 | COMMIT-AUDIT F-COM-03 (byte-exact `cat -A` proof) | **Blocker.** Fix `branches: [main]` in the same push set (one-line) or immediately before it. Trivial fix, must not be forgotten. |
| **R-02** | **Repo's own adversarial gate is red** — 3 `V4 evidence provenance` test failures (evidence tree lost). Deploying a candidate whose own verifier fails normalizes red gates. | 4 | 3 | 12 | Test run this session: 188/12/**3 fail**/776 | **Blocker.** Owner decision D-2.1-02: regenerate evidence via committed generators (honest, dated now) or amend the V4 test to gate on git-tracked evidence. Do not waive silently. |
| **R-03** | **Backup single point of failure** — DB and backup JSONs on the same Railway volume; zero Railway volume backups (last verified); no off-site export; no productized restore path. Volume loss = total data loss. | 3 | 5 | 15 | Backup doc G-01/G-03/G-05 | **Blocker for "production-verified" claim**, not for the deploy act itself. Owner decision D-2.1-03. Restore *capability* is proven (isolated demo PASS); durability of the backup chain is not. |
| **R-04** | **Migration 3 applied to live production data.** Additive INSERT-only tables; low structural risk, but the migration runner runs at boot — a failed migration wedges the deploy. | 2 | 3 | 6 | `packages/db` migrations; prod at 2/3 | Deploy during low-use window; health check verifies `migrations applied: 3`; rollback = redeploy previous image (migration is additive — old code ignores new tables). |
| **R-05** | **Route surface +23 with owner-gating as the security boundary.** Verified correct (30/30 unauthenticated probes → 401; escalation probes rejected), but the owner key becomes single-secret-critical. | 2 | 4 | 8 | Probe evidence (this session) | Confirm `OWNER_KEY` strength/rotation policy at deploy; auth-fail lockout verified. FC-05 (XFF rotation) unresolved — see R-08. |
| **R-06** | **Webhook endpoint goes live** (`POST /railway/webhook`, secret-authenticated). Without `RAILWAY_WEBHOOK_SECRET` configured it returns 503 (fail-closed, verified); with a weak secret it is an intake vector. Replay/dedup/stale-timestamp protections verified. | 2 | 3 | 6 | Probe B4 evidence | Set a strong secret at deploy (B-03); route is otherwise inert. |
| **R-07** | **Model-provider reality gap** — 12 tests skip without live credentials; production health reports providers "available" but verified model-fabric behavior in production depends on credentials the repo cannot verify (B-07). "configured ≠ verified." | 3 | 3 | 9 | Test skips; health endpoint detail | Post-deploy: run `POST /models/verify` (owner) and record honest results; do not claim AI verified until then. |
| **R-08** | **FC-05: rate-limit evasion via XFF rotation** (client rotates `X-Forwarded-For` to defeat per-IP limiting). Unresolved, owner-gated; needs production XFF-behavior verification (is Railway's proxy the last hop?). | 3 | 3 | 9 | cd46b69 message; probe A5 | Verify XFF handling in production after deploy; if Railway overwrites XFF, risk is void; else bind limits to connection IP. |
| **R-09** | **FC-06: `POST /world/construct` with empty body generates a free-hand spec** (deterministic, additive). Verified present this session (probe B2 → 200 with generated spec). Owner-gated route; behavior documented. | 2 | 2 | 4 | Probe B2 evidence | Owner disposition (accept documented behavior or require explicit spec). |
| **R-10** | **Evidence durability failure is systemic** — Stage 2's entire evidence set and both recovery points were lost because they were written only to gitignored `download/`. Stage 2.1 deliverables (this set) must not repeat the pattern. | 4 | 3 | 12 | This audit's central finding | Durable copies of this audit are committed to git (`docs/stage2.1/`) in addition to `download/`. Owner decision D-2.1-02 covers the process fix. |
| **R-11** | **Unpushed-work loss** — until push, 20 commits (+ this audit) exist only in this environment and RP-2.1-001. Prior recovery points are already lost. | 2 | 5 | 10 | RP situation (backup doc §5) | RP-2.1-001 created + clone-verified; real closure = authorized push (B-01). |
| **R-12** | **Legacy unique history in volatile /tmp** — 1 + 18 unreachable commits in two bundles outside the protected tree. | 3 | 2 | 6 | Backup doc §5 | D-2.1-04: copy bundles into durable storage or accept loss. |
| **R-13** | **Release hygiene** — 2 UUID commit messages; commit messages citing lost reports/counts (F-COM-02/04/05). Cosmetic-to-minor, but a release history should be explainable. | 3 | 1 | 3 | COMMIT-AUDIT | Amend the two unpushed UUID messages before push (safe: unpushed), or accept. |
| **R-14** | **Single-instance assumptions** — backup scheduler in-process; rate limiter in-memory (per-instance). Fine at current topology; silently wrong if scaled. | 2 | 2 | 4 | Code comments; index.ts:751 | Document scaling precondition; externalize before any second instance. |
| **R-15** | **CORS/visual-app hosting undecided (B-02)** — the frontend remains undeployed; backend CORS allowlist must eventually name the real origin. | 3 | 2 | 6 | Registry VIS-4 BLOCKED | Owner decision; no production impact until the frontend ships. |
| **R-16** | **Production currently healthy but 2 migrations / 33 routes behind** — the delta deploys cleanly in principle (additive), but the running instance has never booted this code. Boot-time risks: migration runner, backup first-run at +30 s, restart-recovery routines. | 2 | 3 | 6 | Health probe; code review | Post-deploy verification protocol (Section 7 of the directive) covers: startup logs, health, route parity, backup first-run, persistence restart test. |

## 3. Positive controls verified this session (risk-reducing evidence)

1. Route parity: additive-only, no duplicates, 56 registrations confirmed two ways.
2. Auth matrix: 30/30 owner-gated routes return 401 unauthenticated (corrected probe, this session).
3. Rate limiter: fixed-IP burst → 240 allowed then 429 (boundary exact).
4. Webhook: fresh event 202, duplicate 200 `duplicate:true`, stale timestamp 401.
5. Secret-exposure scan of responses: 0 leaks.
6. Secret scan of the full unpushed diff: clean.
7. Typecheck: 0 errors. Registry: consistent (112 requirements; 4 BLOCKED honestly documented).
8. Logical backup: export → destroy → isolated restore → functional resurrection: **22/22 PASS with content SHA-256 on all 24 tables**.
9. Recovery point RP-2.1-001: created, checksummed, clone-verified.
10. Production `GET /health`: 200, overall healthy (read-only probe).

## 4. Aggregated verdict

- **Deploy-act risk (if B-01 granted):** LOW–MODERATE and well-bounded — additive route surface, verified auth posture, INSERT-only migration, health-check-gated rollout with restart policy. The engineering is deployable.
- **Release-process risk: HIGH** — no CI will run (R-01), the repo's own gate is red (R-02), and the evidence trail behind the authorization package has already proven fragile (R-10/R-11).
- **Post-deploy operational risk: MODERATE** — backup durability (R-03) and model-provider verification (R-07) are the two claims that cannot be certified until exercised in production with owner credentials.

**Recommendation:** authorize in two steps — (1) repair CI + evidence gate + optional commit-message amendments (one local commit, re-run full suite to green), push; (2) deploy with the Section 7 verification protocol, then immediately run the production backup export and model verification, and record results in the production verification report. Alternatively authorize immediate deploy with R-01/R-02 explicitly waived by the owner — not recommended.
