# STAGE 2.3 — PRODUCTION CONFIGURATION AUDIT
## Deployment candidate vs running production (directive §4)

**Document ID:** STAGE23-CONFIG-001
**Session:** 2026-11-15 (UTC)

---

## 1. Deployment configuration (committed, authoritative)

**`railway.json`:** builder `DOCKERFILE` (`./Dockerfile`); start command `bun apps/nexus-api/src/main.ts`; healthcheck `GET /health` (timeout 180 s); restart policy `ON_FAILURE` (max 5 retries).

**`Dockerfile`** (pinned base `oven/bun:1.3-slim`): copies `package.json`, `bun.lock`, `tsconfig.json`, `packages/`, `apps/` → `bun install --frozen-lockfile` → `ENV NODE_ENV=production`, `NEXUS_DB_PATH=/data/nexus.db`, `NEXUS_WORKSPACE_ROOT=/data/workspaces` → `EXPOSE 3000` → `CMD bun apps/nexus-api/src/main.ts`. No secrets baked; COPY paths verified to exist in the tree; frozen install verified locally (`bun install --frozen-lockfile` — no changes across 573 packages). **No container runtime exists in this sandbox**, so the image build itself is verified by inspection + local equivalence, and will be genuinely exercised by Railway's builder on deployment.

**Boot sequence (candidate):** `main.ts` → `createApp` → `NexusDb.open` → **`migrate(db)`** (transactional, applies migration 3 on first boot) → subsystem wiring → `Bun.serve` on `PORT`; then restart-recovery resumes interrupted JARVIS/NAEI tasks. `/health` reports `overall` + per-component status and returns **503 when unhealthy** (fail-visible to the Railway healthcheck).

## 2. Current production (read-only baseline, 2026-11-15)

Public URL `https://jarvis-nexus-production.up.railway.app` (edge hkg1, server railway-hikari). `GET /health` → 200 `overall: healthy`; database `migrations applied: 2`; model fabric healthy (cloudflare/openai/echo); MCP gateway healthy; world simulation healthy (1 world, 8 residents); NAEI healthy (10 agents). Anonymous `POST /jarvis/objectives` → 401. Candidate-only routes (`/memory`, `/models/verify`, `/railway/backups`) → 404. Response headers: `access-control-allow-origin: *`.

## 3. Exact delta the deployment will apply

| Dimension | Production today | After deploying the candidate |
|---|---|---|
| Route surface | 33 routes | **58 routes** (+25 additive-only: railway intelligence/backup/recovery/contract/diagnose/monitor/reconcile/webhook, memory, models, NAEI…; 0 removed, 0 duplicates) |
| Migrations | 2/3 | **3/3** (additive `railway_*` tables; applied at boot) |
| Auth | Bearer 401 fail-closed | same, plus 37-route owner-gated matrix incl. the new surface |
| CORS | `access-control-allow-origin: *` | **least-privilege allowlist; unset = same-origin only** (owner must set `CORS_ALLOWED_ORIGINS` for cross-origin browser use — B-02) |
| Backups | phase-4 scheduler (pre-Stage-2.2) | + content-hash verification, guarded productized restore, off-volume copy option, owner download route |
| Webhook | absent | fail-closed `/railway/webhook` (inert until B-03 secret) |
| CI gate on the commit | green run without adversarial step | **adversarial verification gate runs in CI for the first time** |
| Restart recovery | present (phase 4) | same, re-proven |

## 4. Configuration differences between local validation and production (complete list)

1. `OWNER_KEY` — locally injected per-test; production value owner-provisioned (not knowable here, by design).
2. `CORS_ALLOWED_ORIGINS` — unset locally (same-origin posture verified); production needs the owner's origin decision for browser clients of the visual app (B-02).
3. Reverse proxy — local direct; production behind Railway edge (XFF semantics → post-deploy probe FC-05).
4. Storage — local temp dirs; production single `/data` volume (SQLite + workspaces + backups; off-volume copy and object-storage remain owner-gated D-2.1-03).
5. Model egress — sandbox region blocks some providers (ADR-007 expected); production egress differs → post-deploy `/models/verify` (B-07).
6. CI runners — no owner secrets; 12 live-dependent tests self-skip (by design, verified by the green `41092a3` run).

## 5. Railway rollback capability and its limits

Railway retains deployment history; the owner can redeploy the previous (currently healthy) deployment or the repo at `41092a3` from the dashboard — an **application-level** rollback. It does NOT roll back database migrations (no down-migrations by design); migration 3's additive-only shape makes that safe (analysis in RECOVERY_AND_ROLLBACK_REPORT §4). This environment holds no Railway credentials, so every Railway-console action (rollback, auto-deploy toggle, variable changes) is necessarily owner-executed.

## 6. Owner-dependent configuration (explicit, complete)

| Item | Decision | Blocks |
|---|---|---|
| `OWNER_KEY` value in Railway | owner sets a strong key (or confirms the existing one carries over) | usability of all 58-route protected surface (fail-closed without it) |
| `CORS_ALLOWED_ORIGINS` | B-02 | cross-origin browser access post-deploy |
| `RAILWAY_API_TOKEN` + `RAILWAY_WEBHOOK_SECRET` | B-03 | railway intelligence; webhook intake; volume-backup query (BLK-06) |
| `NEXUS_BACKUP_OFFSITE_DIR` (or object storage) | D-2.1-03 | full-strength off-site backup durability |
| Auto-deploy toggle | **new this stage** — if left ON, push = deploy (see authorization package §2) | the two-step push→CI→deploy protocol |
| Model provider keys | B-07 | honest live model verification |

## 7. Audit verdict

The deployment configuration is fully specified, committed, and consistent: pinned builder, frozen dependencies, transactional boot-time migrations, fail-visible healthcheck, ON_FAILURE restart. Every local-vs-production difference is enumerated above; every owner-dependent item is listed with its decision id. Nothing in the configuration requires a change before the owner's authorization decision — and nothing was changed on production while auditing it.
