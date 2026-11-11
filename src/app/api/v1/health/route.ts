import { NextResponse } from 'next/server';
import { ensureSeed } from '@/lib/nexus/worldHub';

export async function GET() {
  try {
    await ensureSeed();
    return NextResponse.json({ status: 'ok', core: 'online', boot: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ status: 'degraded', detail: (err as Error).message }, { status: 200 });
  }
}
