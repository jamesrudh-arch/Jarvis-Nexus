#!/usr/bin/env python3
"""STAGE 2.3 — machine evidence recorder.

Records the Stage 2.3 independently-verified facts into git-tracked
docs/stage2.3/evidence/. Deterministic: reads current state; the session's
manual observations (production probes, bundle restoration tests) are recorded
with their original timestamps and are re-runnable via the commands listed
alongside each entry.

Evidence categories (directive section 2 - never conflate them):
  "recorded"        - claimed by prior stage documentation
  "reproduced"      - independently re-run locally this session
  "github-verified" - observed via the GitHub API
  "production-verified" - observed against the live deployment (read-only)
"""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REPO = Path("/home/z/my-project")
OUT = REPO / "docs" / "stage2.3" / "evidence"
OUT.mkdir(parents=True, exist_ok=True)


def run(*a):
    return subprocess.run(a, capture_output=True, text=True, cwd=REPO).stdout.strip()


def write(name: str, doc: dict) -> None:
    p = OUT / name
    p.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"wrote {p.relative_to(REPO)} ({p.stat().st_size} bytes)")


now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
H = run("git", "rev-parse", "HEAD")

# ---------------------------------------------------------------- git state
git_state = {
    "format": "stage2.3-git-state",
    "generatedAt": now,
    "generatedAtHead": H,
    "generator": "scripts/stage23_evidence_record.py",
    "head": H,
    "originMain": run("git", "rev-parse", "origin/main"),
    "unpushedCount": run("git", "rev-list", "--count", "origin/main..main"),
    "unpushedRange": f"{run('git', 'rev-parse', 'origin/main')}..{H}",
    "workingTreeClean": run("git", "status", "--porcelain") == "",
    "branches": {b: run("git", "rev-parse", b) for b in ["main", "railway-intelligence", "stage2-pre-restructure"]},
    "linearHistory": run("git", "rev-list", "--merges", "origin/main..main") == "",
    "remotes": {"origin": "https://github.com/jamesrudh-arch/Jarvis-Nexus.git"},
    "credentialCapability": {
        "gitCredentialHelper": None,
        "ghCli": None,
        "sshKeys": 0,
        "railwayEnvVars": 0,
        "conclusion": "this environment CANNOT execute an authorized push or a Railway deployment; the owner must push personally or provision credentials (owner decision)",
    },
    "stage22DeliverablesPresent": sorted(p.name for key in ("*.md", "*.json", "SHA256SUMS") for p in (REPO / "docs" / "stage2.2").glob(key)),
}
write("git-state-stage23.json", git_state)

# ---------------------------------------------------- bundle restore proof
bundle_proof = {
    "format": "stage2.3-bundle-restore-proof",
    "generatedAt": now,
    "generatedAtHead": H,
    "generator": "scripts/stage23_evidence_record.py (records the session's strict restoration test)",
    "method": "git init fresh repo; fetch ONLY 41092a3 (origin/main) from the working repo (object store then holds exactly what GitHub holds); fetch each committed thin bundle into it; compare heads and tree ids",
    "reproduction": "see RECOVERY_AND_ROLLBACK_REPORT.md section 2 for the exact command sequence",
    "base": {
        "simulatedGithubState": "41092a33fa13abf5acee64e8f1f3167fe46dadcd",
        "note": "this is exactly the commit GitHub holds as origin/main (verified via unauthenticated API this session)",
    },
    "restorations": [
        {
            "recoveryPoint": "RP-2.2-001",
            "bundle": "docs/stage2.2/recovery/jarvis-nexus-unpushed-delta-20261115-115932.bundle",
            "bundleSha256Verified": "767cb59921ca1a52f2ec517b4cd73112d230b08366bb02ff0d1e7c58f679f699",
            "gitBundleVerify": "PASS (requires 41092a3, provides refs/heads/main)",
            "restoredHead": "c6d4b5199326e69f26d4c30f638c6f3155f768f1",
            "expectedHead": "c6d4b5199326e69f26d4c30f638c6f3155f768f1",
            "restoredTreeId": "30899cb779320806c828926a8bec82920f4f57b1",
            "repoTreeId": "30899cb779320806c828926a8bec82920f4f57b1",
            "treesIdentical": True,
            "verdict": "PASS",
        },
        {
            "recoveryPoint": "RP-2.2-002",
            "bundle": "docs/stage2.2/recovery/jarvis-nexus-unpushed-delta-20261115-122627.bundle",
            "bundleSha256Verified": "12fe669c89a54948f9c201e82cbf2c5c1fab4c4789ec7c6342eba3c3b77394ee",
            "gitBundleVerify": "PASS (requires 41092a3, provides refs/heads/main)",
            "restoredHead": "396ccaf454a17444ae6fb048aafce9ecad569522",
            "expectedHead": "396ccaf454a17444ae6fb048aafce9ecad569522",
            "restoredTreeId": "8c46bd901d8b7debe4a4c0061062bdaf7f80406e",
            "repoTreeId": "8c46bd901d8b7debe4a4c0061062bdaf7f80406e",
            "commitsRestoredOnTopOfOriginMain": 29,
            "treesIdentical": True,
            "verdict": "PASS",
        },
    ],
    "coverageGap": {
        "description": "RP-2.2-002 covers through 396ccaf. The Stage 2.2 tail commits fad4c69 + b93a879, the Stage 2.3 remediation commit 61a7c5b and all Stage 2.3 documentation commits are NOT inside any committed bundle (a bundle cannot contain the commit that commits it).",
        "closure": "RP-2.3-001 is created at the end of Stage 2.3 covering the final tip; the only remaining tail is the RP-2.3-001 artifact commit itself (deterministically reproducible by re-running scripts/stage22_rp_create.sh RP-2.3-001).",
    },
}
write("bundle-restore-proof.json", bundle_proof)

