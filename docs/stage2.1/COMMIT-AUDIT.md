# STAGE 2.1 — INDEPENDENT COMMIT AUDIT (origin/main → main, 20 commits)

**Document ID:** STAGE21-COMMIT-AUDIT-001
**Audited:** 2026-11-15T05:40Z (UTC)
**Range:** `origin/main` = `41092a3` (last push 2026-11-14 12:58:03Z, per reflog) → `main` = `35ae593` (2026-11-14 23:48:49Z)
**Aggregate:** 20 commits · 444 files changed · +55,924 / −65 lines · linear (0 merges) · single day (2026-11-14) · 2 author identities · no GPG signatures (20× `N`)

---

## 1. Range-level integrity checks

| Check | Command | Result |
|---|---|---|
| Unpushed count | `git rev-list --count origin/main..main` | **20** (directive said 19 — see F-COM-01) |
| Lineage | `git rev-list --merges origin/main..main` | 0 merge commits — linear chain, every commit's parent is the previous one; no history rewrites relative to origin |
| Working tree | `git status` | clean at audit start; no stashes |
| Dangling objects | `git fsck --lost-found` | 2 dangling commits (`dde790a`, `80c8b9f`) — byte-identical earlier versions of `9c79f88`/`e5dd804` (rebase remnants), no unique content |
| Authors | `git log --format='%an <%ae>'` | `Z User <z@container>` and `JARVIS NEXUS Engineering <engineering@jarvis-nexus.local>` — both are session/tooling identities of the engineering agent; no third-party commits |
| Secret patterns | pattern scan (AKIA/ghp_/github_pat_/sk-/xox*/JWT/PRIVATE KEY/railway_ai_) over `git diff origin/main..main` added lines | **0 real credentials**; one dev token (F-COM-06 below) |
| Credential assignments | key/password/secret/token assignment scan | only `nexus-tier0-dev-token` (documented dev default) |
| Binary additions | `git diff --numstat` (`- -` rows) | PNG evidence screenshots (12 + 8 + audit captures) and pre-existing `.blend`/texture assets under `NEXUS_WORLD/workspace/` — consistent with "legacy: production capture evidence" commits |
| `.env` / credentials files in range | `git diff --name-only` | none tracked (only code files named `credentials`/`verify_credentials` — logic, not material) |

---

## 2. Per-commit audit table

Risk classes: **PROD** = touches production code path · **TOOL** = scripts/tooling · **DOCS/REG** = documentation/registry · **LEGACY** = legacy asset re-import · **CI** = build/CI config.

