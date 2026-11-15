# STAGE 2.1 — OWNER DECISION REGISTER

**Document ID:** STAGE21-DECISIONS-001
**Generated:** 2026-11-15T05:40Z (UTC)
**Status: AWAITING OWNER APPROVAL — nothing below has been decided. No approval is assumed or implied.**

Decision format: each entry states the decision, the options, the engineering recommendation, what it unblocks, whether it blocks deployment, and the evidence required to close it. The nine pre-existing decisions (B-01…B-07, FC-05, FC-06) are carried from the committed Stage 2 register (`scripts/stage2_final_register.py`) and the final-closure commit message (`cd46b69`); five new decisions (D-2.1-01…05) arise from this audit.

---

## A. Pre-existing decisions (carried, re-verified)

### B-01 — Authorize push + deploy of the unpushed commit series
- **Decision:** push local `main` to `origin` and deploy the approved commit to the Railway production service.
- **Scope now:** **20 commits** (not 16 as originally scoped, not 19 as the Stage 2.1 directive stated) — `0f9986a`…`35ae593`, 444 files, +55,924/−65.
- **Options:** (a) push + deploy now; (b) push only, deploy after CI proves green on GitHub; (c) hold.
- **Recommendation:** **(b)** — push after D-2.1-01 (CI repair) and D-2.1-02 (evidence gate) land, let CI run on GitHub, then deploy the exact commit CI verified.
- **Unblocks:** 23 new routes, migration 3, security hardening, backup scheduler, final-closure repairs in production.
- **Blocks deployment: YES (this is the deployment authorization itself).**
- **Evidence to close:** recorded owner approval naming the exact commit hash; push reflog; deploy logs; production `GET /health` at the new commit.

### B-02 — Visual application hosting decision + CORS origin
- **Decision:** where the Next.js visual app is hosted (Railway second service / same-service / elsewhere) and which origin enters the backend CORS allowlist.
- **Recommendation:** decide before frontend work resumes; backend currently defaults to same-origin/allowlist posture and fails closed for unlisted origins (verified).
- **Unblocks:** V4 mobile acceptance, visual app deployment.
- **Blocks deployment of the backend service: NO** (backend deploys independently).

### B-03 — Provision `RAILWAY_API_TOKEN` + `RAILWAY_WEBHOOK_SECRET`
- **Decision:** supply live Railway credentials so the railway-intelligence layer and webhook intake function in production.
- **Recommendation:** provision at deploy time; strong webhook secret; token least-privilege.
- **Unblocks:** `GET /railway/*` live intelligence (9 currently-skipped live tests), webhook intake, and the **verification of the volume-backup state** (currently unverifiable without owner key/token).
- **Blocks deployment: NO** (routes fail closed with 503/honest errors until configured — verified).

### B-04 — Repository visibility + branch protection
- **Decision:** public vs private repo; branch protection rules on `main`.
- **Recommendation:** branch protection BEFORE push (the repo currently has none verified); visibility per owner's intent.
- **Unblocks:** public-exposure risk closure (CI least-privilege token already in place).
- **Blocks deployment: NO, but should precede the B-01 push.**

### B-05 — Real iPhone/Safari acceptance run (V4)
- **Decision:** owner executes the real-device acceptance checklist.
- **Unblocks:** VIS-4 closure (currently BLOCKED in the registry — honestly recorded).
- **Blocks deployment: NO.**

### B-06 — UE5/Blender workstation runtime
- **Decision:** whether/when to stand up the workstation for cinematic-environment verification.
- **Unblocks:** asset-pipeline and cinematic environment verification (reference subsystem; not in the deployment path).
- **Blocks deployment: NO.**

### B-07 — Live model-provider credentials
- **Decision:** supply production cloud-model credentials (or confirm echo-only operation).
- **Recommendation:** configure, then run `POST /models/verify` (owner) and record the honest result — the system reports "configured ≠ verified" by design.
- **Unblocks:** verified model fabric in production (2 cloudflare live tests currently skip).
- **Blocks deployment: NO** (health degrades honestly without credentials — verified).

### FC-05 — Rate-limit evasion via XFF rotation (disposition)
- **Finding:** per-IP rate limiting trusts `X-Forwarded-For`; a client rotating XFF values obtains a fresh limit per value (if the platform proxy passes client-supplied XFF through).
- **Decision:** verify production XFF behavior post-deploy and either (a) confirm Railway overwrites XFF (risk void), or (b) fund the fix (bind to connection IP / trusted-proxy handling).
- **Blocks deployment: NO** (documented, bounded; owner-gated routes carry the sensitive surface).

### FC-06 — `POST /world/construct` empty-body free-hand generation (disposition)
- **Finding:** empty body → 200 with a fully generated deterministic spec (verified again this session). Additive, owner-gated, deterministic.
- **Decision:** accept as documented feature or require an explicit spec.
- **Blocks deployment: NO.**

---

## B. New decisions forced by this audit

