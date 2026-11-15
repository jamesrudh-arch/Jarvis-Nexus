/**
 * Stage 2.1 — ISOLATED LOGICAL-BACKUP RESTORATION DEMONSTRATION (read-only w.r.t. production).
 *
 * Challenge: "establish the actual logical-backup architecture, demonstrate
 * restoration in isolation".
 *
 * Method (four phases, all inside /tmp — the repo, production and origin are untouched):
 *   A. SEED     — boot the REAL app (createApp) on a fresh isolated DB, drive real
 *                 owner-authenticated routes (jarvis objective, world advance, memory),
 *                 then take a logical backup through the REAL production path
 *                 (POST /railway/backup/export).
 *   B. DESTROY  — stop the app and delete the database file (simulated volume loss).
 *   C. RESTORE  — independent reimplementation of the restore: fresh SQLite DB,
 *                 real @nexus/db migrations, reinsert every row from the backup JSON.
 *                 Verification is STRONGER than the product's own verify:
 *                 per-table row counts AND recomputed content SHA-256 must match
 *                 the hashes recorded in the backup document.
 *   D. REVIVE   — boot a brand-new app instance on the RESTORED DB and confirm the
 *                 seeded state is functionally alive (world id, residents, events,
 *                 JARVIS task) via the normal GET routes.
 *
 * Evidence is printed as a machine-readable JSON verdict.
 */
import { mkdirSync, rmSync, existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createApp } from "@nexus/api";
import { NexusDb, migrate } from "@nexus/db";
import { BackupService, NEXUS_TABLES } from "@nexus/railway";

const ROOT = `/tmp/stage21_restore_demo_${Date.now()}`;
const DIR_A = join(ROOT, "A_live");      // original deployment simulation
const DIR_B = join(ROOT, "B_restored");  // restoration target
mkdirSync(DIR_A, { recursive: true });
mkdirSync(DIR_B, { recursive: true });

const OWNER_KEY = "stage21-demo-owner";
const env = {
  OWNER_KEY,
  NEXUS_ALLOW_ECHO: "true",
  NEXUS_BACKUP_INTERVAL_HOURS: "0", // scheduler off — we export explicitly
  RATE_LIMIT_PER_MIN: "1000",
} as Record<string, string>;

const req = (app: ReturnType<typeof createApp>, path: string, init: RequestInit = {}) =>
  app.app.request(new Request(`http://stage21.test${path}`, init));
const owner = { Authorization: `Bearer ${OWNER_KEY}`, "X-Forwarded-For": "203.0.113.21" };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const evidence: Record<string, unknown> = { root: ROOT, startedAt: new Date().toISOString(), phases: {} as Record<string, unknown> };
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  return ok;
};

// ---------------------------------------------------------------------------
// PHASE A — SEED + EXPORT (real app, real routes, real backup path)
// ---------------------------------------------------------------------------
console.log("\n=== PHASE A: seed the live instance and export a logical backup ===");
const appA = createApp({ dbPath: join(DIR_A, "nexus.db"), workspaceRoot: join(DIR_A, "workspaces"), env });

const worldBefore = await req(appA, "/world/state");
check("GET /world/state after bootstrap", worldBefore.status === 200);
const worldA = (await worldBefore.json()).data;
check("default world bootstrapped with residents", worldA.residents > 0, { worldId: worldA.world.id, residents: worldA.residents, properties: worldA.properties, events: worldA.events });

const objectiveText = `Stage 2.1 restoration drill ${Date.now()}: verify logical backup round-trip`;
const objRes = await req(appA, "/jarvis/objectives", {
  method: "POST", headers: { "content-type": "application/json", ...owner },
  body: JSON.stringify({ objective: objectiveText, origin: "user" }),
});
check("POST /jarvis/objectives", objRes.status === 201, { status: objRes.status });

const advRes = await req(appA, "/world/advance", {
  method: "POST", headers: { "content-type": "application/json", ...owner },
  body: JSON.stringify({ ticks: 12 }),
});
check("POST /world/advance (12 ticks)", advRes.status === 200, { status: advRes.status });

