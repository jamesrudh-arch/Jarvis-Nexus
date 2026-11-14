/**
 * NEXUS simulation engine (directive §7.3, §7.6, §11).
 *
 * - World clock with time acceleration and day/night tracking
 * - Fidelity tiers: HIGH / MEDIUM / ABSTRACT with promotion & demotion
 *   by distance from the active area (spec: no full-fidelity simulation of
 *   the entire population each tick)
 * - Background simulation continues without any rendering client
 * - Director generates world-level events from conditions (§7.6)
 */
import { clamp, seededRandom, nexusId, ID_PREFIXES } from "@nexus/core";
import type { WorldEvent, SimulationFidelityValue } from "@nexus/contracts";
import type { World, Resident, Vehicle } from "./entities";
import type { WorldStore } from "./persistence";
import { LifeEngine, SIM_MINUTES_PER_TICK } from "./life";
import { EconomyEngine } from "./economy";

export interface TickReport {
  simTimeBefore: number;
  simTimeAfter: number;
  ticks: number;
  residentsHigh: number;
  residentsMedium: number;
  residentsAbstract: number;
  eventsGenerated: string[];
  salaryPayments: number;
}

/** How many tick-steps a resident gets per simulation advance, by fidelity. */
const FIDELITY_TICK_STEPS: Record<SimulationFidelityValue, number> = {
  HIGH: 1,
  MEDIUM: 3,      // every 3rd step
  ABSTRACT: 10,   // coarse background simulation
};

export class SimulationEngine {
  readonly life: LifeEngine;
  readonly economy: EconomyEngine;
  private directorRandom = seededRandom(0x9e3779b9);

  constructor(private readonly store: WorldStore) {
    this.life = new LifeEngine(store);
    this.economy = new EconomyEngine(store.db, store);
  }

  /**
   * Advance the world by `ticks` steps. Each step advances sim time by
   * SIM_MINUTES_PER_TICK sim-minutes and:
   *   - updates fidelity assignments (distance to active centre)
   *   - ticks residents at their fidelity cadence
   *   - runs scheduled economy operations (daily salaries)
   *   - lets the Director evaluate world conditions
   */
  advance(world: World, opts?: { ticks?: number; activeCentre?: { x: number; z: number } }): TickReport {
    const ticks = opts?.ticks ?? 10;
    const centre = opts?.activeCentre ?? { x: 0, z: 0 };
    const report: TickReport = {
      simTimeBefore: world.simulationTime,
      simTimeAfter: world.simulationTime,
      ticks,
      residentsHigh: 0, residentsMedium: 0, residentsAbstract: 0,
      eventsGenerated: [], salaryPayments: 0,
    };

    const residents = this.store.listResidents(world.id);
    const simMinuteMs = 60_000;
    const stepMs = SIM_MINUTES_PER_TICK * simMinuteMs;

    // day for which salaries were last paid (init: day before start, so the
    // first 09:00 crossing on the starting day pays normally)
    let lastSalaryDay = Math.floor(world.simulationTime / 86_400_000) - 1;

    for (let t = 0; t < ticks; t++) {
      world.simulationTime += stepMs;
      this.updateEnvironment(world);

      // fidelity assignment by distance from active centre
      for (const r of residents) {
        const dist = Math.hypot(r.position.x - centre.x, r.position.z - centre.z);
        const target: SimulationFidelityValue =
          dist <= world.config.highFidelityRadius ? "HIGH"
          : dist <= world.config.mediumFidelityRadius ? "MEDIUM"
          : "ABSTRACT";
        if (r.fidelity !== target) r.fidelity = target;
      }
      report.residentsHigh = residents.filter((r) => r.fidelity === "HIGH").length;
      report.residentsMedium = residents.filter((r) => r.fidelity === "MEDIUM").length;
      report.residentsAbstract = residents.filter((r) => r.fidelity === "ABSTRACT").length;

      // residents tick at fidelity cadence
      for (const r of residents) {
        const cadence = FIDELITY_TICK_STEPS[r.fidelity];
        if ((t + 1) % cadence === 0 || t === ticks - 1) {
          this.life.tickResident(world, r, 1);
        }
      }

      // ambient social encounters (HIGH fidelity, nearby, socialising/idle)
      this.maybeSocialEncounters(world, residents);

      // daily economy: salaries at 09:00 sim time
      const day = Math.floor(world.simulationTime / 86_400_000);
      const hour = (world.simulationTime % 86_400_000) / 3_600_000;
      if (day !== lastSalaryDay && hour >= 9) {
        lastSalaryDay = day;
        for (const r of residents) {
          if (!r.employment || !r.financialAccountId) continue;
          const pay = this.economy.paySalary({
            worldId: world.id, employee: r, hours: 8,
            simTime: world.simulationTime, payPeriodKey: `day-${day}`,
          });
          if (pay.ok && !("skipped" in pay.value)) report.salaryPayments++;
        }
      }

      // world director
      const evt = this.directorStep(world, residents);
      if (evt) report.eventsGenerated.push(evt.id);
    }

    this.store.saveWorld(world);
    report.simTimeAfter = world.simulationTime;
    return report;
  }

