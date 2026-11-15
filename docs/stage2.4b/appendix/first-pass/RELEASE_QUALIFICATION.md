# STAGE 2.4B — RELEASE QUALIFICATION REPORT

**Candidate lineage:** main `6a788348a6aa7f59558e41143b3b786858548aff` (Stage 2.4A-audited) → `stage2.4b-remediation` (this stage). Production untouched throughout: no deploy, no Railway mutation, no production migration, no push, no merge, no credential rotation.

---

## 1. What this stage was asked to do, and what was done

| Directive requirement | Status | Primary evidence |
|---|---|---|
| Fix F-2.4A-01 (lockout expiry) with 8 engineering requirements + 9 regression scenarios, deterministic time, and proof the defect is dead | **DONE** — 12/12 deterministic tests; probe reproduced the defect pre-fix (429 after 70 s, real time) and it is not reproducible post-fix (200) | LOCKOUT_ROOT_CAUSE, LOCKOUT_REMEDIATION, evidence/repro-f24a01-{pre,post}.json |
| Fix F-2.4A-06 (off-volume backup) — 11 requirements, correct SQLite semantics, evaluate the existing BackupService (no duplicates, no unapproved paid services, honest UNVERIFIED where infrastructure is unavailable) | **DONE in code, PROVEN by drill** — snapshot transaction, AES-256-GCM, verification gate (no artifact on failure), atomic writes, verified encrypted off-volume copies, two-sided retention, alerting (+ optional zero-cost webhook), documented RPO/RTO. Production activation owner-gated (F-2.4B-01) | BACKUP_ARCHITECTURE, BACKUP_IMPLEMENTATION, OFFVOLUME_RESTORE_EVIDENCE |
| Qualify the CI remediation (13-item checklist, local execution, genuine Actions only after authorized push, no merge/push) | **DONE — QUALIFIED** with findings F-2.4B-CI-01/02 | CI_REMEDIATION_REVIEW, evidence/ci-qualification.json |
| Revalidate security (11 areas; reassess XFF without treating undocumented proxy behaviour as proven) | **DONE** — no CRITICAL/HIGH; the XFF question is now *proven unanswerable pre-deploy* (no XFF consumer in the deployed code) and is structurally mitigated by the global backstop; edge answer stays UNVERIFIED until V-08 | SECURITY_REASSESSMENT, evidence/xff-edge-probe.json |
| Full regression (10 areas; compare vs 2.4A; investigate every failure/skip) | **DONE** — 239/12/0 (2.4A: 206/12/0); every skip enumerated; zero unexpected failures | FULL_REGRESSION_REPORT, evidence/suite-output.txt |
| Change control: dedicated branch, no main modification, no history rewrite, no push/merge/deploy; 2.4A evidence branches + recovery bundles preserved | **DONE** — `stage2.4b-remediation` in an isolated worktree; `main`, `stage2.4a-evidence` (215cf1f), `stage2.4a-ci` (773ab14) and the recovery bundles untouched (verified at baseline and re-checked at close) | git state (session record) |
| 14 evidence artifacts, reproducible, checksum-verified, no secrets | **DONE** — this package + SHA256SUMS | EVIDENCE_MANIFEST |
| Exactly one verdict; GREEN only with independently verified test evidence | **AMBER — see §2** | below |

## 2. Verdict reasoning (adversarially examined)

**Why not GREEN:** GREEN requires *all critical remediation complete and independently verified*, with only explicitly accepted non-critical limitations remaining. Two load-bearing items are not yet in their final state:

1. **F-2.4B-01 — production off-volume activation is pending.** The capability exists and is proven (drill: total volume loss recovered exclusively from the encrypted volume-B artifact, content verified against a pre-loss reference), but the production service still has a single volume, no `NEXUS_BACKUP_ENCRYPTION_KEY`, no `NEXUS_BACKUP_OFFSITE_DIR`. Until the owner configures them, production volume-loss RPO remains **unbounded**. That is a *pending owner action*, not an accepted limitation — AMBER is the honest state.
2. **F-2.4A-05's remediation is qualified but not merged** (by design — merging is a separate authorization), so the CI gap is closed on a branch, not in the pipeline that guards main today.

**Why not RED:** no critical defect or safety requirement is unresolved. The two Stage 2.4A MEDIUM defects (F-2.4A-01, F-2.4A-06 code paths) are fixed and independently verified with test evidence — never "appears correct". Security has no CRITICAL/HIGH findings; the suite, adversarial gate, E2E matrix (35/35), builds, and drill all pass on the remediated tree.

**Why not UNVERIFIED:** every claim in this report maps to a machine artifact that was actually produced this session (files, exit codes, HTTP transcripts). The genuinely unverifiable items are *labelled* UNVERIFIED and excluded from the qualification basis — that is exactly why the verdict is AMBER rather than a claim dressed as GREEN.

## 3. Residual items the owner should decide (all recorded in the risk register)

1. Configure production off-volume protection: attach a second volume/mount, set `NEXUS_BACKUP_OFFSITE_DIR` + a 64-hex `NEXUS_BACKUP_ENCRYPTION_KEY` on the service (zero recurring cost), or accept the documented exposure explicitly.
2. Merge `stage2.4a-ci` (+ the two one-line findings) under a separate authorization — after which every push to main gets the production-build gate.
3. Merge `stage2.4b-remediation` (this branch) per the normal stage protocol; its evidence package travels with it.
4. Post-deploy runbook items carried from 2.4A (P-01..P-03 re-verify, V-06, V-08 XFF probe — now the only way to settle the edge question).

## 4. Explicit boundary (unchanged by this stage)

**Stage 2.4B does not authorize deployment, push, merge, Railway configuration change, production migration, or credential rotation.** Production remains on deployment `3bed9747` @ `41092a33` (re-verified read-only this session: healthy, `migrations applied: 2`, and — via the source-level probe finding — demonstrably the old code). Await the owner's next instruction.
