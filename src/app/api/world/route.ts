import { NextResponse } from "next/server";
import { backend, BackendError, type Envelope } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2 — backend-integrated world summary.
 * The Hono NEXUS API is the single source of truth; this route is a thin
 * adapter from the backend envelope to the view model consumed by the UI.
 * No local simulation runs here.
 */

interface BackendWorld {
  id: string;
  name: string;
  simulationTime: number;
  timeScale: number;
  environment: { season: string; weather: string; timeOfDay: number; dayOfYear: number };
  regions: Array<{ regionId: string; name: string; center: { x: number; y: number; z: number }; radius: number }>;
  config: { tickIntervalMs: number };
}

/** 1 tick = 10 sim-minutes = 600_000 sim-ms (backend simulation constant, life.ts SIM_MINUTES_PER_TICK). */
const SIM_MS_PER_TICK = 600_000;
const tickOf = (simTime: number) => Math.floor(simTime / SIM_MS_PER_TICK);

interface BackendWorldState {
  world: BackendWorld;
  residents: number;
  properties: number;
  businesses: number;
  vehicles: number;
  economy: { total: number; accounts: number; transactions: number };
  economyRecent: Array<{ id: string; from: string | null; to: string | null; amount: number; reason: string; simTime: number }>;
  events: number;
  memories: number;
  actionDistribution: Record<string, number>;
  recentEvents: Array<{
    seq?: number; id: string; type: string; simTime: number;
    participants: Array<{ residentId?: string; role: string }>;
    effects: Array<{ target: string; change: string }>;
  }>;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function clockOf(w: BackendWorld) {
  const hour = w.environment.timeOfDay;
  const hh = String(Math.floor(hour)).padStart(2, "0");
  const mm = String(Math.floor((hour % 1) * 60)).padStart(2, "0");
  // deterministic weekday derivation from sim day count (view-level derivation)
  const simDays = Math.floor(w.simulationTime / 86_400_000);
  const dayIdx = ((simDays % 7) + 7) % 7;
  return {
    sim_time_utc: new Date(w.simulationTime).toISOString(),
    local_time: `${hh}:${mm}`,
    local_hour: hour,
    day_of_week: WEEKDAYS[dayIdx]!,
    is_weekday: dayIdx < 5,
    is_daytime: hour >= 6 && hour < 19,
    season: w.environment.season,
  };
}

export async function GET() {
  try {
    const state = await backend.get<Envelope<BackendWorldState>>("/world/state");
    const w = state.data.world;
    const recent = state.data.recentEvents.map((e, i) => ({
      seq: e.seq ?? i + 1,
      tick: tickOf(e.simTime),
      type: e.type,
      weather: w.environment.weather,
      resident_id: e.participants[0]?.residentId,
    }));
    return NextResponse.json({
      source: "nexus-api",
      world_id: w.id,
      world_name: w.name,
      tick: tickOf(w.simulationTime),
      clock: clockOf(w),
      weather: w.environment.weather,
      population: state.data.residents,
      buildings: state.data.properties,
      districts: w.regions.length,
      roads: 0,
      roads_note: "road graph not represented in the backend store yet (honest zero)",
      events: state.data.events,
      memories: state.data.memories,
      communications: 0,
      communications_note: "communication logs land in world events; no separate count exposed yet",
      geo_counts: {},
      regions: w.regions.length,
      action_distribution: state.data.actionDistribution,
      recent_events: recent,
      economy: {
        businesses: state.data.businesses,
        by_kind: {},
        business_cash_total: null,
        revenue_total: null,
        expenses_total: null,
        wallets_total: state.data.economy.accounts,
        transactions: state.data.economy.transactions,
        salaries_paid: null,
        salaries_missed: null,
        purchases_skipped: null,
        recent_transactions: state.data.economyRecent.map((t) => ({
          tick: tickOf(t.simTime),
          purpose: t.reason,
          buyer: t.from,
          product: t.reason,
          total: t.amount,
        })),
        money_supply: state.data.economy.total,
      },
      vehicles: state.data.vehicles,
    });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

/**
 * POST { ticks, simDurationMs } — advances the AUTHORITATIVE backend world
 * (owner-authenticated server-to-server; the browser never sees the key).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ticks = Math.max(1, Math.min(144, Number(body.ticks) || 1));
    const r = await backend.post<Envelope<unknown>>("/world/advance", { ticks }, { owner: true });
    return NextResponse.json({ advanced: r.data ?? null, backend: true });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
