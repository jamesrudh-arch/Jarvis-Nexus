import { NextResponse } from "next/server";
import { backend, BackendError, type Envelope } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2 — system view from the AUTHORITATIVE backend
 * (/health/detailed, /metrics, /world/state). Runtime info describes THIS
 * Next.js server; everything operational comes from the backend. Environment
 * listing exposes variable NAMES + set/unset only — never values.
 */

interface BackendHealth {
  overall: string;
  components: Array<{ component: string; status: string; detail: string; checkedAt: string }>;
}
interface BackendWorldState {
  world: { id: string; name: string; simulationTime: number; environment: { weather: string; timeOfDay: number }; config: { tickIntervalMs: number } };
  residents: number; events: number; memories: number;
  actionDistribution: Record<string, number>;
}

/** 1 tick = 10 sim-minutes = 600_000 sim-ms (backend simulation constant). */
const SIM_MS_PER_TICK = 600_000;

export async function GET() {
  try {
    const [health, world, metrics] = await Promise.all([
      backend.get<BackendHealth>("/health/detailed"),
      backend.get<Envelope<BackendWorldState>>("/world/state"),
      backend.get<{ counters: Array<{ name: string; labels: Record<string, string>; count: number }>; db: Array<{ name: string; total: number }> }>("/metrics"),
    ]);

    const dbComponent = health.components.find((c) => c.component === "database");
    const railwayComponent = health.components.find((c) => c.component.startsWith("railway"));
    const modelComponent = health.components.find((c) => c.component === "model_fabric");

    const blockers: Array<{ id: string; title: string; impact: string; required: string }> = [];
    if (railwayComponent && railwayComponent.status !== "healthy") {
      blockers.push({
        id: "railway-intelligence",
        title: `Railway intelligence: ${railwayComponent.status}`,
        impact: railwayComponent.detail,
        required: "Provide RAILWAY_API_TOKEN (Railway dashboard env) to activate live infrastructure intelligence.",
      });
    }
    if (modelComponent && modelComponent.status !== "healthy") {
      blockers.push({
        id: "model-fabric",
        title: `Model fabric: ${modelComponent.status}`,
        impact: modelComponent.detail,
        required: "Verify provider credentials via POST /models/verify (owner); the fabric fails closed rather than faking intelligence.",
      });
    }
    if (health.overall !== "healthy") {
      blockers.push({
        id: "aggregate",
        title: `Aggregate health: ${health.overall}`,
        impact: "At least one backend component is degraded — see /health/detailed.",
        required: "Inspect the failing component's detail; owner action where credentials or infrastructure are needed.",
      });
    }

    const counts: Record<string, number> = {};
    for (const m of metrics.db ?? []) counts[m.name] = m.total;

    return NextResponse.json({
      app: "JARVIS NEXUS — Visual Application",
      engine: `Next.js (server: ${process.version})`,
      backend: {
        url: backend.apiUrl,
        overall: health.overall,
        components: health.components.map((c) => ({ component: c.component, status: c.status })),
      },
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      database: {
        provider: "sqlite (backend @nexus/db)",
        url_shape: "backend volume (NEXUS_DB_PATH)",
        migrations: dbComponent?.detail ?? "unknown",
        counts,
      },
      environment: {
        NEXUS_API_URL: process.env.NEXUS_API_URL ? "set" : "default (production URL)",
        OWNER_KEY: process.env.OWNER_KEY ? "set (server-only)" : "NOT SET — consequential actions unavailable",
        NODE_ENV: process.env.NODE_ENV ?? "development",
      },
      world: {
        tick: Math.floor(world.data.world.simulationTime / SIM_MS_PER_TICK),
        sim_time: new Date(world.data.world.simulationTime).toISOString(),
        population: world.data.residents,
        weather: world.data.world.environment.weather,
      },
      blockers,
      honesty: "Every status on this page is measured from the live backend. Degraded means degraded; unconfigured means unconfigured. Nothing is fabricated for presentation.",
    });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message, honesty: "backend unreachable — this view refuses to invent status" }, { status });
  }
}
