import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { OPERATIONAL_MODES } from '@/lib/nexus/seed';
import { commandMoveToZone, serializeWorld } from '@/lib/nexus/worldHub';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const modeId = String(body.mode_id || '');
    const mode = OPERATIONAL_MODES.find((m) => m.id === modeId);
    if (!mode) {
      return NextResponse.json({ detail: `Unknown mode: ${modeId}` }, { status: 400 });
    }
    await db.nexusWorldState.update({
      where: { id: 1 },
      data: { activeMode: mode.id },
    });
    const world = await commandMoveToZone({
      zone_id: mode.zone,
      activity: `Engaging ${mode.label.toLowerCase()} protocol.`,
      emotional_state: 'focused',
      mode_override: mode.id,
      camera_override: mode.camera,
    });
    return NextResponse.json(world);
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
