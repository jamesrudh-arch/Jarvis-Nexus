# STAGE 2.3 — INCIDENT AND BLOCKER REGISTER
## Everything found, everything outstanding, nothing hidden (directive §12.10)

**Document ID:** STAGE23-REGISTER-001
**Session:** 2026-11-15 (UTC)
**Convention:** findings from this stage are `F-2.3-*`; inherited items keep their Stage 2.1/2.2 ids. Disposition values: REPAIRED / DOCUMENTED / CARRIED (owner-gated) / PENDING (structurally impossible before authorization).

---

## 1. Stage 2.3 findings (all dispositioned)

| ID | Finding | Severity | Root cause | Disposition |
|---|---|---|---|---|
| **F-2.3-01** | Package checksum register (`docs/stage2.2/SHA256SUMS`) non-standard 3-column format (breaks `sha256sum -c` on every line) AND one stale hash (`evidence-integrity.json` recorded pre-regeneration) | Medium (evidence-verification defect; the substitution guard could not be exercised with the standard tool) | register script recorded `<hash> <path> <bytes>`; ran BEFORE the final evidence refresh in `b93a879` (12:28:18 vs 12:28:22) | **REPAIRED** (`61a7c5b`): standard 2-column format; ordering rule documented in the generator; `sha256sum -c docs/stage2.2/SHA256SUMS` → 22/22 OK directly |
| **F-2.3-02** | Registered evidence files `auth-matrix-gen.log` + `backup-export-verify-gen.log` non-durable: `*.log` in `.gitignore` silently excluded them; environment recycle deleted them; integrity validator honestly failed 51/53 (Stage 2.2's 53/53 was valid only in the pre-recycle tree) | Medium (durability defect class N-2.2-01, third instance — but first to hit REGISTERED evidence) | evidence generator writes `.log` files into a git-tracked dir while a blanket `*.log` ignore rule exists | **REPAIRED** (`61a7c5b`): scoped negation `!docs/stage2/evidence/*.log`; both logs regenerated and committed; validator 53/53 PASS durable |
| **F-2.3-03** | `b93a879` commit message claims 907 test assertions; the machine register's static transcription says 905; the first Stage 2.3 re-run measured 905 | Low (documentation; **resolved during this stage**) | root cause: the V4 gate's assertion count is DYNAMIC — one assert per file in `docs/stage2/evidence/` (6 files post-wipe → 905; 8 files with both gen.logs → 907). Stage 2.2's 907 was correct for its pre-recycle tree; the register's static 905 was stale | **RESOLVED**: after the F-2.3-02 durable repair the reproducible count at HEAD is **907**, matching the original claim — the gate is stronger, not weaker; register literal corrected with a provenance comment |
| **F-2.3-04** | `download/stage2.2/` convenience mirror promised in `b93a879` is absent (third environment wipe of `download/`) | Low (mirror explicitly non-authoritative by design) | non-git-tracked storage does not survive environment recycles | **CONFIRMED THE RULE** — the git-tracked `docs/stage2.2/` tree survived intact; no action required |
| **F-2.3-05** | RP-2.2-002 does not cover the final Stage 2.2 tail (`fad4c69`, `b93a879`) — no bundle can contain the commit that commits it | Low (inherent git-bundle limitation, previously undocumented) | bundle self-reference | **CLOSED** — RP-2.3-001 created at the end of this stage covering the final tip; residual tail = the RP-2.3-001 artifact commit alone (deterministically reproducible) |
| **N-2.3-06** | **This environment cannot execute an authorized push or deployment**: no GitHub credentials (no helper/gh/SSH/token), no Railway credentials | Informational (operational constraint, not a defect) | sandbox credential isolation | **CARRIED** into the authorization package: the owner executes the push personally, or provisions credentials as part of the authorization (credential provisioning is itself owner-gated) |
| **N-2.3-07** | **Railway auto-deploy**: the service is repo-connected to `main`; pushes historically auto-trigger deployments | Informational (protocol-critical) | Railway repo integration | **CARRIED** into the authorization package §2: if auto-deploy remains ON, push = deploy; the owner must either disable it first (two-step protocol) or explicitly authorize push=deploy |

## 2. Inherited items — status after Stage 2.3 revalidation

| Inherited id | Item | Stage 2.3 status |
|---|---|---|
| BLK-01 / D-2.1-01 / F-COM-03 | "CI branch filter corrupted" | **REFUTATION INDEPENDENTLY CONFIRMED** (byte-level hex proof; artifact reproduced live in this session's own output) — closed as false finding |
| F-2.2-CI-01 | adversarial gate missing from CI | repaired in Stage 2.2; **re-verified** (29/29 + `--execute`); first genuine GitHub execution pending authorized push |
| BLK-02…BLK-05, BLK-09…BLK-13 | technical blockers | closed with evidence in Stage 2.2 (REMEDIATION_REGISTER); revalidated via the passing suite/build/parity/integrity |
| BLK-06 / BLK-07 | production-only validations (volume backups; model verify) | **CARRIED** — require B-03 / B-07 + deployment |
| BLK-08 | final-closure probe defect | repaired in Stage 2.2; revalidated (29 routes 401 / 0 unexpected in committed evidence) |
| B-01 | deployment authorization itself | **THIS PACKAGE** — presented at the authorization boundary; NOT granted by anything in this stage |
| B-02, B-03, B-04, B-05, B-06, B-07 | owner decisions | **CARRIED** (unchanged; see the authorization package §"owner decisions") |
| FC-05 | XFF disposition | **CARRIED** — precisely characterized in SECURITY_AUDIT §5; requires live deployment |
| FC-06 | `construct('')` spec decision | **CARRIED** (owner) |
| D-2.1-03 | full off-site backup form | **CARRIED** (owner; minimal form implemented and re-verified) |
| D-2.1-04 | legacy bundle durable preservation | **CARRIED (status improved)** — this session's recycle left `/tmp/my-project/download/backups/` intact: the legacy originals (lineA 85.4 MB, lineB 83.0 MB) survived and were re-mirrored with verified checksums (match the RP-2.2-001 manifest values); they remain NON-DURABLE (both `/tmp` and `download/` are non-git-tracked) — durable preservation still owner-gated |
| D-2.1-05 | two UUID commit messages in the unpushed series | **CARRIED** (owner: reword pre-push — requires history rewrite, owner-gated — or accept) |
| N-2.2-01 | download/ wipe durability lesson | **RE-CONFIRMED** (third wipe, F-2.3-04); mitigation (git-tracked evidence) held — nothing registered was lost this time after the F-2.3-02 repair |

## 3. Open blocker count for the deployment decision

**Technical blockers: 0.** All mandatory technical gates pass on the candidate (tests 206/12/0, typecheck, build, CI structural 29/29 + local step execution, security 31/31, parity, migrations, DR drill 10/10, evidence integrity 53/53, checksums 22/22).

**Owner-gated items: the authorization itself (B-01) plus the carried decision register** (B-02…B-07, FC-05, FC-06, D-2.1-03/04/05, and the two new informational constraints N-2.3-06/07 that shape HOW the authorization must be executed). None of these can be resolved by engineering alone; none was silently closed.

**No incident occurred during this stage**: production was never modified; no push, no deploy, no destructive operation, no credential use. All work was local, isolated and reversible.
