# JARVIS NEXUS — Ground-Zero Reset

This branch removes the obsolete JARVIS NEXUS implementation from the
repository, as explicitly authorised by the project owner on 2026-11-14
("ABSOLUTE DIRECTIVE: WIPE THE EXISTING JARVIS NEXUS IMPLEMENTATION AND
REBUILD FROM ZERO").

## What this commit does

- Removes ALL obsolete application source code, modules, configurations,
  dependencies, build artifacts and deployment files of the previous
  implementation.
- Leaves this README as the only content, so the repository is a clean
  foundation for the fresh implementation.

## What it deliberately does NOT do

- It does not rewrite or force-push history. The obsolete implementation
  remains recoverable from git history and from the owner's verified
  backups (see below) until the owner decides otherwise.
- It does not touch Railway, Supabase or any external infrastructure.

## Backups (verified before this branch was created)

- `git_full_backup_20261114.bundle` — all refs of both development lines
  (canonical production line + NEXUS WORLD V2 line), verified complete.
- `workingtree_full_20261114.tar.gz` — full working-tree snapshot
  including both lines' code, databases, credentials file `.env`
  (gitignored), and all reports.
- SHA-256 manifest and reset evidence: `download/reset_20261114/`.

## Next step

The project awaits the owner's complete JARVIS NEXUS master
specification. No replacement architecture has been invented and no
reduced version has been built, per the owner's explicit instruction.
