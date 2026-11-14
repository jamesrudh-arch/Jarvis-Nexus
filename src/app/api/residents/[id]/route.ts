import { NextResponse } from "next/server";
import { backend, BackendError, type Envelope } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Stage 2 Phase 5 V2 — resident detail from the AUTHORITATIVE backend
 * (GET /world/residents/:id) including the resident's causal knowledge
 * (what they personally witnessed — not omniscient state).
 */

interface BackendResident {
  id: string;
  name: { first: string; last: string };
  personality: { openness: number; conscientiousness: number; extraversion: number; agreeableness: number; neuroticism: number };
  needs: { energy: number; hunger: number; social: number; comfort: number; fun: number };
  goals: Array<{ goalId: string; description: string; priority: number; progress: number }>;
  homePropertyId?: string;
  employment?: { businessId?: string; role?: string; salaryPerHour: number };
  emotionalState: { mood: number };
  currentActivity: string;
  currentActivityDetail?: string;
  position: { x: number; y: number; z: number };
  alive: boolean;
  fidelity: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const r = await backend.get<{ data: BackendResident; knowledge: Array<{ event?: string; level?: string; detail?: string; fact?: string }> }>(
      `/world/residents/${encodeURIComponent(id)}`,
    );
    const res = r.data;
    return NextResponse.json({
      resident_id: res.id,
      name: `${res.name.first} ${res.name.last}`,
      role: res.employment?.role ?? "resident",
      action: res.currentActivity,
      action_detail: res.currentActivityDetail ?? null,
      pos: [res.position.x, res.position.z],
      at_building: "",
      at_building_name: "—",
      district: res.homePropertyId?.slice(0, 8) ?? "—",
      needs: res.needs,
      traits: res.personality,
      mood: res.emotionalState.mood,
      goals: res.goals,
      home_name: res.homePropertyId ? `home ${res.homePropertyId.slice(-4)}` : "—",
      work_name: res.employment?.businessId ? `work ${res.employment.businessId.slice(-4)}` : "—",
      salary_per_hour: res.employment?.salaryPerHour ?? null,
      is_jarvis: false,
      room_name: null,
      alive: res.alive,
      fidelity: res.fidelity,
      knowledge: (r.knowledge ?? []).slice(0, 20),
      source: "nexus-api",
    });
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) {
      return NextResponse.json({ error: "resident not found" }, { status: 404 });
    }
    const status = e instanceof BackendError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
