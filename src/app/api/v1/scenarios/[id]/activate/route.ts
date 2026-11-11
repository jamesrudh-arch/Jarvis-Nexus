import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { commandMoveToZone, ensureSeed, serializeWorld, setScenarioRuntime } from '@/lib/nexus/worldHub';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await ensureSeed();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const sc = await db.scenarioDefinition.findUnique({ where: { id } });
    if (!sc) return NextResponse.json({ detail: 'Scenario not found.' }, { status: 404 });

    const defaultVars: Record<string, number> = {};
    for (const v of JSON.parse(sc.variablesJson || '[]')) {
      defaultVars[v.key] = v.default;
    }
    setScenarioRuntime({
      scenario_id: sc.id,
      title: sc.title,
      classification: sc.classification,
      variables: { ...defaultVars, ...(body.variables || {}) },
      playing: body.playing !== undefined ? Boolean(body.playing) : true,
      current_time: 0.0,
      playback_rate: 1.0,
    });

    await commandMoveToZone({
      zone_id: 'simulation_stage',
      activity: `Directing "${sc.title}" on the Volumetric Stage.`,
      emotional_state: 'focused',
      mode_override: 'simulation_comparison',
    });
    const world = await serializeWorld();
    return NextResponse.json({ world, runtime: world.active_scenario });
  } catch (err) {
    return NextResponse.json({ detail: (err as Error).message }, { status: 500 });
  }
}
