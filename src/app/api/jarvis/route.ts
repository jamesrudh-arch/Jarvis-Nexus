import { NextResponse } from "next/server";
import { backend, BackendError, type Envelope } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2 — JARVIS task feed from the AUTHORITATIVE backend
 * orchestrator repository (GET /jarvis/tasks). States are the orchestrator's
 * real state machine values — never smoothed for presentation.
 */

interface BackendJarvisTask {
  id: string; objective: string; origin: string; state: string;
  evaluation?: { objectiveMet: boolean; summary: string };
  createdAt: string; updatedAt: string;
}

export async function GET() {
  try {
    const r = await backend.get<Envelope<BackendJarvisTask[]>>("/jarvis/tasks");
    return NextResponse.json({
      tasks: r.data.slice(-30).reverse().map((t) => ({
        id: t.id, objective: t.objective, origin: t.origin, state: t.state,
        objective_met: t.evaluation?.objectiveMet ?? null,
        summary: t.evaluation?.summary ?? null,
        updated_at: t.updatedAt,
      })),
      source: "nexus-api",
    });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
