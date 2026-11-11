import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed } from '@/lib/nexus/worldHub';

export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.securityAuditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 12 });
    return NextResponse.json({
      events: rows.map((e) => ({
        id: e.id, severity: e.severity, category: e.category,
        message: e.message, source: e.source, resolved: e.resolved,
        created_at: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
