# STAGE 2.4B — BACKUP ARCHITECTURE (F-2.4A-06 remediation)

**Principle: ONE backup system, extended — no duplicate.** The Stage 2.2/Phase-4 `BackupService` remains the single implementation; Stage 2.4B hardens it in place. No second backup system was introduced.

---

## 1. Pipeline (per run; manual route or in-process scheduler)

```
snapshot-consistent export                BackupService.exportLogicalBackup
  └── SAVEPOINT nexus_backup_snapshot      ONE read transaction over all 24 tables
      (WAL: fixed snapshot; readers never  consistent even while writers commit;
       block writers)                       rollback-journal: shared lock blocks writers)
        → REAL isolated restore-verify      verifyLogicalBackup — in :memory:, reinsert,
            │                                per-table rowid-ordered SHA-256 recompute
            └── FAIL → NO artifact written anywhere + alert VERIFY_FAILED
encode
  ├── key configured  → AES-256-GCM envelope (EncryptedBackupDoc v1)
  └── no key          → honest plaintext v1 (on-volume only — see 4b)
atomic on-volume write
  └── <file>.json.tmp → write → fsync → rename               (never a truncated real file)
off-volume copy (only when NEXUS_BACKUP_OFFSITE_DIR is set)
  ├── key configured  → atomicWrite on the off volume → read-back sha256 compare
  │                      mismatch → delete the suspect copy + alert OFFSITE_VERIFY_MISMATCH
  └── no key          → SKIPPED + alert OFFSITE_SKIPPED_NO_KEY
                           (a plaintext artifact must never leave the volume)
two-sided retention
  └── prune on-volume AND off-volume dirs to NEXUS_BACKUP_RETENTION (newest kept);
      `*.json.tmp` junk (crashed-run remnants) swept unconditionally
```

## 2. SQLite semantics (why this is correct for an actively written DB)

The directive's warning is precise: *never copy an actively written SQLite file without establishing consistency*. The architecture never copies the file at all. The export is a **logical** read of all tables inside **one read transaction**:

- `NexusDb.open` sets `journal_mode = WAL`. In WAL, an open read transaction holds a **fixed snapshot** for its whole duration — all 24 table reads see the same point in time even while other connections commit concurrently, and readers never block writers.
- The wrap uses `SAVEPOINT … RELEASE`, which nests transparently when the caller is already inside a transaction (and begins/commits an implicit one when not).
- Structural test: the SAVEPOINT/RELEASE pair is observed around the reads; isolation test: a second connection's uncommitted rows never appear in an export, and appear in the very next export after COMMIT.
- Honest limitation, stated: a single process cannot deterministically interleave a writer *between* two table reads of one export (the run is synchronous). Cross-connection consistency is guaranteed by SQLite's documented WAL snapshot semantics — the two tests above verify the wrapper is present and the isolation holds; no adversarial-interleaving claim is made.

## 3. Encryption design (AES-256-GCM)

- Key: `NEXUS_BACKUP_ENCRYPTION_KEY` — exactly 64 hex chars (32 bytes). Parsed by `parseBackupEncryptionKey`; set-but-malformed → `invalid: true` → boot-time alert `OFFSITE_KEY_INVALID` (fail-visible; on-volume continues as plaintext v1 with the alert standing).
- Envelope `nexus-logical-backup-encrypted` v1: fresh random 96-bit IV per artifact; fields `iv/tag` (hex), `ciphertext` (base64), `ciphertextSha256`, `plaintextSha256`, `plaintextBytes`, non-sensitive `tables/rows` summary. The key never appears in any artifact, log, alert, listing or header.
- Decoding integrity order: ciphertext sha256 → GCM tag (authenticity — tampering or wrong key) → plaintext sha256 → format check. Three independent checks; each failure carries a distinct human-readable cause; every consumer (restore route, CLI, tests) fails closed.
- `NEXUS_BACKUP_ENCRYPTION_KEY` is read from the environment ONLY. The CLI takes no key argument — arguments leak into process listings and shell history.

## 4. The off-volume rule (the actual F-2.4A-06 fix)

a. **Storage independent of /data**: `NEXUS_BACKUP_OFFSITE_DIR` points at a different mount. On the single-volume Railway trial service there is no second volume today — code path proven in the drill; production activation is owner-gated (attach a volume/mount or use the owner-gated download route; object-storage push remains D-2.1-03). No paid service was introduced; zero recurring cost; no provider assumed.
b. **Plaintext never leaves the volume**: without a valid key the off-volume copy is SKIPPED with alert `OFFSITE_SKIPPED_NO_KEY` — the off dir is not even created. On-volume backups continue as plaintext v1 (the Stage 2.4A posture) so the fix can never reduce existing data protection.
c. **Verified copy**: after the atomic write on the off volume, the bytes are read back and hash-compared; mismatch → the suspect copy is deleted + alert.
d. **Two-sided retention**: both directories are pruned to `NEXUS_BACKUP_RETENTION` (default 14; newest kept). Previously the off dir grew without bound.

## 5. Failure alerting (zero-cost, opt-in delivery)

- In-app: bounded alert log (last 20) exposed in the backup listing (`GET /railway/backups` → logical.alerts), counted in `/metrics` (`backup_failures_total{code}`, `backup_runs_total{result}`), and logged at error level.
- Delivery: `NEXUS_ALERT_WEBHOOK_URL` (optional; owner-chosen endpoint; zero cost). POST `{kind: "backup.alert", at, code, detail}` with 5 s timeout, fire-and-forget, errors recorded as `lastDelivery`. The URL is never logged or exposed; the payload carries no secrets — verified by test.
- Alert codes: `VERIFY_FAILED` (no artifact written), `EXPORT_FAILED`, `WRITE_FAILED`, `OFFSITE_SKIPPED_NO_KEY`, `OFFSITE_KEY_INVALID` (boot), `OFFSITE_COPY_FAILED`, `OFFSITE_VERIFY_MISMATCH`, `RUN_EXCEPTION`. `RUN_OVERLAP` exists as a defensive guard (unreachable while the run is synchronous — documented, not claimed as a control).
- No external alerting infrastructure was introduced; external delivery depends on the owner configuring the webhook — until then alerts are visible in-app, which is the part tests verify.

## 6. Compatibility surface

| Consumer | Effect |
|---|---|
| `POST /railway/backup/export` | 201 + full result (`ok`, `encrypted`, `offsite{copied,encrypted,file,error}`, `pruned`, `tmpSwept`, `prunedOffsite`); **500 + `backup_failed`** when verification fails (new honest failure mode; previously a bad backup was silently persisted) |
| `POST /railway/backup/restore` | transparently decodes both formats; encrypted + no key → 400 fail-closed; tampered → 400 with cause; response/log carry `encrypted` |
| `GET /railway/backup/export/:file/download` | adds `x-backup-encrypted: true|false`; existing integrity headers unchanged |
| `bun run restore` (CLI) | both formats; key from env only; fail-closed (exit 2) on missing key/tamper, before any write |
| `listLogicalBackups()` | adds `encryption`, `alerting`, `alerts`, `history[].encrypted`, `rpo.offVolume` — additive; all previous fields preserved |
| `GET /railway/backups` | unchanged shape plus the additive listing fields |
| Existing on-volume plaintext v1 artifacts | still restorable (decoder handles both formats forever) |
