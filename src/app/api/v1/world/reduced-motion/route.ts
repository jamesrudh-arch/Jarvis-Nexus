import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { serializeWorld } from '@/lib/nexus/worldHub';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

export async function POST(req: NextRequest) {
  const denied = requireOwnerKey(req);
  if (denied) return denied;
  try {
    const enabled = req.nextUrl.searchParams.get('enabled') === 'true';
    await db.nexusWorldState.update({
      where: { id: 1 },
      data: { reducedMotion: enabled },
    });
    const world = await serializeWorld();
    return NextResponse.json(world);
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
