# STAGE 2.4B — DEPLOYMENT READINESS DECISION

**Decision scheme (directive §10):** exactly one of APPROVED FOR DEPLOYMENT / NOT APPROVED FOR DEPLOYMENT, issued on evidence, never on the mere existence of an implementation.

---

## FINAL VERDICT: **NOT APPROVED FOR DEPLOYMENT** — pending owner action

This is not a failure verdict, and it is not a hedge. Every engineering requirement of this
stage is complete and has been verified **twice** in two independent sessions (first pass
2026-11-15T18:13Z; re-verification pass 2026-11-15T20:36Z on a fresh checkout — see
`evidence/reverify/SESSION_RECORD.md`). What remains is exactly and only what the
directive itself reserves to the owner, and under the directive's own decision rule —
"NOT APPROVED FOR DEPLOYMENT if any mandatory requirement … requires owner action" —
the honest verdict is NOT APPROVED until that action is taken or the exposure is
explicitly accepted.

## 1. The six approval criteria, examined one by one

| # | Criterion (directive §10) | Status | Evidence |
|---|---|---|---|
| 1 | Permanent authentication lockout fixed and proven | **MET** — defect reproduced pre-fix (429 after real 70 s) and dead post-fix (200), time-real twin probes on one clock, two sessions; 12 deterministic tests; 35/35 E2E incl. SEC-12/SEC-13; the 206-test 2.4A set passes unmodified | AUTH_LOCKOUT_REMEDIATION §3; repro JSONs (both passes) |
| 2 | Independent backup and restore operationally verified | **MET at the mechanism level** (the §4 mandatory recovery proof: isolated environment, genuine total-volume-loss restore, exclusively from the encrypted off-volume artifact, content verified against a pre-loss reference — PASS twice; RTO 88–100 ms). **NOT MET in production**: the Railway service still has a single volume, no `NEXUS_BACKUP_ENCRYPTION_KEY`, no `NEXUS_BACKUP_OFFSITE_DIR`. Until the owner configures them, production volume-loss RPO is unbounded — stated by the application itself (`rpo.offVolume.enabled: false`) | BACKUP_RESTORE_VERIFICATION; drill JSONs (both passes) |
| 3 | CI remediation validated | **MET per §5's own rules** — structural validation (byte-level; least-privilege perms; zero `continue-on-error`; three unconditional jobs) + local execution of every locally executable job, twice. The genuine GitHub Actions run is **by design not performed** (requires an authorized push; this stage forbids pushing) and is clearly distinguished from local verification — never conflated | CI_REMEDIATION_REPORT |
| 4 | Consolidated regression tests pass | **MET** — 239 pass / 12 skip (identical environmental set) / 0 fail / 1194 expects, twice; typecheck 0 errors; builds + boot smokes clean on both trees | REGRESSION_RESULTS |
| 5 | No unresolved critical or high-severity blocker | **MET** — zero CRITICAL/HIGH findings anywhere in the stage; the register's highest open item is LOW | SECURITY_RESULTS; UPDATED_RISK_REGISTER |
| 6 | All remaining risks explicitly documented and acceptable | **Documented: MET** (every residual item is in the register with evidence). **Acceptability is the owner's judgment** — and the principal residual (production off-volume activation, F-2.4B-01) is precisely the item that requires owner action, so this criterion cannot be closed by this stage alone | UPDATED_RISK_REGISTER |

**Why NOT APPROVED follows from the directive's own rule:** criterion 2's production half
and criterion 6's acceptance both reduce to **owner action** (Railway configuration is
explicitly outside this stage's authorization boundary — "You are NOT authorized to …
change Railway infrastructure settings / modify production environment variables").
Per §10: "NOT APPROVED FOR DEPLOYMENT — If any mandatory requirement remains
unverified, fails, or requires owner action." The production off-volume backup
requirement requires owner action today. Therefore NOT APPROVED — today.

**Why this is not RED-like:** no critical defect or safety requirement is unresolved;
nothing failed; nothing is being concealed. The engineering is finished and doubly
verified. Lowering the acceptance bar to award APPROVED — e.g. by claiming off-volume
protection "exists" while production has a single volume — is exactly what this
directive forbids ("Do not award … because the implementation merely exists. Do not
lower acceptance criteria to obtain approval."), and this decision does not do it.

## 2. The minimum owner action that would change the verdict

1. **Configure production off-volume protection** (zero recurring cost, no provider
   assumed): attach a second volume or mount to the `Jarvis-Nexus` service in the
   `reasonable-heart` / production environment; set service variables
   `NEXUS_BACKUP_OFFSITE_DIR` = the mount path and `NEXUS_BACKUP_ENCRYPTION_KEY` = a
   generated 64-hex (32-byte) key — generated and stored per the owner's secure
   credential mechanism, never pasted in chat, never committed. The first scheduled or
   manual backup run then produces a verified encrypted off-volume artifact, and the
   listing flips to `rpo.offVolume.enabled: true`. (Alternative: explicitly accept the
   documented exposure — volume-loss RPO unbounded — as an owner decision in the
   register. That is an acceptance decision, not an engineering one.)
2. **Authorize the merge sequence** under the standing two-step push/deploy protocol:
   merge `stage2.4a-ci` into main (in the same commit adding the advisory osv-scanner
   step or correcting its design doc — F-2.4B-CI-01 — and adding
   `docs/stage2.4b/SHA256SUMS` to the evidence-integrity loop — F-2.4B-CI-02), then
   merge `stage2.4b-remediation`; push; let the now-guarding CI run genuinely on
   GitHub Actions. This is what converts "CI validated locally" into "CI verified on
   GitHub".
3. **Post-deploy runbook** (carried from Stage 2.4A): P-01..P-03 re-verification,
   V-06, and **V-08** — the XFF edge probe, the only remaining way to settle
   F-2.4A-02 empirically (it is provably unanswerable pre-deploy; the brute-force
   bound no longer depends on it).

None of these requires this stage to be reopened; none creates a Stage 2.4C. They are
configuration and authorization decisions, recorded here and in the register.

## 3. Boundary compliance (confirmed, this stage, end to end)

Main, GitHub remote state and Railway production were NOT modified: no push (verified —
`origin/main` still `6a788348a6aa7f59558e41143b3b786858548aff`; the remediation branch
exists only locally), no merge, no deploy (production remains on deployment `3bed9747`
@ `41092a33`), no Railway configuration or environment change, no production migration
or DB modification, no credential rotation/revocation/deletion (the lost-token situation
is unchanged and recorded; nothing was rotated or fabricated), no destructive recovery
operation. All work happened on the dedicated branch `stage2.4b-remediation` in isolated
worktrees; `stage2.4a-evidence` (215cf1f) and `stage2.4a-ci` (773ab14) are preserved
byte-identical; all recovery bundles (RP-2.2-001/002, RP-2.3-001) remain intact in git;
no secrets were printed, committed, or placed in documentation.

## 4. What would make this APPROVED

When the owner has taken action 1 (or explicitly accepted the exposure), and action 2's
push/CI sequence has genuinely run green on GitHub Actions with the regression numbers
reproduced, the criteria are met and the verdict can be reissued as APPROVED FOR
DEPLOYMENT on that fresh evidence — not by editing this document. Until then, this
stage's deliverable is exactly what it claims to be: a defensible, evidence-backed
decision that production remains untouched and every remaining step is named.