# ------------------------------------------------------- production baseline
prod = {
    "format": "stage2.3-production-baseline",
    "generatedAt": now,
    "generatedAtHead": H,
    "generator": "scripts/stage23_evidence_record.py (records this session's read-only probes)",
    "mode": "READ-ONLY (GET requests + unauthenticated API queries only; no production mutation)",
    "publicUrl": "https://jarvis-nexus-production.up.railway.app",
    "probes": [
        {
            "id": "PB-01", "objective": "production health", "method": "GET /health (anonymous)",
            "timestamp": "2026-11-15T15:11:42Z", "httpStatus": 200,
            "result": {
                "overall": "healthy",
                "database": "healthy (migrations applied: 2)",
                "model_fabric": "healthy (cloudflare:available, openai:available, echo:available)",
                "mcp_gateway": "healthy (io.nexus.test-tools registered, 3 tools)",
                "world_simulation": "healthy (1 world, 8 residents)",
                "naei": "healthy (10 agents)",
            },
            "interpretation": "production runs the OLD code: migrations 2/2 (candidate adds migration 3); route surface 33 (candidate: 58)",
            "verdict": "PASS (healthy, pre-candidate state confirmed)",
        },
        {
            "id": "PB-02", "objective": "auth boundary on deployed code", "method": "POST /jarvis/objectives (anonymous)",
            "timestamp": "2026-11-15T15:12Z", "httpStatus": 401,
            "result": "unauthorized", "verdict": "PASS (fail-closed auth is live in production)",
        },
        {
            "id": "PB-03", "objective": "candidate-only routes absent in production", "method": "GET /memory, POST /models/verify, GET /railway/backups",
            "timestamp": "2026-11-15T15:11-15:12Z", "httpStatus": 404,
            "result": "404 on all three (routes do not exist in the deployed code)", "verdict": "PASS (consistent with the 33-route production inventory)",
        },
        {
            "id": "PB-04", "objective": "CORS posture of deployed code", "method": "response headers of GET /health",
            "timestamp": "2026-11-15T15:12:39Z",
            "result": "access-control-allow-origin: * (old permissive posture); server: railway-hikari; edge: hkg1",
            "verdict": "RECORDED (candidate changes this to least-privilege allowlist; owner must set CORS_ALLOWED_ORIGINS for cross-origin browser clients - decision B-02)",
        },
        {
            "id": "PB-05", "objective": "deployment mechanism",
            "method": "committed Railway inspect reports (NEXUS_WORLD/reports/) + unauthenticated GitHub API",
            "result": "Railway service is repo-connected to jamesrudh-arch/Jarvis-Nexus branch main (deployments auto-triggered from pushes; latest recorded SUCCESS deployment 8128960e at 2026-11-13T17:57Z, commit 'Living residents (directive s4)'); origin/main advanced to 41092a3 at 2026-11-14T12:58Z",
            "verdict": "RECORDED (CRITICAL: if auto-deploy remains enabled, an authorized push IS the deployment - the two-step protocol requires the owner to disable auto-deploy first or explicitly accept push=deploy)",
        },
        {
            "id": "PB-06", "objective": "rollback target",
            "method": "GitHub API runs list",
            "result": "41092a33 completed success at 2026-11-14T12:58:05Z (run 43597371050, all 8 steps green, NO adversarial gate step - it enters CI with the candidate)",
            "verdict": "RECORDED (known-good commit = 41092a3, green CI, currently pushed)",
        },
    ],
    "githubActionsHistory": [
        {"run": 43597371050, "sha": "41092a33", "conclusion": "success", "createdAt": "2026-11-14T12:58:05Z", "note": "current origin/main tip"},
        {"run": 43597251609, "sha": "269d422d", "conclusion": "success", "createdAt": "2026-11-14T12:56:31Z"},
        {"run": 43582769931, "sha": "8e58a259", "conclusion": "failure", "createdAt": "2026-11-14T09:54:54Z"},
        {"run": 43582618722, "sha": "af8bf00f", "conclusion": "failure", "createdAt": "2026-11-14T09:52:52Z"},
        {"run": 43581647079, "sha": "945a78dd", "conclusion": "failure", "createdAt": "2026-11-14T09:40:17Z", "note": "the commit Stage 2.1 audited; the run EXECUTED (further confirming the refuted BLK-01 branch-filter claim); failures were real test failures, fixed by 269d422d/41092a3"},
    ],
    "repoVisibility": "public (unauthenticated API observation works; Actions observable post-push at 60 req/hr)",
}
write("production-baseline.json", prod)

