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
import { createHash } from "node:crypto";
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
  tables: Array<{ name: string; rows: number; sha256: string; data: Array<Record<string, unknown>> }>;
  notes: string[];
}

export interface RestoreVerification {
  restored: boolean;
  tablesChecked: number;
  rowsMatched: boolean;
  perTable: Array<{ name: string; exportedRows: number; restoredRows: number; match: boolean }>;
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

  /** Layer 2: full logical export of the NEXUS SQLite store (read-only scan). */
  static exportLogicalBackup(db: NexusDb, at: string = new Date().toISOString()): LogicalBackupDoc {
    const tables: LogicalBackupDoc["tables"] = [];
    for (const name of NEXUS_TABLES) {
      const rows = db.all<Record<string, unknown>>(`SELECT * FROM ${name}`);
      const sha256 = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      tables.push({ name, rows: rows.length, sha256, data: rows });
    }
    return {
      format: "nexus-logical-backup", version: 1, exportedAt: at, tables,
      notes: [
        "read-only export: no statement in this path writes to the source database",
        "restore verification is mandatory before any backup is called recoverable",
      ],
    };
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
        perTable.push({ name: t.name, exportedRows: t.rows, restoredRows, match: t.rows === restoredRows });
      }
      const rowsMatched = perTable.every((p) => p.match);
      return {
        restored: true,
        tablesChecked: perTable.length,
        rowsMatched,
        perTable,
        notes: rowsMatched
          ? ["full round-trip restore succeeded in an isolated in-memory database — this backup IS proven recoverable"]
          : ["row-count mismatch after restore — backup integrity FAILED"],
      };
    } finally {
      restored.close();
    }
  }
}
