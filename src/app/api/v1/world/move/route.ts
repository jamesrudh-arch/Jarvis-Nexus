import { NextRequest, NextResponse } from 'next/server';
import { commandMoveToZone } from '@/lib/nexus/worldHub';
import { SPATIAL_ZONES } from '@/lib/nexus/seed';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';

export async function POST(req: NextRequest) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const zoneId = String(body.zone_id || 'central_operations');
    if (!SPATIAL_ZONES[zoneId]) {
      return NextResponse.json({ detail: `Unknown zone: ${zoneId}` }, { status: 400 });
    }
    const world = await commandMoveToZone({
      zone_id: zoneId,
      activity: String(body.activity || `Walking to ${SPATIAL_ZONES[zoneId].label}.`),
      emotional_state: String(body.emotional_state || 'focused'),
      urgent: Boolean(body.urgent),
      mode_override: body.mode_override || null,
    });
    return NextResponse.json(world);
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
