# STAGE 2.4B — INDEPENDENT OFF-VOLUME BACKUP RESTORE EVIDENCE

**Machine evidence:** `evidence/drill-offvolume-restore.json` (full run output, checksummed).
**Tool:** `scripts/stage24b/drill_offvolume_restore.ts` (committed; reproducible: `bun scripts/stage24b/drill_offvolume_restore.ts`).

---

## 1. What "independent restore test" must mean here

Per the directive: *never claim off-volume backup capability exists until a genuine independent restore test proves it.* The drill is the claim's only admissible evidence: a backup that has never been restored is not proven recoverable — so the drill destroys the primary volume and recovers **exclusively** from the off-volume artifact, through the product CLI, then re-verifies content against a pre-loss reference captured before the destruction.

## 2. Run record (2026-11-15T18:13Z)

| Phase | Action | Result |
|---|---|---|
| 1 | boot "production" instance on volume A; seed through real owner routes (JARVIS objective, world advance ×5, canary kv row); capture per-table content reference (24 tables, 56 rows) | boot 11 ms |
| 2 | 3 manual backup runs; each: snapshot export → isolated restore-verify → atomic encrypted on-volume write → **encrypted off-volume copy on volume B + read-back hash verify**; retention 3 | volume B holds 3 encrypted artifacts; newest sha256 `d945e554…341fe79` |
| 3 | **total volume-A loss**: instance stopped, volume A erased recursively, existence checked | volume A gone; volume B intact (3 files) — recovery possible ONLY via volume B |
| 4 | restore from the volume-B artifact ONLY (product CLI + env key); fresh volume A' | exit 0; 93 ms; 24 tables / 61 rows; single transaction committed; per-table content SHA-256 verified; `foreign_key_check` clean; `encrypted: true` in the CLI log |
| 5 | boot a fresh instance on the restored store; `/health` 200; content compare vs the pre-loss reference (all non-metrics tables: rows AND rowid-ordered content hash); canary row present; seeded objective readable through the API; one more backup cycle | **zero content mismatches**; canary present; objective readable; post-restore backup 201 |
| 6 | timings | loss → operational: **108 ms** (CLI 93 ms + boot 3 ms); production RTO is dominated by platform redeploy, not restore |

**Verdict: PASS** — "total volume loss recovered exclusively from the verified encrypted off-volume artifact; content verified against the pre-loss reference; system operational post-restore."

## 3. Integrity chain (what exactly was proven, link by link)

1. The off-volume artifact is **encrypted** (envelope format verified; canary never leaked — a matching plaintext-v1 artifact was never produced in this drill because a key was configured).
2. The copy on volume B is **byte-identical** to the on-volume artifact (read-back sha256 comparison inside the run; independently re-hashed by the drill).
3. The restore **decrypted with the key** (GCM tag + both sha256 checks; the CLI refuses without the key — separately regression-tested: exit 2, nothing written).
4. The restored store **matches the pre-loss content** — not just row counts: per-table `sha256Rowid` equality for every non-metrics table (metrics is the per-request writer; excluded identically to every prior stage).
5. The restored store **serves the application** (health 200, seeded data readable through the real API, next backup cycle succeeds).

## 4. Honest boundaries (what is NOT claimed)

- Volumes A and B are separate directory trees on one sandbox filesystem. **Production independence requires a separate Railway volume/mount — owner-gated, not yet configured; therefore production off-volume capability remains UNVERIFIED until the owner configures it.** What IS proven: the complete code path, the recovery procedure, the integrity chain, and the timings — on the remediated tree, this session, from committed tooling.
- The drill does not (and cannot in-process) inject a crash *between* tmp-write and rename; that step is covered by the atomic-write mechanics (tmp + fsync + rename) and the unconditional junk sweep, not by a crash simulation. No claim beyond that is made.
- RPO/RTO implications are in RPO_RTO_ASSESSMENT.md; the drill measures the restore path only.