const memRes = await req(appA, "/memory", {
  method: "POST", headers: { "content-type": "application/json", ...owner },
  body: JSON.stringify({ scope: "jarvis", tier: "operational", kind: "event_record", title: "restoration drill marker", content: "stage2.1 isolated restore drill marker", importance: 0.9, confidence: 0.95 }),
});
check("POST /memory", memRes.status === 201, { status: memRes.status });

// final pre-export state fingerprint
const stateA = (await (await req(appA, "/world/state")).json()).data;
const tasksA = (await (await req(appA, "/jarvis/tasks")).json()).data;
evidence.phases.A = {
  worldId: stateA.world.id, residents: stateA.residents, events: stateA.events,
  properties: stateA.properties, businesses: stateA.businesses, moneySupply: stateA.economy,
  jarvisTasks: tasksA.length, firstTaskObjective: tasksA[0]?.objective?.slice(0, 60),
};

// export via the REAL production route (includes the app's own isolated verify)
const exportRes = await req(appA, "/railway/backup/export", { method: "POST", headers: owner });
check("POST /railway/backup/export (owner)", exportRes.status === 201);
const exportBody = (await exportRes.json()).data;
check("app's own restore-verify passed", exportBody.verification.restored === true && exportBody.verification.rowsMatched === true,
  { tables: exportBody.tables, rows: exportBody.rows, file: exportBody.file });
evidence.phases.A.export = { file: exportBody.file, tables: exportBody.tables, rows: exportBody.rows, appVerifyRowsMatched: exportBody.verification.rowsMatched };

// independent read + hash of the backup document
const backupBytes = statSync(exportBody.file).size;
const doc = JSON.parse(readFileSync(exportBody.file, "utf8")) as import("@nexus/railway").LogicalBackupDoc;
check("backup document format", doc.format === "nexus-logical-backup" && doc.version === 1);
const exportedTableHashes = Object.fromEntries(doc.tables.map((t) => [t.name, t.sha256]));
const totalRows = doc.tables.reduce((n, t) => n + t.rows, 0);
check("backup contains all 24 NEXUS tables", doc.tables.length === NEXUS_TABLES.length, { tables: doc.tables.length, totalRows });
evidence.phases.A.backupDoc = { bytes: backupBytes, sha256: sha(readFileSync(exportBody.file, "utf8")), tables: doc.tables.length, totalRows };

// ---------------------------------------------------------------------------
// PHASE B — DESTROY (simulated volume loss)
// ---------------------------------------------------------------------------
console.log("\n=== PHASE B: destroy the source database (simulated volume loss) ===");
const dbPathA = join(DIR_A, "nexus.db");
appA.stopBackupScheduler();
appA.db.close();
rmSync(dbPathA);
check("source database file destroyed", !existsSync(dbPathA));
// NOTE: the backup file lives under DIR_A/workspaces/backups — keep it (that is
// the artifact we restore from). A REAL volume loss would take it too; the
// off-volume copy problem is documented in the risk report.

// ---------------------------------------------------------------------------
// PHASE C — INDEPENDENT ISOLATED RESTORE (fresh DB, real migrations, stronger verify)
// ---------------------------------------------------------------------------
console.log("\n=== PHASE C: independent restore into an isolated database ===");
const dbPathB = join(DIR_B, "nexus.db");
const restored = NexusDb.open(dbPathB);
const mig = migrate(restored);
check("migrations applied to the fresh target", Array.isArray(mig.applied) ? mig.applied.length >= 1 : mig.applied >= 1, { applied: mig.applied, skipped: mig.skipped });

