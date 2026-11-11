import { NextResponse } from 'next/server';
import { serializeWorld } from '@/lib/nexus/worldHub';

export async function GET() {
  try {
    const world = await serializeWorld();
    return NextResponse.json(world);
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
