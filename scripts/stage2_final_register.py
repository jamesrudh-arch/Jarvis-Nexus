#!/usr/bin/env python3
"""Stage 2 — machine-readable execution register (companion to the execution report)."""
import json
import subprocess
import time

head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
count = subprocess.run(["git", "rev-list", "--count", "HEAD"], capture_output=True, text=True).stdout.strip()
unpushed = subprocess.run(["git", "log", "origin/main..main", "--oneline"], capture_output=True, text=True).stdout.splitlines()

register = {
    "stage": 2,
    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "head": head,
    "totalCommits": int(count),
    "unpushedCommitCount": len(unpushed),
    "verdict": "OPEN — exclusively on owner-gated blockers B-01..B-07",
    "phases": {
        "0_baseline_revalidation": "PASS",
        "1_security_and_recovery": "PASS",
        "2_git_reconciliation": "PASS",
        "3_production_reconciliation": "CODE_READY / DEPLOY_GATED (owner)",
        "4_production_backups": "IMPLEMENTED+VERIFIED_LOCAL (activation rides deploy)",
        "5_visual_application": "V1/V2/V3 VERIFIED; V4 owner-gated",
        "6_four_environment_architecture": "RECONCILED (evidence-based statuses)",
        "7_voice_intelligence": "CORE VERIFIED (client adapters); wake-word/VAD DISCOVERED",
        "8_advanced_integrations": "CLASSIFIED (honest 6-state)",
        "9_independent_verification": "PASS (2 implementation rejections exercised+fixed)",
    },
    "tests": {"pass": 191, "skip": 12, "fail": 0, "assertions": 805, "files": 26,
              "skipsAre": "live-credential-gated (fail-closed, never fake pass)"},
    "typecheck": "0 errors (backend + app, strict)",
    "registry": {"requirements": 112, "addedThisStage": ["SEC-4", "SEC-5", "SEC-6", "VIS-1", "VIS-2", "VIS-3", "VIS-4", "VOI-1", "VOI-2", "BKP-1", "VER-1", "ARC-RT-1"], "consistent": True},
    "secrets": {"committedInHistory": 0, "scanScope": "71 commits / 1,426 blobs / 13 patterns", "findings": "11 synthetic test fixtures only"},
    "production": {"url": "https://jarvis-nexus-production.up.railway.app", "healthy": True,
                   "migrationsApplied": 2, "repoMigrations": 3, "missingRoutes": 21, "deployGatedOn": "B-01"},
    "recoveryPoint": {"id": "RP-STAGE2-001", "restoreTested": True},
    "verifierFindings": {
        "ADV-01": {"finding": "POST /world/advance coerced malformed JSON and mutated world state", "disposition": "FIXED + regression guard"},
        "ADV-02": {"finding": "/models/providers advertised disabled echo provider", "disposition": "FIXED (activeProviderIds)"},
        "verifierSelfCorrections": 3,
    },
    "ownerBlockers": [
        {"id": "B-01", "item": "authorize push/deploy of 16 commits", "unblocks": "21 routes + migration 3 + security + backups in production"},
        {"id": "B-02", "item": "visual app hosting decision + CORS origin", "unblocks": "V4 mobile acceptance"},
        {"id": "B-03", "item": "RAILWAY_API_TOKEN + RAILWAY_WEBHOOK_SECRET", "unblocks": "railway intelligence + webhook intake"},
        {"id": "B-04", "item": "repository visibility + branch protection", "unblocks": "public-exposure risk closure"},
        {"id": "B-05", "item": "real iPhone/Safari acceptance run", "unblocks": "V4 closure"},
        {"id": "B-06", "item": "UE5/Blender workstation runtime", "unblocks": "cinematic environment + asset pipeline verification"},
        {"id": "B-07", "item": "live model-provider credentials", "unblocks": "verified model fabric in production"},
    ],
    "reports": [
        "PHASE0_BASELINE.md", "SECURITY_REMEDIATION.md", "RECOVERY_MANIFEST.md",
        "GIT_RECONCILIATION.md", "DEPLOYMENT_READINESS.md", "BACKUP_VERIFICATION.md",
        "VISUAL_APP_RESTORATION.md", "ARCHITECTURE_VOICE_INTEGRATIONS.md",
        "INDEPENDENT_VERIFICATION.md", "STAGE2_EXECUTION_REPORT.md",
    ],
    "evidence": [
        "secret_history_scan.txt", "finding_classification.txt", "prod route parity (in baseline)",
        "visual_app_integration.txt", "visual_dom_verification.txt", "voice_chat_verification.txt",
        "visual_01..06 screenshots",
    ],
    "stage3Readiness": "READY TO PLAN; executes immediately upon B-01/B-02 authorization",
}

with open("download/stage2/reports/stage2_execution_register.json", "w") as f:
    json.dump(register, f, indent=2)
print("machine register written")