# --------------------------------------------------- revalidation summary
reval = {
    "format": "stage2.3-revalidation-summary",
    "generatedAt": now,
    "generatedAtHead": H,
    "generator": "scripts/stage23_evidence_record.py (records this session's independent re-runs; full outputs in docs/stage2*/evidence/)",
    "categoryKey": "reproduced = independently re-run locally this session; github-verified = observed via GitHub API; production-verified = observed against the live deployment read-only",
    "results": [
        {"item": "full test suite", "stage22Claim": "206 pass / 12 skip / 0 fail / 27 files; assertions 905 (register's static transcription) vs 907 (b93a879 commit message)", "stage23Reproduced": "206 pass / 12 skip / 0 fail / 27 files; assertions DYNAMIC via the V4 evidence-directory scan: 905 in the recycled environment (6 evidence files), 907 after the F-2.3-02 durable repair (8 files) — final suite at stage close: 907", "category": "reproduced", "verdict": "MATCH on pass/fail/skip/files; assertion-count discrepancy RESOLVED (F-2.3-03): Stage 2.2's 907 was correct for its pre-recycle tree; the register's static 905 was stale; after repair the reproducible count is 907 — the gate is stronger, not weaker"},
        {"item": "typecheck", "stage22Claim": "0 errors", "stage23Reproduced": "tsc --noEmit exit 0, no output", "category": "reproduced", "verdict": "MATCH"},
        {"item": "production build (visual app)", "stage22Claim": "strict standalone build + assembly PASS", "stage23Reproduced": "bunx next build PASS (3 static pages, 14 routes); standalone assembled (server.js + public + .next/static)", "category": "reproduced", "verdict": "MATCH"},
        {"item": "CI structural validation", "stage22Claim": "29 checks PASS", "stage23Reproduced": "29/29 PASS (re-run, plus --execute local step run: verdict PASS)", "category": "reproduced", "verdict": "MATCH"},
        {"item": "adversarial gate inclusion in CI", "stage22Claim": "F-2.2-CI-01 repaired; gate is a CI step", "stage23Reproduced": "ci.yml contains 'bun test tests/adversarial' step (byte-verified: file sha256 fad51387..., [main] branch filter confirmed by hex dump; git blob identical to worktree)", "category": "reproduced", "verdict": "MATCH"},
        {"item": "branch filter bytes (BLK-01 refutation)", "stage22Claim": "ci.yml always contained branches: [main]; 'ain]' was a display artifact", "stage23Reproduced": "line 9 hex 20202020 6272616e63686573 3a 20 5b 6d 61696e 5d = '    branches: [main]'; 2 exact [main] matches, 0 literal 'branches: ain]' matches, no ESC bytes; artifact reproduced live in this session's own terminal labels", "category": "reproduced", "verdict": "CONFIRMED (refutation independently reproduced)"},
        {"item": "security suite", "stage22Claim": "31 checks PASS", "stage23Reproduced": "31/31 PASS (auth matrix 37/37, webhook auth/replay/dedup/stale, rate-limit boundary, lockout, CORS, 0 secret leaks, input handling)", "category": "reproduced", "verdict": "MATCH"},
        {"item": "route parity", "stage22Claim": "58 routes (33 GET + 25 POST), +25 additive-only vs production 33, 0 removed, 0 duplicates", "stage23Reproduced": "58 routes at HEAD, additive-only, no duplicates (re-run)", "category": "reproduced", "verdict": "MATCH"},
        {"item": "registry consistency", "stage22Claim": "consistent, 112 requirements, 6 honestly BLOCKED", "stage23Reproduced": "consistent (re-run; BLOCKED items carry evidence, documentation-only)", "category": "reproduced", "verdict": "MATCH"},
        {"item": "DR drill", "stage22Claim": "10/10 steps PASS, RTO 96ms / CLI 5ms / RPO 11ms", "stage23Reproduced": "10/10 steps PASS (fresh run 2026-11-15: RTO 94ms wall-clock, CLI restore 5ms, RPO 11ms; 24 tables, content hashes, 0 FK violations, functional resurrection)", "category": "reproduced", "verdict": "MATCH"},
        {"item": "backup content-hash verification", "stage22Claim": "sha256Rowid content-level verification, corruption-with-matching-counts detectable", "stage23Reproduced": "exercised inside the fresh DR drill + backup-export-verify evidence (regenerated this session, generator FAILURES: 0)", "category": "reproduced", "verdict": "MATCH"},
        {"item": "guarded restoration", "stage22Claim": "restore refuses non-empty targets without --confirm-destructive; owner route restores into isolated verification DB", "stage23Reproduced": "covered by test suite (206 passing incl. backup-restore tests) + DR drill restore path", "category": "reproduced", "verdict": "MATCH"},
        {"item": "evidence integrity validator", "stage22Claim": "53/53 PASS", "stage23InitialReproduction": "FAIL 51/53 in the recycled environment (two registered gen.log evidence files were non-durable - F-2.3-02)", "stage23AfterRepair": "53/53 PASS with gen.logs committed (durable)", "category": "reproduced (defect found, repaired, re-proven)", "verdict": "DEFECT REPAIRED - the Stage 2.2 claim was valid only pre-recycle; now durable"},
        {"item": "evidence substitution detection (SHA256SUMS)", "stage22Claim": "package SHA256SUMS verifiable", "stage23InitialReproduction": "FAILED: non-standard 3-column format breaks sha256sum -c AND the evidence-integrity.json hash was stale (F-2.3-01)", "stage23AfterRepair": "standard 2-column format; sha256sum -c docs/stage2.2/SHA256SUMS verifies 22/22 OK directly", "category": "reproduced (defect found, repaired, re-proven)", "verdict": "DEFECT REPAIRED"},
        {"item": "migration idempotency + compatibility", "stage22Claim": "[1,2,3] applied then all skipped; 24 tables", "stage23Reproduced": "migration 3 decoded: CREATE TABLE railway_events/railway_audit/railway_state + indexes ONLY (additive, no ALTER/DROP) => rolling the app back to 2-migration code with migration 3 applied is data-safe (extra tables ignored)", "category": "reproduced", "verdict": "MATCH + rollback-compatibility established"},
        {"item": "recovery bundle restoration", "stage22Claim": "restore-proven", "stage23Reproduced": "strict re-proof from an origin/main-only object base: both bundles restore exact heads, tree ids identical", "category": "reproduced", "verdict": "MATCH (see bundle-restore-proof.json)"},
        {"item": "GitHub Actions (candidate)", "stage22Claim": "pending authorized push (never claimed)", "stage23Status": "still pending: the candidate's ci.yml (with adversarial gate + least-privilege permissions) has NEVER run on GitHub; last genuine run = 41092a3 (green, without the gate)", "category": "github-verified (history only)", "verdict": "NOT YET POSSIBLE - requires authorized push"},
        {"item": "production behavior (candidate)", "stage22Claim": "post-deploy validations listed, not claimed", "stage23Status": "production baseline recorded read-only (healthy, old code, 33 routes, migrations 2/2)", "category": "production-verified (baseline only)", "verdict": "NOT YET POSSIBLE - requires authorized deployment"},
    ],
}
write("revalidation-summary.json", reval)

# ------------------------------------------------------------------ sums
sums_path = REPO / "docs" / "stage2.3" / "SHA256SUMS"
entries = []
for p in sorted(OUT.iterdir()):
    if p.is_file() and p.name != "SHA256SUMS":
        entries.append(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(REPO)}")
# note: refreshed at the end of the stage by scripts/stage23_finalize.py
sums_path.write_text(
    "# STAGE 2.3 evidence checksums (authoritative tree: docs/stage2.3/)\n"
    "# Standard sha256sum format: verify from repo root with\n"
    "#   sha256sum -c docs/stage2.3/SHA256SUMS\n"
    f"# initial record {now} at head {H} (final record taken after all stage documents exist)\n"
    + "\n".join(entries) + "\n"
)
print(f"wrote {sums_path.relative_to(REPO)}")
print("OK")
