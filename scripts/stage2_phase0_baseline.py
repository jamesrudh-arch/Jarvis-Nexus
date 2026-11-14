#!/usr/bin/env python3
"""Stage 2 Phase 0 — immutable baseline report generator.

Writes download/stage2/reports/PHASE0_BASELINE.md from live revalidation
results captured in this session (2026-11-14T21:39Z .. 21:56Z UTC).
"""
import json
import subprocess
import time

REPORT = """# STAGE 2 — PHASE 0 BASELINE REPORT (IMMUTABLE)

Generated: {ts}
Operator: Principal Autonomous Systems Engineer (Stage 2 directive)
Scope: READ-ONLY revalidation of the Stage 1.5 baseline. No modifications made.

---

## 1. Environment Identity

| Item | Value |
|---|---|
| Repository root | /home/z/my-project |
| Primary branch | main @ f4c5a41cc5d39553964ad6a4372684a79bb0a6be |
| Working tree | CLEAN (0 modified, 0 untracked policy-relevant files) |
| Secondary branch | railway-intelligence (identical to main, 0 commits ahead) |
| Remote | origin = https://github.com/jamesrud-arch/Jarvis-Nexus.git |
| Remote fetch | 2026-11-14 (this session): origin/main UNCHANGED |
| Unpushed commits (main ahead of origin/main) | **5** — f4c5a41, 60d4fdd, a808727, e7d4e39, 0f9986a |
| Total commits | 64 |
| Toolchain | bun 1.3.14 (0d9b296a), node v24.22.3, tsc (typescript ^7.0.2) |

## 2. The Five Unpushed Commits (verified)

| Commit | Subject | Classification |
|---|---|---|
| 0f9986a | ced79372-5a91-423c-87b2-d528aa58b733 | UUID marker commit (pre-railway-intelligence snapshot) |
| e7d4e39 | railway intelligence: packages/railway — secure live infrastructure intelligence | Feature: @nexus/railway package |
| a808727 | railway intelligence: independent-verifier remediation (6 findings) | Remediation |
| 60d4fdd | railway intelligence: final engineering report (25 sections, 17 PASS / 2 PARTIAL / 0 FAIL) + live evidence collector | Report + tooling |
| f4c5a41 | c1351cdb-003c-48b4-be4d-291b0b9c5da1 | **ANOMALOUS 378-file legacy import** (42,474 insertions) |

### Anatomy of the 378-file import (f4c5a41)
- 181 files → NEXUS_WORLD/ (legacy subsystem: reports, evidence, workspace renders, integration registers)
- 95 files → src/ (Next.js visual application: app router, shadcn/ui components, client-side nexus engine)
- 69 files → scripts/ (legacy audit/probe scripts)
- 26 files → audit/ (screenshots, JS bundles captured from prior production)
- 3 files → tests/ (python runtime build scripts)
- Junk confirmed present: `gh_servers.json` (committed GitHub API rate-limit error message)

## 3. Dependency / Typecheck / Test Revalidation

| Check | Command | Result | Stage 1.5 evidence match |
|---|---|---|---|
| Dependency install | `bun install --frozen-lockfile` | PASS — "Checked 124 installs across 132 packages (no changes)" | IDENTICAL |
| Typecheck | `tsc --noEmit` | PASS — 0 errors | IDENTICAL |
| Registry validation | `bun tools/registry-validate.ts` | PASS — "registries consistent" (same 3 warnings: ARCH-6, MCP-4, INFRA-2 unreferenced) | IDENTICAL |
| Full test suite | `bun test` | **155 pass / 12 skip / 0 fail** (597 expect calls, 23 files, 3.02s) | IDENTICAL shape |
| Skipped tests | 12 | All live-credential-gated (Railway API, Cloudflare fabric, live objective flows) — fail-closed by design | IDENTICAL |

## 4. Requirements Registry

- **100 entries** confirmed (version 1.0.0).
- Status distribution: VERIFIED 71, BLOCKED 9, TESTING 6, DISCOVERED 11, SPECIFIED 2, DEPLOYED 1.
- Warnings (non-blocking): ARCH-6, MCP-4, INFRA-2 not referenced by any ledger task.
- Registries: requirements.json (70,477 B), ledger.json (15,205 B), technologies.json (19,463 B).

## 5. Production Deployment Identity

| Probe | Result |
|---|---|
| Base URL | https://jarvis-nexus-production.up.railway.app |
| GET / | 200 — {"service":"NEXUS API","version":"1.0.0","contractVersion":"1.0.0",...} |
| GET /health | 200 — overall healthy; database: **migrations applied: 2**; model_fabric: cloudflare/openai/echo available; mcp_gateway: io.nexus.test-tools registered (3 tools); world: 1 world / 8 residents; naei: 10 agents |
| GET /metrics | 200 — live counters |

## 6. Production vs Repository Route Parity (GET-only, this session)

Repository defines **54 routes** (33 GET + 21 POST) in apps/nexus-api/src/index.ts.

Production probe of all 30 addressable GET routes (2026-11-14T21:55:44Z):

| Outcome | Count | Routes |
|---|---|---|
| 200 OK | 15 | /, /health, /health/detailed, /jarvis/tasks, /mcp/servers, /mcp/servers/:name/tools, /metrics, /models/catalog, /models/health, /models/providers, /naei/agents, /naei/tasks, /world/events, /world/residents, /world/state |
| 401 unauthorized (route EXISTS, auth boundary correct) | 2 | /mcp/audit, /memory/global |
| 404 not_found (route EXISTS, resource absent — correct JSON error) | 3 | /jarvis/tasks/:id, /naei/tasks/:id, /world/residents/:id |
| **404 raw (route MISSING — parity gap)** | 11 | **ALL /railway/* GET routes**: audit, backups, credentials/status, discovery, events, operations, reconciliation, recovery/plans/:id, status, usage + (10 unprobed POST /railway/* routes also absent) |

**Parity verdict: production is running a build WITHOUT @nexus/railway. 21 railway routes (11 GET + 10 POST) are missing. Additionally migration 3 (railway_intelligence: railway_events, railway_audit, railway_state tables — additive-only DDL) is pending in production (prod reports "migrations applied: 2", repo defines 3).**

## 7. Known-Model Endpoint Findings (carried from Stage 1.5, re-confirmed)

- GET /models/health returns `{{"data":[]}}` — empty health payload (semantic gap: providers list is non-empty but per-model health is empty).
- GET /models/providers lists openai as available although ADR-007 records openai egress is blocked from this sandbox region; production view may differ — needs production-side verification in Phase 3.

## 8. Visual Application State

- Root-level Next.js application present: src/app (17 files incl. 14 API routes), src/components/ui (shadcn), src/lib/nexus (client-side engine: economy, identity, memory, autonomy, interiors), src/hooks.
- `next.config.ts` contains **`ignoreBuildErrors: true`** (unverified-build workaround — Phase 5 V1 must remove).
- **Dependencies NOT installed**: root package.json declares only @modelcontextprotocol/sdk, hono, zod (+dev @types/bun, typescript). No react/next/three/prisma client runtime — the Next.js app is currently UNBUILDABLE in-place. (Legacy src/app cannot typecheck; it is excluded from root tsconfig.)
- The client-side src/lib/nexus engine + src/app/api/* routes duplicate backend subsystems — Phase 5 V2 must retire conflicts in favor of the Hono backend as single source of truth.

## 9. CI Configuration Defect (new finding, this session)

`.github/workflows/ci.yml` contains corrupted YAML: `branches: ain]` (appears twice, push + pull_request triggers). The workflow file cannot parse — CI is effectively INOPERABLE even if pushed. Repair scheduled in Phase 2 (file edit only; no push).

## 10. Credential Posture (Phase 1 preview)

- `.env` contains exactly ONE key: DATABASE_URL (value never printed; gitignored).
- RAILWAY_API_TOKEN is **NOT configured** in this sandbox — /railway/* live features are fail-closed (credential manager reports UNCONFIGURED, never fake-healthy).
- Credential design (packages/railway/src/credentials.ts): env-only retrieval, prefix-family redaction, rotation with previous-token demotion, token-type-aware auth headers. Structurally sound.
- Stage 1.5 secret-material scan of flagged files found no secret-shaped strings; full-history scan scheduled for Phase 1.1.

## 11. Changes Since Stage 1.5

**NONE.** Working tree clean, HEAD identical (f4c5a41), remote unchanged, install/typecheck/test/registry results identical to Stage 1.5 evidence captured in download/stage1_5/evidence/. The baseline is REPRODUCIBLE.

## 12. Phase 0 Acceptance

| Criterion | Status |
|---|---|
| Baseline reproducible | PASS (all five checks re-run with identical results) |
| Existing functionality understood | PASS (54 routes, 12 packages, 100 registry entries mapped) |
| No unexplained repository changes | PASS (zero changes since Stage 1.5 evidence) |
| All blockers documented | PASS (see §13) |

## 13. Blockers Register (carried into Phase 1+)

| ID | Blocker | Owner action needed |
|---|---|---|
| B-01 | Railway deployment required to restore 21 routes + migration 3 | Explicit owner authorization (Phase 3 gate) |
| B-02 | Git push of 5 commits + restructured history | Explicit owner authorization (Phase 2 gate) |
| B-03 | RAILWAY_API_TOKEN absent from sandbox — live railway intelligence cannot run here | Owner to provide via secret management at deploy time |
| B-04 | GitHub API rate-limited from sandbox egress (403) — visibility/branch-protection checks need authenticated API or owner confirmation | Owner to verify repo is private, or provide auth |
| B-05 | Next.js visual app dependencies absent; build currently impossible without restore | Resolved autonomously in Phase 5 (no owner action) |
| B-06 | iPhone/Safari real-device acceptance cannot be executed from sandbox | Owner to perform guided acceptance (Phase 5 V4) |

---

END OF PHASE 0 BASELINE — IMMUTABLE. Phase 1 (Security and Recovery) authorized to proceed
under the Stage 2 directive (all Phase 1 actions are local, non-destructive, non-deploying).
"""

