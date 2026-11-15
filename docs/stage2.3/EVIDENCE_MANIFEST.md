# STAGE 2.3 — EVIDENCE MANIFEST
## What exists, where it is, how to verify it (directive §10, §12)

**Document ID:** STAGE23-MANIFEST-001
**Session:** 2026-11-15 (UTC)
**Durability rule:** every artifact below is git-tracked under `docs/` — the only storage proven to survive environment recycles (three wipes of `download/` recorded across stages; F-2.3-04 is the latest confirmation).

---

## 1. Stage 2.3 documents (this directory)

| Document | Content | Status |
|---|---|---|
| `REPOSITORY_BASELINE.md` | independent audit: git state, 14 Stage 2.2 deliverables, bundle integrity, SHA256SUMS findings, production/deployment state, credential capability | COMPLETE |
| `STAGE2.2_EVIDENCE_REVALIDATION.md` | 23-item revalidation matrix with the four evidence categories; every Stage 2.2 claim reproduced or defect-repaired | COMPLETE |
| `RECOVERY_AND_ROLLBACK_REPORT.md` | strict bundle restoration proofs, DB backup/restore procedures, migration compatibility analysis, recovery decision tree | COMPLETE |
| `SECURITY_AUDIT.md` | pre-deployment security audit: auth, tokens, webhook, rate limit, CORS, XFF (FC-05), secrets, env inventory, local-vs-production differences | COMPLETE |
| `PRODUCTION_CONFIGURATION_AUDIT.md` | railway.json/Dockerfile, production baseline, exact deploy delta, config differences, owner-dependent configuration | COMPLETE |
| `DEPLOYMENT_AUTHORIZATION_PACKAGE.md` | the authorization boundary: candidate, protocol options, verification results, risks, rollback, required decisions | COMPLETE (awaiting owner decision B-01) |
| `INCIDENT_AND_BLOCKER_REGISTER.md` | F-2.3-01…F-2.3-05, N-2.3-06/07 findings; inherited-item statuses; zero technical blockers | COMPLETE |
| `EVIDENCE_MANIFEST.md` | this document | COMPLETE |
| `SHA256SUMS` | standard-format checksums of `docs/stage2.3/` (verify: `sha256sum -c docs/stage2.3/SHA256SUMS` from repo root) | COMPLETE (finalized at stage close) |

## 2. Stage 2.3 machine evidence (`docs/stage2.3/evidence/`)

| Artifact | Records | Reproduce with |
|---|---|---|
| `git-state-stage23.json` | branch/HEAD/origin relationship, unpushed count, credential capability, Stage 2.2 deliverable inventory | `python3 scripts/stage23_evidence_record.py` |
| `bundle-restore-proof.json` | strict restoration of RP-2.2-001/002 from an origin/main-only base (heads + tree IDs + checksums) | `git bundle verify <bundle>`; full method in RECOVERY_AND_ROLLBACK_REPORT §1 |
| `production-baseline.json` | read-only production probes PB-01…PB-06 (health 200, auth 401, 404s, CORS `*`, auto-deploy mechanism, GitHub Actions history) | `curl -s https://jarvis-nexus-production.up.railway.app/health`; GitHub API |
| `revalidation-summary.json` | the full 23-item revalidation matrix in machine form, with categories and verdicts | individual tools listed per row |

## 3. Refreshed Stage 2.2 / Stage 2 evidence (regenerated this session in the correct order)

- `docs/stage2.2/SHA256SUMS` — repaired to standard format; **22/22 OK** via `sha256sum -c`
- `docs/stage2/evidence/` — route-parity, registry, typecheck, git-state, auth-matrix (+ gen.log, now durable), backup-export-verify (+ gen.log, now durable), SHA256SUMS re-recorded (8 artifacts)
- `docs/stage2.2/evidence/` — ci-validation (29/29 + local step execution), security-suite (31/31), dr-drill (fresh 10/10), evidence-integrity (53/53 after repair)
- `docs/stage2.2/MACHINE_READABLE_EVIDENCE_REGISTER.json`, `RECOVERY_MANIFEST.json` — regenerated at the repaired state

## 4. NOT created at this boundary (structurally impossible before authorization — never stubbed, never faked)

| Planned document | Why it does not exist yet | Will be created when |
|---|---|---|
| `GITHUB_ACTIONS_VERIFICATION.md` | requires the first genuine CI run of the candidate (authorized push) | after the authorized push; observed via the public Actions API |
| `RAILWAY_DEPLOYMENT_REPORT.md` | requires an authorized deployment (deployment ID, build/startup/health outcomes) | after the authorized deploy |
| `PRODUCTION_ACCEPTANCE_REPORT.md` | requires the mandatory acceptance gates A–F against the live deployment | after all mandatory gates pass (or with explicit BLOCKED records where owner-gated) |
| `POST_DEPLOYMENT_TEST_RESULTS.md` | per-test records (id, objective, command, timestamp, expected/actual, PASS/FAIL/BLOCKED, reproduction) | alongside the acceptance report |

These four are the exact deliverables of the post-authorization protocol (authorization package §2). Their absence at this boundary is the honest state, not an omission.

## 5. Integrity chain

All Stage 2.3 evidence and documents are checksummed in `docs/stage2.3/SHA256SUMS` (standard format). Stage 2.2's package is checksummed in `docs/stage2.2/SHA256SUMS` (22/22 OK). Stage 2's evidence tree is checksummed in `docs/stage2/evidence/SHA256SUMS` (8 artifacts, substitution-guarded by the validator). The evidence validator (`scripts/stage22_evidence_validate.ts`) enforces presence, schemas, manifest resolution, checksums, timestamp sanity, git-ref existence and recovery-artifact completeness — 53/53 PASS at stage close. Every generator and validator named in this manifest is committed and re-runnable by anyone.