  private updateEnvironment(world: World): void {
    const dayFraction = (world.simulationTime % 86_400_000) / 86_400_000;
    world.environment.timeOfDay = Math.floor(dayFraction * 24 * 10) / 10;
    world.environment.dayOfYear = 1 + Math.floor(world.simulationTime / 86_400_000) % 366;
    const seasonIdx = Math.floor(((world.environment.dayOfYear - 1) % 365) / 91.25);
    world.environment.season = (["spring", "summer", "autumn", "winter"] as const)[clamp(seasonIdx, 0, 3)] ?? "summer";
    const roll = this.directorRandom();
    world.environment.weather = roll > 0.92 ? "storm" : roll > 0.78 ? "rain" : roll > 0.66 ? "cloudy" : "clear";
  }

  private maybeSocialEncounters(world: World, residents: Resident[]): void {
    const available = residents.filter(
      (r) => r.fidelity === "HIGH" && (r.currentActivity === "idle" || r.currentActivity === "socialising" || r.currentActivity === "leisure"),
    );
    if (available.length < 2) return;
    if (this.directorRandom() > 0.3) return;
    const a = available[Math.floor(this.directorRandom() * available.length)]!;
    let best: Resident | null = null;
    let bestDist = Infinity;
    for (const b of available) {
      if (b.id === a.id) continue;
      const d = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    if (best && bestDist < 50) {
      this.life.socialise(world, a, best);
    }
  }

  /**
   * NEXUS World Director (§7.6): observes conditions and occasionally creates
   * world-level events (weather incidents, opportunities). It coordinates
   * world pressures — it does NOT control individual residents.
   */
  directorStep(world: World, residents: Resident[]): WorldEvent | null {
    const roll = this.directorRandom();
    const hour = world.environment.timeOfDay;

    if (world.environment.weather === "storm" && roll > 0.95) {
      return this.store.recordEvent({
        worldId: world.id,
        type: "weather_incident",
        simTime: world.simulationTime,
        cause: `storm at ${hour.toFixed(1)}h`,
        effects: [{ target: "environment", change: "storm_damage_risk" }],
        payload: { weather: "storm", severity: 0.7 },
      });
    }
    // traffic incident chance during commute hours with vehicles in motion
    const vehicles = this.store.listVehicles(world.id).filter((v) => v.inUse);
    if ((hour >= 7.5 && hour <= 9) || (hour >= 17 && hour <= 18.5)) {
      if (vehicles.length >= 2 && roll > 0.97) {
        const a = vehicles[0]!;
        const b = vehicles[1]!;
        return this.vehicleCollision(world, a, b, residents);
      }
    }
    // community event opportunity
    if (hour >= 19 && hour <= 21 && roll > 0.96) {
      // knowledge only — the director never controls individual residents
      // directly (§7.6); attending the festival is the life engine's decision.
      const nearby = residents.filter((r) => Math.hypot(r.position.x, r.position.z) < 50);
      const evt = this.store.recordEvent({
        worldId: world.id,
        type: "community_event",
        simTime: world.simulationTime,
        cause: "director opportunity generation",
        effects: [{ target: "social_calendar", change: "street_festival" }],
        knowledge: nearby.map((r) => ({ residentId: r.id, level: "direct_observation" as const })),
        payload: { kind: "street_festival" },
      });
      // nearby residents learn of it (resident-side knowledge, same as event.knowledge)
      for (const r of nearby) {
        if (!r.knowledgeRefs.includes(evt.id)) {
          r.knowledgeRefs.push(evt.id);
          this.store.saveResident(r);
        }
      }
      return evt;
    }
    return null;
  }

  /**
   * Causal collision event with witnesses, damage, emergency response chain
   * (Scenario F). The whole chain (2 vehicle saves, 3 events, witness saves)
   * commits atomically — a crash mid-chain can no longer tear the causal
   * history. Participants (drivers) are always given knowledge of their own
   * crash, even if they are farther from the impact point than the 40 m
   * witness radius.
   */
  vehicleCollision(world: World, a: Vehicle, b: Vehicle, residents: Resident[]): WorldEvent {
    return this.store.db.transaction(() => {
      a.inUse = false; b.inUse = false;
      a.condition = clamp(a.condition - 0.45, 0, 1);
      b.condition = clamp(b.condition - 0.35, 0, 1);
      this.store.saveVehicle(a);
      this.store.saveVehicle(b);

      const witnesses = residents
        .filter((r) => Math.hypot(r.position.x - a.location.x, r.position.z - a.location.z) < 40)
        .map((r) => r.id);
      // participants always know their own collision, even beyond the witness radius
      const knowledgeIds = [...new Set([
        ...witnesses,
        ...(a.ownerId ? [a.ownerId] : []),
        ...(b.ownerId ? [b.ownerId] : []),
      ])];

      const collision = this.store.recordEvent({
        id: nexusId(ID_PREFIXES.event),
        worldId: world.id,
        type: "vehicle_collision",
        simTime: world.simulationTime,
        location: a.location,
        cause: `${world.environment.weather} roads during commute`,
        participants: [
          ...(a.ownerId ? [{ residentId: a.ownerId, role: "driver_a" }] : []),
          ...(b.ownerId ? [{ residentId: b.ownerId, role: "driver_b" }] : []),
        ],
        witnesses,
        evidence: [`damage_report:${a.id}`, `damage_report:${b.id}`],
        effects: [
          { target: `vehicle:${a.id}`, change: "condition -0.45, stopped" },
          { target: `vehicle:${b.id}`, change: "condition -0.35, stopped" },
          { target: "traffic", change: "lane_blocked" },
        ],
        knowledge: knowledgeIds.map((id) => ({ residentId: id, level: "direct_observation" as const })),
        payload: { vehicleA: a.id, vehicleB: b.id, weather: world.environment.weather },
      });

      // witnesses and participants remember the event
      for (const r of residents) {
        if (knowledgeIds.includes(r.id) && !r.knowledgeRefs.includes(collision.id)) {
          r.knowledgeRefs.push(collision.id);
          this.store.saveResident(r);
        }
      }

      // chained consequence: emergency response (§10.9)
      this.store.recordEvent({
        worldId: world.id,
        type: "emergency_response",
        simTime: world.simulationTime + 8 * 60_000, // 8 sim-minutes later
        location: a.location,
        cause: "dispatched to vehicle collision",
        causeEventId: collision.id,
        participants: [{ role: "police" }, { role: "ambulance" }],
        effects: [
          { target: "traffic", change: "road_cleared_pending_tow" },
          { target: `vehicle:${a.id}`, change: "towed_to_garage" },
        ],
        payload: { collisionId: collision.id, responders: ["police", "ambulance", "tow"] },
      });

      // road consequence persists
      this.store.recordEvent({
        worldId: world.id,
        type: "road_consequence",
        simTime: world.simulationTime + 45 * 60_000,
        cause: "collision aftermath",
        causeEventId: collision.id,
        effects: [{ target: "traffic", change: "speed_restriction_40" }],
        payload: { collisionId: collision.id, restriction: "40kph", durationSimHours: 6 },
      });

      return collision;
    });
  }
}
