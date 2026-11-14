/**
 * NEXUS Life Engine (directive §7.4) — persistent autonomous residents.
 *
 * Decision-making: needs-driven utility AI + time-of-day routines with
 * deterministic seeded randomness (reproducible for tests). No per-resident
 * LLM inference for routine behaviour — selective model reasoning is reserved
 * for exceptional situations and is invoked by the orchestrator, not here.
 */
import { clamp, seededRandom, weightedPick } from "@nexus/core";
import type { Resident, ResidentActivity, World } from "./entities";
import type { WorldStore } from "./persistence";

/** Sim minutes per tick step. */
export const SIM_MINUTES_PER_TICK = 10;

interface ActivityOption {
  activity: ResidentActivity;
  detail: string;
  weight: number;
}

export class LifeEngine {
  constructor(private readonly store: WorldStore) {}

  /**
   * Advance one resident by `steps` simulation ticks (each SIM_MINUTES_PER_TICK
   * sim-minutes). Needs decay by activity; activity chosen by utility =
   * need pressure × time-of-day routine × personality.
   */
  tickResident(world: World, resident: Resident, steps: number): void {
    for (let i = 0; i < steps; i++) {
      this.applyNeedDecay(resident);
      const hour = worldTimeOfDay(world);
      const next = this.chooseActivity(world, resident, hour);
      resident.currentActivity = next.activity;
      resident.currentActivityDetail = next.detail;
      this.applyActivityEffects(resident, next.activity);
      resident.emotionalState.mood = clamp(
        resident.emotionalState.mood + (resident.needs.comfort > 50 ? 0.02 : -0.02),
        -1, 1,
      );
      resident.emotionalState.lastMoodUpdateSimTime = world.simulationTime;
    }
    this.store.saveResident(resident);
  }

  private applyNeedDecay(r: Resident): void {
    r.needs.energy = clamp(r.needs.energy - 0.8, 0, 100);
    r.needs.hunger = clamp(r.needs.hunger - 1.2, 0, 100); // rises as "hunger level"
    r.needs.social = clamp(r.needs.social - 0.5, 0, 100);
    r.needs.comfort = clamp(r.needs.comfort - 0.3, 0, 100);
    r.needs.fun = clamp(r.needs.fun - 0.4, 0, 100);
  }

  private chooseActivity(world: World, r: Resident, hour: number): ActivityOption {
    const rng = seededRandom(r.routineSeed + Math.floor(world.simulationTime / 600_000));
    const dayIndex = Math.floor(world.simulationTime / 86_400_000) % 7;
    const workday = this.isWorkday(r, dayIndex, hour);
    const options: ActivityOption[] = [
      { activity: "sleeping", detail: "asleep at home", weight: (hour >= 22 || hour < 6 ? 40 : 1) + (100 - r.needs.energy) * 0.3 },
      { activity: "eating", detail: "having a meal", weight: (hour === 7 || hour === 12 || hour === 18 ? 15 : 2) + (100 - r.needs.hunger) * 0.4 },
      { activity: "working", detail: "at work", weight: workday ? 35 : 0 },
      { activity: "commuting", detail: "travelling", weight: workday && hour >= 6 && hour <= 9 ? 8 : 0 },
      { activity: "socialising", detail: "meeting people", weight: (100 - r.needs.social) * 0.35 * (1 + r.personality.extraversion) * (hour >= 17 && hour <= 22 ? 2 : 0.5) },
      { activity: "leisure", detail: "relaxing", weight: (100 - r.needs.fun) * 0.3 * (hour >= 18 || hour < 23 ? 1.5 : 0.4) },
      { activity: "maintaining_home", detail: "tending home", weight: 3 + (1 - r.personality.conscientiousness) * -2 + (hour >= 9 && hour <= 17 ? 2 : 0) },
      { activity: "exercising", detail: "exercising", weight: (hour >= 6 && hour <= 8 ? 4 : 1) * (0.5 + r.personality.conscientiousness) },
      { activity: "shopping", detail: "shopping for supplies", weight: (100 - r.needs.comfort) * 0.15 + 2 },
      { activity: "idle", detail: "idle", weight: 2 },
    ];
    const viable = options.filter((o) => o.weight > 0).map((o) => ({ value: o, weight: o.weight }));
    const chosen = weightedPick(rng, viable);
    return chosen ?? { activity: "idle", detail: "idle", weight: 1 };
  }

