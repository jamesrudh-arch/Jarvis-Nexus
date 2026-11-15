# STAGE 2.4B — BACKUP IMPLEMENTATION REPORT (F-2.4A-06)

**Commits:** `6b21787` (both fixes + tests, on `stage2.4b-remediation`), `6242242` (off-volume restore drill), `17353a3` (E2E matrix + XFF probe). Branch tip will advance with the evidence commit.
Files: `packages/railway/src/backup.ts`, `packages/railway/src/index.ts` (type exports), `apps/nexus-api/src/index.ts` (scheduler/routes), `apps/nexus-api/src/restore-cli.ts`, `tests/integration/backup-hardening.test.ts` (new), `tests/integration/backup-restore.test.ts` (G-03 updated).
No new dependencies (node:crypto only); lockfile byte-identical — dependency integrity preserved (`bun install --frozen-lockfile` 902 packages, `bun audit`: no vulnerabilities).

---

## 1. What changed, and why each change is the defect's actual cure (not a symptom)

1. **Snapshot transaction around the export** (`SAVEPOINT/RELEASE`). Pre-existing gap: the 24 reads were 48 independent statements — a concurrent writer could tear the multi-table view, and no test could see it (the export's own hashes are computed from the same torn reads). The transaction makes cross-table consistency a property of the database engine, not of timing.
2. **Verification gate before persistence.** Pre-existing gap (the real "incomplete backup" hole): `runLogicalBackup` wrote the artifact to disk *before/regardless of* verification outcome, and a verification failure still produced a file that listings would happily serve. Now: verification fails → **no artifact exists anywhere** → alert `VERIFY_FAILED` → route answers 500 `backup_failed`. An unproven backup is no longer mistaken for a backup.
3. **Atomic writes** (`<file>.json.tmp` → write → fsync → rename) on both volumes. A crash between any two steps leaves either a complete file or junk `.tmp` — never a truncated artifact under the real name. Junk is swept unconditionally on every run (`tmpSwept`).
4. **Encrypted artifacts** (AES-256-GCM) with three-layer tamper detection. Previously every artifact was plaintext on disk.
5. **Off-volume rule**: encrypted only, verified by read-back hash; no key → skip + alert, never plaintext off-volume; on-volume continues (never a regression of existing protection).
6. **Two-sided retention** — the off dir previously grew without bound; now pruned with the same retention count as the on-volume dir.
7. **Alerting** (in-app + /metrics + logs + optional zero-cost webhook). Previously a failure was a single log line.
8. **Restore path handles both formats** everywhere (route, CLI, tests); encrypted without key → fail closed before any write.

## 2. Environment matrix (all fail-visible; none fail-open)

| Env | On-volume artifact | Off-volume copy | Visible state |
|---|---|---|---|
| key + offsite dir | encrypted, verified before write | encrypted, read-back verified, retention-pruned | `encryption.configured`, `rpo.offVolume.enabled` after first copy; zero alerts |
| key, no offsite dir | encrypted | none (not configured — owner decision D-2.1-03) | honest `rpo.offVolume.enabled: false`; no nag alert (posture, not a run failure — stated in the listing note) |
| no key, offsite dir set | **plaintext v1** (Stage 2.4A posture preserved — existing protection cannot regress) | **REFUSED** — skipped, dir not even created | alert `OFFSITE_SKIPPED_NO_KEY`; `offsite.error: "no valid encryption key configured"` |
| key set but malformed | plaintext v1 | refused | boot alert `OFFSITE_KEY_INVALID` (persists until fixed) |
| nothing set (production today) | plaintext v1 | none | honest listing; owner decision pending |

## 3. Verification actually performed (not "implementation appears correct")

- **21-test hardening suite** (see REGRESSION_TESTS §2) — codec round-trips, three tamper modes with distinct failure causes, canary non-leakage (a distinctive plaintext value provably absent from every encrypted artifact and present in the plaintext doc), route-level encrypted export/download/restore, CLI success and fail-closed, stale-junk sweep, two-sided retention, snapshot structural + isolation tests.
- **Independent off-volume restore drill** — `scripts/stage24b/drill_offvolume_restore.ts`, evidence `evidence/drill-offvolume-restore.json`: boot on volume A → seed through real owner routes (objective + world advance + canary kv) → content reference captured → 3 backup runs → **destroy volume A entirely** → volume B survives with 3 encrypted artifacts → restore from the volume-B artifact only (CLI + key) → boot on the restored store → `/health` 200 → every non-metrics table matches the pre-loss reference in rows AND content hash → canary row present → seeded objective readable through the API → one more backup cycle succeeds. **PASS.**
- The drill's honest boundary: volumes A/B are separate directory trees on the sandbox filesystem. The code path and recovery procedure are proven; the *production storage topology* (a genuinely independent Railway volume/mount) is owner-gated and stays UNVERIFIED until configured — never claimed otherwise.

## 4. RPO/RTO (updated; details in RPO_RTO_ASSESSMENT.md)

With off-volume active (key + dir + 24 h interval): data RPO 24 h for corruption scenarios AND volume-loss scenarios; restore-path RTO measured 108 ms end-to-end in the drill (93 ms CLI + 3 ms boot); planning RTO stays ≤ 15 min (dominated by platform redeploy, not restore). Without off-volume configured: volume-loss RPO unbounded — stated, not hidden.

## 5. Deliberate non-changes

- No second backup system; no scheduler change (30 s first run + `NEXUS_BACKUP_INTERVAL_HOURS` interval, in-process timer — correct for single-instance, documented for future multi-instance).
- No migrations added or altered (schema untouched this stage; the Stage 2.4A migration audit stands for the identical MIGRATIONS array).
- No paid service, no provider, no new infrastructure; the webhook is opt-in and zero-cost.
- Historical Stage 2.2 drill script (`scripts/stage22_disaster_recovery_drill.ts`) left untouched as provenance; it predates the encryption requirement and is superseded by the Stage 2.4B drill (noted so nobody re-runs the old one expecting the new contract).
