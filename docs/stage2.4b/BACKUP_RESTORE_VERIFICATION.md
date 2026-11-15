# STAGE 2.4B — BACKUP & RESTORE VERIFICATION (F-2.4A-06)

**Status:**
- Backup & restore mechanism — **FIXED AND VERIFIED** (implemented, 21-test hardening suite, and proven by a genuine independent off-volume restore drill — executed twice, two independent sessions, both PASS).
- Production off-volume activation — **REQUIRES OWNER ACTION / UNVERIFIED in production** until the owner configures a second volume or mount + `NEXUS_BACKUP_OFFSITE_DIR` + a 64-hex `NEXUS_BACKUP_ENCRYPTION_KEY` on the Railway service. Until then, production volume-loss RPO remains **unbounded**, and the application's own backup listing says so (`rpo.offVolume.enabled: false`). This is stated, never hidden.

**Fix commits:** `6b21787` (backup hardening + tests), `6242242` (drill). Files: `packages/railway/src/backup.ts`, `apps/nexus-api/src/index.ts`, `apps/nexus-api/src/restore-cli.ts`, `tests/integration/backup-hardening.test.ts` (new, 21), `tests/integration/backup-restore.test.ts` (G-03 updated). Architecture: `BACKUP_ARCHITECTURE.md` (this directory). Full first-pass reports: `appendix/first-pass/BACKUP_IMPLEMENTATION.md`, `appendix/first-pass/OFFVOLUME_RESTORE_EVIDENCE.md`, `appendix/first-pass/RPO_RTO_ASSESSMENT.md`.

---

## 1. What was implemented (one backup system, extended — no duplicate)

The Stage 2.2/Phase-4 `BackupService` remains the single implementation; Stage 2.4B hardens it in place. Per run: snapshot-consistent export (one `SAVEPOINT` read transaction over all 24 tables — correct SQLite semantics under concurrent writers; WAL fixed snapshot; the file is never blind-copied) → REAL isolated restore-verification gate (failure ⇒ **no artifact written anywhere**, alert `VERIFY_FAILED`, route answers 500) → AES-256-GCM envelope when a key is configured → atomic on-volume write (`*.tmp` → fsync → rename; never a truncated real file) → **encrypted-only** off-volume copy with read-back hash verification (no key ⇒ skipped with a visible alert; a plaintext artifact never leaves the volume; on-volume continues — no regression of existing protection) → two-sided retention + unconditional `*.json.tmp` junk sweep → alerting (in-app bounded log, `/metrics` counters, error logs, optional zero-cost webhook `NEXUS_ALERT_WEBHOOK_URL`; the URL is never exposed; payloads carry no secrets). Key from environment only — never a CLI argument, never in an artifact, log, alert, listing or header.

Environment matrix (all fail-visible, none fail-open): key+dir → encrypted verified both volumes; key only → encrypted on-volume, honest `offVolume.enabled: false`; dir without key → plaintext on-volume (Stage 2.4A posture preserved), off-volume REFUSED + alert; malformed key → boot alert `OFFSITE_KEY_INVALID` persists until fixed; nothing set (production today) → plaintext v1 on-volume, honest listing.

## 2. Mandatory recovery proof (directive §4) — the drill

Tool: `scripts/stage24b/drill_offvolume_restore.ts` (committed, reproducible). Isolated test environment. Executed twice: first pass 2026-11-15T18:13Z, re-verification pass 2026-11-15T20:38Z — **both PASS**. Evidence: `evidence/drill-offvolume-restore.json` and `evidence/reverify/drill-offvolume-restore.json`.

| # | Directive step | Result (re-verification pass; first pass in parentheses where it differs) |
|---|---|---|
| 1 | Create a representative database | boot "production" instance on volume A; seed through real owner routes (JARVIS objective, world advance ×5, canary kv row); 24 tables / 56 rows; per-table content reference captured (rows + rowid-ordered SHA-256) |
| 2 | Generate a backup | 3 backup runs; each: snapshot export → isolated restore-verify → atomic encrypted on-volume write → encrypted off-volume copy on volume B + read-back hash verify; retention 3; volume B holds 3 encrypted artifacts |
| 3 | Transfer to independent storage | volume B = separate directory tree (see §4 boundaries); copy is byte-identical (read-back sha256; re-hashed independently by the drill) |
| 4 | Verify its integrity | envelope format verified; GCM tag + ciphertext/plaintext sha256 chain; canary never leaked into any encrypted artifact |
| 5 | Remove access to the original test database | **total volume-A loss**: instance stopped, volume A erased recursively, existence re-checked — gone; recovery possible ONLY via volume B |
| 6 | Restore exclusively from the independent backup | product CLI + env key; exit 0; 88 ms (first pass: 93 ms); 24 tables / 61 rows; single transaction; per-table content SHA-256 re-verified; `foreign_key_check` clean; `encrypted: true` in the CLI log |
| 7 | Verify table counts, schema, representative records, checksums | **zero content mismatches** vs the pre-loss reference (every non-metrics table: rows AND rowid-ordered content hash); canary row present; seeded objective readable through the real API |
| 8 | Demonstrate the restored application can operate | fresh instance boots on the restored store (2 ms; first pass 3 ms); `/health` 200; one more backup cycle succeeds (201) |

## 3. RPO / RTO (measured, not marketed)

| Metric | Stage 2.4A | Stage 2.4B |
|---|---|---|
| Data RPO — corruption/accidental-write (volume survives) | 24 h | 24 h (now encrypted when key set, verification-gated, atomic) |
| Data RPO — **total volume loss** | **unbounded** | **24 h with off-volume active** (key + dir + 24 h interval; drill-proven). **Without owner configuration: still unbounded** — stated in the listing, never claimed otherwise |
| Restore-path RTO (measured) | ~5 ms estimated | **88–93 ms** CLI wall-clock (two passes) |
| Boot on restored store | not measured | 2–3 ms |
| Loss → operational (app-level) | not measured | **100–108 ms** (two passes) |
| End-to-end incl. platform redeploy | ≤ 15 min planning | **≤ 15 min stands** (dominated by Railway redeploy, not restore) |
| Alerting latency | n/a | synchronous with the failed run (in-app + /metrics + log); webhook fire-and-forget ≤ 5 s timeout when configured |

## 4. Honest boundaries (what is NOT claimed)

- Drill volumes A/B are separate directory trees on one sandbox filesystem. The **code path, recovery procedure, integrity chain and timings are proven**; *production storage independence* requires a genuinely separate Railway volume/mount — owner-gated, not yet configured, therefore production off-volume capability remains **UNVERIFIED** until the owner configures it. Exactly this is said in the application's own listing; no claim is made beyond the evidence.
- The drill does not (and cannot in-process) inject a crash *between* tmp-write and rename; that step is covered by the atomic-write mechanics + unconditional junk sweep, not by a crash simulation.
- The external webhook delivery channel is owner-configured; the *in-app* visibility part is what tests verify. External delivery is not claimed until configured.
- No paid service, no provider, no new infrastructure was introduced; object-storage push remains owner-gated (D-2.1-03 lineage). Zero recurring cost for the recommended configuration.
