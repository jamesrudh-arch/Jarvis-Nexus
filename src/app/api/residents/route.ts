import { NextResponse } from "next/server";
import { backend, BackendError, type Envelope } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2 — residents from the AUTHORITATIVE backend store
 * (GET /world/residents). Fields the backend does not model (interior room
 * occupancy, JARVIS embodiment) map to honest empty values, never fabrications.
 */

interface BackendResident {
  id: string;
  worldId: string;
  name: { first: string; last: string };
  personality: { openness: number; conscientiousness: number; extraversion: number; agreeableness: number; neuroticism: number };
  needs: { energy: number; hunger: number; social: number; comfort: number; fun: number };
  goals: Array<{ goalId: string; description: string; priority: number; progress: number }>;
  homePropertyId?: string;
  employment?: { businessId?: string; role?: string; salaryPerHour: number; schedule: { startHour: number; endHour: number; days: number[] } };
  financialAccountId?: string;
  emotionalState: { mood: number; lastMoodUpdateSimTime: number };
  currentActivity: string;
  currentActivityDetail?: string;
  position: { x: number; y: number; z: number };
  fidelity: string;
  alive: boolean;
}

export async function GET() {
  try {
    const r = await backend.get<Envelope<BackendResident[]>>("/world/residents");
    const residents = r.data.map((res) => ({
      resident_id: res.id,
      name: `${res.name.first} ${res.name.last}`,
      role: res.employment?.role ?? "resident",
      action: res.currentActivity,
      pos: [res.position.x, res.position.z] as [number, number],
      at_building: "",
      at_building_name: res.currentActivityDetail ?? "—",
      district: res.homePropertyId?.slice(0, 8) ?? "—",
      needs: res.needs,
      traits: { extraversion: res.personality.extraversion, industriousness: res.personality.conscientiousness },
      mood: res.emotionalState.mood,
      goal: {
        type: res.goals[0]?.goalId ?? "none",
        target: res.goals[0]?.priority ?? 0,
        window: 0,
        starts_tick: 0,
        ends_tick: 0,
        description: res.goals[0]?.description ?? "",
        progress: res.goals[0]?.progress ?? 0,
      },
      home_name: res.homePropertyId ? `home ${res.homePropertyId.slice(-4)}` : "—",
      work_name: res.employment?.businessId ? `work ${res.employment.businessId.slice(-4)}` : "—",
      is_jarvis: false, // backend has no embodied JARVIS resident yet (registry item, Phase 6)
      wallet: undefined,
      room_name: null,
      alive: res.alive,
      fidelity: res.fidelity,
    }));
    return NextResponse.json({ residents, source: "nexus-api" });
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
