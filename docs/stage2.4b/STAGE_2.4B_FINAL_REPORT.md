# STAGE 2.4B — FINAL REPORT
## Final Remediation, Verification & Deployment Qualification

**Remediation branch:** `stage2.4b-remediation` (this evidence commit advances the tip; the fixes live in `6b21787`, the drill in `6242242`, the E2E/XFF work in `17353a3`, the first evidence package in `e1d9b48`).
**Candidate lineage:** main `6a788348a6aa7f59558e41143b3b786858548aff` (Stage 2.4A-audited) → this branch. Every change made this stage lives on this branch only, in isolated worktrees.
**Verification model:** every load-bearing claim was executed **twice** — first pass (2026-11-15T18:13Z) and an independent re-verification pass on a fresh checkout after an environment recycle (2026-11-15T20:36Z), with actual commands and exit codes recorded in `evidence/reverify/SESSION_RECORD.md`. A claim appears below only if it reproduced in both passes.

---

## 1. Classification of every major item (directive §9)

### FIXED AND VERIFIED
| Item | Proof (both passes) |
|---|---|
| **F-2.4A-01 — permanent authentication lockout** | Root cause identified (expiry lived only on the unreachable increment path; the lock check never reset). Fix: expiry clause in `requireOwner` + safe synchronous bucket reset + injectable clock; brute-force threshold and fail-closed semantics untouched. **Defect reproduced pre-fix** (valid key → 429 after a real 70 s wait, tree pinned to main `6a788348`) and **dead post-fix** (valid key → 200; wrong key → honest 401) — time-real twin probes on one clock. 12 deterministic regression tests (zero real sleeps); 35/35 E2E incl. SEC-12 (post-expiry recovery through real HTTP) and SEC-13 (global backstop); the 206-test Stage 2.4A set passes unmodified. → `AUTH_LOCKOUT_REMEDIATION.md`, `evidence{,/reverify}/repro-f24a01-{pre,post}.json` |
| **F-2.4A-06 — backup mechanism (code paths)** | ONE backup system extended, no duplicate: snapshot-consistent export (single SAVEPOINT read transaction — correct SQLite semantics under concurrent writers; the file is never blind-copied); verification gate (failure ⇒ NO artifact anywhere + alert + route 500 — an unproven backup is no longer mistaken for a backup); AES-256-GCM artifacts; atomic writes; **encrypted-only off-volume copies** (read-back hash verified; no key ⇒ skipped with a visible alert — a plaintext artifact never leaves the volume); two-sided retention; alerting (in-app + /metrics + logs + optional zero-cost webhook). 21-test hardening suite (tamper ×3 with distinct causes, canary non-leakage, CLI fail-closed, WAL isolation, junk sweep, retention). → `BACKUP_ARCHITECTURE.md`, `BACKUP_RESTORE_VERIFICATION.md` |
| **Independent off-volume restore (the §4 mandatory recovery proof)** | Genuine total-volume-loss drill, isolated environment, executed twice: seed via real owner routes → pre-loss content reference → 3 verified encrypted backups → **volume A destroyed** → restore **exclusively** from the volume-B artifact via the product CLI → zero content mismatches vs the pre-loss reference (rows AND rowid-ordered SHA-256 per table) → canary back → operational (health 200, seeded data readable, next backup cycle 201). Measured RTO 100–108 ms (CLI 88–93 ms + boot 2–3 ms); planning RTO ≤ 15 min stands (platform redeploy dominates). RPO with off-volume active: 24 h for both corruption and volume-loss classes. → drill JSONs (both passes) |
| **F-2.4A-05 — CI remediation (qualification)** | `stage2.4a-ci` @ `773ab14`: diff vs main is exactly one file (`ci.yml` +78). All 9 directive coverage items verified across two passes; byte-level trigger verification (`[main]` confirmed by octal dump — the `[m` display artifact is refuted, as in Stage 2.2); least-privilege perms; zero `continue-on-error`; three unconditional jobs; honest failure propagation. Local execution of every locally executable job on that tree: typecheck 0, registry consistent, unit 100/2 skip/349, integration 89+10 skip/429, adversarial 19/129, evidence loop OK, `bun audit` clean, boot smoke (health 200, migrations 3), Next build clean. → `CI_REMEDIATION_REPORT.md`, `evidence/ci-qualification.json` |
| **Consolidated regression vs Stage 2.4A baseline** | 239 pass / 12 skip / 0 fail / 1194 expects (2.4A: 206/12/0/907). Delta fully explained: +33 = 12 lockout + 21 backup-hardening tests; zero pre-existing tests lost; skip set identical (all 12 enumerated, all environmental); zero unexpected failures; no test weakened (the single modified existing test, G-03, is a hardening change, documented). Docker layer: no docker binary in this sandbox — every Dockerfile step verified individually on the exact sources; first-pass phrasing "identical tree for the Docker context" corrected (see REGRESSION_RESULTS §3). → `REGRESSION_RESULTS.md`, suite transcripts (both passes) |
| **Security revalidation** | No CRITICAL/HIGH findings. 11 areas re-tested post-remediation; no existing security test modified. → `SECURITY_RESULTS.md` |

