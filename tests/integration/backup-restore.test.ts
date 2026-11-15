/**
 * STAGE 2.2 / WORKSTREAM C — BACKUP RESTORE + OFF-SITE EXPORT TESTS.
 *
 * Covers the Stage 2.2 repairs:
 *  G-01  productized restore (function + route + CLI guard)
 *  G-02  content-level integrity verification (corruption detection)
 *  G-03  minimal off-site export (NEXUS_BACKUP_OFFSITE_DIR + download route)
 * These tests are ADVERSARIAL where it matters: a corrupted backup with
 * matching row counts MUST fail verification; the CLI MUST refuse to
 * overwrite a non-empty target without --confirm-destructive; the restore
 * route MUST never touch the live store.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createApp } from "@nexus/api";
import { NexusDb } from "@nexus/db";
import { BackupService, type LogicalBackupDoc } from "@nexus/railway";

const TMP = `/tmp/stage22_backup_restore_${Date.now()}`;
const OWNER_KEY = "stage22-br-owner";
const env = { OWNER_KEY, NEXUS_BACKUP_INTERVAL_HOURS: "0", RATE_LIMIT_PER_MIN: "10000" } as Record<string, string>;
const owner = { Authorization: `Bearer ${OWNER_KEY}`, "content-type": "application/json" };
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

const app = createApp({ dbPath: `${TMP}/live/nexus.db`, workspaceRoot: `${TMP}/live/ws`, env });
let backupFile = ""; // module scope: shared across describe blocks (route export -> download/offsite)
const req = (p: string, init: RequestInit = {}) => app.app.request(new Request(`http://br.test${p}`, init));

beforeAll(async () => {
  // seed representative state through real owner routes
  await req("/jarvis/objectives", { method: "POST", headers: owner, body: JSON.stringify({ objective: "stage2.2 restore test objective", origin: "user" }) });
  await req("/world/advance", { method: "POST", headers: owner, body: JSON.stringify({ ticks: 3 }) });
});

afterAll(() => {
  app.stopBackupScheduler();
  app.db.close();
  rmSync(TMP, { recursive: true, force: true });
});

describe("G-02 content-level integrity verification", () => {
  test("verifyLogicalBackup re-checks content hashes (rowid-ordered) — clean doc passes", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const v = BackupService.verifyLogicalBackup(doc);
    expect(v.rowsMatched).toBe(true);
    expect(v.contentMatched).toBe(true);
    expect(v.notes.some((n) => n.includes("G-02 closed"))).toBe(true);
  });

  test("CORRUPTION DETECTION: mutated row content with matching counts MUST fail", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    // find a table with rows and corrupt one field value in the DOCUMENT
    // (row count unchanged — the pre-Stage-2.2 count-only check would pass)
    const t = doc.tables.find((x) => x.rows > 0 && x.data[0] && Object.keys(x.data[0]).length > 1)!;
    expect(t).toBeDefined();
    const corrupted: LogicalBackupDoc = JSON.parse(JSON.stringify(doc));
    const ct = corrupted.tables.find((x) => x.name === t.name)!;
    const row0 = ct.data[0]!;
    const firstCol = Object.keys(row0).find((c) => typeof row0[c] === "string")!;
    row0[firstCol] = `${row0[firstCol]} CORRUPTED-CONTENT`;
    const v = BackupService.verifyLogicalBackup(corrupted);
    // counts still match...
    expect(v.rowsMatched).toBe(true);
    // ...but content verification MUST fail
    expect(v.contentMatched).toBe(false);
    expect(v.notes.some((n) => n.includes("CONTENT hash mismatch"))).toBe(true);
    expect(v.perTable.find((p) => p.name === t.name)?.contentMatch).toBe(false);
  });

  test("legacy doc without sha256Rowid degrades honestly to count-only", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const legacy: LogicalBackupDoc = JSON.parse(JSON.stringify(doc));
    for (const t of legacy.tables) delete (t as Partial<typeof t>).sha256Rowid;
    const v = BackupService.verifyLogicalBackup(legacy);
    expect(v.rowsMatched).toBe(true);
    expect(v.contentMatched).toBeUndefined();
    expect(v.notes.some((n) => n.includes("count-only verification"))).toBe(true);
  });
});

describe("G-01 productized restore — function level", () => {
  test("restoreLogicalBackup: fresh target, single transaction, content verified, FK clean", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const target = NexusDb.open(`${TMP}/fn-restore-${Date.now()}.db`);
    const report = BackupService.restoreLogicalBackup(target, doc);
    target.close();
    expect(report.restored).toBe(true);
    expect(report.transaction).toBe("committed");
    expect(report.errors).toEqual([]);
    expect(report.foreignKeyViolations).toEqual([]);
    expect(report.perTable.every((p) => p.contentMatch)).toBe(true);
    expect(report.rows).toBe(doc.tables.reduce((n, t) => n + t.rows, 0));
  });

  test("restoreLogicalBackup: unknown table name fails BEFORE any write (schema validation)", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const bad: LogicalBackupDoc = JSON.parse(JSON.stringify(doc));
    const t0 = bad.tables[0]!;
    t0.name = "no_such_table_anywhere";
    const target = NexusDb.open(`${TMP}/fn-bad-${Date.now()}.db`);
    const report = BackupService.restoreLogicalBackup(target, bad);
    target.close();
    expect(report.restored).toBe(false);
    expect(report.transaction).toBe("rolled-back");
    expect(report.errors[0]).toContain("tables absent from this schema");
  });

  test("restoreLogicalBackup: corrupted content fails post-restore verification", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const corrupted: LogicalBackupDoc = JSON.parse(JSON.stringify(doc));
    const t = corrupted.tables.find((x) => x.rows > 0)!;
    const row0 = t.data[0]!;
    const firstCol = Object.keys(row0).find((c) => typeof row0[c] === "string")!;
    row0[firstCol] = "CORRUPTED";
    const target = NexusDb.open(`${TMP}/fn-corrupt-${Date.now()}.db`);
    const report = BackupService.restoreLogicalBackup(target, corrupted);
    target.close();
    expect(report.restored).toBe(false);
    expect(report.errors.some((e) => e.includes("content hash mismatch") || e.includes("content verification failed"))).toBe(true);
  });
});

describe("G-01 productized restore — route level (non-destructive by construction)", () => {

  test("export a backup through the real route (prerequisite)", async () => {
    const r = await req("/railway/backup/export", { method: "POST", headers: owner });
    expect(r.status).toBe(201);
    const body = ((await r.json()) as any).data;
    backupFile = body.file;
    expect(body.verification.rowsMatched).toBe(true);
  });

  test("POST /railway/backup/restore restores into an ISOLATED db and never touches the live store", async () => {
    const name = backupFile.split("/").pop()!;
    // snapshot the live store's core tables BEFORE (metrics excluded: its rows
    // accumulate per request by design — the per-request writer, not the
    // restore path, changes that table on every call)
    const before = BackupService.exportLogicalBackup(app.db);
    const r = await req("/railway/backup/restore", { method: "POST", headers: owner, body: JSON.stringify({ file: name }) });
    expect(r.status).toBe(200);
    const body = ((await r.json()) as any).data;
    expect(body.report.restored).toBe(true);
    expect(body.report.perTable.every((p: { contentMatch: boolean }) => p.contentMatch)).toBe(true);
    // the isolated target lives under restore-verifications/, not the live db path
    expect(body.target).toContain("restore-verifications");
    expect(existsSync(body.target)).toBe(true);
    expect(existsSync(body.log)).toBe(true);
    // live store untouched: every table except the per-request metrics writer
    // must be byte-identical (rows AND content hash)
    const after = BackupService.exportLogicalBackup(app.db);
    for (const b of before.tables) {
      if (b.name === "metrics") continue;
      const a = after.tables.find((x) => x.name === b.name)!;
      expect(a.rows).toBe(b.rows);
      expect(a.sha256Rowid).toBe(b.sha256Rowid);
    }
  });

  test("restore route: unauthenticated 401; bad filename 400; missing file 404", async () => {
    expect((await req("/railway/backup/restore", { method: "POST", body: "{}" })).status).toBe(401);
    const bad = await req("/railway/backup/restore", { method: "POST", headers: owner, body: JSON.stringify({ file: "../etc/passwd" }) });
    expect(bad.status).toBe(400);
    const missing = await req("/railway/backup/restore", { method: "POST", headers: owner, body: JSON.stringify({ file: "no-such-backup.json" }) });
    expect(missing.status).toBe(404);
  });
});

describe("G-03 minimal off-site export", () => {
  test("download route streams the artifact with integrity headers", async () => {
    const name = backupFile.split("/").pop()!;
    const r = await req(`/railway/backup/export/${name}/download`, { headers: { Authorization: `Bearer ${OWNER_KEY}` } });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-backup-sha256")).toBe(sha(readFileSync(backupFile)));
    expect(r.headers.get("x-backup-bytes")).toBe(String(statSync(backupFile).size));
    expect(r.headers.get("content-disposition")).toContain(name);
    expect(sha(await r.text())).toBe(sha(readFileSync(backupFile)));
  });

  test("download route: path traversal refused (400), unauthenticated 401", async () => {
    const evil = await req(`/railway/backup/export/..%2F..%2Fetc%2Fpasswd/download`, { headers: { Authorization: `Bearer ${OWNER_KEY}` } });
    expect(evil.status).toBe(400);
    expect((await req(`/railway/backup/export/whatever.json/download`)).status).toBe(401);
  });

  test("NEXUS_BACKUP_OFFSITE_DIR: export copies the newest backup off-volume (Stage 2.4B: encrypted only)", async () => {
    const offsite = `${TMP}/offsite-dir`;
    // Stage 2.4B (F-2.4A-06): off-volume copies require a valid encryption key —
    // a plaintext artifact must never leave the volume. TEST-ONLY key generated
    // at runtime for this run; never a committed secret.
    const keyHex = randomBytes(32).toString("hex");
    const app2 = createApp({
      dbPath: `${TMP}/offsite-live/nexus.db`,
      workspaceRoot: `${TMP}/offsite-live/ws`,
      env: { ...env, NEXUS_BACKUP_OFFSITE_DIR: offsite, NEXUS_BACKUP_ENCRYPTION_KEY: keyHex },
    });
    const r2 = await app2.app.request(new Request("http://br.test/railway/backup/export", { method: "POST", headers: { Authorization: `Bearer ${OWNER_KEY}` } }));
    expect(r2.status).toBe(201);
    const body2 = ((await r2.json()) as any).data;
    expect(body2.offsite.copied).toBe(true);
    expect(body2.offsite.encrypted).toBe(true);
    expect(body2.encrypted).toBe(true);
    const srcName = body2.file.split("/").pop()!;
    const dest = join(offsite, srcName);
    expect(existsSync(dest)).toBe(true);
    // the off-volume copy is byte-identical to the on-volume artifact
    expect(sha(readFileSync(dest))).toBe(sha(readFileSync(body2.file)));
    // and it is an ENCRYPTED envelope, not a plaintext doc
    expect(readFileSync(dest).subarray(0, 320).toString("utf8")).toContain("nexus-logical-backup-encrypted");
    // /railway/backups is fail-closed without Railway credentials by design
    // (live discovery required): assert the honest 502 rather than pretending.
    const status = await app2.app.request(new Request("http://br.test/railway/backups", { headers: { Authorization: `Bearer ${OWNER_KEY}` } }));
    expect(status.status).toBe(502);
    app2.stopBackupScheduler();
    app2.db.close();
  });
});

describe("G-01 productized restore — CLI guard (destructive operations require explicit authorization)", () => {
  test("CLI REFUSES a non-empty target without --confirm-destructive (exit 2, no writes)", async () => {
    // create a real backup file and a non-empty target db
    const doc = BackupService.exportLogicalBackup(app.db);
    const backupPath = `${TMP}/cli-backup.json`;
    writeFileSync(backupPath, JSON.stringify(doc));
    const targetPath = `${TMP}/cli-target.db`;
    const tdb = NexusDb.open(targetPath);
    BackupService.restoreLogicalBackup(tdb, doc); // non-empty target
    tdb.close();
    const bytesBefore = statSync(targetPath).size;

    const proc = Bun.spawnSync(["bun", "run", "restore", "--file", backupPath, "--db", targetPath], { cwd: import.meta.dir + "/../..", stdout: "pipe", stderr: "pipe" });
    expect(proc.exitCode).toBe(2);
    expect(String(proc.stderr).includes("REFUSED")).toBe(true);
    expect(statSync(targetPath).size).toBe(bytesBefore); // untouched
    expect(existsSync(`${targetPath}.restore-log.json`)).toBe(false); // no log for a refusal
  });

  test("CLI with --confirm-destructive overwrites the target in one transaction", async () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const backupPath = `${TMP}/cli-backup2.json`;
    writeFileSync(backupPath, JSON.stringify(doc));
    const targetPath = `${TMP}/cli-target2.db`;
    const tdb = NexusDb.open(targetPath);
    BackupService.restoreLogicalBackup(tdb, doc);
    tdb.close();
    const proc = Bun.spawnSync(["bun", "run", "restore", "--file", backupPath, "--db", targetPath, "--confirm-destructive"], { cwd: import.meta.dir + "/../..", stdout: "pipe", stderr: "pipe" });
    expect(proc.exitCode).toBe(0);
    const parsed = JSON.parse(String(proc.stdout).match(/\{[\s\S]*\n\}/)![0]);
    expect(parsed.restored).toBe(true);
    expect(parsed.transaction).toBe("committed");
    expect(existsSync(`${targetPath}.restore-log.json`)).toBe(true);
  });

  test("CLI happy path on a fresh target: full verification report", async () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const backupPath = `${TMP}/cli-backup3.json`;
    writeFileSync(backupPath, JSON.stringify(doc));
    const targetPath = `${TMP}/cli-target3-${Date.now()}.db`;
    const proc = Bun.spawnSync(["bun", "run", "restore", "--file", backupPath, "--db", targetPath], { cwd: import.meta.dir + "/../..", stdout: "pipe", stderr: "pipe" });
    expect(proc.exitCode).toBe(0);
    const match = String(proc.stdout).match(/\{[\s\S]*\n\}/);
    const parsed = JSON.parse(match![0]);
    expect(parsed.restored).toBe(true);
    expect(parsed.contentVerified).toBe(true);
    expect(parsed.foreignKeyViolations).toBe(0);
    // restore-log written next to the target
    const log = JSON.parse(readFileSync(`${targetPath}.restore-log.json`, "utf8"));
    expect(log.report.restored).toBe(true);
  });
});
