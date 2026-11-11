import { NextResponse } from 'next/server';
import { gatherTelemetry } from '@/lib/nexus/telemetry';
import { ensureSeed } from '@/lib/nexus/worldHub';

export async function GET() {
  try {
    await ensureSeed();
    const tel = await gatherTelemetry();
    return NextResponse.json(tel);
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
