import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSeed, serializeWorld } from '@/lib/nexus/worldHub';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

export async function POST(req: NextRequest) {
  const denied = requireOwnerKey(req);
  if (denied) return denied;
  try {
    await ensureSeed();
    const ownerName = req.nextUrl.searchParams.get('owner_name') || 'Owner';
    await db.nexusWorldState.update({
      where: { id: 1 },
      data: { firstLaunchCompleted: true, ownerName, activeMode: 'living_presence' },
    });
    const world = await serializeWorld();
    return NextResponse.json(world);
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
