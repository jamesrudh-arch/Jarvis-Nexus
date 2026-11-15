# STAGE 2.4B — RPO/RTO ASSESSMENT (post-remediation)

Measured this session; no marketing figures. The two loss classes are kept separate — conflating them is how DR claims go wrong.

---

## 1. Recovery-point objectives (RPO = maximum data-loss window)

| Scenario | Stage 2.4A (candidate as deployed-pending) | Stage 2.4B (this remediation) |
|---|---|---|
| Code (repo) | ~0 (GitHub `origin/main` + committed thin bundles; verified 2.4A §2) | unchanged ~0 |
| Data — corruption/accidental-write (volume survives) | 24 h (on-volume logical backups, same volume) | **24 h** (on-volume, now encrypted when key set, verification-gated, atomic) |
| Data — **total volume loss** | **unbounded** (same-volume backups die with the volume) | **24 h with off-volume active** (key + `NEXUS_BACKUP_OFFSITE_DIR` + interval 24 h): proven by drill — volume-A loss recovered exclusively from the volume-B artifact. **Without owner configuration: still unbounded** — stated in the listing (`rpo.offVolume.enabled: false`) and never claimed otherwise |

Design note: the on-volume plaintext posture is unchanged when no key is set (existing protection can never regress because of this stage); the off-volume copy is the new, additional protection and it is *encrypted-only*.

## 2. Recovery-time objectives (RTO = loss → operational)

| Path | Stage 2.4A | Stage 2.4B (measured in the drill) |
|---|---|---|
| Logical restore itself | ~5 ms per 55-row store (estimated) | **93 ms** wall-clock CLI (61 rows; includes open, wipe-free insert, content re-verify, foreign_key_check, log write) |
| Boot on the restored store | not measured | **3 ms** |
| Loss → verified operational (app-level, excluding platform) | not measured | **108 ms** |
| End-to-end incl. platform redeploy | ≤ 15 min planning figure | **≤ 15 min stands** (dominated by Railway redeploy, not the restore — the drill's 108 ms is the floor; the 15-minute figure covers human response + platform build/deploy, and remains the honest planning number) |
| Application rollback (redeploy previous image) | minutes (2.4A Phase C) | unchanged |

## 3. Alerting latency (new)

Failure → in-app alert + `/metrics` counter + error log is synchronous with the failed run. Webhook delivery (when configured): fire-and-forget with 5 s timeout; verified delivered in the hardening tests within the test's 3 s wait window. Delivery to an external owner channel depends on the owner configuring `NEXUS_ALERT_WEBHOOK_URL`; without it alerts are still visible in-app — that part is tested, the external channel is not (and is not claimed).

## 4. What would change the numbers

- Owner sets a shorter `NEXUS_BACKUP_INTERVAL_HOURS` → RPO scales linearly with interval (cost: more runs; each run is verification-gated and atomic).
- Owner attaches a second Railway volume (or any mount) + sets `NEXUS_BACKUP_OFFSITE_DIR` + a 64-hex `NEXUS_BACKUP_ENCRYPTION_KEY` → volume-loss RPO drops from unbounded to the interval. Object-storage push remains D-2.1-03 (owner-gated; no provider assumed, no cost introduced).
- Multi-instance future topology: the in-process scheduler must be externalised (documented in the listing note) — RPO/RTO figures then depend on that scheduler.
