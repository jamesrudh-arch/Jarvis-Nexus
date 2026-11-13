import { NextResponse } from 'next/server';
import { ensureSeed } from '@/lib/nexus/worldHub';

// Process start time — captured once at module load so /health reports the
// REAL boot time of this server instance (used for deploy/restart detection),
// not the time of the request.
const BOOT_TIME = new Date().toISOString();

export async function GET() {
  try {
    await ensureSeed();
    return NextResponse.json({ status: 'ok', core: 'online', boot: BOOT_TIME });
  } catch (err) {
    return NextResponse.json({ status: 'degraded', detail: (err as Error).message }, { status: 200 });
  }
}
