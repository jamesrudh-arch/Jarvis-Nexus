# STAGE 2.2 — DEPLOYMENT AUTHORIZATION PACKAGE

**Document ID:** STAGE22-AUTH-001
**Prepared for:** the owner's deployment-authorization decision (B-01).
**Verdict (directive §15):** **GREEN — READY FOR AUTHORIZATION.**

> **GREEN does not itself authorize deployment.** It states: all mandatory technical gates pass; no critical or high-severity unresolved technical blockers remain; the system is ready for the owner to *consider* authorizing the next deployment stage. The authorization act (B-01) remains exclusively the owner's.

---

## 1. Why GREEN (not AMBER)

Every entry of the §14 acceptance table is MET (STAGE2_2_MASTER_REPORT.md §8). The exceptions the table itself allows are satisfied in their allowed form: off-site recovery = implemented (minimal) **plus** explicitly owner-blocked (full). The remaining open items are exactly the class GREEN anticipates: the owner's authorization decisions (B-01 and the carried register), and post-deploy validations that by definition cannot exist before a deployment is authorized. No technical work remains that the engineer could perform without violating the standing prohibitions (no push, no deploy, no production mutation).

## 2. What the owner is asked to authorize (B-01) — recommended protocol

**Step 1 — PUSH (authorization act 1):** push local `main` to `origin` at its current head (the exact hash at authorization time; the series = Stage 2.1's 20 + 2 Stage 2.1 audit commits + the Stage 2.2 remediation commits ending with this package's final commit, recorded in MACHINE_READABLE_EVIDENCE_REGISTER.json).

**Step 2 — OBSERVE CI (gate, not formality):** the first genuine GitHub Actions run on this repository executes (workflow valid — proven; adversarial gate included — proven). **It must be green.** If it is not, deployment does not proceed and the failure is triaged honestly. Until this run exists, "CI green on GitHub" is never claimed.

**Step 3 — DEPLOY (authorization act 2):** deploy the exact commit CI verified to the Railway service (builder Dockerfile, start `bun apps/nexus-api/src/main.ts`, healthcheck `/health`, ON_FAILURE restart). Deploying any commit other than the CI-verified one breaks the evidence chain.

**Step 4 — POST-DEPLOY VERIFICATION (mandatory, honest recording):**

1. Startup logs + `GET /health`: overall healthy; **migrations 3/3**; 58-route surface.
2. First backup event in production (scheduled at +30 s or manual `POST /railway/backup/export`), then `GET /railway/backups` (owner): schedule, lastRun, **off-site status**.
3. Off-site protection confirmation: `NEXUS_BACKUP_OFFSITE_DIR` set (or another mount), one off-volume copy verified by checksum — else R-2.2-01 stands and is recorded.
4. `GET /railway/backup/export/<file>/download` (owner): download + verify `X-Backup-Sha256` against the local artifact — a real off-volume copy exists outside the service.
5. Isolated restore verification in production via `POST /railway/backup/restore` (owner; non-destructive by construction).
6. Volume-backup state query (BLK-06; requires B-03 credentials) — record honestly.
7. `POST /models/verify` (owner) with honest result (B-07; "configured ≠ verified" until then).
8. XFF behavior probe (FC-05) and disposition.
9. Persistence restart test on production.

## 3. The complete open-decision list at authorization time

| Decision | Required action | Blocks |
|---|---|---|
| **B-01** | Approve push + CI observation + deploy of the CI-verified commit (protocol above) | the deployment itself |
| B-02 | Visual-app hosting + CORS origin | frontend work, not this deploy |
| B-03 | Provision `RAILWAY_API_TOKEN` + strong `RAILWAY_WEBHOOK_SECRET` | railway intelligence, webhook intake, BLK-06 verification |
| B-04 | Branch protection on `main` before push (recommended); visibility | repo hygiene |
| B-05 | Real-device acceptance run (VIS-4) | VIS-4 closure |
| B-06 | UE5/Blender workstation | reference subsystem verification |
| B-07 | Live model credentials → honest verify | "AI verified in production" claim |
| FC-05 | XFF disposition post-deploy | rate-limit evasion risk closure |
| FC-06 | Accept or require explicit spec for `construct('')` | documented behavior |
| D-2.1-03 | Full off-site form (object storage / volume backups) + set `NEXUS_BACKUP_OFFSITE_DIR` | backup-durability claim at full strength |
| D-2.1-04 | Legacy bundle durable preservation or accept loss | unique legacy history |
| D-2.1-05 | Reword the two UUID commit messages pre-push, or accept | release-history hygiene |

## 4. Evidence package the owner can independently check

- Every claim above is backed by machine evidence in git-tracked `docs/stage2.2/evidence/` and `docs/stage2/evidence/` (checksummed in SHA256SUMS; substitution-guarded).
- Every verification tool is committed and re-runnable by anyone: `scripts/stage22_ci_validate.py`, `stage22_evidence_validate.ts`, `stage22_security_suite.ts`, `stage22_disaster_recovery_drill.ts`, `stage21_route_parity.py`, `final_closure_adversarial_probe.sh` (repaired).
- The full state is restorable from the committed recovery bundles without any external dependency beyond `origin/main` (restore-proven).

## 5. If the owner declines

Nothing is lost by declining: the repository remains clean, unpushed, protected by committed recovery points (RP-2.2-001/002), with all evidence durable. The owner may re-run any verification at any time. No clock forces this decision; no silent expiry exists.

---

**Issued by:** the Stage 2.2 autonomous engineering organization (verification auditor sign-off embedded in each machine evidence file).
**Awaiting explicit owner approval. No deployment, push or production modification has occurred.**
