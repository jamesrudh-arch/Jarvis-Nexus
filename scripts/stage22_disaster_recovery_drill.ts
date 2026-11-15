/**
 * STAGE 2.2 / WORKSTREAM C5 — DISASTER-RECOVERY DRILL (improved architecture).
 *
 * Implements the directive's 10-step drill against the NEW architecture:
 *   1. create representative application data          (real owner routes)
 *   2. generate a backup through the actual backup path  (POST /railway/backup/export)
 *   3. validate the backup                               (content-level, on the OFF-SITE copy)
 *   4. destroy only the isolated source database          (the whole source VOLUME: db + workspaceRoot)
 *   5. restore into an independent isolated database      (product CLI: bun run restore)
 *   6. verify all expected tables                          (24/24 from the CLI report)
 *   7. verify content integrity                            (per-table SHA-256 rowid-ordered, independent recheck)
 *   8. verify relationships and foreign keys               (PRAGMA foreign_key_check + explicit orphan checks)
 *   9. verify representative application functionality     (boot on restored DB; world/task/memory survive)
 *  10. generate a signed-off recovery report               (docs/stage2.2/evidence/dr-drill.json)
 *
 * The scenario is the one G-03 closes: the source VOLUME is lost — the backup
 * survives ONLY because it was exported off-volume (NEXUS_BACKUP_OFFSITE_DIR).
 * RTO is measured wall-clock from destruction to successful functional
 * verification. RPO is measured as the data window between the last export
 * and destruction (in production: one backup interval, 24h default).
 */
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { createApp } from "@nexus/api";
import { NexusDb } from "@nexus/db";
import { BackupService, NEXUS_TABLES, type LogicalBackupDoc } from "@nexus/railway";

const ROOT = `/tmp/stage22_dr_drill_${Date.now()}`;
const VOLUME = join(ROOT, "volume");      // the "Railway volume": db + workspaceRoot (backups live here too)
const OFFSITE = join(ROOT, "offsite");    // the off-volume export destination
const TARGET = join(ROOT, "restored");    // the independent isolated restore target
mkdirSync(VOLUME, { recursive: true });
mkdirSync(OFFSITE, { recursive: true });
mkdirSync(TARGET, { recursive: true });

const OWNER_KEY = "stage22-dr-drill-owner";
const env = {
  OWNER_KEY,
  NEXUS_ALLOW_ECHO: "true",
  NEXUS_BACKUP_INTERVAL_HOURS: "0",
  NEXUS_BACKUP_OFFSITE_DIR: OFFSITE,
  RATE_LIMIT_PER_MIN: "10000",
} as Record<string, string>;
const owner = { Authorization: `Bearer ${OWNER_KEY}`, "content-type": "application/json" };
const sha = (b: string) => createHash("sha256").update(b).digest("hex");
const drillId = `DR-${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 14)}`;