| # | Commit | Time (UTC) | Scope | Class | Content summary | Audit notes |
|---|---|---|---|---|---|---|
| 1 | `0f9986a` | 13:03 | 4f +514 | TOOL | Phase-0 audit scripts (`audit_live_probes.py`, `audit_phase0_railway.py`, `audit_post_deploy_probe.py`, `audit_update_registry.py`) | **UUID message** `ced79372-…` (F-COM-02). Benign content. First unpushed commit — everything after the 12:58 push rides on B-01. |
| 2 | `e7d4e39` | 20:01 | 48f +8,971/−139 | PROD+TOOL | `packages/railway` — secure live infrastructure intelligence (client, authz ladder, webhook, audit hash-chain, backups, discovery, recovery, threat model, contract) | Largest product addition. Owner directive-driven. Webhook secret-authenticated; read-only mode default. |
| 3 | `a808727` | 20:09 | 11f +80/−23 | PROD | Independent-verifier remediation (6 findings) in packages/railway | Small, focused fixes. |
| 4 | `60d4fdd` | 20:11 | 2f +235 | DOCS/REG | Railway-intelligence final engineering report + live evidence collector | Matches `railway-intelligence` branch tip (also merged into main lineage here). |
| 5 | `3d08fe3` | 22:02 | 164f +21,190 | LEGACY | NEXUS_WORLD Python subsystem re-import (reference implementation: reports, evidence, workspace renders, integration registers) | Largest commit. Re-import of legacy content, no production service impact (Python subsystem is reference-only; production runtime is the Bun API). |
| 6 | `1ab6731` | 22:02 | 95f +12,669 | LEGACY | Next.js visual application (app router, UI kit, client nexus engine) | Frontend; deployment of the backend service does not ship this (hosting = B-02). |
| 7 | `1545f4a` | 22:02 | 26f +738 | LEGACY | Production capture evidence (screenshots, client bundles under `audit/`) | Evidence-only. |
| 8 | `ab29a05` | 22:04 | 72f +7,528 | LEGACY | Audit/probe scripts + runtime-build test assets | Tooling. |
| 9 | `e5dd804` | 22:04 | 2f +139 | PROD-adjacent | `next.config.ts` (standalone, `ignoreBuildErrors` **removed** in Phase 5 V1) + `prisma/schema.prisma` (event-sourced world persistence) | Verified: current `next.config.ts` contains no `ignoreBuildErrors` — the removal claim checks out. |
| 10 | `9c79f88` | 22:04 | 2f +23 | CI | Dependabot (npm + actions, weekly) + gitignore `__pycache__` | Fine. (Does **not** fix the pre-existing CI trigger corruption — F-COM-03.) |
| 11 | `f6eda7f` | 22:04 | 5f +522 | TOOL | Stage 2 Phase 0/1 engineering tooling | Fine. |
| 12 | `e366267` | 22:09 | 3f +387/−9 | **PROD** | Phase-3 security hardening: CORS allowlist, per-IP rate limiting + auth-fail lockout, honest model health, provider verification | Deployment-relevant. Re-verified live this session (auth matrix 30/30, rate-limit boundary, CORS negative). |
| 13 | `e22f7d9` | 22:10 | 2f +181/−10 | **PROD** | Phase-4 scheduled logical backups + retention + honest status + RPO/RTO | Deployment-relevant. Architecture audited and restore demonstrated in isolation — see backup document. |
| 14 | `3f6b579` | 22:25 | 26f +2,094/−563 | PROD+LEGACY | Phase-5 V1+V2: visual app restored, strict build, backend-single-source-of-truth adapter | Frontend. |
| 15 | `bee3ecb` | 22:29 | 2f +112 | TOOL | Phase-5 verification tooling + evidence | Fine. |
| 16 | `879f8ed` | 22:37 | 3f +189/−18 | **PROD** | Phase-7 provider-independent voice (client Web Speech adapters) | Voice = client-side; honest degradation verified in earlier phases. |
| 17 | `a4f8b79` | 22:41 | 4f +313/−3 | PROD+TEST | Phase-9 independent adversarial verification — 19 tests, 2 real defects found and fixed (`ADV-01` malformed-JSON coercion, `ADV-02` disabled-provider advertisement) | The `tests/adversarial/verifier.test.ts` added here is the file whose V4 block now fails (evidence loss) — see F-COM-07. |
| 18 | `623da7b` | 22:43 | 3f +482/−129 | DOCS/REG | Registry update (112 requirements) + `scripts/stage2_final_register.py` | **Message announces `stage2_execution_register.json` as a deliverable — the file is not in the commit** (its generator writes to gitignored `download/`, now lost). F-COM-04. Register content itself is committed and consistent. |
| 19 | `cd46b69` | 23:33 | 8f +316/−4 | **PROD+CI+TEST** | Final closure: FC-01 honesty repair (ChatView), FC-03 accessibility (aria-labels), FC-04 per-request timeouts (model fabric), CI least-privilege token; adversarial probe scripts | **F-COM-03:** edited `ci.yml` but left `branches: ain]` corrupted (defect predates this commit at pushed `945a78d`, yet a "final closure" touching CI must not leave CI dead). **F-COM-05:** message cites "30-route auth matrix" — the committed probe script is broken and its recorded output is `19 correct / 36 unexpected`. **F-COM-06 note:** message claims "full suite 191 pass / 0 fail (805 assertions)" — true only while the now-lost evidence files existed. Message also cites "documented in final-closure reports" — those reports were never committed and are lost. |
| 20 | `35ae593` | 23:48 | 1f +74 | TOOL | Adds `scripts/stage21_route_parity.py` (route set-diff checker) | **UUID message** `b944b55e-…` (F-COM-02). Post-dates the final-closure report — explains 19→20 count drift (F-COM-01). Content benign and useful; this audit used it. |

