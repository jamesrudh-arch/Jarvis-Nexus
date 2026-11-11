import { NextResponse } from 'next/server';
import { interruptForOwner } from '@/lib/nexus/worldHub';

export async function POST() {
  try {
    const world = await interruptForOwner('Owner direct address');
    return NextResponse.json(world);
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
