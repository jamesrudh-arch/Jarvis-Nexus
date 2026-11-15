# STAGE 2.2 — OWNER DECISION REGISTER

**Document ID:** STAGE22-DEC-001
**Status: AWAITING OWNER APPROVAL — nothing below is decided. No approval is assumed or implied. Silence is never consent.**
**Rule (directive §12):** A. engineering decisions (autonomous when reversible + technically justified + within existing architecture); B. owner decisions (explicit authorization required); C. financial decisions (approval before costs); D. production decisions (explicit authorization before any production modification). Every decision below is classified.

---

## A. Decisions made autonomously during Stage 2.2 (engineering, all reversible, all documented)

| Decision | Rationale | Where recorded |
|---|---|---|
| Evidence tree moved to git-tracked `docs/` (V4 repointed) | The twice-proven wipe rule; same assertion strength | V4_EVIDENCE_RECONSTRUCTION.md |
| Adversarial gate added to CI (F-2.2-CI-01) | CI must fail when the repo's own verifier is red | CI_REPAIR_AND_VERIFICATION.md |
| Content-level backup verification (`sha256Rowid`) | G-02; corruption with matching counts now detected | BACKUP_ARCHITECTURE.md |
| Productized restore (function + guarded CLI + isolated-verification route) | G-01; destructive ops require explicit authorization by construction | BACKUP_ARCHITECTURE.md |
| Off-site export via `NEXUS_BACKUP_OFFSITE_DIR` + owner download route (no provider, no cost) | G-03 minimal; zero recurring cost; no provider assumed | BACKUP_ARCHITECTURE.md |
| `docs` excluded from Next type-check sweep | The build was broken at HEAD by committed docs artifacts | REGRESSION_TEST_REPORT.md |
| Parity invariants made structural (frozen count removed) | Frozen counts fail on legitimate growth | REGRESSION_TEST_REPORT.md |
| BLK-08 probe script repaired (array iteration) | Cited evidence must be valid; re-proven "29 correct / 0 unexpected" | SECURITY_VERIFICATION.md |

## B. Owner decisions outstanding (explicit authorization required)

### B-01 — Authorize push + deployment of the unpushed series **[THE authorization itself]**
- **Scope:** the full unpushed series at push time (Stage 2.1's 20 + Stage 2.1 audit commits + all Stage 2.2 remediation commits; exact final hash recorded in DEPLOYMENT_AUTHORIZATION_PACKAGE.md).
- **Recommended protocol (two-step, unchanged from Stage 2.1):** (1) authorize push → observe the first genuine GitHub Actions run → it must be green; (2) deploy the exact commit CI verified, with the post-deploy verification protocol.
- **Sub-gates:** all technical sub-gates are now cleared (CI valid + adversarial gate included; V4 green; evidence durable). The only observation pending is the first real GitHub run, which cannot exist before the push.

### D-2.1-03 — Full off-site backup destination (financial/infrastructure)
- Implemented: minimal, zero-cost (env dir + download route; drill-proven).
- Owner chooses the full form: scheduled object-storage push (S3-compatible; introduces cost + credentials) and/or Railway volume backups (introduces cost); and must set `NEXUS_BACKUP_OFFSITE_DIR` on the service (or attach a mount) for the minimal form to protect production. Without it, R-2.2-01 stands.

### D-2.1-04 — Legacy bundle disposition (1 + 18 unreachable commits)
- Mirrored with checksums to `download/stage2.2/recovery/legacy/` (non-durable); originals still in `/tmp`. Durable preservation = commit 168 MB to git, or external storage, or accept loss. Owner decision (cost/history trade).

### D-2.1-05 — Commit-message hygiene for the push set
- Two UUID-message commits (`0f9986a`, `35ae593`) can still be reworded via rebase (safe: unpushed). NOT done autonomously: it rewrites 20+ hashes and invalidates every evidence cross-reference recorded this session. Recommendation unchanged: reword before push, or accept as-is.

### B-02 — Visual application hosting + CORS origin (unchanged)
### B-03 — Railway API token + webhook secret (unchanged; unlocks BLK-06 verification)
### B-04 — Repository visibility + branch protection BEFORE push (recommendation unchanged)
### B-05 — Real-device acceptance run (VIS-4; unchanged)
### B-06 — UE5/Blender workstation (unchanged, defer)
### B-07 — Live model credentials, then honest `POST /models/verify` (unchanged)
### FC-05 — XFF-rotation disposition (verify production XFF post-deploy; unchanged)
### FC-06 — `construct('')` disposition (accept documented or require explicit spec; unchanged)

## C. Production-only validation still required (after any authorized deploy)

1. Startup logs + `GET /health` at the new commit (migrations 3/3; 58 routes).
2. First scheduled/manual backup run in production + off-site copy verification (`GET /railway/backups` with owner key).
3. Volume-backup state query (BLK-06) — requires B-03.
4. `POST /models/verify` (owner) — honest result recorded (B-07).
5. XFF behavior probe (FC-05).
6. Persistence restart test on production (restart-recovery routines).

## D. Financial decisions
None taken. No provider, service or recurring cost was introduced (directive constraint honored). The only cost-bearing items (object storage, Railway volume backups, 168 MB-in-git) are owner-gated above.
