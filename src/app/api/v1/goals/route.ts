import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed } from '@/lib/nexus/worldHub';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

function serializeGoal(g: {
  id: string; title: string; description: string; priority: number; status: string;
  progress: number; dependsOnJson: string; scheduleSpec: string; nextAction: string;
}) {
  let deps: string[] = [];
  try { deps = JSON.parse(g.dependsOnJson || '[]'); } catch { deps = []; }
  let unmet: string[] = [];
  void deps;
  return {
    id: g.id, title: g.title, description: g.description, priority: g.priority,
    status: g.status, progress: g.progress, schedule_spec: g.scheduleSpec,
    next_action: g.nextAction, unmet_dependencies: unmet,
  };
}

export async function GET(req: Request) {
  const denied = requireOwnerKey(req);
  if (denied) return denied;
  try {
    await ensureSeed();
    const rows = await db.goalRecord.findMany({ orderBy: [{ priority: 'asc' }] });
    const all = new Map(rows.map((g) => [g.id, g.status]));
    return NextResponse.json(
      rows.map((g) => {
        const s = serializeGoal(g);
        let deps: string[] = [];
        try { deps = JSON.parse(g.dependsOnJson || '[]'); } catch { deps = []; }
        s.unmet_dependencies = deps.filter((d) => all.get(d) !== 'completed');
        return s;
      })
    );
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireOwnerKey(req);
  if (denied) return denied;
  try {
    await ensureSeed();
    const body = await req.json();
    if (!body.title || !body.description) {
      return NextResponse.json({ detail: 'Title and description are required.' }, { status: 400 });
    }
    await db.goalRecord.create({
      data: {
        title: String(body.title).slice(0, 190),
        description: String(body.description).slice(0, 1000),
        priority: [1, 2, 3].includes(Number(body.priority)) ? Number(body.priority) : 2,
        status: 'active',
        nextAction: 'Registered by Owner.',
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