const perTable: Array<{ name: string; exportedRows: number; restoredRows: number; countMatch: boolean; hashMatch: boolean }> = [];
for (const t of doc.tables) {
  for (const row of t.data) {
    const cols = Object.keys(row);
    if (cols.length === 0) continue;
    const values = cols.map((c) => (row[c] === true ? 1 : row[c] === false ? 0 : row[c] as string | number | null));
    restored.run(`INSERT OR REPLACE INTO ${t.name} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...values);
  }
  const rowsBack = restored.all<Record<string, unknown>>(`SELECT * FROM ${t.name}`);
  const hashBack = sha(JSON.stringify(rowsBack));
  perTable.push({ name: t.name, exportedRows: t.rows, restoredRows: rowsBack.length, countMatch: t.rows === rowsBack.length, hashMatch: hashBack === t.sha256 });
}
const countsOk = perTable.every((p) => p.countMatch);
const hashesOk = perTable.every((p) => p.hashMatch);
check("per-table row counts match", countsOk, perTable.filter((p) => !p.countMatch));
check("per-table CONTENT SHA-256 match (stronger than product verify)", hashesOk, perTable.filter((p) => !p.hashMatch));
const nonEmpty = perTable.filter((p) => p.restoredRows > 0).map((p) => `${p.name}:${p.restoredRows}`);
console.log(`  INFO  non-empty tables after restore: ${nonEmpty.join(", ")}`);
restored.close();
evidence.phases.C = { perTable, countsOk, hashesOk, migrationsApplied: mig.applied };

// ---------------------------------------------------------------------------
// PHASE D — FUNCTIONAL RESURRECTION (new app instance on the restored DB)
// ---------------------------------------------------------------------------
console.log("\n=== PHASE D: boot a new app instance on the restored database ===");
const appB = createApp({ dbPath: dbPathB, workspaceRoot: join(DIR_B, "workspaces"), env });
const worldResB = await req(appB, "/world/state");
check("GET /world/state on restored DB", worldResB.status === 200);
const stateB = (await worldResB.json()).data;
check("world id survived", stateB.world.id === stateA.world.id, { before: stateA.world.id, after: stateB.world.id });
check("resident count survived", stateB.residents === stateA.residents, { before: stateA.residents, after: stateB.residents });
check("world event count survived (>= pre-export)", stateB.events >= stateA.events, { before: stateA.events, after: stateB.events });
check("properties + businesses survived", stateB.properties === stateA.properties && stateB.businesses === stateA.businesses,
  { properties: `${stateA.properties}->${stateB.properties}`, businesses: `${stateA.businesses}->${stateB.businesses}` });
const tasksB = (await (await req(appB, "/jarvis/tasks")).json()).data;
check("JARVIS task survived", tasksB.length === tasksA.length && tasksB.some((t: any) => t.objective === objectiveText),
  { before: tasksA.length, after: tasksB.length });
const memoryMarker = "stage2.1 isolated restore drill marker";
check("memory marker survived", (await (await req(appB, "/memory/jarvis", { headers: owner })).json()).data.some((m: any) => m.content === memoryMarker));
appB.stopBackupScheduler();
appB.db.close();
evidence.phases.D = { worldId: stateB.world.id, residents: stateB.residents, events: stateB.events, jarvisTasks: tasksB.length };

// ---------------------------------------------------------------------------
// VERDICT
// ---------------------------------------------------------------------------
evidence.finishedAt = new Date().toISOString();
evidence.verdict = failures === 0 ? "PASS — logical backup restored in isolation with content-hash verification and functional resurrection" : `FAIL — ${failures} check(s) failed`;
evidence.remainingArtifacts = { backupFile: exportBody.file, restoredDb: dbPathB };
console.log("\n=== VERDICT ===");
console.log(JSON.stringify({ verdict: evidence.verdict, failures, root: ROOT }, null, 2));
console.log("\n=== FULL EVIDENCE ===");
console.log(JSON.stringify({ ...evidence, phases: { ...evidence.phases, C: { countsOk, hashesOk, migrationsApplied: mig.applied, perTableSummary: perTable.map((p) => `${p.name}:${p.restoredRows}${p.hashMatch ? "✓" : "✗"}`) } } }, null, 2));
process.exit(failures === 0 ? 0 : 1);
