/**
 * STAGE 2.4B / F-2.4A-06 — backup hardening regression tests.
 *
 * Covers the Stage 2.4B remediation of the off-volume backup strategy:
 *  - AES-256-GCM encryption round-trip + fail-closed tamper detection
 *    (ciphertext hash, GCM tag, plaintext hash — three independent checks)
 *  - no plaintext leakage into encrypted artifacts (canary row)
 *  - verified ENCRYPTED off-volume copy (read-back hash), atomic writes
 *    (tmp + fsync + rename) and stale-tmp junk sweeping
 *  - two-sided retention (on-volume AND off-volume dirs)
 *  - fail-visible behaviour WITHOUT a valid key: off-volume copy refused
 *    (never plaintext off-volume), on-volume continues as plaintext v1,
 *    an alert is recorded and delivered to the optional webhook
 *  - restore path (route + CLI) handles BOTH formats; the CLI fails closed
 *    without the key; tampered artifacts are rejected before any write
 *  - snapshot transaction: export reads run inside ONE read transaction
 *    (SAVEPOINT/RELEASE) and uncommitted rows from a second connection are
 *    never exported (WAL isolation)
 */
import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createApp } from "@nexus/api";
import { NexusDb } from "@nexus/db";
import { BackupService, type EncryptedBackupDoc, type LogicalBackupDoc } from "@nexus/railway";

const TMP = `/tmp/stage24b_backup_${Date.now()}`;
mkdirSync(TMP, { recursive: true });

const OWNER_KEY = "stage24b-backup-owner";
// TEST-ONLY key, generated at runtime for this run — never a committed secret.
const KEY_HEX = randomBytes(32).toString("hex");
const WRONG_KEY_HEX = randomBytes(32).toString("hex");
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

// ---- optional alert-webhook receiver (local, ephemeral port) ----------------
const WEBHOOK_DELIVERIES: Array<{ url: string; body: any }> = [];
const hook = Bun.serve({
  port: 0,
  async fetch(req) {
    const body = await req.json();
    WEBHOOK_DELIVERIES.push({ url: req.url, body });
    return new Response("ok");
  },
});

const envBase: Record<string, string> = {
  OWNER_KEY,
  NEXUS_ALLOW_ECHO: "true",
  NEXUS_BACKUP_INTERVAL_HOURS: "0", // scheduler off — every run below is manual
  RATE_LIMIT_PER_MIN: "100000",
  NEXUS_BACKUP_RETENTION: "3",
};

// main instance: key configured, offsite dir configured, NO webhook (its runs succeed)
const OFFSITE = `${TMP}/offsite-volume`; // stands in for an INDEPENDENT volume
const app = createApp({
  dbPath: `${TMP}/live/nexus.db`,
  workspaceRoot: `${TMP}/live/ws`,
  env: { ...envBase, NEXUS_BACKUP_OFFSITE_DIR: OFFSITE, NEXUS_BACKUP_ENCRYPTION_KEY: KEY_HEX },
});
const req = (p: string, init: RequestInit = {}) => app.app.request(new Request(`http://bh.test${p}`, init));
const owner = { Authorization: `Bearer ${OWNER_KEY}`, "content-type": "application/json", "X-Forwarded-For": "198.51.100.77" };
const backupDir = join(TMP, "live", "ws", "backups");

const waitFor = async (f: () => boolean, ms = 3000): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (f()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return f();
};