### IMPLEMENTED BUT NOT OPERATIONALLY VERIFIED (in production)
| Item | Boundary |
|---|---|
| Production off-volume backup activation | The mechanism is implemented and drill-proven, but the production service still has a single volume and no key/offsite-dir configured. Until the owner acts, production volume-loss RPO is **unbounded** — stated by the application itself (`rpo.offVolume.enabled: false`); never claimed otherwise |
| External alert delivery (`NEXUS_ALERT_WEBHOOK_URL`) | Implemented, opt-in, zero cost; the in-app visibility part is tested; the external channel operates only once the owner configures it |

### UNVERIFIED (never converted to PASS)
| Item | Why it stays UNVERIFIED |
|---|---|
| Railway edge XFF behaviour (F-2.4A-02) | **Proven unanswerable pre-deploy**: the deployed code (`41092a33`) has no XFF consumer. Neither Railway's official statement (overwrite) nor the community report (append) is treated as proven. Structurally mitigated by the global auth-fail backstop (300/min across all identities) so the brute-force bound no longer depends on the answer; empirical settlement is runbook V-08, post-deploy only |
| Genuine GitHub Actions run | Requires an authorized push — forbidden this stage by design. Local verification is clearly distinguished from a real GHA run; never conflated |
| Docker image-layer assembly in this sandbox | No docker binary. Every step the Dockerfile executes is verified on the exact sources (frozen install, entrypoint boot, health, migrations); layer assembly itself is covered for main by Stage 2.4A and is byte-identical for the CI branch (only `ci.yml` differs, outside the Docker context) |

### FAILED
None. No command whose result is cited anywhere in this package failed in either pass; failures were never disguised with a second command producing a green-looking result.

### REQUIRES OWNER ACTION
1. **Production off-volume protection** (zero recurring cost): attach a second volume/mount; set `NEXUS_BACKUP_OFFSITE_DIR` + a generated 64-hex `NEXUS_BACKUP_ENCRYPTION_KEY` via the secure credential mechanism — never pasted into chat, never committed. Alternative: explicitly accept the documented exposure in the register.
2. **Merge + push authorization** (the standing two-step protocol): merge `stage2.4a-ci` (same commit: add the advisory osv-scanner step or correct its design doc — F-2.4B-CI-01; add `docs/stage2.4b/SHA256SUMS` to the integrity loop — F-2.4B-CI-02), then merge `stage2.4b-remediation`; push; the pipeline then runs genuinely on GitHub Actions.
3. **Post-deploy runbook**: P-01..P-03 re-verify, V-06, and **V-08** (the XFF edge probe).

## 2. Directive completion summary (the nine required points)

