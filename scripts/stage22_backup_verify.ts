/**
 * STAGE 2.2 — FRESH BACKUP EXPORT + PRODUCT VERIFY (evidence generator).
 *
 * Boots the real app on an isolated DB, drives a small amount of real state
 * through owner-authenticated routes, then takes a logical backup through the
 * REAL production path (POST /railway/backup/export) and records the app's
 * own verification. This is the phase-4 code path re-executed for the
 * regenerated Stage 2 evidence set (Workstream B).
 *
 * Output: docs/stage2/evidence/backup-export-verify.json
 */
import { createApp } from "@nexus/api";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const TMP = `/tmp/stage22_backup_verify_${Date.now()}`;
const OWNER_KEY = "stage22-backup-verify-key";
const app = createApp({
  dbPath: `${TMP}/nexus.db`,
  workspaceRoot: `${TMP}/ws`,
  env: { OWNER_KEY, NEXUS_BACKUP_INTERVAL_HOURS: "0", RATE_LIMIT_PER_MIN: "10000" } as Record<string, string>,
});
const owner = { Authorization: `Bearer ${OWNER_KEY}`, "content-type": "application/json" };
const req = (p: string, init: RequestInit = {}) => app.app.request(new Request(`http://bv.test${p}`, init));

// seed a little real state through real routes
await req("/jarvis/objectives", { method: "POST", headers: owner, body: JSON.stringify({ objective: "stage2.2 backup-verify evidence objective", origin: "user" }) });
await req("/world/advance", { method: "POST", headers: owner, body: JSON.stringify({ ticks: 5 }) });

// export through the REAL production path (includes the app's own isolated restore-verify)
const r = await req("/railway/backup/export", { method: "POST", headers: owner });
if (r.status !== 201) throw new Error(`export failed: ${r.status}`);
const body = (await r.json()) as { data: any };
const file = body.data.file as string;
const bytes = statSync(file).size;
const sha256 = createHash("sha256").update(readFileSync(file, "utf8")).digest("hex");

const doc = {
  format: "stage2-backup-export-verify",
  generatedAt: new Date().toISOString(),
  generatedAtHead: execSync("git rev-parse HEAD").toString().trim(),
  generator: "scripts/stage22_backup_verify.ts (real app path: POST /railway/backup/export on an isolated instance)",
  export: {
    status: r.status,
    file,
    bytes,
    sha256,
    tables: body.data.tables,
    rows: body.data.rows,
    appOwnVerify: {
      restored: body.data.verification.restored,
      rowsMatched: body.data.verification.rowsMatched,
      tablesChecked: body.data.verification.tablesChecked,
    },
    pruned: body.data.pruned,
  },
  seedState: { note: "1 jarvis objective + 5 world ticks driven through real owner-authenticated routes before export" },
  verdict: body.data.verification.rowsMatched ? `PASS — export through the real production path; app's own isolated restore-verify matched all ${body.data.tables} tables (${body.data.rows} rows)` : "FAIL — app verify mismatch",
};
app.stopBackupScheduler();
app.db.close();
mkdirSync("docs/stage2/evidence", { recursive: true });
writeFileSync("docs/stage2/evidence/backup-export-verify.json", JSON.stringify(doc, null, 2) + "\n");
console.log(doc.verdict);
process.exit(doc.verdict.startsWith("PASS") ? 0 : 1);
