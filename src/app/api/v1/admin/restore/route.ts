import { NextRequest, NextResponse } from 'next/server';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';
import {
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_BYTES,
  backupHash,
  exportBackup,
  restoreBackup,
  validateBackupPayload,
  type BackupPayload,
} from '@/lib/nexus/backup';
import { db } from '@/lib/db';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * POST /api/v1/admin/restore — validated, dry-runnable, transactional restore
 * (Phase 1, Part 14). Mirrors the hardened FastAPI CORE semantics:
 *
 *   - owner key + Master switch ON required
 *   - hard payload cap (4 MiB → 413)
 *   - strict validation: unknown tables/fields, wrong types, missing tables → 400
 *   - dry_run: validates and reports without mutating
 *   - automatic pre-restore safety backup written to disk
 *   - atomic restore: deletes + creates + count verification in ONE
 *     transaction; any failure rolls back completely
 *   - audit trail for every attempt
 */
export async function POST(req: NextRequest) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    // 1. Hard payload cap — works for Content-Length and pre-parsed bodies.
    const raw = await req.text();
    if (raw.length > MAX_BACKUP_BYTES) {
      return NextResponse.json(
        { detail: `Backup payload too large (${raw.length} bytes; cap ${MAX_BACKUP_BYTES}).` },
        { status: 413 },
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ detail: 'Malformed JSON payload.' }, { status: 400 });
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ detail: 'Payload must be a JSON object.' }, { status: 400 });
    }

    // 2. Strict validation.
    const validation = validateBackupPayload(payload);
    if (!validation.ok) {
      return NextResponse.json(
        { detail: 'Backup payload rejected by validation.', errors: validation.errors.slice(0, 50) },
        { status: 400 },
      );
    }

    const dryRun = String((payload as Record<string, unknown>).dry_run ?? '') === 'true';
    const p = payload as BackupPayload;

    if (dryRun) {
      return NextResponse.json({
        status: 'dry_run',
        would_restore: validation.counts,
        hash: backupHash(p),
      });
    }

    // 3. Pre-restore safety backup (restorable state before any mutation).
    const safetyDir = join(process.cwd(), 'db', 'backups');
    try {
      mkdirSync(safetyDir, { recursive: true });
      const safety = await exportBackup();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      writeFileSync(join(safetyDir, `pre-restore-safety-${stamp}.json`), JSON.stringify(safety));
    } catch (e) {
      return NextResponse.json(
        { detail: `Pre-restore safety backup failed — restore aborted: ${(e as Error).message}` },
        { status: 500 },
      );
    }

    // 4. Atomic restore with in-transaction count verification.
    const restored = await restoreBackup(p);

    // 5. Audit + result.
    await db.securityAuditEvent.create({
      data: {
        severity: 'warning',
        category: 'admin_restore',
        message: `Database restored from backup ${backupHash(p)} (${JSON.stringify(restored)}). Safety backup written.`,
        source: 'AdminRestore',
        resolved: true,
      },
    });
    return NextResponse.json({
      status: 'restored',
      restored,
      schema_version: BACKUP_SCHEMA_VERSION,
      hash: backupHash(p),
    });
  } catch (err) {
    await db.securityAuditEvent
      .create({
        data: {
          severity: 'error',
          category: 'admin_restore',
          message: `Restore FAILED (rolled back): ${(err as Error).message}`,
          source: 'AdminRestore',
          resolved: true,
        },
      })
      .catch(() => {});
    return NextResponse.json(
      { detail: `Restore failed and was rolled back: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
