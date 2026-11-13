/**
 * JARVIS NEXUS — living-residents world-state surface (directive §4).
 *
 * GET  /api/v1/world/residents  — public status read (roster + positions;
 *                                 no credentials, no mutations — matches the
 *                                 public status-surface policy of Gate 0).
 * PATCH                          — owner-key guarded: persist the residents'
 *                                 live state (positions/yaw/activity) into
 *                                 NexusWorldState.residentsJson.
 */
import { NextRequest, NextResponse } from 'next/server';

import { requireOwnerKey } from '@/lib/nexus/ownerGuard';
import { ensureSeed, persistResidents, serializeWorld } from '@/lib/nexus/worldHub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSeed();
  const world = await serializeWorld();
  return NextResponse.json({ residents: world.residents });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const list = Array.isArray(body?.residents) ? body.residents : [];
    if (list.length === 0) {
      return NextResponse.json({ detail: 'residents[] required' }, { status: 400 });
    }
    // sanity: at most 16 residents, coordinates bounded to the sanctuary disc
    const bounded = list
      .slice(0, 16)
      .filter((r: { x?: number; z?: number }): r is { id: string; x: number; z: number; yaw?: number; activity?: string } => {
        const x = Number(r?.x);
        const z = Number(r?.z);
        const id = (r as { id?: unknown }).id;
        return typeof id === 'string'
          && Number.isFinite(x) && Number.isFinite(z)
          && Math.hypot(x, z) <= 16;
      });
    if (bounded.length === 0) {
      return NextResponse.json(
        { detail: 'no valid resident states (id/x/z required, within the sanctuary)' },
        { status: 400 },
      );
    }
    const result = await persistResidents(bounded);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ detail: 'invalid JSON body' }, { status: 400 });
  }
}
