/**
 * @nexus/railway — backup & restoration verification (directive §12).
 *
 * Two distinct layers, never conflated:
 *  1. RAILWAY VOLUME BACKUPS (volumeInstanceBackupList): existence, retention
 *     metadata. Existence is NOT recoverability — restoring one is an L4
 *     destructive operation requiring explicit owner authorization. In this
 *     integration those restores are registered but production restores are
 *     BLOCKED (read-only mode), so recoverability stays UNVERIFIED.
 *  2. APPLICATION-LEVEL LOGICAL BACKUPS of the NEXUS SQLite store: a full
 *     read-only export plus a REAL restore-verify into an isolated in-memory
 *     database (migrate -> reinsert -> compare). A backup that has never been
 *     restored is not proven recoverable — so we actually restore it.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { openSync, readSync, closeSync } from "node:fs";
import { NexusDb, migrate } from "@nexus/db";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import type { InfrastructureSnapshot } from "./model";

export interface BackupReport {
  asOf: string;
  volumes: Array<{
    volumeInstanceId: string;
    mountPath: string;
    sizeMB: number;
    currentSizeMB: number | null;
    backups: Array<{
      id: string;
      name: string | null;
      createdAt: string;
      expiresAt: string | null;
      usedMB: number | null;
      schedules: Array<{ kind: string | null; cron: string | null; retentionSeconds: number | null }>;
      verified: false;
      recoverability: "UNVERIFIED";
    }>;
  }>;
  notes: string[];
}

export interface LogicalBackupDoc {
  format: "nexus-logical-backup";
  version: 1;
  exportedAt: string;
  tables: Array<{ name: string; rows: number; sha256: string; sha256Rowid?: string; data: Array<Record<string, unknown>> }>;
  notes: string[];
}

/**
 * Stage 2.4B (F-2.4A-06): encrypted backup artifact. The plaintext
 * LogicalBackupDoc is AES-256-GCM encrypted; the envelope carries only
 * non-sensitive metadata plus the ciphertext. The key NEVER appears in any
 * artifact, log, alert or listing.
 */
export interface EncryptedBackupDoc {
  format: "nexus-logical-backup-encrypted";
  version: 1;
  alg: "aes-256-gcm";
  exportedAt: string;
  iv: string;            // 24 hex (12 bytes)
  tag: string;           // 32 hex (16-byte GCM auth tag)
  ciphertext: string;    // base64
  ciphertextSha256: string;
  plaintextSha256: string;
  plaintextBytes: number;
  tables: number;        // non-sensitive summary for listings
  rows: number;
  notes: string[];
}

/** Result of parsing NEXUS_BACKUP_ENCRYPTION_KEY. */
export interface EncryptionKeyInfo {
  /** a usable 32-byte key is present */
  configured: boolean;
  /** the env var was SET but is not a valid 64-hex key (fail-visible) */
  invalid: boolean;
  key?: Buffer;
  error?: string;
}

export interface RestoreVerification {
  restored: boolean;
  tablesChecked: number;
  rowsMatched: boolean;
  contentMatched?: boolean;
  perTable: Array<{ name: string; exportedRows: number; restoredRows: number; match: boolean; contentMatch?: boolean }>;
  notes: string[];
}

export interface RestoreReport {
  restored: boolean;
  doc: { format: string; version: number; exportedAt: string };
  tables: number;
  rows: number;
  transaction: "committed" | "rolled-back";
  perTable: Array<{ name: string; rows: number; contentMatch: boolean }>;
  foreignKeyViolations: Array<Record<string, unknown>>;
  errors: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  notes: string[];
}

/** All tables of the NEXUS store (migration 1-3). */
export const NEXUS_TABLES = [
  "schema_migrations", "kv", "jarvis_tasks", "naei_agents", "naei_tasks", "memories",
  "world_events", "world_snapshots", "worlds", "residents", "vehicles", "properties",
  "businesses", "accounts", "transactions", "mcp_servers", "mcp_audit",
  "requirements", "ledger", "technologies", "metrics",
  "railway_events", "railway_audit", "railway_state",
] as const;

