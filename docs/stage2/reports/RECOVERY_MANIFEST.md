# RECOVERY MANIFEST — stage 2 recovery points (state of record)

> **REGENERATED 2026-11-15 (Stage 2.2, Workstream B).** The original recovery
> report was lost with the wiped gitignored `download/` tree (Stage 2.1
> finding BLK-07a). Reconstruction from committed sources only; NOT the
> original document.

## Original scope (from surviving committed evidence)

Stage 2 defined recovery point **RP-STAGE2-001** in the committed generator
`scripts/stage2_recovery_manifest.py`: a git bundle (all refs) plus a
worktree tarball, both written to `download/` (gitignored — the durability
defect). The final-closure session later claimed **RP-FC-001** with a
checksum; Stage 2.1 established that **no traceable reference to RP-FC-001
exists anywhere** in the repository or its history.

## Current state of record (2026-11-15, this session)

| Recovery point | State | Evidence |
|---|---|---|
| RP-STAGE2-001 | **Artifacts LOST** (both bundle and tarball wiped with `download/`) | Stage 2.1 audit; definition survives in committed `scripts/stage2_recovery_manifest.py` |
| RP-FC-001 | **UNTRACEABLE — claim unverifiable** (no reference anywhere in repo or history) | Stage 2.1 audit, COMMIT-AUDIT §3 |
| RP-2.1-001 | Created by Stage 2.1 audit; **artifacts LOST AGAIN** — `download/` was wiped after that session (Stage 2.2 finding N-2.2-01) | `docs/stage2.1/recovery_manifest.json` (committed) vs. absent files |
| RP-2.1-002 | Same — **artifacts LOST AGAIN** (N-2.2-01) | same |
| **RP-2.2-001** | **CREATED THIS SESSION, DURABLE** — thin bundle (`main ^origin/main`, 14,669,434 bytes, sha256 recorded in `docs/stage2.2/recovery/manifest-rp-2.2-001.json`) **committed to git**; restore-proven against an origin/main-only base (fetched → restored-main == main, 514 files, tree identical) | `docs/stage2.2/recovery/manifest-rp-2.2-001.json` + `scripts/stage22_rp_create.sh` |

## The durability rule (twice proven empirically)

Only git-tracked files survive environment wipes. From Stage 2.2 onward,
recovery manifests and any recovery artifact small enough to commit live in
git-tracked locations (`docs/…`); oversized full-state bundles are mirrored
to `download/` but are explicitly labelled **non-durable** and never counted
as protection. The authoritative machine-readable manifest for the V4 gate
is `docs/stage2/reports/recovery_manifest.json` (this directory), whose
`artifacts` array contains only existing, committed, checksummed artifacts.

## Unrecoverable (explicit classification)

RP-STAGE2-001 and RP-FC-001 artifacts are permanently lost; no regeneration
can restore them (they would be new artifacts, not the originals). They are
recorded as lost, never silently replaced.

## Provenance

Regeneration inputs: committed `scripts/stage2_recovery_manifest.py`,
`docs/stage2.1/*.md` (committed), fresh bundle creation + restore proof this
session. Authored document; checksums and byte counts are machine-generated.
