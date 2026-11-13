import { NextResponse } from 'next/server';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';
import { backupHash, exportBackup } from '@/lib/nexus/backup';
import { db } from '@/lib/db';

/**
 * GET /api/v1/admin/backup — export a full database backup (Phase 1, Part 14).
 *
 * Requires: owner key AND Master switch ON (mirrors the FastAPI CORE rule).
 * Secrets are excluded by policy — none live in this database; sensitive
 * memory contents are exported as '[REDACTED_SENSITIVE]' markers only.
 */
export async function GET(req: Request) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    const payload = await exportBackup();
    await db.securityAuditEvent.create({
      data: {
        severity: 'info',
        category: 'admin_backup',
        message: `Database backup exported (${backupHash(payload)}). Secrets excluded by policy.`,
        source: 'AdminBackup',
        resolved: true,
      },
    });
    return NextResponse.json({
      ...payload,
      hash: backupHash(payload),
      counts: Object.fromEntries(Object.entries(payload.tables).map(([k, v]) => [k, v.length])),
    });
  } catch (err) {
    return NextResponse.json({ detail: `Backup failed: ${(err as Error).message}` }, { status: 500 });
  }
}