let failures = 0;
const checks: Array<{ step: string; check: string; pass: boolean; detail?: unknown }> = [];
const check = (step: string, name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures += 1;
  checks.push({ step, check: name, pass: ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  [${step}] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  return ok;
};

// ── 1. SEED ──────────────────────────────────────────────────────────────────
console.log("\n=== STEP 1: representative application data (real owner routes) ===");
const appA = createApp({ dbPath: join(VOLUME, "nexus.db"), workspaceRoot: join(VOLUME, "workspaces"), env });
const req = (app: ReturnType<typeof createApp>, p: string, init: RequestInit = {}) => app.app.request(new Request(`http://drill.test${p}`, init));

const worldRes = await req(appA, "/world/state");
check("1", "GET /world/state after bootstrap", worldRes.status === 200);
const stateA = (await worldRes.json()).data;

const objectiveText = `${drillId}: survive a simulated volume loss and restore via the product CLI`;
const obj1 = await req(appA, "/jarvis/objectives", { method: "POST", headers: owner, body: JSON.stringify({ objective: objectiveText, origin: "user" }) });
check("1", "POST /jarvis/objectives (drill objective)", obj1.status === 201);
const obj2 = await req(appA, "/jarvis/objectives", { method: "POST", headers: owner, body: JSON.stringify({ objective: `${drillId}: second objective for row-depth`, origin: "user" }) });
check("1", "POST /jarvis/objectives (second)", obj2.status === 201);
const adv = await req(appA, "/world/advance", { method: "POST", headers: owner, body: JSON.stringify({ ticks: 12 }) });
check("1", "POST /world/advance (12 ticks)", adv.status === 200);
const mem = await req(appA, "/memory", { method: "POST", headers: owner, body: JSON.stringify({ scope: "jarvis", tier: "operational", kind: "event_record", title: "dr drill marker", content: "stage2.2 dr-drill marker", importance: 0.9, confidence: 0.95 }) });
check("1", "POST /memory (drill marker)", mem.status === 201);
const naeiTask = await req(appA, "/naei/tasks", { method: "POST", headers: owner, body: JSON.stringify({ requirement: "dr drill: verify restoration preserves the NAEI workforce task graph", affectedSubsystems: ["persistence"], acceptanceCriteria: ["restored DB exposes the NAEI task via GET /naei/tasks"] }) });
check("1", "POST /naei/tasks (workforce task)", naeiTask.status === 201);

const preExport = (await (await req(appA, "/world/state")).json()).data;
const preTasks = (await (await req(appA, "/jarvis/tasks")).json()).data;
check("1", "seeded state is representative", preExport.residents >= 8 && preTasks.length >= 2, {
  worldId: preExport.world.id, residents: preExport.residents, properties: preExport.properties,
  businesses: preExport.businesses, events: preExport.events, jarvisTasks: preTasks.length,
});

// ── 2. BACKUP through the real application path ─────────────────────────────
console.log("\n=== STEP 2: backup through the actual application backup path ===");
const exportedAt = new Date().toISOString();
const exp = await req(appA, "/railway/backup/export", { method: "POST", headers: owner });
check("2", "POST /railway/backup/export (owner)", exp.status === 201);
const expBody = (await exp.json()).data;
check("2", "app's own restore-verify passed (now content-level)", expBody.verification.rowsMatched === true && expBody.verification.contentMatched === true, { tables: expBody.tables, rows: expBody.rows });
check("2", "off-volume copy made (NEXUS_BACKUP_OFFSITE_DIR)", expBody.offsite?.copied === true, { dir: OFFSITE });
const backupName = expBody.file.split("/").pop() as string;
const offsiteFile = join(OFFSITE, backupName);
check("2", "off-site copy exists and matches the on-volume artifact", existsSync(offsiteFile) && sha(readFileSync(offsiteFile, "utf8")) === sha(readFileSync(expBody.file, "utf8")));

// ── 3. VALIDATE the backup (the off-site artifact is what will be used) ─────
console.log("\n=== STEP 3: validate the backup (content-level, off-site copy) ===");
const doc: LogicalBackupDoc = JSON.parse(readFileSync(offsiteFile, "utf8"));
check("3", "format is nexus-logical-backup v1", doc.format === "nexus-logical-backup" && doc.version === 1);
check("3", "all 24 NEXUS tables present", doc.tables.length === NEXUS_TABLES.length, { tables: doc.tables.length });
const indepVerify = BackupService.verifyLogicalBackup(doc);
check("3", "independent content-level verification passes", indepVerify.rowsMatched === true && indepVerify.contentMatched === true);

// ── 4. DESTROY only the isolated source database (the whole volume) ─────────
console.log("\n=== STEP 4: destroy the source volume (db + workspaceRoot incl. on-volume backups)");
const destroyedAt = new Date();
appA.stopBackupScheduler();
appA.db.close();
rmSync(VOLUME, { recursive: true, force: true });
check("4", "source volume destroyed (db, workspaceRoot, on-volume backup chain)", !existsSync(VOLUME));
check("4", "off-site backup survived the volume loss", existsSync(offsiteFile));

// ── 5. RESTORE into an independent isolated database (product CLI) ─────────
console.log("\n=== STEP 5: restore via the PRODUCT CLI into an independent database ===");
const targetPath = join(TARGET, "nexus.db");
const cliProc = Bun.spawnSync(["bun", "run", "restore", "--file", offsiteFile, "--db", targetPath], { cwd: "/home/z/my-project", stdout: "pipe", stderr: "pipe" });
check("5", "bun run restore exits 0", cliProc.exitCode === 0, { exitCode: cliProc.exitCode, stderr: String(cliProc.stderr).slice(0, 300) });
const cliOut = JSON.parse(String(cliProc.stdout).match(/\{[\s\S]*\n\}/)![0]);
const restoreLog = JSON.parse(readFileSync(`${targetPath}.restore-log.json`, "utf8"));
const restoredAt = new Date();
check("5", "CLI report: committed single transaction", cliOut.transaction === "committed" && restoreLog.report.transaction === "committed");
check("5", "CLI report: content verified", cliOut.contentVerified === true);
check("5", "CLI report: foreign_key_check clean", cliOut.foreignKeyViolations === 0);

// ── 6/7. TABLES + CONTENT ────────────────────────────────────────────────────
console.log("\n=== STEP 6/7: verify tables and content integrity ===");
check("6", "all 24 tables restored (CLI report perTable)", restoreLog.report.perTable.length === NEXUS_TABLES.length, { tables: restoreLog.report.perTable.length });
check("6", "row total matches the backup document", restoreLog.report.rows === doc.tables.reduce((n, t) => n + t.rows, 0), { rows: restoreLog.report.rows });
check("7", "per-table content SHA-256 match (CLI, product verify)", restoreLog.report.perTable.every((p: { contentMatch: boolean }) => p.contentMatch));
// independent recheck straight from the restored file against the doc's hashes
const rdb = NexusDb.open(targetPath);
let indepContentOk = true;
const indepPerTable: string[] = [];
for (const t of doc.tables) {
  const rowsBack = rdb.all(`SELECT * FROM ${t.name} ORDER BY rowid`);
  const hashBack = sha(JSON.stringify(rowsBack));
  const ok = hashBack === t.sha256Rowid && rowsBack.length === t.rows;
  indepContentOk = indepContentOk && ok;
  indepPerTable.push(`${t.name}:${rowsBack.length}${ok ? "✓" : "✗"}`);
}
check("7", "independent recheck: content hashes match on all tables", indepContentOk, indepPerTable.filter((s) => s.includes("✗")));

// ── 8. RELATIONSHIPS + FOREIGN KEYS ──────────────────────────────────────────
console.log("\n=== STEP 8: verify relationships and foreign keys ===");
const fk = rdb.all("PRAGMA foreign_key_check");
check("8", "PRAGMA foreign_key_check clean", fk.length === 0, fk);
const rel: Array<{ from: string; to: string; orphans: number }> = [];
const orphanCount = (from: string, col: string, to: string, toCol: string) => {
  const sql = `SELECT COUNT(*) AS n FROM ${from} f LEFT JOIN ${to} t ON t.${toCol} = f.${col} WHERE t.${toCol} IS NULL AND f.${col} IS NOT NULL`;
  return rdb.count(sql);
};
for (const [from, col, to] of [
  ["residents", "world_id", "worlds"],
  ["vehicles", "world_id", "worlds"],
  ["vehicles", "owner_id", "residents"],
  ["properties", "world_id", "worlds"],
  ["properties", "owner_id", "residents"],
  ["businesses", "world_id", "worlds"],
  ["businesses", "account_id", "accounts"],
  ["accounts", "world_id", "worlds"],
  ["transactions", "world_id", "worlds"],
  ["transactions", "from_account_id", "accounts"],
  ["transactions", "to_account_id", "accounts"],
] as const) {
  const orphans = orphanCount(from, col, to, to === "residents" ? "id" : to === "accounts" ? "id" : "id");
  rel.push({ from: `${from}.${col}`, to, orphans });
  check("8", `no orphans: ${from}.${col} -> ${to}.id`, orphans === 0, { orphans });
}
rdb.close();

// ── 9. FUNCTIONAL resurrection on the restored database ─────────────────────
console.log("\n=== STEP 9: functional verification on the restored database ===");
const bootT0 = Date.now();
const appB = createApp({ dbPath: targetPath, workspaceRoot: join(TARGET, "workspaces"), env: { ...env, NEXUS_BACKUP_OFFSITE_DIR: "" } });
const stateB = (await (await req(appB, "/world/state")).json()).data;
check("9", "GET /world/state on restored DB", (await req(appB, "/world/state")).status === 200);
check("9", "world id survived", stateB.world.id === preExport.world.id, { before: preExport.world.id, after: stateB.world.id });
check("9", "resident count survived", stateB.residents === preExport.residents, { before: preExport.residents, after: stateB.residents });
check("9", "properties + businesses survived", stateB.properties === preExport.properties && stateB.businesses === preExport.businesses);
check("9", "world events survived", stateB.events >= preExport.events, { before: preExport.events, after: stateB.events });
const tasksB = (await (await req(appB, "/jarvis/tasks")).json()).data;
check("9", "JARVIS tasks survived (incl. drill objective text)", tasksB.length === preTasks.length && tasksB.some((t: { objective: string }) => t.objective === objectiveText), { before: preTasks.length, after: tasksB.length });
const memB = (await (await req(appB, "/memory/jarvis", { headers: owner })).json()).data;
check("9", "memory marker survived", memB.some((m: { content: string }) => m.content === "stage2.2 dr-drill marker"));
const naeiB = (await (await req(appB, "/naei/tasks")).json()).data;
check("9", "NAEI task survived", naeiB.some((t: { requirement: string }) => t.requirement.includes("restoration preserves the NAEI workforce task graph")));
const functionalOkAt = new Date();
appB.stopBackupScheduler();
appB.db.close();

// ── 10. SIGNED-OFF REPORT ────────────────────────────────────────────────────
const rtoMs = functionalOkAt.getTime() - destroyedAt.getTime();
const rpoMs = destroyedAt.getTime() - Date.parse(exportedAt);
const evidence = {
  format: "stage2.2-dr-drill",
  drillId,
  generatedAt: new Date().toISOString(),
  generatedAtHead: execSync("git rev-parse HEAD").toString().trim(),
  generator: "scripts/stage22_disaster_recovery_drill.ts",
  scenario: "source VOLUME loss (db + workspaceRoot + on-volume backup chain destroyed); recovery from the OFF-VOLUME export via the product CLI",
  steps: {
    1: "representative data via real owner routes (2 objectives, 12 ticks, memory, NAEI task)",
    2: `backup via POST /railway/backup/export + off-volume copy (${OFFSITE})`,
    3: "content-level validation of the off-site artifact",
    4: `source volume destroyed at ${destroyedAt.toISOString()}`,
    5: `bun run restore into ${targetPath} (product CLI, single transaction)`,
    6: "24 tables verified",
    7: "content SHA-256 verified (product + independent recheck)",
    8: "PRAGMA foreign_key_check + 11 explicit orphan checks",
    9: `functional resurrection verified at ${functionalOkAt.toISOString()}`,
    10: "this signed-off report",
  },
  timing: {
    destroyedAt: destroyedAt.toISOString(),
    restoredAt: restoredAt.toISOString(),
    functionalOkAt: functionalOkAt.toISOString(),
    rtoWallClockMs: rtoMs,
    rtoBreakdown: { cliRestoreMs: restoreLog.report.durationMs, bootPlusFunctionalMs: functionalOkAt.getTime() - restoredAt.getTime() },
    rpoMeasuredMs: rpoMs,
    rpoProductionMeaning: "in production the data-loss window is one backup interval (NEXUS_BACKUP_INTERVAL_HOURS, default 24h) plus unexported writes; this drill's measured RPO is minutes because the export was taken moments before destruction",
  },
  state: {
    worldId: preExport.world.id,
    residents: preExport.residents,
    properties: preExport.properties,
    businesses: preExport.businesses,
    events: preExport.events,
    jarvisTasks: preTasks.length,
  },
  referentialChecks: rel,
  backupArtifact: { offsiteFile, bytes: readFileSync(offsiteFile).length, sha256: sha(readFileSync(offsiteFile, "utf8")) },
  checksTotal: checks.length,
  checksFailed: failures,
  verdict: failures === 0
    ? `PASS — ${drillId}: volume loss simulated; recovery from the off-volume export via the product CLI; 24 tables, content hashes, referential integrity and functional resurrection all verified; measured RTO ${rtoMs}ms wall-clock`
    : `FAIL — ${failures} check(s) failed`,
  signature: {
    signedOffBy: "Stage 2.2 autonomous engineering (this script's verdict is the sign-off; the owner may counter-sign in the DEPLOYMENT_AUTHORIZATION_PACKAGE)",
    at: new Date().toISOString(),
    head: execSync("git rev-parse HEAD").toString().trim(),
  },
};
mkdirSync("docs/stage2.2/evidence", { recursive: true });
writeFileSync("docs/stage2.2/evidence/dr-drill.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(`\n=== VERDICT: ${evidence.verdict}`);
console.log(`RTO (wall-clock, destroy -> functional): ${rtoMs}ms | CLI restore: ${restoreLog.report.durationMs}ms | RPO measured: ${rpoMs}ms`);
process.exit(failures === 0 ? 0 : 1);
