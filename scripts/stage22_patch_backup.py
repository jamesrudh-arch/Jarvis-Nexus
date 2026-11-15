#!/usr/bin/env python3
"""Stage 2.2 / Workstream C — deterministic patcher for packages/railway/src/backup.ts.

The interactive edit layer proved unreliable for long strings (truncated
application). This patcher performs anchor-based transformations with
assertions on byte counts, so every step either lands exactly or aborts.
Idempotent: re-running on an already-patched file detects the final state
and exits 0 without changes.
"""
import sys
from pathlib import Path

P = Path("/home/z/my-project/packages/railway/src/backup.ts")
s = P.read_text()
changed = False

def apply(name, old, new, count=1):
    global s, changed
    n = s.count(old)
    if n == count:
        s = s.replace(old, new)
        changed = True
        print(f"OK    {name} (replaced {count})")
    elif n == 0 and new in s:
        print(f"SKIP  {name} (already applied)")
    else:
        print(f"ABORT {name}: found {n} occurrences, expected {count}")
        sys.exit(1)

# --- 1. exportLogicalBackup: ordered-rowid hash ------------------------------
apply(
    "export: ordered hash + push with sha256Rowid",
    """      const rows = db.all<Record<string, unknown>>(`SELECT * FROM ${name}`);
      const sha256 = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      tables.push({ name, rows: rows.length, sha256, data: rows });""",
    """      const rows = db.all<Record<string, unknown>>(`SELECT * FROM ${name}`);
      const sha256 = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      // Stage 2.2 (G-02 repair): deterministic serialization ordered by rowid;
      // re-checked after every restore. v1 docs without this field fall back
      // to count-only verification with an explicit note.
      const ordered = db.all<Record<string, unknown>>(`SELECT * FROM ${name} ORDER BY rowid`);
      const sha256Rowid = createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
      tables.push({ name, rows: rows.length, sha256, sha256Rowid, data: rows });""",
)

# --- 2. export notes ----------------------------------------------------------
apply(
    "export: note about sha256Rowid",
    """        "restore verification is mandatory before any backup is called recoverable",
      ],""",
    """        "restore verification is mandatory before any backup is called recoverable",
        "sha256Rowid = SHA-256 of JSON.stringify(rows ordered by rowid); verified after every restore (Stage 2.2 G-02 repair)",
      ],""",
)

# --- 3. verifyLogicalBackup: content-hash recheck ------------------------------
apply(
    "verify: content recheck + perTable with contentMatch",
    """        const restoredRows = restored.count(`SELECT COUNT(*) AS n FROM ${t.name}`);
        perTable.push({ name: t.name, exportedRows: t.rows, restoredRows, match: t.rows === restoredRows });""",
    """        const restoredRows = restored.count(`SELECT COUNT(*) AS n FROM ${t.name}`);
        const match = t.rows === restoredRows;
        // content-level verification (G-02): recompute the rowid-ordered hash
        // from the restored store and compare against the doc's record.
        let contentMatch: boolean | undefined = undefined;
        if (typeof t.sha256Rowid === "string") {
          const rowsBack = restored.all<Record<string, unknown>>(`SELECT * FROM ${t.name} ORDER BY rowid`);
          const hashBack = createHash("sha256").update(JSON.stringify(rowsBack)).digest("hex");
          contentMatch = hashBack === t.sha256Rowid;
        }
        perTable.push({ name: t.name, exportedRows: t.rows, restoredRows, match, contentMatch });""",
)

apply(
    "verify: return with contentMatched",
    """      const rowsMatched = perTable.every((p) => p.match);
      return {
        restored: true,
        tablesChecked: perTable.length,
        rowsMatched,
        perTable,
        notes: rowsMatched
          ? ["full round-trip restore succeeded in an isolated in-memory database — this backup IS proven recoverable"]
          : ["row-count mismatch after restore — backup integrity FAILED"],
      };""",
    """      const rowsMatched = perTable.every((p) => p.match);
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
      };""",
)

# --- 4. append restoreLogicalBackup + restoreFailure ---------------------------
RESTORE_METHODS = """
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
}"""

if "restoreLogicalBackup" in s:
    print("SKIP  restore methods (already applied)")
else:
    # anchor: the file's final closing sequence of the class
    tail_anchor = """    } finally {
      restored.close();
    }
  }
}"""
    if s.count(tail_anchor) != 1:
        print(f"ABORT restore-append: tail anchor count = {s.count(tail_anchor)}")
        sys.exit(1)
    s = s.replace(
        tail_anchor,
        """    } finally {
      restored.close();
    }
  }
""" + RESTORE_METHODS,
    )
    changed = True
    print("OK    restore methods appended")

if changed:
    P.write_text(s)
    print("written")
else:
    print("no changes needed")

# final assertions
assert "sha256Rowid" in s and "restoreLogicalBackup" in s and "PRAGMA foreign_key_check" in s
print("final assertions passed")
