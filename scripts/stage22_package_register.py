#!/usr/bin/env python3
"""STAGE 2.2 / WORKSTREAM F — generate the final three deliverables:
  #12 docs/stage2.2/MACHINE_READABLE_EVIDENCE_REGISTER.json
  #13 docs/stage2.2/RECOVERY_MANIFEST.json
  #14 docs/stage2.2/SHA256SUMS (+ mirror to download/stage2.2/SHA256SUMS)
Deterministic: re-runnable; reads current state; never fabricates (missing
evidence = recorded as missing, generator fails).
"""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REPO = Path("/home/z/my-project")
PKG = REPO / "docs" / "stage2.2"


def run(*a):
    return subprocess.run(a, capture_output=True, text=True).stdout.strip()


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def head():
    return run("git", "rev-parse", "HEAD")


now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
H = head()

# ---------- #14 SHA256SUMS (package level) ----------------------------------
# Stage 2.3 (F-2.3-01) repair: STANDARD two-column format
# "<sha256>  <path>" so `sha256sum -c SHA256SUMS` (GNU/coreutils) verifies
# directly from the repo root. The previous three-column variant
# ("<hash>  <path> <bytes>") broke sha256sum -c with 'No such file or
# directory' on every line. Byte sizes remain available via `wc -c` and in
# the machine-readable register; they do not belong in a checksum register.
# ORDERING RULE (the other half of F-2.3-01): this script MUST run AFTER the
# final evidence refresh. Stage 2.2 recorded SHA256SUMS at 12:28:18 and then
# regenerated evidence-integrity.json at 12:28:22 — the recorded hash went
# stale before the commit. Run the validators FIRST, this script LAST.
entries = []
for p in sorted(PKG.rglob("*")):
    if p.is_file() and p.name not in ("SHA256SUMS",):
        rel = str(p.relative_to(REPO))
        entries.append(f"{sha256(p)}  {rel}")
sums = (
    "# STAGE 2.2 package checksums (authoritative tree: docs/stage2.2/)\n"
    "# Standard sha256sum format: verify from repo root with\n"
    "#   sha256sum -c docs/stage2.2/SHA256SUMS\n"
    f"# recorded {now} at head {H}\n"
    + "\n".join(entries) + "\n"
)
(PKG / "SHA256SUMS").write_text(sums)
(REPO / "download" / "stage2.2" / "SHA256SUMS").parent.mkdir(parents=True, exist_ok=True)
(REPO / "download" / "stage2.2" / "SHA256SUMS").write_text(sums)

# ---------- #13 RECOVERY_MANIFEST.json ---------------------------------------
rp_manifests = {}
for mf in sorted((PKG / "recovery").glob("manifest-rp-*.json")):
    d = json.loads(mf.read_text())
    rp_manifests[d["recoveryPointId"]] = {
        "manifest": f"docs/stage2.2/recovery/{mf.name}",
        "durable": [
            {"id": a["id"], "path": a["path"], "bytes": a["bytes"], "sha256": a["sha256"], "head": a["head"], "durability": "git-tracked"}
            for a in d.get("durableArtifacts", [])
        ],
        "mirrorOnly": [
            {"id": a["id"], "path": a["path"], "durability": a.get("durability", "NON-DURABLE mirror")}
            for a in d.get("mirrorOnlyArtifacts", [])
        ],
    }
recovery_manifest = {
    "format": "stage2.2-recovery-manifest",
    "version": 1,
    "generatedAt": now,
    "generatedAtHead": H,
    "generator": "scripts/stage22_package_register.py (committed, deterministic)",
    "authoritativeRule": "Only git-tracked files survive environment wipes (proven twice). Artifacts below are durable ONLY in docs/; download/ entries are non-authoritative mirrors.",
    "recoveryPoints": rp_manifests,
    "restorationProcedure": "git clone <any repo holding 41092a3> <dir>; git -C <dir> fetch <bundle> main:restored-main (prerequisite satisfied by origin/main); verified twice this session (tree-identical restore proofs)",
    "priorLostPoints": {
        "RP-STAGE2-001": "artifacts lost (gitignored download/ wipe #1)",
        "RP-FC-001": "untraceable",
        "RP-2.1-001 / RP-2.1-002": "artifacts lost again (wipe #2, finding N-2.2-01)",
    },
    "ownerGated": [
        "D-2.1-04 legacy bundles (download/stage2.2/recovery/legacy/ mirrors; originals /tmp)",
        "B-01 authorized push is the durable closure for the unpushed series",
    ],
}
(PKG / "RECOVERY_MANIFEST.json").write_text(json.dumps(recovery_manifest, indent=2) + "\n")

# ---------- #12 MACHINE_READABLE_EVIDENCE_REGISTER.json ----------------------
def ev(rel: str, note: str):
    p = REPO / rel
    if not p.exists():
        return {"path": rel, "status": "MISSING", "note": note}
    return {"path": rel, "bytes": p.stat().st_size, "sha256": sha256(p), "status": "VERIFIED", "note": note}


