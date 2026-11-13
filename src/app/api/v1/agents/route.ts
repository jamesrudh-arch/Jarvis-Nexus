import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed } from '@/lib/nexus/worldHub';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

export async function GET(req: Request) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    await ensureSeed();
    const rows = await db.specialistAgent.findMany();
    return NextResponse.json({
      agents: rows.map((a) => ({
        id: a.id, name: a.name, role_summary: a.roleSummary,
        allowed_tools: JSON.parse(a.allowedToolsJson || '[]'),
        permission_boundary: a.permissionBoundary,
        status: a.status, last_output: a.lastOutput,
      })),
    });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
