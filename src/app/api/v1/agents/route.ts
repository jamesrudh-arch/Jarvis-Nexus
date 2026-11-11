import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed } from '@/lib/nexus/worldHub';

export async function GET() {
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