  private applyActivityEffects(r: Resident, activity: ResidentActivity): void {
    switch (activity) {
      case "sleeping": r.needs.energy = clamp(r.needs.energy + 6, 0, 100); r.needs.comfort = clamp(r.needs.comfort + 1, 0, 100); break;
      case "eating": r.needs.hunger = clamp(r.needs.hunger + 8, 0, 100); break;
      case "socialising": r.needs.social = clamp(r.needs.social + 6, 0, 100); r.needs.fun = clamp(r.needs.fun + 3, 0, 100); break;
      case "leisure": r.needs.fun = clamp(r.needs.fun + 5, 0, 100); break;
      case "exercising": r.needs.energy = clamp(r.needs.energy - 2, 0, 100); r.needs.fun = clamp(r.needs.fun + 4, 0, 100); r.needs.comfort = clamp(r.needs.comfort + 2, 0, 100); break;
      case "working": r.needs.energy = clamp(r.needs.energy - 2, 0, 100); r.needs.social = clamp(r.needs.social + 1, 0, 100); break;
      case "commuting": r.needs.energy = clamp(r.needs.energy - 1, 0, 100); break;
      case "maintaining_home": r.needs.comfort = clamp(r.needs.comfort + 4, 0, 100); break;
      case "shopping": r.needs.comfort = clamp(r.needs.comfort + 2, 0, 100); break;
      case "responding_to_event": r.needs.social = clamp(r.needs.social + 2, 0, 100); break;
      default: break;
    }
  }

  private isWorkday(r: Resident, dayIndex: number, hour: number): boolean {
    if (!r.employment) return false;
    const { startHour, endHour, days } = r.employment.schedule;
    return hour >= startHour && hour < endHour && days.includes(dayIndex);
  }

  /** Two residents socialise — records relationship event + mutual knowledge. */
  socialise(world: World, a: Resident, b: Resident): string {
    const evt = this.store.recordEvent({
      worldId: world.id,
      type: "social_encounter",
      simTime: world.simulationTime,
      location: a.position,
      cause: "proximity + mutual availability",
      participants: [
        { residentId: a.id, role: "participant" },
        { residentId: b.id, role: "participant" },
      ],
      knowledge: [
        { residentId: a.id, level: "direct_observation" },
        { residentId: b.id, level: "direct_observation" },
      ],
      payload: { aId: a.id, bId: b.id },
    });
    for (const r of [a, b]) {
      if (!r.knowledgeRefs.includes(evt.id)) r.knowledgeRefs.push(evt.id);
      if (!r.relationshipIds.includes(r.id === a.id ? b.id : a.id)) {
        r.relationshipIds.push(r.id === a.id ? b.id : a.id);
      }
      r.needs.social = clamp(r.needs.social + 10, 0, 100);
      this.store.saveResident(r);
    }
    return evt.id;
  }

  /** What a resident actually knows — their knowledge refs resolved to events. */
  residentKnowledge(worldId: string, resident: Resident) {
    return resident.knowledgeRefs
      .map((id) => this.store.eventById(id))
      .filter((e): e is NonNullable<typeof e> => e !== null && e.worldId === worldId);
  }
}

export function worldTimeOfDay(world: World): number {
  // sim time is ms; a NEXUS day = 24 sim-hours
  const dayFraction = (world.simulationTime % 86_400_000) / 86_400_000;
  return Math.floor(dayFraction * 24);
}
