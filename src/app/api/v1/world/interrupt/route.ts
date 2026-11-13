import { NextResponse } from 'next/server';
import { interruptForOwner } from '@/lib/nexus/worldHub';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

export async function POST(req: Request) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    const world = await interruptForOwner('Owner direct address');
    return NextResponse.json(world);
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