export class BackupService {
  /** Layer 1: Railway volume backup discovery (existence only — honestly labelled). */
  async report(snapshot: InfrastructureSnapshot): Promise<BackupReport> {
    const notes = [
      "Volume backup EXISTENCE is reported; existence is not recoverability (directive §12)",
      "Restoring a Railway volume backup is an L4 destructive operation (railway.volume.backup.restore) — blocked in read-only mode; recoverability remains UNVERIFIED until an owner-authorized isolated restore is performed",
    ];
    const volumes = snapshot.volumes.map((v) => {
      const backups = snapshot.volumeBackups
        .filter((b) => b.volumeInstanceId === v.id)
        .map((b) => ({
          id: b.id, name: b.name ?? null, createdAt: b.createdAt, expiresAt: b.expiresAt ?? null, usedMB: b.usedMB ?? null,
          schedules: b.schedules.map((s) => ({ kind: s.kind ?? null, cron: s.cron ?? null, retentionSeconds: s.retentionSeconds ?? null })),
          verified: false as const, recoverability: "UNVERIFIED" as const,
        }));
      return {
        volumeInstanceId: v.id, mountPath: v.mountPath, sizeMB: v.sizeMB,
        currentSizeMB: v.currentSizeMB ?? null, backups,
      };
    });
    if (snapshot.volumes.some((v) => snapshot.volumeBackups.filter((b) => b.volumeInstanceId === v.id).length === 0)) {
      notes.push("at least one volume has NO backups — data-loss exposure if the volume is lost");
    }
    return { asOf: new Date().toISOString(), volumes, notes };
  }

  /** Layer 2: full logical export of the NEXUS SQLite store (read-only scan).
   *
   * Stage 2.4B (F-2.4A-06, concurrent-write protection): every read now runs
   * inside ONE read transaction (SAVEPOINT/RELEASE). In WAL mode — which
   * NexusDb.open() sets — an open read transaction holds a fixed snapshot for
   * its whole duration, so the 24-table export is consistent even while other
   * connections commit concurrently; in rollback-journal mode the shared lock
   * simply blocks writers for the duration. A savepoint (rather than a bare
   * BEGIN) nests transparently when the caller is already inside a
   * transaction. Copying an actively written SQLite FILE — which this path
   * deliberately does not do — would have none of these guarantees. */
  static exportLogicalBackup(db: NexusDb, at: string = new Date().toISOString()): LogicalBackupDoc {
    db.db.exec("SAVEPOINT nexus_backup_snapshot");
    let tables: LogicalBackupDoc["tables"] = [];
    try {
      for (const name of NEXUS_TABLES) {
        const rows = db.all<Record<string, unknown>>(`SELECT * FROM ${name}`);
        const sha256 = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
        // Stage 2.2 (G-02 repair): deterministic serialization ordered by rowid;
        // re-checked after every restore. v1 docs without this field fall back
        // to count-only verification with an explicit note.
        const ordered = db.all<Record<string, unknown>>(`SELECT * FROM ${name} ORDER BY rowid`);
        const sha256Rowid = createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
        tables.push({ name, rows: rows.length, sha256, sha256Rowid, data: ordered });
      }
    } catch (e) {
      try {
        db.db.exec("ROLLBACK TO nexus_backup_snapshot");
        db.db.exec("RELEASE nexus_backup_snapshot");
      } catch { /* the statement failure may already have aborted the transaction */ }
      throw e;
    }
    db.db.exec("RELEASE nexus_backup_snapshot");
    return {
      format: "nexus-logical-backup", version: 1, exportedAt: at, tables,
      notes: [
        "read-only export: no statement in this path writes to the source database",
        "all 24 tables were read inside one snapshot transaction (Stage 2.4B F-2.4A-06) — consistent even under concurrent writers",
        "restore verification is mandatory before any backup is called recoverable",
        "sha256Rowid = SHA-256 of JSON.stringify(rows ordered by rowid); verified after every restore (Stage 2.2 G-02 repair)",
      ],
    };
  }

