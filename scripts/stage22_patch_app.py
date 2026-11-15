#!/usr/bin/env python3
"""Stage 2.2 / Workstream C — patcher for the app layer:
  - packages/railway/src/index.ts: export RestoreReport type
  - apps/nexus-api/src/index.ts:
      * imports (readFileSync, copyFileSync, existsSync, basename)
      * NEXUS_BACKUP_OFFSITE_DIR config + off-site copy in runLogicalBackup
      * POST /railway/backup/restore  (owner; NON-destructive isolated restore-verification)
      * GET  /railway/backup/export/:file/download (owner; integrity headers)
      * listLogicalBackups exposes offsite status
Every step is anchored and asserted; idempotent.
"""
import sys
from pathlib import Path

changed_any = False

def patch(path, steps):
    global changed_any
    p = Path(path)
    s = p.read_text()
    local_changed = False
    for name, old, new in steps:
        n = s.count(old)
        if n == 1:
            s = s.replace(old, new)
            local_changed = True
            print(f"OK    {path}: {name}")
        elif n == 0 and new in s:
            print(f"SKIP  {path}: {name} (already applied)")
        else:
            print(f"ABORT {path}: {name} (count={n})")
            sys.exit(1)
    if local_changed:
        p.write_text(s)
        changed_any = True

patch("packages/railway/src/index.ts", [
    ("export RestoreReport type",
     'export type { BackupReport, LogicalBackupDoc, RestoreVerification } from "./backup";',
     'export type { BackupReport, LogicalBackupDoc, RestoreVerification, RestoreReport } from "./backup";'),
])