// seed a canary row so the store contains a distinctive plaintext value that
// must never appear in any encrypted artifact. Deterministic kv insert (part
// of every export); a route-level seed would depend on CreateMemoryRequest's
// exact schema and is not the property under test here.
app.db.run(
  "INSERT INTO kv (key, value) VALUES ('stage24b-canary', '\"STAGE24B-CANARY-VALUE\"') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);

afterAll(() => {
  app.stopBackupScheduler();
  app.db.close();
  hook.stop(true);
  rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// codec level
// ---------------------------------------------------------------------------
describe("encryption codec (BackupService)", () => {
  test("encrypt/decrypt round-trip preserves full verifiability", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const artifact = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    expect(artifact.format).toBe("nexus-logical-backup-encrypted");
    expect(artifact.alg).toBe("aes-256-gcm");
    const back = BackupService.decryptBackupDoc(artifact, Buffer.from(KEY_HEX, "hex"));
    const v = BackupService.verifyLogicalBackup(back);
    expect(v.rowsMatched).toBe(true);
    expect(v.contentMatched).toBe(true);
    // decrypted content == original export, table for table
    for (const t of doc.tables) {
      const bt = back.tables.find((x) => x.name === t.name)!;
      expect(bt.rows).toBe(t.rows);
      expect(bt.sha256Rowid).toBe(t.sha256Rowid);
    }
  });

  test("encrypted artifact contains NO plaintext (canary never leaks)", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const artifact = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const serialized = JSON.stringify(artifact);
    expect(serialized).not.toContain("STAGE24B-CANARY-VALUE");
    expect(serialized).not.toContain("nexus-logical-backup\",\"version"); // no embedded plaintext doc
    // while the plaintext doc itself DOES contain the canary (sanity of the check)
    expect(JSON.stringify(doc)).toContain("STAGE24B-CANARY-VALUE");
    // and the decrypted doc too
    const back = BackupService.decryptBackupDoc(artifact, Buffer.from(KEY_HEX, "hex"));
    expect(JSON.stringify(back)).toContain("STAGE24B-CANARY-VALUE");
  });

  test("tamper (ciphertext modified) -> fail closed with a clear cause", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const artifact = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const tampered: EncryptedBackupDoc = JSON.parse(JSON.stringify(artifact));
    const ct = tampered.ciphertext;
    tampered.ciphertext = (ct[0] === "A" ? "B" : "A") + ct.slice(1); // same length, different byte
    expect(() => BackupService.decryptBackupDoc(tampered, Buffer.from(KEY_HEX, "hex"))).toThrow(/ciphertext integrity check failed/);
  });

  test("tamper (GCM tag modified, ciphertext hash still valid) -> fail closed at decryption", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const artifact = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    const tampered: EncryptedBackupDoc = JSON.parse(JSON.stringify(artifact));
    tampered.tag = (tampered.tag[0] === "0" ? "1" : "0") + tampered.tag.slice(1); // valid hex, wrong tag
    // ciphertext unchanged so its sha256 still matches — only the auth tag is wrong
    expect(() => BackupService.decryptBackupDoc(tampered, Buffer.from(KEY_HEX, "hex"))).toThrow(/decryption failed/);
  });

  test("wrong key -> fail closed (never a garbage plaintext)", () => {
    const doc = BackupService.exportLogicalBackup(app.db);
    const artifact = BackupService.encryptBackupDoc(doc, Buffer.from(KEY_HEX, "hex"));
    expect(() => BackupService.decryptBackupDoc(artifact, Buffer.from(WRONG_KEY_HEX, "hex"))).toThrow(/decryption failed/);
  });

  test("peekBackupFormat distinguishes the three shapes", () => {
    const p = `${TMP}/peek`;
    const enc = BackupService.encryptBackupDoc(BackupService.exportLogicalBackup(app.db), Buffer.from(KEY_HEX, "hex"));
    writeFileSync(`${p}-enc.json`, JSON.stringify(enc));
    writeFileSync(`${p}-plain.json`, JSON.stringify(BackupService.exportLogicalBackup(app.db)));
    writeFileSync(`${p}-junk.json`, "this is not json at all");
    expect(BackupService.peekBackupFormat(`${p}-enc.json`)).toBe("encrypted");
    expect(BackupService.peekBackupFormat(`${p}-plain.json`)).toBe("plaintext");
    expect(BackupService.peekBackupFormat(`${p}-junk.json`)).toBe("unknown");
    expect(BackupService.peekBackupFormat(`${p}-missing.json`)).toBe("unknown");
  });

  test("parseBackupEncryptionKey: unset / invalid / valid", () => {
    expect(BackupService.parseBackupEncryptionKey(undefined)).toEqual({ configured: false, invalid: false });
    expect(BackupService.parseBackupEncryptionKey("   ")).toEqual({ configured: false, invalid: false });
    const bad = BackupService.parseBackupEncryptionKey("not-hex-at-all");
    expect(bad.configured).toBe(false);
    expect(bad.invalid).toBe(true);
    expect(BackupService.parseBackupEncryptionKey(KEY_HEX).configured).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scheduler, route level (key configured)
// ---------------------------------------------------------------------------
describe("scheduler with a key: verified encrypted on-volume + off-volume artifacts", () => {
  test("export: 201, encrypted on-volume, verified encrypted off-volume, no tmp residue", async () => {
    const r = await req("/railway/backup/export", { method: "POST", headers: owner });
    expect(r.status).toBe(201);
    const data = (await r.json()) as any;
    expect(data.data.ok).toBe(true);
    expect(data.data.encrypted).toBe(true);
    expect(data.data.verification.rowsMatched).toBe(true);
    expect(data.data.offsite.copied).toBe(true);
    expect(data.data.offsite.encrypted).toBe(true);

    const onVol = data.data.file as string;
    const offVol = data.data.offsite.file as string;
    expect(existsSync(onVol)).toBe(true);
    expect(existsSync(offVol)).toBe(true);
    // byte-identical (the copy is verified by read-back hash inside the run)
    expect(sha(readFileSync(onVol))).toBe(sha(readFileSync(offVol)));
    // the artifact is an ENCRYPTED envelope, not a plaintext doc
    expect(readFileSync(onVol).subarray(0, 320).toString("utf8")).toContain("nexus-logical-backup-encrypted");
    expect(readFileSync(onVol).toString("utf8")).not.toContain("STAGE24B-CANARY-VALUE");
    // no half-written junk anywhere
    expect(readdirSync(backupDir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(readdirSync(OFFSITE).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  test("listing: encrypted history, honest off-volume RPO state, no alerts", () => {
    const s = app.listLogicalBackups();
    expect(s.encryption.configured).toBe(true);
    expect(s.encryption.invalid).toBe(false);
    expect(s.history[0]!.encrypted).toBe(true);
    expect(s.rpo.offVolume.enabled).toBe(true);
    expect(s.rpo.offVolume.encrypted).toBe(true);
    expect(s.alerts).toEqual([]);
    expect(s.alerting.webhookConfigured).toBe(false); // this instance has no webhook
  });

  test("download route: ciphertext bytes + x-backup-encrypted: true + integrity headers", async () => {
    const s = app.listLogicalBackups();
    const name = s.history[0]!.file;
    const r = await req(`/railway/backup/export/${name}/download`, { headers: { Authorization: `Bearer ${OWNER_KEY}` } });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-backup-encrypted")).toBe("true");
    expect(r.headers.get("x-backup-sha256")).toBe(sha(readFileSync(join(backupDir, name))));
    expect(sha(await r.text())).toBe(sha(readFileSync(join(backupDir, name))));
  });

  test("restore route: decrypts, verifies in isolation, never touches the live store", async () => {
    const s = app.listLogicalBackups();
    const name = s.history[0]!.file;
    const before = BackupService.exportLogicalBackup(app.db);
    const r = await req("/railway/backup/restore", { method: "POST", headers: owner, body: JSON.stringify({ file: name }) });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.data.encrypted).toBe(true);
    expect(body.data.report.restored).toBe(true);
    expect(body.data.report.perTable.every((p: any) => p.contentMatch)).toBe(true);
    // restore-log records the format
    const log = JSON.parse(readFileSync(body.data.log, "utf8"));
    expect(log.encrypted).toBe(true);
    // live store untouched (metrics excluded: per-request writer)
    const after = BackupService.exportLogicalBackup(app.db);
    for (const b of before.tables) {
      if (b.name === "metrics") continue;
      const a = after.tables.find((x) => x.name === b.name)!;
      expect(a.sha256Rowid).toBe(b.sha256Rowid);
    }
  });

  test("CLI restores the off-volume ENCRYPTED artifact; without the key it fails closed (exit 2)", async () => {
    const s = app.listLogicalBackups();
    const offVol = s.lastRun!.offsite!.file!;
    const targetPath = `${TMP}/cli-restore-${Date.now()}.db`;
    const okRun = Bun.spawnSync(["bun", "run", "restore", "--file", offVol, "--db", targetPath], {
      cwd: import.meta.dir + "/../..",
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, NEXUS_BACKUP_ENCRYPTION_KEY: KEY_HEX },
    });
    expect(okRun.exitCode).toBe(0);
    expect(String(okRun.stdout)).toContain("encrypted artifact decoded");
    const targetPath2 = `${TMP}/cli-restore2-${Date.now()}.db`;
    const noKey = Bun.spawnSync(["bun", "run", "restore", "--file", offVol, "--db", targetPath2], {
      cwd: import.meta.dir + "/../..",
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, NEXUS_BACKUP_ENCRYPTION_KEY: "" },
    });
    expect(noKey.exitCode).toBe(2);
    expect(String(noKey.stderr)).toContain("could not be decoded");
    expect(existsSync(targetPath2)).toBe(false); // nothing written on refusal
  });

  test("tampered ON-VOLUME artifact is rejected by the restore route (400, before any write)", async () => {
    const r0 = await req("/railway/backup/export", { method: "POST", headers: owner });
    const file = ((await r0.json()) as any).data.file as string;
    const name = file.split("/").pop()!;
    const artifact: EncryptedBackupDoc = JSON.parse(readFileSync(file, "utf8"));
    artifact.ciphertext = (artifact.ciphertext[0] === "A" ? "B" : "A") + artifact.ciphertext.slice(1);
    writeFileSync(file, JSON.stringify(artifact));
    const r = await req("/railway/backup/restore", { method: "POST", headers: owner, body: JSON.stringify({ file: name }) });
    expect(r.status).toBe(400);
    const body = (await r.json()) as any;
    expect(body.error).toBe("validation");
    expect(String(body.detail)).toMatch(/could not be decoded/);
  });

  test("stale *.json.tmp junk (crashed-run remnants) is swept on the next run", async () => {
    writeFileSync(join(backupDir, "stale-from-crash.json.tmp"), "half-written junk");
    const r = await req("/railway/backup/export", { method: "POST", headers: owner });
    const data = (await r.json()) as any;
    expect(data.data.tmpSwept).toBeGreaterThanOrEqual(1);
    expect(existsSync(join(backupDir, "stale-from-crash.json.tmp"))).toBe(false);
    expect(readdirSync(backupDir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  test("two-sided retention: both dirs converge to the retention count", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await req("/railway/backup/export", { method: "POST", headers: owner });
      expect(r.status).toBe(201);
      await new Promise((res) => setTimeout(res, 3)); // distinct ms timestamps -> distinct filenames
    }
    expect(readdirSync(backupDir).filter((f) => f.endsWith(".json")).length).toBe(3);
    expect(readdirSync(OFFSITE).filter((f) => f.endsWith(".json")).length).toBe(3);
    const s = app.listLogicalBackups();
    expect(s.historyCount).toBe(3);
    expect(s.history.every((h) => h.encrypted)).toBe(true);
    // every surviving file is a complete, parseable encrypted envelope
    for (const f of readdirSync(backupDir).filter((x) => x.endsWith(".json"))) {
      const parsed = JSON.parse(readFileSync(join(backupDir, f), "utf8"));
      expect(parsed.format).toBe("nexus-logical-backup-encrypted");
    }
    for (const f of readdirSync(OFFSITE).filter((x) => x.endsWith(".json"))) {
      expect(BackupService.peekBackupFormat(join(OFFSITE, f))).toBe("encrypted");
    }
  });
});

// ---------------------------------------------------------------------------
// fail-visible behaviour WITHOUT a valid key (the new Stage 2.4B contract)
// ---------------------------------------------------------------------------
describe("no valid key: off-volume refused, on-volume continues, alert + webhook delivered", () => {
  const OFFSITE_NOKEY = `${TMP}/offsite-nokey`;
  const app2 = createApp({
    dbPath: `${TMP}/nokey/nexus.db`,
    workspaceRoot: `${TMP}/nokey/ws`,
    env: { ...envBase, NEXUS_BACKUP_OFFSITE_DIR: OFFSITE_NOKEY, NEXUS_ALERT_WEBHOOK_URL: `http://127.0.0.1:${hook.port}/alerts` },
  });

  test("export succeeds on-volume (plaintext v1) but off-volume is REFUSED — never plaintext off-volume", async () => {
    const r = await app2.app.request(new Request("http://bh.test/railway/backup/export", { method: "POST", headers: { Authorization: `Bearer ${OWNER_KEY}`, "X-Forwarded-For": "198.51.100.78" } }));
    expect(r.status).toBe(201);
    const data = (await r.json()) as any;
    expect(data.data.ok).toBe(true);
    expect(data.data.encrypted).toBe(false); // honest: on-volume is plaintext v1
    expect(data.data.offsite.copied).toBe(false);
    expect(String(data.data.offsite.error)).toMatch(/no valid encryption key/);
    // the offsite dir stays EMPTY — nothing left the volume
    expect(existsSync(OFFSITE_NOKEY) ? readdirSync(OFFSITE_NOKEY).length : 0).toBe(0);
    // on-volume artifact exists and is honestly labelled plaintext
    expect(existsSync(data.data.file)).toBe(true);
    expect(BackupService.peekBackupFormat(data.data.file)).toBe("plaintext");
  });

  test("alert recorded in the listing; RPO honestly says off-volume disabled", () => {
    const s = app2.listLogicalBackups();
    expect(s.alerts.some((a) => a.code === "OFFSITE_SKIPPED_NO_KEY")).toBe(true);
    expect(s.encryption.configured).toBe(false);
    expect(s.rpo.offVolume.enabled).toBe(false);
    expect(s.alerting.webhookConfigured).toBe(true);
    expect(s.history[0]!.encrypted).toBe(false);
  });

  test("webhook delivered with a sanitized payload (no key material, no URL echoed)", async () => {
    const delivered = await waitFor(() => WEBHOOK_DELIVERIES.length > 0);
    expect(delivered).toBe(true);
    const d = WEBHOOK_DELIVERIES[WEBHOOK_DELIVERIES.length - 1]!;
    expect(d.url).toContain(`/alerts`);
    expect(d.body.kind).toBe("backup.alert");
    expect(d.body.code).toBe("OFFSITE_SKIPPED_NO_KEY");
    const s = app2.listLogicalBackups();
    expect(s.alerting.lastDelivery?.ok).toBe(true);
    expect(s.alerting.lastDelivery?.status).toBe(200);
    // the payload carries no secrets of any kind
    const payload = JSON.stringify(d.body);
    expect(payload).not.toContain(KEY_HEX);
    expect(payload).not.toContain(WRONG_KEY_HEX);
    expect(payload).not.toContain(`http://127.0.0.1:${hook.port}`);
  });

  test("invalid key shape (set but malformed) is fail-visible at boot", () => {
    const app3 = createApp({
      dbPath: `${TMP}/badkey/nexus.db`,
      workspaceRoot: `${TMP}/badkey/ws`,
      env: { ...envBase, NEXUS_BACKUP_ENCRYPTION_KEY: "not-hex", NEXUS_BACKUP_OFFSITE_DIR: `${TMP}/offsite-badkey` },
    });
    const s = app3.listLogicalBackups();
    expect(s.encryption.invalid).toBe(true);
    expect(s.alerts.some((a) => a.code === "OFFSITE_KEY_INVALID")).toBe(true);
    app3.stopBackupScheduler();
    app3.db.close();
  });

  afterAll(() => {
    app2.stopBackupScheduler();
    app2.db.close();
  });
});

// ---------------------------------------------------------------------------
// snapshot transaction (concurrent-write protection)
// ---------------------------------------------------------------------------
describe("snapshot transaction (F-2.4A-06 concurrent-write protection)", () => {
  test("export reads run inside ONE read transaction (SAVEPOINT/RELEASE wrap)", () => {
    const db = app.db.db as { exec: (sql: string) => unknown };
    const orig = db.exec.bind(db);
    const calls: string[] = [];
    (db as any).exec = (sql: string) => { calls.push(sql); return orig(sql); };
    try {
      BackupService.exportLogicalBackup(app.db);
    } finally {
      (db as any).exec = orig;
    }
    expect(calls[0]).toBe("SAVEPOINT nexus_backup_snapshot");
    expect(calls[calls.length - 1]).toBe("RELEASE nexus_backup_snapshot");
    expect(calls.filter((c) => c.includes("SAVEPOINT")).length).toBe(1);
  });

  test("uncommitted rows from a second connection are never exported (WAL isolation)", () => {
    const conn2 = NexusDb.open(`${TMP}/live/nexus.db`);
    try {
      conn2.db.exec("BEGIN");
      conn2.run("INSERT INTO kv (key, value) VALUES ('stage24b-uncommitted', '\"nope\"')");
      const during = BackupService.exportLogicalBackup(app.db);
      expect(during.tables.find((t) => t.name === "kv")!.data.some((row: any) => row.key === "stage24b-uncommitted")).toBe(false);
      conn2.db.exec("COMMIT");
      const after = BackupService.exportLogicalBackup(app.db);
      expect(after.tables.find((t) => t.name === "kv")!.data.some((row: any) => row.key === "stage24b-uncommitted")).toBe(true);
      // and the exported snapshot verifies clean both times
      expect(BackupService.verifyLogicalBackup(during).rowsMatched).toBe(true);
      expect(BackupService.verifyLogicalBackup(after).rowsMatched).toBe(true);
    } finally {
      conn2.close();
    }
  });
});
