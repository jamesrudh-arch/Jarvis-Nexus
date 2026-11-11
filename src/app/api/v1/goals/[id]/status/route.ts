import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const goal = await db.goalRecord.findUnique({ where: { id } });
    if (!goal) return NextResponse.json({ detail: 'Goal not found.' }, { status: 404 });

    let deps: string[] = [];
    try { deps = JSON.parse(goal.dependsOnJson || '[]'); } catch { deps = []; }
    if (deps.length > 0) {
      const depGoals = await db.goalRecord.findMany({ where: { id: { in: deps } } });
      const unmet = depGoals.filter((d) => d.status !== 'completed');
      if (unmet.length > 0 && body.status === 'active') {
        return NextResponse.json(
          { detail: `Blocked on unmet dependencies: ${unmet.map((u) => u.title).join(', ')}.` },
          { status: 409 }
        );
      }
    }
    await db.goalRecord.update({
      where: { id },
      data: {
        status: String(body.status || goal.status),
        ...(body.progress !== undefined ? { progress: Math.max(0, Math.min(100, Number(body.progress))) } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
