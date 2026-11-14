import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { worldSummary, getWorldContext } from "@/lib/nexus/state";
import { runTicks } from "@/lib/nexus/engine";
import { EconomyEngine } from "@/lib/nexus/economy";
import { ensureBootstrapped } from "@/lib/nexus/boot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureBootstrapped(db);
    return NextResponse.json(await worldSummary(db));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST { ticks: number, cognition?: boolean }
 * Advances the world deterministically — resident behaviour + economy layer
 * (salaries, purchases, restocks, grants). With cognition: true, one
 * ambiguous decision per tick may be delegated to the GLM cognition layer
 * (ADR-003 layer 2, validated choice + utility fallback).
 */
export async function POST(req: Request) {
  try {
    await ensureBootstrapped(db);
    const body = await req.json().catch(() => ({}));
    const ticks = Math.max(1, Math.min(144, Number(body.ticks) || 1));
    const useCognition = body.cognition === true;
    const ctx = await getWorldContext(db);
    const economy = await new EconomyEngine(ctx.store, ctx.seed).init();
    // build a stepping engine (the read-model engine has no behaviour hooks)
    const { ResidentEngine } = await import("@/lib/nexus/engine");
    const options: { economy: EconomyEngine; cognition?: import("@/lib/nexus/engine").Cognition } = { economy };
    if (useCognition) {
      const { Gl_mCognition } = await import("@/lib/nexus/cognition");
      options.cognition = new Gl_mCognition();
    }
    const engine = await new ResidentEngine(ctx.store, ctx.layout, ctx.seed, db, options).init();
    const t0 = Date.now();
    const result = await runTicks(db, ctx.store, engine, ticks);
    const summary = await worldSummary(db);
    return NextResponse.json({
      advanced: result,
      wall_ms: Date.now() - t0,
      world: summary,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