1. **Final verdict:** **NOT APPROVED FOR DEPLOYMENT — pending owner action.** All engineering complete and doubly verified; what remains is exactly the configuration/authorization the directive reserves to the owner. Full reasoning: `DEPLOYMENT_READINESS_DECISION.md`.
2. **Exact remediation branch and commit SHA:** `stage2.4b-remediation`; fixes at `6b21787`, drill at `6242242`, E2E/XFF at `17353a3`, first evidence package at `e1d9b48` (this commit advances the tip with the restructured package + re-verification evidence; exact SHA recorded in the commit itself and in SHA256SUMS' regeneration note).
3. **Defects fixed:** F-2.4A-01 (permanent lockout — root cause + fix + both-direction proof + 12 tests) and F-2.4A-06 (backup mechanism — hardening + 21 tests + drill). F-2.4A-05 qualified (not merged, by design). F-2.4A-02 structurally mitigated, empirically UNVERIFIED by design. No Stage 2.4A finding was reopened; scope was not expanded; no Stage 2.4C was created.
4. **Backup implementation and restore proof:** see §1 above — genuine total-volume-loss restore exclusively from the encrypted off-volume artifact, content verified against a pre-loss reference, twice; measured RPO/RTO in `BACKUP_RESTORE_VERIFICATION.md` §3.
5. **Consolidated test results:** 239 pass / 12 skip (identical environmental set, every one enumerated) / 0 fail / 1194 expects — twice; typecheck 0 errors; E2E 35/35; adversarial 19/19; both boot smokes (health 200, migrations 3); both Next builds clean; `bun audit` clean; numerical comparison vs the 2.4A baseline (206/12/0/907) with every difference explained.
6. **CI validation status:** QUALIFIED (structural + local, twice; byte-level trigger verification; least privilege; no `continue-on-error`; three unconditional jobs). Genuine GHA run pending the owner's authorized push — clearly distinguished, never conflated. Findings F-2.4B-CI-01/02 recorded with merge-time actions.
7. **Remaining risks:** all in `UPDATED_RISK_REGISTER.md`. Highest open item: F-2.4B-01 (LOW, owner-gated). Zero CRITICAL/HIGH. Zero FAILED. Every UNVERIFIED item named and bounded.
8. **Owner action required:** YES — the three items in §1 above; nothing else. Each is a configuration or authorization decision; none requires reopening this stage.
9. **Boundary confirmation:** main, GitHub remote state and Railway production were NOT modified — verified at close, not assumed: `origin/main` still `6a788348…` (nothing pushed; the branch exists only locally), no merge, no deploy (production untouched on deployment `3bed9747` @ `41092a33`), no Railway configuration or environment change, no production migration or DB modification, no credential rotation/revocation/deletion (lost-token situation unchanged and recorded; never fabricated), no destructive recovery operation. `stage2.4a-evidence` (215cf1f) and `stage2.4a-ci` (773ab14) preserved byte-identical; all recovery bundles intact in git; no secrets printed, committed, or documented.

## 3. Evidence integrity

`SHA256SUMS` (this directory) covers every file in this package — top-level documents, `appendix/first-pass/` (the 14 first-pass documents preserved verbatim, so the first session's evidence is never retro-edited), and `evidence/` including the complete `evidence/reverify/` second-pass record. Machine evidence: suite transcripts (both passes), repro/drill/E2E/XFF JSONs (both passes), `ci-qualification.json`, `SESSION_RECORD.md` with the exact commands and exit codes. Reproducible tooling is committed on the branch: `scripts/stage24b/{repro_f24a01,drill_offvolume_restore,e2e_matrix,probe_xff_edge}.ts` and the two test files. Everything is regenerable by re-running those commands; nothing in this package is claimed from memory.

## 4. Closing statement

The objective was to complete remediation and reach a defensible deployment decision — not another audit cycle. The remediation is complete; the verification ran twice and reproduced exactly; the decision is issued on evidence and names every remaining step. Production remains untouched. Awaiting the owner's next instruction.