with open("download/stage2/reports/PHASE0_BASELINE.md", "w") as f:
    f.write(REPORT.replace("{ts}", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())))

# machine-readable companion
machine = {
    "phase": 0,
    "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "head": "f4c5a41cc5d39553964ad6a4372684a79bb0a6be",
    "unpushedCommits": ["0f9986a", "e7d4e39", "a808727", "60d4fdd", "f4c5a41"],
    "install": "PASS frozen-lockfile 124/132 no changes",
    "typecheck": "PASS 0 errors",
    "tests": {"pass": 155, "skip": 12, "fail": 0, "expect": 597, "files": 23},
    "registry": {"total": 100, "statuses": {"VERIFIED": 71, "BLOCKED": 9, "TESTING": 6,
                  "DISCOVERED": 11, "SPECIFIED": 2, "DEPLOYED": 1}},
    "production": {
        "url": "https://jarvis-nexus-production.up.railway.app",
        "root": 200, "health": 200, "migrationsApplied": 2, "repoMigrations": 3,
        "routesRepo": 54, "routesMissingInProd": 21, "routesRailwayGet404": 11,
    },
    "changesSinceStage15": "NONE",
    "blockers": ["B-01", "B-02", "B-03", "B-04", "B-05", "B-06"],
}
with open("download/stage2/reports/phase0_baseline.json", "w") as f:
    json.dump(machine, f, indent=2)
print("PHASE0 baseline written:", len(REPORT), "chars")