---

## 3. Findings (complete list)

- **F-COM-01 — Unpushed count is 20, not 19.** `35ae593` (23:48:49Z) post-dates the directive's baseline. Not a defect in itself, but every count-based claim in the authorization package must use 20.
- **F-COM-02 — Two UUID-placeholder commit messages** (`0f9986a`, `35ae593`). Release history should carry human-readable messages. Remediation option: amend before push (safe — neither is pushed) or accept as-is.
- **F-COM-03 — CI trigger corrupted and already live on origin.** `.github/workflows/ci.yml`: `on.push.branches: ain]` and `on.pull_request.branches: ain]` (should be `[main]`). Introduced at pushed commit `945a78d`; confirmed byte-exact (`cat -A`: `branches: ain]$`). Consequence: **CI never triggers on this repository.** The unpushed range does not fix it. Must be repaired **before or with** the authorized push, otherwise 20 commits land with zero CI.
- **F-COM-04 — Commit message announces a deliverable that is not in the commit** (`623da7b`: `stage2_execution_register.json`). The output was written to gitignored `download/` and is now lost. Honesty defect in messaging, not in code.
- **F-COM-05 — Cited adversarial evidence is invalid.** `cd46b69` cites a "30-route auth matrix" probe; the committed script `final_closure_adversarial_probe.sh` has a word-splitting bug (`for spec in $ROUTES` iterates words, so `M` and `P` both become the method token; every request goes to an invalid URL and returns `000`). Its saved evidence file records `A1 result: 19 routes correctly 401, 36 unexpected`. The **product** is not implicated — the corrected probe (round 2) and this session's re-run both pass 30/30 — but the artifact cited as closure evidence was never valid, and its failure line was not read before the commit message claimed success.
- **F-COM-06 — Secrets: clean.** One documented dev token (`nexus-tier0-dev-token`, legacy Python subsystem, env-overridable, self-flagged LOW in `NEXUS_WORLD/reports/SECURITY_SCAN_OUTPUT.txt`). Binary additions are PNG screenshots. No `.env`, no credentials files, no cloud keys anywhere in the range.
- **F-COM-07 — The V4 evidence-provenance tests added in this range** (`a4f8b79`, `tests/adversarial/verifier.test.ts`) hard-depend on files in gitignored `download/` — a durability defect that now makes the suite red (3 failures). The tests were green when written because the files existed in that session's sandbox; the environment later wiped them.
- **F-COM-08 — Register's `missingRoutes` says 21; actual route delta is 23** (56 vs 33). Minor accuracy defect in the committed register script's snapshot values.
- **F-COM-09 — Route parity re-verified independently:** 56 routes at HEAD (32 GET + 24 POST), production 33 (20 GET + 13 POST), delta +23 additive-only, 0 removals, 0 duplicate registrations. Confirmed by the committed script and by hand-count.
- **F-COM-10 — Legacy bundles in volatile storage hold unique history.** `/tmp/my-project/download/backups/lineA_production.bundle` contains 1 commit unreachable from any current ref (`84a1831` — smart-failover: circuit breakers, backoff, 879 insertions); `lineB_NEXUS_WORLD_V2.bundle` contains 18 unreachable commits (V2 lineage). Both files live outside the protected project directory and will be lost with the sandbox. (Restored and verified in isolation this session — see backup document §5.)

## 4. Verdict

The range is **technically sound to deploy in substance** (additive routes, verified auth posture, clean secret scan, real security hardening and backup features) but **not ready to push as a release** until: F-COM-03 (CI repair) is fixed, F-COM-02 (UUID messages) is dispositioned, and the evidence-durability failure behind the red V4 gate (F-COM-07) is remediated or explicitly waived by the owner. The push/deploy itself remains owner-gated (B-01).
