import { NextResponse } from 'next/server';
import { commandMoveToZone, serializeWorld, setScenarioRuntime } from '@/lib/nexus/worldHub';

export async function POST() {
  try {
    setScenarioRuntime(null);
    const world = await commandMoveToZone({
      zone_id: 'central_operations',
      activity: 'Standing by at Central Operations.',
      emotional_state: 'attentive',
      mode_override: 'living_presence',
    });
    return NextResponse.json(world);
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
