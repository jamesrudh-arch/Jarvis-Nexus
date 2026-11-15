/**
 * STAGE 2.2 / WORKSTREAM C2 — PRODUCTIZED RESTORE CLI (G-01 repair).
 *
 * Usage:
 *   bun run restore --file <backup.json> --db <target.sqlite> [--confirm-destructive]
 *
 * Safety design (directive §C2: "Never allow an ordinary verification
 * operation to accidentally overwrite production data"):
 *   1. --file and --db are both REQUIRED — explicit backup selection and an
 *      explicit restore target; nothing is inferred from the environment.
 *   2. If the target file exists and is non-empty, the CLI REFUSES (exit 2)
 *      unless --confirm-destructive is passed. With the flag, existing rows
 *      are wiped inside the same transaction as the reinsert (rollback on
 *      any failure).
 *   3. Every run writes <target>.restore-log.json with the full report.
 *   4. Post-restore verification is built in: per-table content SHA-256
 *      (rowid-ordered) + PRAGMA foreign_key_check; the CLI fails (exit 1)
 *      if verification fails.
 */
import { parseArgs } from "node:util";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { NexusDb } from "@nexus/db";
import { BackupService, type LogicalBackupDoc } from "@nexus/railway";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    file: { type: "string" },
    db: { type: "string" },
    "confirm-destructive": { type: "boolean", default: false },
  },
});

const fail = (code: number, msg: string): never => {
  console.error(msg);
  process.exit(code);
};

if (!values.file) fail(2, "restore: --file <backup.json> is required (explicit backup selection)");
if (!values.db) fail(2, "restore: --db <target.sqlite> is required (explicit restore target — nothing is inferred from the environment)");
const file = values.file as string;
const dbPath = values.db as string;
const confirmDestructive = values["confirm-destructive"] === true;

if (!existsSync(file)) fail(2, `restore: backup file not found: ${file}`);
const doc: LogicalBackupDoc = (() => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as LogicalBackupDoc;
  } catch (e) {
    return fail(2, `restore: backup file is not valid JSON: ${String(e)}`);
  }
})();
if (doc.format !== "nexus-logical-backup" || doc.version !== 1) {
  fail(2, `restore: unsupported backup format ${String(doc.format)} v${String(doc.version)}`);
}

const targetExists = existsSync(dbPath);
const targetNonEmpty = targetExists && statSync(dbPath).size > 0;
let wipe = false;
if (targetNonEmpty) {
  if (!confirmDestructive) {
    fail(2, [
      "restore: REFUSED — the target already exists and is non-empty.",
      `  target: ${dbPath} (${statSync(dbPath).size} bytes)`,
      "  An ordinary restore must never overwrite existing data (Stage 2.2 safety rule).",
      "  If you REALLY intend to overwrite this target, re-run with:",
      "    --confirm-destructive",
      "  (the wipe and the reinsert then run inside ONE transaction; any failure rolls back).",
    ].join("\n"));
  }
  wipe = true;
  console.log("restore: --confirm-destructive present; target will be wiped and reinserted in one transaction");
}

const startedAt = new Date().toISOString();
const t0 = Date.now();
const db = NexusDb.open(dbPath);
let report;
try {
  report = BackupService.restoreLogicalBackup(db, doc, { wipe });
} finally {
  const log = {
    cli: "bun run restore",
    argv: { file, db: dbPath, confirmDestructive },
    startedAt,
    finishedAt: new Date().toISOString(),
    wallClockMs: Date.now() - t0,
    report,
  };
  writeFileSync(`${dbPath}.restore-log.json`, JSON.stringify(log, null, 2));
  db.close();
}

console.log(JSON.stringify({
  restored: report.restored,
  tables: report.tables,
  rows: report.rows,
  transaction: report.transaction,
  durationMs: report.durationMs,
  foreignKeyViolations: report.foreignKeyViolations.length,
  contentVerified: report.perTable.every((p) => p.contentMatch),
  log: `${dbPath}.restore-log.json`,
  errors: report.errors,
}, null, 2));

if (!report.restored) fail(1, `restore: FAILED and rolled back — ${report.errors.join("; ")}`);
console.log(`restore: OK — ${report.rows} rows across ${report.tables} tables restored into ${dbPath} (content SHA-256 verified, foreign_key_check clean)`);