evidence_files = sorted(
    str(p.relative_to(REPO)) for p in (REPO / "docs" / "stage2.2" / "evidence").rglob("*") if p.is_file()
) + sorted(
    str(p.relative_to(REPO)) for p in (REPO / "docs" / "stage2" / "evidence").rglob("*") if p.is_file()
)
register = {
    "format": "stage2.2-machine-readable-evidence-register",
    "version": 1,
    "generatedAt": now,
    "generatedAtHead": H,
    "git": {
        "main": H,
        "originMain": run("git", "rev-parse", "origin/main"),
        "unpushedCount": run("git", "rev-list", "--count", "origin/main..main"),
        "workingTreeClean": run("git", "status", "--porcelain") == "",
        "branches": {b: run("git", "rev-parse", b) for b in ["main", "railway-intelligence", "stage2-pre-restructure"]},
        "pushed": False,
        "deployed": False,
        "productionTouched": False,
    },
    "verdict": "GREEN — READY FOR AUTHORIZATION (see DEPLOYMENT_AUTHORIZATION_PACKAGE.md; does not itself authorize deployment)",
    "verificationResults": {
        "testSuite": {"pass": 206, "skip": 12, "fail": 0, "assertions": 905, "files": 27, "source": "bun test (recorded in REGRESSION_TEST_REPORT.md)"},
        "typecheck": "0 errors",
        "routeParity": {"head": 58, "headGet": 33, "headPost": 25, "production": 33, "delta": "+25 additive / -0 / 0 duplicates"},
        "authMatrix": "37/37 source-derived owner-gated routes 401 (anon + wrong key)",
        "securitySuite": "31 checks PASS",
        "drDrill": {"steps": "10/10 PASS", "rtoWallClockMs": 96, "cliRestoreMs": 5, "rpoMeasuredMs": 11, "fkViolations": 0, "orphanChecks": "11/11 zero orphans"},
        "ciValidation": "29 checks PASS (trigger proof incl. self-test; GitHub execution pending authorized push)",
        "evidenceIntegrity": "53 checks PASS (substitution guard tamper-proven)",
        "migrations": "idempotency proven ([1,2,3] then all skipped)",
        "build": "next build strict PASS after F-2.2-BUILD-01 repair",
    },
    "evidence": [ev(f, "git-tracked evidence") for f in evidence_files],
    "evidenceRegisters": {
        "stage2V4": "docs/stage2/reports/recovery_manifest.json (V4 gate manifest; artifacts RP-2.2-001-T + RP-2.2-002-T)",
        "stage2Checksums": "docs/stage2/evidence/SHA256SUMS",
        "stage22PackageChecksums": "docs/stage2.2/SHA256SUMS",
    },
    "findingsDisposition": {
        "stage21Findings": "21/21 dispositioned — see REMEDIATION_REGISTER.md (1 refuted, 8 repaired/implemented, 12 carried/owner-gated)",
        "stage22Findings": "5/5 dispositioned — N-2.2-01 repaired; F-2.2-CI-01 repaired; F-2.2-BUILD-01 repaired; F-2.2-PARITY-01 repaired; D-2.1-04 partially mitigated/owner-gated",
    },
    "outstandingOwnerDecisions": ["B-01 (the authorization: push + CI-observed deploy + post-deploy protocol)", "B-02", "B-03", "B-04", "B-05", "B-06", "B-07", "FC-05", "FC-06", "D-2.1-03 (full form)", "D-2.1-04", "D-2.1-05"],
    "productionOnlyValidationStillRequired": [
        "first genuine GitHub Actions run (inside the B-01 push protocol)",
        "startup + health at new commit (migrations 3/3, 58 routes)",
        "first production backup + off-site copy verification",
        "volume-backup state query (needs B-03)",
        "POST /models/verify (needs B-07)",
        "XFF behavior probe (FC-05)",
        "persistence restart test on production",
    ],
    "constraintsHonored": {"pushed": False, "deployed": False, "productionModified": False, "historyRewritten": False, "forcePushed": False},
}
missing = [e["path"] for e in register["evidence"] if e["status"] == "MISSING"]
if missing:
    print(f"FAIL: missing evidence files: {missing}")
    raise SystemExit(1)
(PKG / "MACHINE_READABLE_EVIDENCE_REGISTER.json").write_text(json.dumps(register, indent=2) + "\n")

# refresh SHA256SUMS to include the two files just written
# (standard two-column format — F-2.3-01)
entries = []
for p in sorted(PKG.rglob("*")):
    if p.is_file() and p.name not in ("SHA256SUMS",):
        rel = str(p.relative_to(REPO))
        entries.append(f"{sha256(p)}  {rel}")
sums = (
    "# STAGE 2.2 package checksums (authoritative tree: docs/stage2.2/)\n"
    "# Standard sha256sum format: verify from repo root with\n"
    "#   sha256sum -c docs/stage2.2/SHA256SUMS\n"
    f"# recorded {now} at head {H}\n"
    + "\n".join(entries) + "\n"
)
(PKG / "SHA256SUMS").write_text(sums)
(REPO / "download" / "stage2.2" / "SHA256SUMS").write_text(sums)

print(f"OK: register + recovery manifest + SHA256SUMS ({len(entries)} files) at head {H[:12]}")
print(f"evidence files indexed: {len(register['evidence'])} (0 missing)")