### D-2.1-01 — Repair the CI workflow **before** push *(new, deployment-blocking as a gate of B-01)*
- **Finding:** `on.push.branches: ain]` / `on.pull_request.branches: ain]` (corrupted `[main]`), introduced at pushed `945a78d`; CI has never triggered on this repository; none of the 20 commits fixes it (F-COM-03).
- **Options:** (a) one-line repair commit included in the push set; (b) repair in a separate immediate hotfix push; (c) push without repair (CI stays dead — not recommended).
- **Recommendation:** (a) — fix `branches: [main]` in the same authorized push; CI then runs typecheck + registry + unit + integration suites on GitHub for the first time.
- **Evidence to close:** corrected `ci.yml` at the pushed commit; a green (or honestly-triaged) GitHub Actions run.

### D-2.1-02 — Evidence durability + disposition of the 3 failing V4 tests *(new, deployment-blocking as a gate of B-01 unless waived)*
- **Finding:** Stage 2's evidence set and both recovery points were written only to gitignored `download/` and were wiped; `tests/adversarial/verifier.test.ts` V4 now fails 3 checks; the claimed 191/0/805 baseline is unreproducible (R-02/R-10).
- **Options:** (a) regenerate the evidence honestly via the committed generators (adversarial probes re-run this session already; a fresh evidence pass + dated reports + a **new** recovery manifest pointing at RP-2.1-001), commit the evidence to git, suite returns to green; (b) amend V4 to gate on git-tracked artifacts only; (c) waive with documented owner acceptance of a red gate (not recommended).
- **Recommendation:** (a) — one evidence-regeneration commit (reports dated 2026-11-15, explicitly marked as re-verification, not backdated).
- **Evidence to close:** full suite green locally; V4 passing against committed evidence.

### D-2.1-03 — Off-site backup export path *(new; blocks the "production-verified backups" claim, not the deploy act)*
- **Finding:** backups and database share one Railway volume; zero Railway volume backups (last verified); no off-site export (G-03/G-05).
- **Options:** (a) implement scheduled off-volume push (object storage) or an owner-gated backup-download route before deploy; (b) accept residual risk and schedule the fix post-deploy; (c) additionally fund Railway volume backups.
- **Recommendation:** (a) minimal: owner-gated download route + documented manual off-site copy procedure; full: scheduled object-storage push.
- **Evidence to close:** a backup existing outside the Railway volume, checksum recorded.

### D-2.1-04 — Disposition of legacy bundles holding unique history *(new)*
- **Finding:** `lineA_production.bundle` (1 unreachable commit: smart-failover) and `lineB_NEXUS_WORLD_V2.bundle` (18 unreachable commits) exist only in volatile `/tmp` (F-COM-10).
- **Options:** (a) copy both bundles into the durable recovery directory (RP-2.1-002) with checksums; (b) extract and re-import the smart-failover commit onto a branch; (c) accept loss.
- **Recommendation:** (a) immediately (cheap, reversible), (b) optional later.
- **Blocks deployment: NO.**

### D-2.1-05 — Commit-message hygiene for the push set *(new, cosmetic)*
- **Finding:** two UUID-message commits (`0f9986a`, `35ae593`) and two messages citing lost/nonexistent artifacts (F-COM-02/04/05).
- **Options:** (a) reword the two UUID messages via rebase (safe — unpushed) and add a correcting note in the push request; (b) push as-is.
- **Recommendation:** (a) for the UUID messages only (no content rewrites, messages-only rebase).
- **Blocks deployment: NO.**

---

## C. Decision matrix summary

| ID | One-line decision | Blocks deploy? | Recommended |
|---|---|---|---|
| B-01 | Push + deploy the 20-commit series | **YES (is the authorization)** | Push after gates, deploy after CI green |
| B-02 | Visual-app hosting + CORS origin | no | Decide before frontend phase |
| B-03 | Railway token + webhook secret | no | Provision at deploy time |
| B-04 | Repo visibility + branch protection | no (should precede push) | Protection first |
| B-05 | Real-device acceptance run | no | Owner-executed checklist |
| B-06 | UE5/Blender workstation | no | Defer |
| B-07 | Live model credentials | no | Configure then verify honestly |
| FC-05 | XFF rotation disposition | no | Verify production XFF post-deploy |
| FC-06 | construct('') disposition | no | Accept as documented |
| D-2.1-01 | **CI repair before push** | **YES (gate of B-01)** | One-line fix in push set |
| D-2.1-02 | **Evidence regeneration + V4 gate** | **YES (gate of B-01) unless waived** | Regenerate honestly, commit evidence |
| D-2.1-03 | Off-site backup export | blocks "verified backups" claim only | Minimal route now, full push later |
| D-2.1-04 | Legacy bundle disposition | no | Copy to durable storage now |
| D-2.1-05 | Commit-message hygiene | no | Reword 2 UUID messages |

**Nothing above is executed. The repository remains at `35ae593`, clean, unpushed. Production remains at `41092a3`, untouched. Awaiting explicit owner approval.**
