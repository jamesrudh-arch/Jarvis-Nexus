/**
 * STAGE 2.4B / F-2.4A-06 — GENUINE INDEPENDENT OFF-VOLUME RESTORE DRILL.
 *
 * Proves (or disproves) the off-volume backup capability end-to-end:
 *
 *   Phase 1  boot a "production" instance on simulated volume A; seed real
 *            data through owner routes; capture a content reference
 *   Phase 2  run the backup pipeline; the newest ENCRYPTED artifact lands on
 *            the independent volume B and is read-back hash verified
 *   Phase 3  TOTAL VOLUME-A LOSS: stop the instance and destroy volume A
 *            entirely; volume B must survive with its artifacts
 *   Phase 4  restore from the volume-B artifact ONLY (product CLI + key),
 *            into a fresh volume-A' — nothing else is used
 *   Phase 5  boot a fresh instance on the restored store; verify content
 *            against the Phase-1 reference; run one more backup cycle to
 *            prove the system is fully operational after recovery
 *   Phase 6  timings (RTO components) + honest verdict
 *
 * Simulation boundary, stated honestly: volumes A and B are separate
 * directory trees on the sandbox filesystem. Genuine production independence
 * requires a separate Railway volume/mount — that step is owner-gated and
 * stays UNVERIFIED until configured; this drill proves the CODE path and the
 * recovery procedure, not the production storage topology.
 *
 * Usage: bun scripts/stage24b/drill_offvolume_restore.ts
 */
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createApp } from "@nexus/api";
import { BackupService } from "@nexus/railway";

const TMP = `/tmp/stage24b_drill_${Date.now()}`;
const VOL_A = `${TMP}/volume-a`; // the "production" volume
const VOL_B = `${TMP}/volume-b`; // the independent off-site volume
const KEY_HEX = randomBytes(32).toString("hex"); // drill key (runtime-generated)
const OWNER_KEY = "drill-owner-key-stage24b";
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

const env: Record<string, string> = {
  OWNER_KEY,
  NEXUS_ALLOW_ECHO: "true",
  NEXUS_BACKUP_INTERVAL_HOURS: "0", // manual runs only in a drill (scheduling is covered by the test suite)
  NEXUS_BACKUP_RETENTION: "3",
  NEXUS_BACKUP_OFFSITE_DIR: VOL_B,
  NEXUS_BACKUP_ENCRYPTION_KEY: KEY_HEX,
  RATE_LIMIT_PER_MIN: "100000",
};

const mk = (dbPath: string, workspaceRoot: string) => createApp({ dbPath, workspaceRoot, env });
const req = (a: ReturnType<typeof mk>, p: string, init: RequestInit = {}) => a.app.request(new Request(`http://drill.test${p}`, init));
const owner = { Authorization: `Bearer ${OWNER_KEY}`, "content-type": "application/json", "X-Forwarded-For": "203.0.113.77" };

const out: Record<string, unknown> = {
  drill: "F-2.4A-06 independent off-volume restore",
  startedAt: new Date().toISOString(),
  volumeA: VOL_A,
  volumeB: VOL_B,
  phases: {} as Record<string, unknown>,
};

const t = (ms: number) => new Promise((r) => setTimeout(r, ms));

mkdirSync(VOL_A, { recursive: true });
mkdirSync(VOL_B, { recursive: true });

// ---- Phase 1: production instance + seeded data + content reference --------
const tBoot = Date.now();
const appA = mk(join(VOL_A, "nexus.db"), join(VOL_A, "ws"));
out.phases.bootMs = Date.now() - tBoot;

const seed = await req(appA, "/jarvis/objectives", { method: "POST", headers: owner, body: JSON.stringify({ objective: "stage 2.4b drill objective", origin: "user" }) });
if (seed.status !== 201) throw new Error(`seed objective failed: ${seed.status}`);
const adv = await req(appA, "/world/advance", { method: "POST", headers: owner, body: JSON.stringify({ ticks: 5 }) });
if (adv.status !== 200) throw new Error(`world advance failed: ${adv.status}`);
appA.db.run("INSERT INTO kv (key, value) VALUES ('drill-canary', '\"STAGE24B-DRILL-CANARY\"') ON CONFLICT(key) DO UPDATE SET value = excluded.value");

const reference = BackupService.exportLogicalBackup(appA.db);
out.phases.reference = {
  tables: reference.tables.length,
  rows: reference.tables.reduce((n, x) => n + x.rows, 0),
  perTable: reference.tables.map((x) => ({ name: x.name, rows: x.rows, sha256Rowid: x.sha256Rowid })),
};

// ---- Phase 2: backup runs -> verified encrypted off-volume copies -----------
let lastOffVol = "";
let lastOffVolSha = "";
for (let i = 0; i < 3; i++) {
  const r = await req(appA, "/railway/backup/export", { method: "POST", headers: owner });
  if (r.status !== 201) throw new Error(`backup export failed: ${r.status}`);
  const data = (await r.json()) as any;
  if (data.data.offsite.copied !== true || data.data.encrypted !== true) throw new Error("off-volume copy did not complete");
  lastOffVol = data.data.offsite.file;
  lastOffVolSha = sha(readFileSync(lastOffVol));
  await t(3); // distinct ms timestamps -> distinct filenames
}
const offVolCount = readdirSync(VOL_B).filter((f) => f.endsWith(".json")).length;
out.phases.backup = { runs: 3, offVolumeFiles: offVolCount, newestArtifact: lastOffVol, newestArtifactSha256: lastOffVolSha, encrypted: true };