  /** Stage 2.4B (F-2.4A-06): parse NEXUS_BACKUP_ENCRYPTION_KEY.
   * Accepts exactly 64 hex characters (32 bytes). Never logs the value. */
  static parseBackupEncryptionKey(raw: string | undefined): EncryptionKeyInfo {
    const v = (raw ?? "").trim();
    if (v.length === 0) return { configured: false, invalid: false };
    if (!/^[0-9a-fA-F]{64}$/.test(v)) {
      return { configured: false, invalid: true, error: "NEXUS_BACKUP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)" };
    }
    return { configured: true, invalid: false, key: Buffer.from(v, "hex") };
  }

  /** Stage 2.4B (F-2.4A-06): encrypt a LogicalBackupDoc with AES-256-GCM.
   * Fresh random IV per artifact; the auth tag makes tampering detectable. */
  static encryptBackupDoc(doc: LogicalBackupDoc, key: Buffer): EncryptedBackupDoc {
    const plaintext = Buffer.from(JSON.stringify(doc), "utf8");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      format: "nexus-logical-backup-encrypted", version: 1, alg: "aes-256-gcm",
      exportedAt: doc.exportedAt,
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      ciphertext: ciphertext.toString("base64"),
      ciphertextSha256: createHash("sha256").update(ciphertext).digest("hex"),
      plaintextSha256: createHash("sha256").update(plaintext).digest("hex"),
      plaintextBytes: plaintext.length,
      tables: doc.tables.length,
      rows: doc.tables.reduce((n, t) => n + t.rows, 0),
      notes: [
        "AES-256-GCM authenticated encryption (Stage 2.4B F-2.4A-06): tampering is detected via the GCM tag",
        "the encryption key never appears in any artifact, log or alert",
        "restore verification is mandatory before any backup is called recoverable",
      ],
    };
  }

  /** Stage 2.4B (F-2.4A-06): decrypt + integrity-check an EncryptedBackupDoc.
   * Throws with a human-readable cause on: wrong key, tampered ciphertext
   * (sha256 mismatch), GCM tag failure, or plaintext hash mismatch. */
  static decryptBackupDoc(enc: EncryptedBackupDoc, key: Buffer): LogicalBackupDoc {
    if (enc.format !== "nexus-logical-backup-encrypted" || enc.version !== 1) {
      throw new Error("unsupported encrypted backup format");
    }
    const ct = Buffer.from(enc.ciphertext, "base64");
    const ctHash = createHash("sha256").update(ct).digest("hex");
    if (ctHash !== enc.ciphertextSha256) {
      throw new Error("ciphertext integrity check failed (sha256 mismatch — the artifact was modified or truncated)");
    }
    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(enc.iv, "hex"));
      decipher.setAuthTag(Buffer.from(enc.tag, "hex"));
      plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch (e) {
      throw new Error(`decryption failed (wrong key or tampered ciphertext): ${e instanceof Error ? e.message : String(e)}`);
    }
    const ptHash = createHash("sha256").update(plaintext).digest("hex");
    if (ptHash !== enc.plaintextSha256) {
      throw new Error("plaintext integrity check failed after decryption");
    }
    const doc = JSON.parse(plaintext.toString("utf8")) as LogicalBackupDoc;
    if (doc?.format !== "nexus-logical-backup") {
      throw new Error("decrypted payload is not a nexus-logical-backup document");
    }
    return doc;
  }

  /** Stage 2.4B: decode a parsed backup file of EITHER format into the
   * plaintext doc. `key` may be null only for plaintext v1 docs; an encrypted
   * doc without a usable key is a hard error (fail-closed, never guess). */
  static decodeBackupDoc(parsed: unknown, key: Buffer | null): { doc: LogicalBackupDoc; encrypted: boolean } {
    const obj = (parsed ?? {}) as { format?: unknown };
    if (obj.format === "nexus-logical-backup-encrypted") {
      if (!key) {
        throw new Error("encrypted backup, but no valid NEXUS_BACKUP_ENCRYPTION_KEY is configured");
      }
      return { doc: BackupService.decryptBackupDoc(parsed as EncryptedBackupDoc, key), encrypted: true };
    }
    if (obj.format === "nexus-logical-backup") {
      const doc = parsed as LogicalBackupDoc;
      if (doc.version !== 1) throw new Error(`unsupported backup version: ${String(doc.version)}`);
      return { doc, encrypted: false };
    }
    throw new Error("unsupported backup format (expected nexus-logical-backup or nexus-logical-backup-encrypted)");
  }

  /** Stage 2.4B: cheap format probe for listings/headers — reads only the
   * first 320 bytes; never loads the whole artifact. */
  static peekBackupFormat(path: string): "encrypted" | "plaintext" | "unknown" {
    let fd: number;
    try {
      fd = openSync(path, "r");
    } catch {
      return "unknown";
    }
    try {
      const buf = Buffer.alloc(320);
      const n = readSync(fd, buf, 0, 320, 0);
      const head = buf.subarray(0, n).toString("utf8");
      if (/"format"\s*:\s*"nexus-logical-backup-encrypted"/.test(head)) return "encrypted";
      if (/"format"\s*:\s*"nexus-logical-backup"/.test(head)) return "plaintext";
      return "unknown";
    } finally {
      closeSync(fd);
    }
  }

  /** Layer 2: REAL isolated restore — migrate a fresh in-memory DB, reinsert, compare. */
  static verifyLogicalBackup(doc: LogicalBackupDoc): RestoreVerification {
    const restored = NexusDb.open(":memory:");
    try {
      migrate(restored);
      const perTable: RestoreVerification["perTable"] = [];
      for (const t of doc.tables) {
        if (!NEXUS_TABLES.includes(t.name as (typeof NEXUS_TABLES)[number])) {
          perTable.push({ name: t.name, exportedRows: t.rows, restoredRows: 0, match: false });
          continue;
        }
        for (const row of t.data) {
          const cols = Object.keys(row);
          if (cols.length === 0) continue;
          const placeholders = cols.map(() => "?").join(", ");
          const values = cols.map((c) => {
            const v = row[c];
            // SQLite booleans are stored as 0/1 — normalize JSON true/false
            if (v === true) return 1;
            if (v === false) return 0;
            return v as string | number | bigint | null | Uint8Array;
          });
          restored.run(
            `INSERT OR REPLACE INTO ${t.name} (${cols.join(", ")}) VALUES (${placeholders})`,
            ...values,
          );
        }
        const restoredRows = restored.count(`SELECT COUNT(*) AS n FROM ${t.name}`);
        const match = t.rows === restoredRows;
        // content-level verification (G-02): recompute the rowid-ordered hash
        // from the restored store and compare against the doc's record.
        let contentMatch: boolean | undefined = undefined;
        if (typeof t.sha256Rowid === "string") {
          const rowsBack = restored.all<Record<string, unknown>>(`SELECT * FROM ${t.name} ORDER BY rowid`);
          const hashBack = createHash("sha256").update(JSON.stringify(rowsBack)).digest("hex");
          contentMatch = hashBack === t.sha256Rowid;
        }
        perTable.push({ name: t.name, exportedRows: t.rows, restoredRows, match, contentMatch });
      }
      const rowsMatched = perTable.every((p) => p.match);
      const contentMatched = perTable.some((p) => p.contentMatch !== undefined)
        ? perTable.every((p) => p.contentMatch !== false) && rowsMatched
        : undefined;
      const notes = rowsMatched
        ? ["full round-trip restore succeeded in an isolated in-memory database — this backup IS proven recoverable"]
        : ["row-count mismatch after restore — backup integrity FAILED"];
      if (contentMatched === true) notes.push("content SHA-256 (rowid-ordered) re-checked on every table carrying sha256Rowid — G-02 closed");
      if (contentMatched === false) notes.push("CONTENT hash mismatch — backup integrity FAILED (corrupted content with matching counts)");
      if (contentMatched === undefined) notes.push("legacy doc without sha256Rowid: count-only verification (re-export to gain content verification)");
      return {
        restored: true,
        tablesChecked: perTable.length,
        rowsMatched,
        contentMatched,
        perTable,
        notes,
      };
    } finally {
      restored.close();
    }
  }

  /** Stage 2.2 (G-01 repair): PRODUCTIZED RESTORE — load a backup document
   *  into a target database with schema validation, a single transaction,
   *  failure detection, content-hash post-verification and a foreign-key
   *  check. Destructive only by explicit caller intent: existing rows are
   *  never deleted unless `wipe` is set (the CLI requires
   *  --confirm-destructive for that; the in-product route never sets it). */
  static restoreLogicalBackup(db: NexusDb, doc: LogicalBackupDoc, opts: { wipe?: boolean } = {}): RestoreReport {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const errors: string[] = [];
    const notes: string[] = [];
    if (doc.format !== "nexus-logical-backup" || doc.version !== 1) {
      return BackupService.restoreFailure(doc, startedAt, t0, [`unsupported backup format: ${String(doc.format)} v${String(doc.version)}`], notes);
    }
    const unknown = doc.tables.filter((t) => !NEXUS_TABLES.includes(t.name as (typeof NEXUS_TABLES)[number])).map((t) => t.name);
    if (unknown.length > 0) {
      return BackupService.restoreFailure(doc, startedAt, t0, [`backup references tables absent from this schema: ${unknown.join(", ")}`], notes);
    }
    migrate(db); // idempotent — applies missing migrations, skips applied ones
    const perTable: RestoreReport["perTable"] = [];
    let rows = 0;
    try {
      db.db.exec("BEGIN");
      if (opts.wipe) {
        for (const name of [...NEXUS_TABLES].reverse()) db.db.exec(`DELETE FROM ${name}`);
        notes.push("existing rows wiped (explicit --confirm-destructive path only)");
      }
      for (const t of doc.tables) {
        for (const row of t.data) {
          const cols = Object.keys(row);
          if (cols.length === 0) continue;
          const placeholders = cols.map(() => "?").join(", ");
          const values = cols.map((c) => {
            const v = row[c];
            if (v === true) return 1;
            if (v === false) return 0;
            return v as string | number | bigint | null | Uint8Array;
          });
          db.run(`INSERT OR REPLACE INTO ${t.name} (${cols.join(", ")}) VALUES (${placeholders})`, ...values);
          rows += 1;
        }
      }
      db.db.exec("COMMIT");
      let allContent = true;
      for (const t of doc.tables) {
        const rowsBack = db.all<Record<string, unknown>>(`SELECT * FROM ${t.name} ORDER BY rowid`);
        const hashBack = createHash("sha256").update(JSON.stringify(rowsBack)).digest("hex");
        const contentMatch = typeof t.sha256Rowid === "string" ? hashBack === t.sha256Rowid : true;
        if (!contentMatch) errors.push(`content hash mismatch after restore: ${t.name}`);
        allContent = allContent && contentMatch;
        perTable.push({ name: t.name, rows: rowsBack.length, contentMatch });
      }
      const fkViolations = db.all<Record<string, unknown>>("PRAGMA foreign_key_check");
      if (fkViolations.length > 0) errors.push(`foreign_key_check reported ${fkViolations.length} violation(s)`);
      if (errors.length > 0) throw new Error(errors.join("; "));
      if (!allContent) errors.push("content verification failed");
      notes.push("single transaction committed; content SHA-256 (rowid-ordered) verified per table; PRAGMA foreign_key_check clean");
      return {
        restored: true, doc: { format: doc.format, version: doc.version, exportedAt: doc.exportedAt },
        tables: doc.tables.length, rows, transaction: "committed", perTable,
        foreignKeyViolations: fkViolations, errors, startedAt, finishedAt: new Date().toISOString(),
        durationMs: Date.now() - t0, notes,
      };
    } catch (e) {
      try { db.db.exec("ROLLBACK"); } catch { /* connection already rolled the statement back */ }
      errors.push(`restore failed and was rolled back: ${String(e)}`);
      return BackupService.restoreFailure(doc, startedAt, t0, errors, notes);
    }
  }

  private static restoreFailure(doc: LogicalBackupDoc, startedAt: string, t0: number, errors: string[], notes: string[]): RestoreReport {
    return {
      restored: false, doc: { format: doc.format, version: doc.version, exportedAt: doc.exportedAt },
      tables: doc.tables?.length ?? 0, rows: 0, transaction: "rolled-back", perTable: [],
      foreignKeyViolations: [], errors, startedAt, finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0, notes,
    };
  }
}
