import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { OPERATIONAL_MODES } from '@/lib/nexus/seed';
import { commandMoveToZone, serializeWorld } from '@/lib/nexus/worldHub';
import { requireOwnerKey } from '@/lib/nexus/ownerGuard';
import { EMBODIMENT_MODES, getSwitchMap, requireSwitchOn } from '@/lib/nexus/switchGate';

/**
 * POST /api/v1/world/mode — operational mode switch.
 * Part 13 enforcement: embodiment-specific modes (holographic presence, digital
 * human embodiment) require the Embodiment switch — mirrors the FastAPI CORE
 * gate. OFF → 403 ("JARVIS has no body in the world").
 */
export async function POST(req: NextRequest) {
  const denied = await requireOwnerKey(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const modeId = String(body.mode_id || '');
    const mode = OPERATIONAL_MODES.find((m) => m.id === modeId);
    if (!mode) {
      return NextResponse.json({ detail: `Unknown mode: ${modeId}` }, { status: 400 });
    }
    if (EMBODIMENT_MODES.has(mode.id)) {
      const switchMap = await getSwitchMap();
      const embDenied = requireSwitchOn(switchMap, 'embodiment');
      if (embDenied) return embDenied;
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
