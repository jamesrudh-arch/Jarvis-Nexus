# STAGE 2.3 — DEPLOYMENT AUTHORIZATION PACKAGE
## Presented at the authorization boundary (directive §5). NOT an authorization.

**Document ID:** STAGE23-AUTH-001
**Issued:** 2026-11-15 (UTC)
**Stage 2.3 verdict at issuance:** **READY FOR AUTHORIZATION** (all prerequisites verified; push/deploy NOT authorized by this document — only the owner's explicit decision B-01 authorizes anything below)

> A previous GREEN verdict, general development permission, or the Stage 2.3 execution prompt does NOT constitute deployment authorization. This package exists so the owner can decide with complete information.

---

## 1. The candidate

- **Branch:** `main` (local; linear history, no rewrites, no force-push at any point)
- **Candidate = the tip of local `main` at authorization time.** At issuance the tip lineage is: …→ `b93a879` (Stage 2.2 final) → `61a7c5b` (Stage 2.3 evidence repairs) → **D** = the Stage 2.3 documentation commit (tagged `stage2.3-candidate`) → **E** = the RP-2.3-001 recovery-artifact commit (bundle + manifest + finalized checksums; adds nothing else). The exact SHAs of D and E are restated in the authorization request that accompanies this package and are re-verified immediately before any push (recipe in §8). If the candidate changes after authorization, renewed authorization is required (directive §6).
- **Commits to be pushed:** **34** (the full unpushed series: Stage 2.1's audit + Stage 2.2's remediation + Stage 2.3's repairs and documentation; `git rev-list --count origin/main..main` re-run at push time must equal the stated number exactly).
- **Remote target:** `origin` = `https://github.com/jamesrudh-arch/Jarvis-Nexus.git`, branch `main` (currently at `41092a33`, CI-green, confirmed via `git fetch` and the GitHub API this session).

## 2. Authorization protocol — TWO OPTIONS (the owner must pick one explicitly)

**N-2.3-07 (critical):** the Railway service is repo-connected to `main` and pushes have historically auto-triggered deployments. Therefore the Stage 2.2 "push → observe CI → deploy" two-step protocol only works if the owner first disables auto-deploy in the Railway console (this environment has no Railway credentials — owner-executed by necessity).

- **Option A (two-step, recommended):** (1) owner disables Railway auto-deploy; (2) owner authorizes push; (3) push executes; (4) first genuine CI run on the candidate must be GREEN (adversarial gate included for the first time) — observed via the public Actions API; (5) owner authorizes deploy; (6) owner triggers the Railway deployment of the exact CI-verified commit.
- **Option B (single act):** owner explicitly accepts that **push = deploy** (auto-deploy stays on; Railway builds while CI runs in parallel; CI is then an observation, not a gate). Cheaper, but the candidate deploys before its CI evidence exists.

**N-2.3-06 (execution constraint):** this environment has NO GitHub or Railway credentials. Even after authorization, the push/deploy must be executed BY THE OWNER (or the owner provisions credentials as an explicit, separately-recorded decision). Nothing in this package asks for credentials in conversation — use your own environment.

## 3. Verification results (all independently reproduced this session; categories per directive §2)

| Gate | Result | Category |
|---|---|---|
| Full test suite | **206 pass / 12 skip / 0 fail / 905 assertions / 27 files** (12 skips = live-credential tests, self-skipping by design) | reproduced |
| TypeScript | `tsc --noEmit` — 0 errors | reproduced |
| Production build | `next build` strict PASS; standalone assembled | reproduced |
| CI structural validation | **29/29 PASS** + full local step execution (`--execute`) PASS | reproduced |
| Adversarial gate in CI | present in the candidate's `ci.yml` (byte-verified, branch filter `[main]` hex-proven); **never yet run on GitHub** | reproduced / github-pending |
| Security suite | **31/31 PASS** (auth 37/37, webhook fail-closed, replay/dedup/stale, rate-limit boundary + lockout, CORS both ways, 0 secret leaks, input hardening) | reproduced |
| Route parity | 58 routes; +25 additive-only vs production 33; 0 removed, 0 duplicates | reproduced |
| Migrations | idempotency proven; migration 3 decoded: **additive-only** (rollback-safe) | reproduced |
| DR drill (fresh) | **10/10 PASS**; RTO 94 ms (data segment) / CLI restore 5 ms / RPO 11 ms; 24 tables, content hashes, 0 FK violations, functional resurrection | reproduced |
| Recovery bundles | RP-2.2-001/002 checksums match; `git bundle verify` PASS; **strict restoration re-proof from GitHub's exact object base — tree-identical**; RP-2.3-001 created covering the final tip | reproduced |
| Evidence integrity | **53/53 PASS** (after this stage's repairs; durable artifacts) | reproduced |
| Checksum registers | `sha256sum -c docs/stage2.2/SHA256SUMS` → **22/22 OK** (standard format, repaired this stage) | reproduced |
| GitHub Actions on the candidate | **NOT YET POSSIBLE** — requires the authorized push; last genuine run `41092a33` green (without the gate step) | github-pending |
| Production behavior of the candidate | **NOT YET POSSIBLE** — requires the authorized deploy; baseline recorded (healthy, old code, 33 routes, migrations 2/2) | production-pending |

## 4. Expected production impact (what changes on deploy)

Route surface 33 → **58** (additive); migrations 2/3 → **3/3** at boot; CORS `*` → **least-privilege allowlist** (cross-origin browser clients stop working until `CORS_ALLOWED_ORIGINS` is set — B-02); new fail-closed webhook (inert until B-03 secret); upgraded backup subsystem (content-hash verification, guarded restore, off-volume copy option); restart recovery re-proven. First backup runs shortly after boot; expect `/health` to show `migrations applied: 3` and the 58-route surface. Data: no destructive migration; existing world/residents/tasks data is preserved (additive-only migration; production today reports 1 world / 8 residents healthy).

## 5. Outstanding risks (honest list)

1. **First genuine CI run of the candidate is unobserved** — high confidence (all steps green locally in `--execute`; identical toolchain), but "CI green on GitHub" is NOT claimed until it exists (Option A gates deploy on it; Option B accepts the residual risk explicitly).
2. **XFF/rate-limit keying (FC-05)** — first entry of `X-Forwarded-For` is spoofable; weakens per-IP rate limiting/lockout behind the proxy; NOT an auth weakness; disposition requires a live probe post-deploy.
3. **CORS behavior change** — visible to any cross-origin browser client on day one (intended hardening; owner decides the origin list).
4. **`OWNER_KEY` provisioning** — if the production variable is absent after deploy, all 58 protected routes fail closed (401): safe but unusable until the owner sets a key.
5. **Single `/data` volume** remains the production storage; full off-site durability stays owner-gated (D-2.1-03) until `NEXUS_BACKUP_OFFSITE_DIR` or object storage is configured.
6. **Auto-deploy ambiguity (N-2.3-07)** — resolved only by the owner's explicit Option A/B choice.
7. Carried owner decisions unchanged: B-02…B-07, FC-05, FC-06, D-2.1-03/04/05 (full list in OWNER_DECISION_REGISTER.md, Stage 2.2).

## 6. Rollback plan (pre-authorized shape; execution details in RECOVERY_AND_ROLLBACK_REPORT)

Known-good: `41092a33` (pushed, CI-green; currently healthy deployment lineage). Application rollback = owner redeploys the previous Railway deployment (or `41092a3`); **database migrations do not roll back** — migration 3 is additive-only, so the old app runs safely against the migrated DB (decoded and verified). Data-level recovery, if ever needed, uses the productized guarded restore — isolated verification first; any destructive restore is owner-authorized (never automatic). Decision tree for every failure layer: RECOVERY_AND_ROLLBACK_REPORT §5.

## 7. Required owner decisions at this boundary

| # | Decision | Options |
|---|---|---|
| 1 | **B-01 — authorize the deployment protocol** | Option A (two-step: disable auto-deploy → authorize push → CI green → authorize deploy) or Option B (push = deploy, single act) — or decline (nothing is lost; the repo stays clean, protected and re-verifiable) |
| 2 | **Execution actor** (N-2.3-06) | owner executes push/deploy personally, or provisions credentials as an explicit separate decision |
| 3 | Pre-push hygiene (optional, D-2.1-05 adjacent) | accept the 2 UUID commit messages in the series, or require rewording (history rewrite, therefore owner-gated, before push only) |
| 4 | Post-deploy gates (B-03, B-07, D-2.1-03, B-02) | provision `OWNER_KEY`/secrets/origins/off-site dir when authorizing, or explicitly defer each (every deferral is recorded, never silently assumed) |

## 8. Candidate-integrity recipe (the owner can verify the exact candidate independently)

```
git fetch origin && git rev-list --count origin/main..main   # must equal the stated commit count
git log --oneline origin/main..main                          # full series, descriptive messages
git rev-parse main^{tree}                                    # tree hash (recorded in the RP-2.3-001 manifest)
sha256sum -c docs/stage2.2/SHA256SUMS                        # 22/22 OK
sha256sum -c docs/stage2.3/SHA256SUMS                        # all OK
bun test && bun run typecheck                                # 206/12/0/905, 0 errors
python3 scripts/stage22_ci_validate.py --execute             # 29/29 + step execution PASS
```

## 9. If the owner declines

Nothing expires and nothing is lost: the repository remains clean at the candidate tip, unpushed, protected by RP-2.2-001/002 + RP-2.3-001 (all committed, restore-proven), with every verification re-runnable by anyone at any time and production untouched at its healthy baseline.

---

**STOP. This package is the authorization boundary. No push, no deployment, no production change and no credential operation will occur until the owner explicitly grants B-01 under Option A or Option B.**