// ---- Phase 3: TOTAL VOLUME-A LOSS -------------------------------------------
const tLoss = Date.now();
appA.stopBackupScheduler();
appA.db.close();
rmSync(VOL_A, { recursive: true, force: true });
if (existsSync(VOL_A)) throw new Error("volume A not destroyed");
const survivors = readdirSync(VOL_B).filter((f) => f.endsWith(".json"));
if (survivors.length !== offVolCount) throw new Error("volume B did not survive intact");
out.phases.volumeLoss = { destroyed: true, volumeBFilesAfterLoss: survivors.length, note: "volume A erased entirely; recovery is possible ONLY through the volume-B artifact" };

// ---- Phase 4: restore from the volume-B artifact ONLY ------------------------
const tRestore = Date.now();
mkdirSync(VOL_A, { recursive: true });
const restoreTarget = join(VOL_A, "nexus.db");
const proc = Bun.spawnSync(["bun", "run", "restore", "--file", lastOffVol, "--db", restoreTarget], {
  cwd: import.meta.dir + "/../..",
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, NEXUS_BACKUP_ENCRYPTION_KEY: KEY_HEX },
});
const restoreMs = Date.now() - tRestore;
if (proc.exitCode !== 0) {
  out.verdict = "FAIL: CLI restore failed";
  out.phases.restore = { exitCode: proc.exitCode, stdout: String(proc.stdout).slice(-2000), stderr: String(proc.stderr).slice(-2000) };
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
const restoreLog = JSON.parse(readFileSync(`${restoreTarget}.restore-log.json`, "utf8"));
out.phases.restore = {
  exitCode: 0,
  wallClockMs: restoreMs,
  encrypted: restoreLog.encrypted,
  tables: restoreLog.report.tables,
  rows: restoreLog.report.rows,
  transaction: restoreLog.report.transaction,
  contentVerified: restoreLog.report.perTable.every((p: any) => p.contentMatch),
  foreignKeyViolations: restoreLog.report.foreignKeyViolations.length,
};

// ---- Phase 5: boot on the restored store + content verification -------------
const tBoot2 = Date.now();
const appB = mk(restoreTarget, join(VOL_A, "ws"));
const boot2Ms = Date.now() - tBoot2;
const health = await req(appB, "/health", { headers: { "X-Forwarded-For": "203.0.113.78" } });
if (health.status !== 200) throw new Error(`restored app unhealthy: ${health.status}`);

const restored = BackupService.exportLogicalBackup(appB.db);
const mismatches: string[] = [];
for (const ref of reference.tables) {
  const got = restored.tables.find((x) => x.name === ref.name);
  if (!got) { mismatches.push(`${ref.name}: missing`); continue; }
  // metrics is the per-request writer (health probes above) — excluded, as in
  // every prior stage; every OTHER table must match rows AND content hash
  if (ref.name === "metrics") continue;
  if (got.rows !== ref.rows) mismatches.push(`${ref.name}: rows ${got.rows} != ${ref.rows}`);
  if (got.sha256Rowid !== ref.sha256Rowid) mismatches.push(`${ref.name}: content hash differs`);
}
const canaryBack = restored.tables.find((x) => x.name === "kv")!.data.some((row: any) => row.key === "drill-canary");
const canaryOk = await (async () => {
  const list = await req(appB, "/jarvis/tasks", { headers: { "X-Forwarded-For": "203.0.113.79" } });
  const body = (await list.json()) as any;
  return Array.isArray(body.data) && body.data.some((x: any) => String(x.objective ?? "").includes("stage 2.4b drill objective"));
})();

// one more backup cycle on the restored instance proves operational recovery
const again = await req(appB, "/railway/backup/export", { method: "POST", headers: { "X-Forwarded-For": "203.0.113.80", Authorization: `Bearer ${OWNER_KEY}`, "content-type": "application/json" } });
out.phases.restoredInstance = {
  bootMs: boot2Ms,
  health: health.status,
  contentMismatches: mismatches,
  canaryRowPresent: canaryBack,
  seededObjectiveReadable: canaryOk,
  postRestoreBackup: again.status === 201,
};
appB.stopBackupScheduler();
appB.db.close();

// ---- Phase 6: timings + verdict ----------------------------------------------
const rtoMs = (Date.now() - tLoss) - 0; // from volume loss to a verified, healthy, operational restored instance
out.phases.timings = {
  fromVolumeLossToRestoredOperationalMs: rtoMs,
  components: { restoreCliMs: restoreMs, bootMs: boot2Ms, note: "the dominant term in production is platform redeploy time, not the restore itself" },
};
out.finishedAt = new Date().toISOString();
out.verdict = mismatches.length === 0 && canaryBack && canaryOk && again.status === 201 && restoreLog.encrypted === true
  ? "PASS: total volume loss recovered exclusively from the verified encrypted off-volume artifact; content verified against the pre-loss reference; system operational post-restore"
  : "FAIL: see phases.restoredInstance";

console.log(JSON.stringify(out, null, 2));
process.exit(out.verdict.startsWith("PASS") ? 0 : 1);