patch("apps/nexus-api/src/index.ts", [
    ("fs imports",
     'import { mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";',
     'import { mkdirSync, writeFileSync, readdirSync, statSync, rmSync, readFileSync, copyFileSync, existsSync } from "node:fs";'),
    ("path imports",
     'import { join } from "node:path";',
     'import { join, basename } from "node:path";'),
    ("offsite config constant",
     '  const BACKUP_RETENTION = Math.max(1, Number(cfg.env.NEXUS_BACKUP_RETENTION ?? 14));',
     '  const BACKUP_RETENTION = Math.max(1, Number(cfg.env.NEXUS_BACKUP_RETENTION ?? 14));\n'
     '  // Stage 2.2 (G-03 minimal): off-volume copy target for the newest backup.\n'
     '  // Zero-cost, provider-independent; effective on Railway when another\n'
     '  // volume/mount is attached. S3/object-storage push stays owner-gated (D-2.1-03).\n'
     '  const OFFSITE_DIR = (cfg.env.NEXUS_BACKUP_OFFSITE_DIR ?? "").trim();'),
    ("lastBackupRun type gains offsite",
     '  let lastBackupRun: { at: string; file: string | null; tables: number; rows: number; rowsMatched: boolean; pruned: number } | null = null;',
     '  let lastBackupRun: { at: string; file: string | null; tables: number; rows: number; rowsMatched: boolean; pruned: number; offsite?: { dir: string; copied: boolean; file?: string; error?: string } | null } | null = null;'),
    ("runLogicalBackup signature gains offsite",
     '  const runLogicalBackup = (): { file: string; tables: number; rows: number; verification: ReturnType<typeof BackupService.verifyLogicalBackup>; pruned: number } => {',
     '  const runLogicalBackup = (): { file: string; tables: number; rows: number; verification: ReturnType<typeof BackupService.verifyLogicalBackup>; pruned: number; offsite: { dir: string; copied: boolean; file?: string; error?: string } | null } => {'),
    ("offsite copy after write",
     '    writeFileSync(file, JSON.stringify(doc));',
     '    writeFileSync(file, JSON.stringify(doc));\n'
     '    // Stage 2.2 (G-03 minimal): copy the newest backup off-volume when configured.\n'
     '    let offsite: { dir: string; copied: boolean; file?: string; error?: string } | null = null;\n'
     '    if (OFFSITE_DIR) {\n'
     '      try {\n'
     '        mkdirSync(OFFSITE_DIR, { recursive: true });\n'
     '        const dest = join(OFFSITE_DIR, basename(file));\n'
     '        copyFileSync(file, dest);\n'
     '        offsite = { dir: OFFSITE_DIR, copied: true, file: dest };\n'
     '      } catch (e) {\n'
     '        offsite = { dir: OFFSITE_DIR, copied: false, error: String(e) };\n'
     '        logger.error?.("backup", "off-site backup copy failed", { dir: OFFSITE_DIR, error: String(e) });\n'
     '      }\n'
     '    }'),
    ("lastBackupRun assignment gains offsite",
     '      rowsMatched: verification.rowsMatched, pruned,\n    };',
     '      rowsMatched: verification.rowsMatched, pruned, offsite,\n    };'),
    ("runLogicalBackup return gains offsite",
     '    return { file, tables: doc.tables.length, rows: doc.tables.reduce((n, t) => n + t.rows, 0), verification, pruned };',
     '    return { file, tables: doc.tables.length, rows: doc.tables.reduce((n, t) => n + t.rows, 0), verification, pruned, offsite };'),
    ("schedule exposes offsite",
     '        note: "in-process scheduler (single-instance); volume backup schedules are reported in the volumes layer",',
     '        note: "in-process scheduler (single-instance); volume backup schedules are reported in the volumes layer",\n'
     '        offsiteDir: OFFSITE_DIR || null,\n'
     '        offsiteNote: "off-volume copy target (NEXUS_BACKUP_OFFSITE_DIR); null = off-site export disabled (G-03); full object-storage push is owner-gated (D-2.1-03)",'),
    ("new routes: restore + download",
     '  app.post("/railway/reconcile", requireOwner, async (c) => {',
     '  app.post("/railway/backup/restore", requireOwner, async (c) => {\n'
     '    // Stage 2.2 (G-01): productized restore-verification. NON-DESTRUCTIVE by\n'
     '    // construction: the backup is restored into an ISOLATED verification\n'
     '    // database under <workspaceRoot>/restore-verifications/. The live store\n'
     '    // is never touched by this route. Destructive restores are CLI-only and\n'
     '    // require --confirm-destructive (apps/nexus-api/src/restore-cli.ts).\n'
     '    const body = (await c.req.json().catch(() => ({}))) as { file?: string };\n'
     '    const name = String(body.file ?? "");\n'
     '    if (!/^[\\w-]+\\.json$/.test(name)) return c.json({ error: "validation", detail: "file must be a backup filename from the backup directory" }, 400);\n'
     '    const src = join(backupDir, name);\n'
     '    if (!existsSync(src)) return c.json({ error: "not_found", detail: "no such backup in the backup directory" }, 404);\n'
     '    let doc: import("@nexus/railway").LogicalBackupDoc;\n'
     '    try { doc = JSON.parse(readFileSync(src, "utf8")); } catch { return c.json({ error: "validation", detail: "backup file is not valid JSON" }, 400); }\n'
     '    const id = `restore-${Date.now()}`;\n'
     '    const dir = join(cfg.workspaceRoot, "restore-verifications", id);\n'
     '    mkdirSync(dir, { recursive: true });\n'
     '    const targetPath = join(dir, "nexus.db");\n'
     '    const target = NexusDb.open(targetPath);\n'
     '    let report;\n'
     '    try {\n'
     '      report = BackupService.restoreLogicalBackup(target, doc);\n'
     '    } finally {\n'
     '      const logPath = join(dir, "restore-log.json");\n'
     '      writeFileSync(logPath, JSON.stringify({ id, source: src, target: targetPath, generatedAt: new Date().toISOString(), report }, null, 2));\n'
     '      target.close();\n'
     '    }\n'
     '    return c.json({ data: { id, source: src, target: targetPath, log: join(dir, "restore-log.json"), report } }, report.restored ? 200 : 422);\n'
     '  });\n'
     '  app.get("/railway/backup/export/:file/download", requireOwner, (c) => {\n'
     '    // Stage 2.2 (G-03 minimal): owner-gated off-volume export enabler —\n'
     '    // streams a backup artifact with integrity headers so the owner can\n'
     '    // copy it off-site. No provider assumed; no recurring cost.\n'
     '    const name = c.req.param("file");\n'
     '    if (!/^[\\w-]+\\.json$/.test(name)) return c.json({ error: "validation", detail: "invalid backup filename" }, 400);\n'
     '    const src = join(backupDir, name);\n'
     '    if (!existsSync(src)) return c.json({ error: "not_found" }, 404);\n'
     '    const bytes = statSync(src).size;\n'
     '    const sha256 = createHash("sha256").update(readFileSync(src)).digest("hex");\n'
     '    return c.body(readFileSync(src), 200, {\n'
     '      "content-type": "application/json",\n'
     '      "content-disposition": `attachment; filename="${name}"`,\n'
     '      "x-backup-sha256": sha256,\n'
     '      "x-backup-bytes": String(bytes),\n'
     '    });\n'
     '  });\n'
     '  app.post("/railway/reconcile", requireOwner, async (c) => {'),
])

print("ALL PATCHES APPLIED" if changed_any else "NO CHANGES NEEDED")
