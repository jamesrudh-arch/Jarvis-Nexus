# STAGE 2.2 — RELEASE RISK ASSESSMENT (updated register)

**Document ID:** STAGE22-RISK-001
**Candidate:** local `main` (unpushed series incl. the Stage 2.2 remediation commits) → Railway service `jarvis-nexus-production` (currently running `origin/main` @ `41092a3`, 33 routes, 2/3 migrations).
**Scale:** Likelihood (L) and Impact (I) 1–5; Risk = L×I. Every Stage 2.1 risk is re-dispositioned; new risks from Stage 2.2 are registered.

---

## 1. Stage 2.1 risk register — updated dispositions

| ID | Stage 2.1 risk | Then | Now | Disposition |
|---|---|---|---|---|
| R-01 | Push executes no CI (corrupted trigger) | 20 | **0 (refuted)** | The trigger was never corrupted (display artifact — see CI_REPAIR_AND_VERIFICATION.md). Real adjacent risk found and fixed: the adversarial gate was omitted from CI (F-2.2-CI-01, now repaired — CI fails when the repo's own verifier is red). Residual: first genuine GitHub run still pending push (owner-gated). |
| R-02 | Repo's own gate red (V4) | 12 | **0 (resolved)** | V4 green on genuine, regenerated, checksummed, git-tracked evidence; substitution guard active; CI now enforces the gate. |
| R-03 | Backup single point of failure | 15 | **6 (mitigated; full form owner-gated)** | Off-volume copy implemented (env-configured), download route with integrity headers, DR drill proves recovery after total volume loss. Residual: without `NEXUS_BACKUP_OFFSITE_DIR` configured in production, the coupling persists — configuring it (or funding object-storage push / Railway volume backups) is owner-gated (D-2.1-03). |
| R-04 | Migration 3 on live data | 6 | 6 (unchanged) | Additive INSERT-only; runner at boot; idempotency proven; restore path applies migrations safely. Rollback = redeploy previous image (additive — old code ignores new tables). |
| R-05 | +route surface behind owner key | 8 | **6 (re-verified)** | Matrix re-proven at 37/37 source-derived (grew with the new restore/download routes, both owner-gated). XFF-rotation (FC-05) still the open sub-item. |
| R-06 | Webhook endpoint live | 6 | **4 (re-verified)** | Auth/replay/dedup/stale re-proven with a configured secret; fail-closed 503 unconfigured; contract-validated payloads. Weak-secret risk remains an owner configuration duty (B-03). |
| R-07 | Model-provider reality gap | 9 | 9 (unchanged, post-deploy) | `POST /models/verify` after deploy; "configured ≠ verified" stands. |
| R-08 | FC-05 XFF rotation | 9 | 9 (unchanged, owner-gated) | Production XFF verification post-deploy. |
| R-09 | FC-06 construct('') | 4 | 4 (unchanged, owner disposition) | Documented, deterministic, additive, owner-gated. |
| R-10 | Evidence durability systemic | 12 | **2 (resolved)** | Architecture moved to git-tracked locations; twice-proven wipe rule now embodied: SHA256SUMS substitution guard + committed generators + banner classification. The download/ mirror is explicitly non-authoritative. |
| R-11 | Unpushed-work loss | 10 | **4 (mitigated)** | Thin-delta bundles committed to git (RP-2.2-001/002) with restore proofs. Real closure = authorized push (B-01). |
| R-12 | Legacy unique history in /tmp | 6 | 6 (owner-gated) | Mirrored with checksums; durable preservation is D-2.1-04 (168 MB in git is a real cost). |
| R-13 | Release hygiene (UUID messages) | 3 | 3 (owner-gated) | D-2.1-05: reword-before-push remains possible; recommendation unchanged. |
| R-14 | Single-instance assumptions | 4 | 4 (documented precondition) | Scheduler/limiter per-instance; externalize before any scale-out. |
| R-15 | CORS/visual hosting undecided | 6 | 6 (owner-gated, unchanged) | B-02; no production impact until the frontend ships. |
| R-16 | Running instance never booted this code | 6 | **5 (reduced)** | Boot-time risks now better covered: backup first-run + migration idempotency + restore paths all test/drill-proven; restart-recovery unchanged. Post-deploy verification protocol still required. |

## 2. New risks from Stage 2.2

| ID | Risk | L | I | R | Mitigation / gate |
|---|---|---|---|---|---|
| R-2.2-01 | **Off-site dir not configured in production** — the off-volume copy exists in code but only protects if `NEXUS_BACKUP_OFFSITE_DIR` is set on the service (or another mount exists) | 3 | 4 | 12 | Owner sets it at deploy (one env var); until then the honest status view states the exposure. Tracked under D-2.1-03. |
| R-2.2-02 | First GitHub Actions run still unobserved (cannot be triggered without push) | 3 | 2 | 6 | Push protocol: authorized push → CI must run green → deploy the exact commit CI verified. Never claim "CI green on GitHub" before it exists. |
| R-2.2-03 | Display-pipeline artifact could mislead a future audit (it produced a false finding twice) | 2 | 3 | 6 | Standing rule adopted and documented: byte-level verification (`od -c`/structured parsers) for gate-critical files; recorded in CI_REPAIR_AND_VERIFICATION.md. |
| R-2.2-04 | `docs/` evidence grows git history (14.7 MB recovery bundle committed) | 2 | 1 | 2 | Accepted deliberately: durability beats repo size at this scale; full-state bundles stay non-durable mirrors. |

## 3. Aggregated verdict

- **Deploy-act risk (if B-01 granted): LOW and bounded** — additive-only route surface (58 vs 33; +25), verified auth posture (37/37), INSERT-only migration (idempotency proven), health-check-gated rollout with restart policy, and a productized, drill-proven recovery path with measured data-segment RTO.
- **Release-process risk: LOW (was HIGH)** — the repo's own gate is green on genuine evidence, enforced in CI; evidence is durable, checksummed and substitution-guarded; the one remaining process item is observing the first real GitHub Actions run, which is inside the push protocol.
- **Post-deploy operational risk: MODERATE and enumerated** — off-site dir configuration (R-2.2-01), model verification (R-07), volume-backup state (BLK-06), XFF behavior (R-08): all post-deploy verifications with named owners and protocols; none concealable, all listed in DEPLOYMENT_AUTHORIZATION_PACKAGE.md.
