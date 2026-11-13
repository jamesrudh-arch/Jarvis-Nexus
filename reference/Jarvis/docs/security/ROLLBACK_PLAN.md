# JARVIS NEXUS CORE — Gate 0 Rollback Plan (tested)

Every revert below has been EXECUTED on a scratch worktree and verified:
the rolled-back tree is byte-identical to the pre-item commit, and the test
suite that existed at that state passes. Verification output:
`docs/security/evidence/rollback_test.txt`.

## Per-item revert map (all on branch `gate0-security`)

| To roll back | Revert commit | Tree becomes | Suite after rollback (verified) |
|---|---|---|---|
| Item 5 (lexical fingerprint) | `9d294ea` | Item 4 state | 38/38 (verified at Item 4 commit) |
| Item 4 (worker packages) | `1603e17` | Item 3 state | 31/31 (verified at Item 3 commit) |
| Item 3 (admin hardening) | `3a973c8` | Item 2 state (`177659d`) | 23/23 (verified during rollback test) |
| Item 2 (CORS allowlist) | `177659d` | Item 1 state (`8095846`) | 17/17 (verified during rollback test) |
| Item 1 (owner auth) | `8095846` | Step 0 state (`322aacc` — route inventory + baseline docs retained) | 8/8 baseline tests (verified during rollback test) |

Revert in reverse chronological order (git handles the dependencies); the
reverts also remove the per-item test files, so the tree and suite always
match the pre-item state exactly:

```bash
git revert --no-edit 9d294ea 1603e17 3a973c8   # back to Item 2 (23/23)
git revert --no-edit 177659d 8095846           # back to Step 0 (8/8)
```

After each level `git diff --quiet <pre-item-commit>` confirmed the tree is
byte-identical to that pre-item state (no half-reverted residue).

## Data considerations when rolling back Item 5

`9d294ea` renames `memory_records.embedding_json` -> `lexical_fingerprint_json`
in the ORM, and lifespan migrates existing databases (ALTER TABLE RENAME
COLUMN). After the code has run once against a database:

- **SQLite dev database**: rolling the CODE back without the DATABASE leaves
  the column renamed while the old model expects `embedding_json`. Rename it
  back before/after the code revert:
  `ALTER TABLE memory_records RENAME COLUMN lexical_fingerprint_json TO embedding_json;`
  (or simply delete the dev DB — it regenerates on next start, losing memories).
- **Production (when this branch deploys)**: prefer restoring the latest
  `pre_restore_*` backup via the (still-hardened, pre-revert) restore route
  BEFORE reverting, or run the equivalent ALTER on Postgres. Fingerprints are
  derived data — a DB without the column value is harmless to old code; old
  code re-adds `embedding_json` values on new writes only.

## Operational rollback (deployments)

Repo-level: revert commits and redeploy; startup is fail-closed so a
misconfigured redeploy (missing `JARVIS_OWNER_TOKEN` / wildcard CORS) refuses
to boot rather than starting exposed.

Platform-level: redeploying the previous Railway image restores the previous
running state without touching this branch. **UNVERIFIED** — no infrastructure
access from this repo-level session; verify on the owner's Railway dashboard.

## What rollback does NOT undo

- `SecurityAuditEvent` rows written during the hardened period (they are
  append-only history — by design).
- Backup files under `backend/data/backups/` (including `pre_restore_*`) —
  dev artifacts, gitignored, safe to delete manually.
