# STAGE 2.1 — UNRESOLVED BLOCKERS (complete list)

**Document ID:** STAGE21-BLOCKERS-001
**Generated:** 2026-11-15T05:40Z (UTC)
**Rule:** a blocker is anything that prevents an honest "deployed and production-verified" claim. Deployment-blocking blockers are marked **[DEPLOY-GATE]**; the rest block specific claims or capabilities. No blocker is hidden, softened, or deferred without saying so.

---

## 1. Deployment-blocking

### BLK-01 — CI is dead on the remote repository **[DEPLOY-GATE, gate of B-01]**
- **What:** `.github/workflows/ci.yml` trigger filters corrupted (`branches: ain]`, both `push` and `pull_request`), introduced at already-pushed `945a78d`. GitHub Actions never triggers; the authorized push would land 20 commits with zero CI.
- **Resolution:** D-2.1-01 — one-line repair in the push set; then a real CI run on GitHub.
- **Status:** UNRESOLVED (owner decision + 1-line commit).

### BLK-02 — The repository's own adversarial gate is red (3 failing tests) **[DEPLOY-GATE, gate of B-01 unless owner waives]**
- **What:** `tests/adversarial/verifier.test.ts` V4 "evidence provenance" — 3 failures: stage-2 evidence directory, 7 phase reports, recovery-manifest artifacts all missing (gitignored `download/` was wiped). Measured suite: 188 pass / 12 skip / 3 fail / 776 assertions — the claimed 191/0/805 does not reproduce.
- **Resolution:** D-2.1-02 — regenerate evidence via committed generators with current timestamps, commit it, suite returns to green; or amend the test; or explicit owner waiver (not recommended).
- **Status:** UNRESOLVED (owner decision).

### BLK-03 — Push/deploy authorization itself **[DEPLOY-GATE — B-01]**
- **What:** 20 unpushed commits (not 19; the delta vs the directive is `35ae593`, a UUID-message tooling commit). No deploy may proceed without explicit owner approval naming the commit.
- **Resolution:** owner approval → push (with BLK-01 fix) → CI green → deploy the CI-verified commit.
- **Status:** AWAITING OWNER.

## 2. Claim-blocking (prevent specific "production-verified" claims, not the deploy act)

### BLK-04 — Backup durability single point of failure
- **What:** logical backups + SQLite DB share the Railway volume `/data`; Railway volume backups = 0 at last verified state; no off-site export path. Restore *capability* is proven (isolated demo 22/22 PASS); backup-chain *durability* is not.
- **Resolution:** D-2.1-03 (off-volume export or owner-gated download route; optionally Railway volume backups).
- **Status:** UNRESOLVED. Blocks the "backups production-verified" claim.

### BLK-05 — No productized restore path
- **What:** no route/CLI/package function restores a backup into a database; the RTO text references an "import JSON" step that does not exist in code. (This audit built and validated an external restore script.)
- **Resolution:** productize `scripts/stage21_isolated_restore_demo.ts` logic as `bun run restore`.
- **Status:** UNRESOLVED. Blocks the honest 15-minute RTO claim.

### BLK-06 — Volume-backup state unverifiable from here
- **What:** `GET /railway/backups` is owner-gated; no owner key/token in this environment. Last recorded state: zero volume backups. Current state: unknown.
- **Resolution:** at deploy/verification time (B-03 credentials), query and record.
- **Status:** UNRESOLVED (pending B-03 + deploy-time verification).

### BLK-07 — Model-provider verification in production
- **What:** 12 live-credential-gated tests skip; production health says providers "available" but configured ≠ verified (B-07). 
- **Resolution:** post-deploy `POST /models/verify` (owner) with honest recording.
- **Status:** UNRESOLVED. Blocks the "AI verified in production" claim.

## 3. Evidence and traceability

### BLK-07a — Final-closure deliverables lost / never persisted
- **What:** `FINAL-CLOSURE-REPORT.md` and `DEPLOYMENT-READINESS.md` do not exist anywhere (working tree, full history, snapshots). Two commit messages cite "final-closure reports" that were never committed. The nine owner decisions survive only in the committed register script + commit message — which this audit used as the authoritative source.
- **Resolution:** D-2.1-02 evidence regeneration produces *new* Stage 2.1 reports; the original documents are unrecoverable and their loss is permanent and documented.
- **Status:** UNRESOLVED (permanent loss; regeneration is the only path).

### BLK-07b — Recovery points lost; new one created but local-only
- **What:** RP-FC-001 — no traceable reference. RP-STAGE2-001 — artifacts lost. RP-2.1-001 (created this session, clone-verified) exists only in this environment.
- **Resolution:** push (B-01) closes it durably; until then the environment + RP-2.1-001 bundle are the only protection.
- **Status:** PARTIALLY MITIGATED.

### BLK-08 — Invalid historical evidence artifact
- **What:** the committed A1 auth-matrix probe is script-broken (word-splitting); its recorded line reads "19 correct / 36 unexpected" while the commit message cites it as verification. The corrected matrix (30/30 PASS) exists from this session.
- **Resolution:** fix or retire the broken probe script in the evidence-regeneration commit.
- **Status:** UNRESOLVED (script defect; product unaffected).

### BLK-09 — Register accuracy defect
- **What:** committed register records `missingRoutes: 21`; actual route delta is 23 (56 vs 33).
- **Resolution:** correct in the regeneration commit.
- **Status:** UNRESOLVED (minor).

## 4. Known owner-gated engineering dispositions (not defects)

### BLK-10 — FC-05 XFF-rotation rate-limit evasion
- Unresolved by design (needs production XFF-behavior verification post-deploy). Owner disposition required.

### BLK-11 — FC-06 construct('') free-hand generation
- Verified still present (probe B2, this session). Documented, deterministic, additive, owner-gated. Owner disposition required.

### BLK-12 — VIS-4 real-device mobile acceptance (B-05)
- Registry status BLOCKED (honest). Unblocks only via owner-executed real-device run.

### BLK-13 — Legacy bundle volatility (D-2.1-04)
- 1 + 18 unreachable commits in `/tmp` bundles. Owner disposition: durable copy or accept loss.

## 5. Explicitly NOT blockers (verified this session)

- Owner auth-gating of all 23 new sensitive routes (30/30 correct 401) — verified.
- Rate limiting + auth-fail lockout — verified at boundary.
- Webhook auth/replay/dedup/stale-timestamp — verified.
- Secret exposure (responses) and secret leakage (diff) — verified clean.
- Route parity additive-only, no duplicates — verified.
- Typecheck + registry consistency — verified.
- Logical backup export→restore round-trip with content hashes — **verified by demonstration**.
- Production health (read-only) — HTTP 200, healthy.

**Count: 3 deployment-blocking (BLK-01..03), 4 claim-blocking (BLK-04..07), 5 evidence/traceability (BLK-07a..09, incl. minor), 4 owner-gated dispositions (BLK-10..13). Every item above is open until its stated resolution lands; none is marked resolved without evidence.**
