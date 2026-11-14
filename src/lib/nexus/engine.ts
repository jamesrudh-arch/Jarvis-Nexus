/**
 * Resident engine — the living population of NEXUS WORLD (TS port of
 * residents/engine.py, Phase 2 + PRIORITY 5 layers).
 *
 * Deterministic given (seed, tick, store content): needs, decisions,
 * weather, meetings — all SHA-256 derived, never wall-clock or RNG.
 * Every state change is an idempotent event (ADR-002): the world
 * replays and survives restarts.
 *
 * Layers:
 *  1. utility script (circadian/needs scoring)
 *  2. autonomy policy (goals/mood/social-graph, bounded bias)
 *  3. optional LLM cognition (validated choice, utility fallback)
 */
import { clamp, h } from "./hash";
import { WorldClock } from "./clock";
import { CityLayout, type Building } from "./layout";
import { AutonomyLedger, AutonomyPolicy, mood } from "./autonomy";
import { LongTermMemory } from "./memory";
import { EventStore, IdAllocator } from "./store";
import type { EconomyHooks } from "./economy";
import type { PrismaClient } from "@prisma/client";

export const ACTIONS = ["sleeping", "eating", "working", "socializing", "leisure", "commuting", "idle"] as const;
export type Action = (typeof ACTIONS)[number];

const SPEED = 4.0; // world units per tick
const SYNC_EVERY = 36; // full state sync every 36 ticks (6 sim hours)
const MEETING_TICKS = 6; // meeting evaluation cadence (1 sim hour)
const LLM_BUDGET_PER_TICK = 1;
const LOCALITY_K = 4;

const FIRST = ["Ari", "Bex", "Cai", "Dov", "Eli", "Fyn", "Gia", "Hal", "Ivo",
  "Juna", "Kex", "Lio", "Mira", "Nox", "Oda", "Pim", "Quill",
  "Ryn", "Sable", "Tess", "Uli", "Vero", "Wren", "Yara", "Zeph",
  "Bram", "Cyra", "Dane", "Esme", "Fiora"];
const LAST = ["Ashvale", "Briarwood", "Coldwater", "Duskbane", "Emberly",
  "Fairholt", "Grimshaw", "Hollybrook", "Ironquill", "Juniper",
  "Kettleburn", "Lorimer", "Marsden", "Northgate", "Oakhollow",
  "Pinefall", "Quarry", "Rushmore", "Stonebrook", "Thornfield"];
const ROLES = ["artisan", "clerk", "engineer", "medic", "teacher", "smith", "courier", "grower"];
const TOPICS = ["the weather over the district", "the new workshop orders",
  "a rumour about the northern quarter", "the harvest festival",
  "the council's latest notice", "a strange light at night",
  "the price of bread", "an old story about the founding"];
const WEATHER_TABLE = ["clear", "clear", "clear", "clear", "cloudy", "cloudy", "rain"];

export interface ResidentState {
  resident_id: string;
  name: string;
  role: string;
  traits: { extraversion: number; industriousness: number };
  home_id: string;
  work_id: string;
  venue_id: string;
  action: Action;
  pending_action: Action | null;
  at_building: string;
  target_building: string | null;
  pos: [number, number];
  needs: { energy: number; hunger: number; social: number; purpose: number };
  llm_decisions: number;
  updated_tick: number;
  last_emitted_action: Action;
  // economy + interiors (optional: older worlds may lack them)
  wallet?: number;
  room_id?: string | null;
  is_jarvis?: boolean;
}

/** Pluggable cognition layer (ADR-003 layer 2). */
export interface Cognition {
  decide(
    rid: string,
    data: ResidentState,
    context: Record<string, unknown>,
    allowed: Array<[string, number]>
  ): Promise<{ chosen: Action; reason: string }>;
}

export interface StepSummary {
  tick: number;
  llm_decisions: number;
  communications: number;
  memories: number;
  action_changes: number;
  policy_decisions: number;
  goal_evaluations: number;
}

type PendingEvent = { tick: number; type: string; payload: Record<string, unknown> };

export class ResidentEngine {
  private clock: WorldClock;
  private tz: number;
  private policy: AutonomyPolicy | null;
  readonly autonomyLedger = new AutonomyLedger();
  private ltm: LongTermMemory;
  private ids: IdAllocator;
  private weatherDay: number | null = null;

  constructor(
    private store: EventStore,
    private layout: CityLayout,
    private seed: number,
    private db: PrismaClient,
    private opts: { enablePolicy?: boolean; cognition?: Cognition; economy?: EconomyHooks } = {}
  ) {
    this.clock = null as unknown as WorldClock; // set in init()
    this.tz = 0;
    this.policy = null;
    this.ltm = new LongTermMemory(store);
    this.ids = new IdAllocator(db);
  }

  async init(): Promise<this> {
    const epoch = (await this.store.meta("epoch_utc")) || "2026-01-01T00:00:00";
    const mpt = parseInt((await this.store.meta("minutes_per_tick")) || "10", 10);
    this.clock = new WorldClock(epoch, mpt);
    // primary timezone from the first country node (Python _primary_tz)
    const countries = await this.store.geoNodes("country");
    if (countries.length > 0) {
      const meta = (countries[0].meta ?? {}) as Record<string, unknown>;
      this.tz = typeof meta.tz_offset_hours === "number" ? meta.tz_offset_hours : 0;
    }
    if (this.opts.enablePolicy !== false) {
      this.policy = new AutonomyPolicy(this.store, this.seed);
    }
    // warm id counters from the DB (replay-safe)
    for (const prefix of ["mem", "res", "geo-cont", "geo-coun", "geo-stat", "geo-city", "geo-dist", "geo-nei", "geo-buil"]) {
      const row = await this.db.idCounter.findUnique({ where: { prefix } });
      if (row) this.ids.warm(prefix, row.nextVal - 1);
    }
    return this;
  }

  async residents(): Promise<ResidentState[]> {
    const rows = await this.store.entitiesOfType("resident");
    return rows.map((r) => ({ resident_id: r.entity_id, ...(r.data as object) })) as ResidentState[];
  }

  // ------------------------------------------------------------ creation
  async createPopulation(n = 24, tick = 0): Promise<{ created: number; resident_ids: string[] }> {
    if ((await this.residents()).length > 0) throw new Error("population already exists");
    const buildings = this.layout.buildings();
    if (buildings.length === 0) throw new Error("no buildings: create world geography first");
    const homes = buildings.filter((b) => b.kind === "residential");
    const works = buildings.filter((b) => b.kind === "workshop" || b.kind === "civic");
    const venues = buildings.filter((b) => b.kind === "food" || b.kind === "shop");
    const H = homes.length ? homes : buildings;
    const W = works.length ? works : buildings;
    const V = venues.length ? venues : buildings;
    const created: string[] = [];
    const events: PendingEvent[] = [];

    const nearest = (from: Building, options: Building[]): Building[] => {
      const ranked = [...options].sort(
        (a, b) =>
          Math.abs(a.center[0] - from.center[0]) +
          Math.abs(a.center[1] - from.center[1]) +
          (a.district === from.district ? 0 : 100) -
          (Math.abs(b.center[0] - from.center[0]) +
            Math.abs(b.center[1] - from.center[1]) +
            (b.district === from.district ? 0 : 100))
      );
      return ranked.slice(0, LOCALITY_K).length ? ranked.slice(0, LOCALITY_K) : [from];
    };

    for (let i = 0; i < n; i++) {
      const rid = this.ids.next("res");
      const name = `${FIRST[h(this.seed, i, "first") % FIRST.length]} ${LAST[h(this.seed, i, "last") % LAST.length]}`;
      const role = ROLES[h(this.seed, i, "role") % ROLES.length];
      const home = H[h(this.seed, i, "home") % H.length];
      const nearWork = nearest(home, W);
      const work = nearWork[h(this.seed, i, "work") % nearWork.length];
      const venue = nearest(home, V)[0]; // THE nearest venue — district-mates share it
      const data: Omit<ResidentState, "resident_id"> = {
        name, role,
        traits: {
          extraversion: Math.round((0.3 + 0.6 * (h(this.seed, i, "ex") % 1000) / 1000) * 100) / 100,
          industriousness: Math.round((0.3 + 0.6 * (h(this.seed, i, "ind") % 1000) / 1000) * 100) / 100,
        },
        home_id: home.id, work_id: work.id, venue_id: venue.id,
        action: "idle", pending_action: null,
        at_building: home.id, target_building: null,
        pos: [home.center[0], home.center[1]],
        needs: {
          energy: 60 + (h(this.seed, i, "e") % 30),
          hunger: 55 + (h(this.seed, i, "hu") % 30),
          social: 45 + (h(this.seed, i, "s") % 30),
          purpose: 40 + (h(this.seed, i, "p") % 30),
        },
        llm_decisions: 0, updated_tick: tick, last_emitted_action: "idle",
      };
      events.push({
        tick, type: "resident.created",
        payload: { idempotency_key: `resident-create-${rid}`, resident_id: rid, data },
      });
      created.push(rid);
    }
    await this.store.applyBatch(events);
    await this.ids.flush();
    return { created: created.length, resident_ids: created };
  }

  // ------------------------------------------------------------ stepping
  async step(tick: number): Promise<StepSummary> {
    const summary: StepSummary = {
      tick, llm_decisions: 0, communications: 0, memories: 0,
      action_changes: 0, policy_decisions: 0, goal_evaluations: 0,
    };
    const events: PendingEvent[] = [];
    const remember = (rid: string, t: number, kind: string, text: string, importance = 2) => {
      const mid = this.ids.next("mem");
      events.push({
        tick: t, type: "resident.memory_recorded",
        payload: { idempotency_key: `mem-${mid}`, memory_id: mid, resident_id: rid, tick: t, kind, text, importance },
      });
      summary.memories += 1;
    };

    await this.maybeWeather(tick, events);
    if (this.opts.economy) this.opts.economy.onTick(tick, events);
    const weather = (await this.store.meta("weather")) || "clear";
    const local = this.clock.localParts(tick, this.tz);
    const hour = local.hour;
    const weekday = local.isWeekday;

    const residents = await this.residents();
    for (const r of residents) {
      if (this.policy) {
        const ev = await this.policy.evaluateWindow(r.resident_id, r, tick, remember);
        if (ev) {
          summary.goal_evaluations += 1;
        }
      }
      await this.tickResident(r, tick, hour, weekday, weather, summary, events, remember);
      if (
        r.action !== r.last_emitted_action ||
        tick % SYNC_EVERY === 0 ||
        r.action === "commuting"
      ) {
        const { resident_id, ...payload } = r;
        void resident_id;
        events.push({
          tick, type: "resident.acted",
          payload: { idempotency_key: `act-${r.resident_id}-${tick}`, resident_id: r.resident_id, data: payload },
        });
        r.last_emitted_action = r.action;
        summary.action_changes += 1;
      }
    }
    await this.meetings(tick, summary, events, remember);
    await this.store.applyBatch(events);
    await this.ids.flush();
    summary.policy_decisions = this.autonomyLedger.records.filter(
      (rec) => rec.tick === tick && rec.source.startsWith("policy")
    ).length;
    return summary;
  }

  private async tickResident(
    r: ResidentState,
    tick: number,
    hour: number,
    weekday: boolean,
    weather: string,
    summary: StepSummary,
    events: PendingEvent[],
    remember: (rid: string, t: number, kind: string, text: string, importance?: number) => void
  ): Promise<void> {
    // finish an in-progress commute first
    if (r.action === "commuting") {
      this.advancePosition(r);
      r.needs.energy = clamp(r.needs.energy - 0.18);
      r.needs.hunger = clamp(r.needs.hunger - 0.22);
      this.arriveIfReached(r, tick, events, remember);
      return;
    }

    this.applyActionEffects(r.action, r.needs);
    const scores = this.scores(r, hour, weekday, weather);
    let { desired, reason } = this.pick(scores, r.action);
    const scriptChoice = desired;

    if (this.policy) {
      const biased = await this.policy.applyBias(r.resident_id, r, scores, hour, tick);
      if (biased.reason) {
        const b = this.pick(biased.scores, r.action);
        if (b.desired !== desired) {
          desired = b.desired;
          reason = biased.reason; // the POLICY reason (Python: reason = policy_reason)
        }
      }
    }

    if (
      this.opts.cognition &&
      summary.llm_decisions < LLM_BUDGET_PER_TICK &&
      this.decisionPoint(r, scores, tick)
    ) {
      const allowed = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const ctx = await this.context(r, hour, weather);
      const out = await this.opts.cognition.decide(r.resident_id, r, ctx, allowed);
      if (out.reason.startsWith("llm:")) {
        summary.llm_decisions += 1;
        r.llm_decisions += 1;
        remember(r.resident_id, tick, "decision", `Reflected and chose to ${out.chosen}.`, 3);
      }
      desired = out.chosen;
      reason = out.reason;
    }

    if (desired !== r.action) {
      this.autonomyLedger.record(r.resident_id, tick, reason, desired, scriptChoice);
    }
    if (desired === r.action) return; // hysteresis keeps behaviour stable

    const location = this.locationFor(desired, r, hour);
    if (location !== r.at_building) {
      r.action = "commuting";
      r.pending_action = desired;
      r.target_building = location;
      r.room_id = null; // leaving the room (documented: intra-building transit not simulated in v1)
    } else {
      r.action = desired;
      r.pending_action = null;
      r.target_building = null;
      this.enterBuilding(r, tick);
      this.onActionStart(r, tick, desired, events, remember);
    }
  }

  // ------------------------------------------------------------- movement
  private targetPos(r: ResidentState): [number, number] {
    const b = r.target_building ? this.layout.building(r.target_building) : null;
    if (!b) return r.pos;
    return b.center;
  }

  private advancePosition(r: ResidentState) {
    const [tx, ty] = this.targetPos(r);
    const [px, py] = r.pos;
    const dx = tx - px;
    const dy = ty - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= SPEED) {
      r.pos = [tx, ty];
    } else {
      r.pos = [
        Math.round((px + (SPEED * dx) / dist) * 1000) / 1000,
        Math.round((py + (SPEED * dy) / dist) * 1000) / 1000,
      ];
    }
  }

  private arriveIfReached(
    r: ResidentState,
    tick: number,
    events: Array<{ tick: number; type: string; payload: Record<string, unknown> }>,
    remember: (rid: string, t: number, kind: string, text: string, importance?: number) => void
  ) {
    const target = r.target_building;
    if (!target) {
      r.action = "idle";
      r.pending_action = null;
      return;
    }
    const tp = this.targetPos(r);
    if (r.pos[0] !== tp[0] || r.pos[1] !== tp[1]) return; // still walking
    r.at_building = target;
    r.action = r.pending_action ?? "idle";
    r.pending_action = null;
    r.target_building = null;
    this.enterBuilding(r, tick);
    this.onActionStart(r, tick, r.action, events, remember);
  }

  /**
   * Room assignment on arrival (interiors v1): places the resident in a
   * semantically appropriate room of the building they just entered, with
   * a deterministic per-resident offset so co-residents don't stack.
   * Buildings without generated interiors keep room_id null (honest shell).
   */
  private enterBuilding(r: ResidentState, tick: number): void {
    const rooms = this.layout.roomsOf(r.at_building);
    if (rooms.length === 0) {
      r.room_id = null;
      return;
    }
    const preferred: Record<string, string[]> = {
      eating: ["dining", "floor"],
      socializing: ["dining", "floor"],
      working: ["office", "kitchen", "hall"],
      sleeping: ["studio", "atrium"],
      leisure: ["atrium", "observatory", "dining", "floor"],
      idle: ["atrium", "hall", "dining", "floor"],
      commuting: [],
    };
    const want = preferred[r.action] ?? [];
    const matching = rooms.filter((room) => want.includes(room.kind));
    const pool = matching.length > 0 ? matching : rooms;
    const room = pool[h(this.seed, r.resident_id, "room", tick) % pool.length];
    r.room_id = room.id;
    const ox = ((h(this.seed, r.resident_id, "ro", room.id) % 100) / 100) * 1.6 - 0.8;
    const oy = ((h(this.seed, r.resident_id, "ry", room.id) % 100) / 100) * 1.6 - 0.8;
    r.pos = [
      Math.round((room.center[0] + ox) * 1000) / 1000,
      Math.round((room.center[1] + oy) * 1000) / 1000,
    ];
  }

  private onActionStart(
    r: ResidentState,
    tick: number,
    action: Action,
    events: Array<{ tick: number; type: string; payload: Record<string, unknown> }>,
    remember: (rid: string, t: number, kind: string, text: string, importance?: number) => void
  ) {
    const bname = this.layout.buildingName(r.at_building);
    if (action === "working") remember(r.resident_id, tick, "work", `Began work at ${bname}.`, 2);
    else if (action === "eating") remember(r.resident_id, tick, "meal", `Ate at ${bname}.`, 1);
    else if (action === "sleeping") remember(r.resident_id, tick, "rest", `Went to sleep at ${bname}.`, 1);
    if (this.opts.economy) this.opts.economy.onActionStart(r, action, tick, events, remember);
  }

  // ---------------------------------------------------------------- needs
  private applyActionEffects(action: Action, n: Record<string, number>) {
    if (action === "sleeping") {
      n.energy = clamp(n.energy + 1.0);
      n.hunger = clamp(n.hunger - 0.22);
      n.social = clamp(n.social - 0.05);
      n.purpose = clamp(n.purpose - 0.04);
    } else if (action === "eating") {
      n.hunger = clamp(n.hunger + 9.0);
      n.energy = clamp(n.energy + 0.1);
      n.social = clamp(n.social - 0.05);
    } else if (action === "working") {
      n.purpose = clamp(n.purpose + 0.38);
      n.energy = clamp(n.energy - 0.25);
      n.hunger = clamp(n.hunger - 0.28);
      n.social = clamp(n.social - 0.08);
    } else if (action === "socializing") {
      n.social = clamp(n.social + 1.2);
      n.hunger = clamp(n.hunger - 0.2);
      n.energy = clamp(n.energy - 0.15);
      n.purpose = clamp(n.purpose + 0.05);
    } else if (action === "leisure") {
      n.energy = clamp(n.energy - 0.05); // rest ≠ sleep
      n.purpose = clamp(n.purpose - 0.05);
      n.hunger = clamp(n.hunger - 0.2);
      n.social = clamp(n.social - 0.12);
    } else {
      // idle
      n.purpose = clamp(n.purpose - 0.08);
      n.energy = clamp(n.energy + 0.05);
      n.hunger = clamp(n.hunger - 0.2);
      n.social = clamp(n.social - 0.12);
    }
  }

  // -------------------------------------------------------------- utility
  private scores(r: ResidentState, hour: number, weekday: boolean, weather: string): Record<string, number> {
    const n = r.needs;
    const tr = r.traits;
    const rain = weather === "rain" ? 0.7 : 1.0;
    const night = hour >= 22 || hour < 6 ? 3.0 : 0.15;
    const meal = hour >= 7 && hour < 9 || hour >= 12 && hour < 14 || hour >= 18 && hour < 20 ? 1.6 : 0.45;
    const work = weekday && hour >= 9 && hour < 17 ? 1.5 : 0.08;
    const evening = hour >= 17 && hour < 22 ? 1.5 : !weekday && hour >= 10 && hour < 22 ? 0.8 : 0.3;
    return {
      sleeping: (100 - n.energy) * 1.05 * night + (hour >= 22 || hour < 6 ? 18.0 : 0.0),
      eating: (100 - n.hunger) * 0.85 * meal,
      working: (100 - n.purpose) * 0.62 * work * tr.industriousness,
      socializing: (100 - n.social) * 0.7 * evening * tr.extraversion * rain,
      leisure: 18.0 * (0.5 + (hour >= 17 && hour < 23 ? 0.5 : 0)) * rain,
      idle: 4.0,
    };
  }

  private pick(scores: Record<string, number>, current: Action): { desired: Action; reason: string } {
    let best: [string, number] = ["idle", -Infinity];
    for (const [k, v] of Object.entries(scores)) if (v > best[1]) best = [k, v];
    if (scores[current] !== undefined && scores[current] >= best[1] * 0.85 - 4.0) {
      return { desired: current, reason: "utility:keep" };
    }
    return { desired: best[0] as Action, reason: "utility:best" };
  }

  private decisionPoint(r: ResidentState, scores: Record<string, number>, tick: number): boolean {
    const ranked = Object.values(scores).sort((a, b) => b - a);
    const ambiguous =
      ranked.length > 1 && ranked[0] - ranked[1] < 0.12 * Math.max(ranked[0], 1.0);
    const narrative = r.resident_id.endsWith("000001") && tick % 24 === 0;
    return ambiguous || narrative;
  }

  private locationFor(action: Action, r: ResidentState, hour: number): string {
    if (action === "sleeping" || action === "leisure") return r.home_id;
    if (action === "working") return r.work_id;
    if (action === "eating") return hour >= 12 && hour < 14 ? r.venue_id : r.home_id;
    if (action === "socializing") return r.venue_id;
    return r.at_building;
  }

  // ------------------------------------------------------------ meetings
  private async meetings(
    tick: number,
    summary: StepSummary,
    events: PendingEvent[],
    remember: (rid: string, t: number, kind: string, text: string, importance?: number) => void
  ) {
    if (tick % MEETING_TICKS !== 0) return;
    const groups = new Map<string, ResidentState[]>();
    for (const r of await this.residents()) {
      if (r.action === "socializing" && r.at_building) {
        const list = groups.get(r.at_building) ?? [];
        list.push(r);
        groups.set(r.at_building, list);
      }
    }
    for (const [building, group] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (group.length < 2) continue;
      group.sort((a, b) => (a.resident_id < b.resident_id ? -1 : 1));
      const i = h(this.seed, Math.floor(tick / MEETING_TICKS), building) % (group.length - 1);
      const a = group[i];
      const b = group[i + 1];
      const key = `comm-${a.resident_id}-${b.resident_id}-${Math.floor(tick / MEETING_TICKS)}`;
      const topic = TOPICS[h(this.seed, a.resident_id, b.resident_id, Math.floor(tick / 36)) % TOPICS.length];
      events.push({
        tick, type: "resident.communication",
        payload: { idempotency_key: key, from_id: a.resident_id, to_id: b.resident_id, building_id: building, topic },
      });
      summary.communications += 1;
      const bname = this.layout.buildingName(building);
      remember(a.resident_id, tick, "meeting", `Met ${b.name} at ${bname}; talked about ${topic}.`, 3);
      remember(b.resident_id, tick, "meeting", `Met ${a.name} at ${bname}; talked about ${topic}.`, 3);
    }
  }

  private async maybeWeather(tick: number, events: PendingEvent[]) {
    const day = Math.floor(this.clock.timeAtMs(tick) / 86_400_000);
    if (this.weatherDay === day) return;
    this.weatherDay = day;
    const next = WEATHER_TABLE[h(this.seed, day) % WEATHER_TABLE.length];
    const current = await this.store.meta("weather");
    if (current !== next) {
      const worldId = (await this.store.meta("world_id")) || "w";
      events.push({
        tick, type: "world.weather_changed",
        payload: { idempotency_key: `weather-${worldId}-${day}`, weather: next },
      });
    }
  }

  private async context(r: ResidentState, hour: number, weather: string) {
    const mems = await this.ltm.memories(r.resident_id, await this.store.currentTick, 3);
    return {
      name: r.name, role: r.role,
      time: `${String(hour).padStart(2, "0")}:00`, weather,
      needs: Object.fromEntries(Object.entries(r.needs).map(([k, v]) => [k, Math.round(v)])),
      location: this.layout.buildingName(r.at_building),
      current_action: r.action,
      recent_memories: mems.map((m) => m.text),
    };
  }

  async autonomyReport(): Promise<Record<string, unknown>> {
    const report = this.autonomyLedger.summary();
    const { relationshipSummary } = await import("./memory");
    report.relationships = await relationshipSummary(this.store, await this.store.currentTick);
    return report;
  }
}

// ------------------------------------------------------------------ ticks
export interface TickResult {
  tick: number;
  requested: number;
  advanced: number;
  sim_time_utc: string;
}

/** Advances simulation time, running resident behaviour on the same loop. */
export async function runTicks(
  db: import("@prisma/client").PrismaClient,
  store: EventStore,
  behaviour: ResidentEngine | null,
  n: number,
  onTick?: (r: TickResult) => void
): Promise<TickResult> {
  const worldId = (await store.meta("world_id")) || "world";
  const epoch = (await store.meta("epoch_utc")) || "2026-01-01T00:00:00";
  const mpt = parseInt((await store.meta("minutes_per_tick")) || "10", 10);
  const clock = new WorldClock(epoch, mpt);
  let current = await store.currentTick;
  let advanced = 0;
  for (let i = 0; i < n; i++) {
    const next = current + 1;
    const simTime = clock.timeAt(next).toISOString().replace(".000Z", "+00:00");
    const applied = await store.applyBatch([
      {
        tick: next,
        type: "world.tick_advanced",
        payload: { idempotency_key: `tick-${worldId}-${next}`, tick: next, sim_time_utc: simTime },
      },
    ]);
    if (applied) {
      advanced += 1;
      current = next;
      await renewExpiringLeases(db, store, current);
      if (behaviour) await behaviour.step(next);
      if (onTick) onTick({ tick: current, requested: n, advanced, sim_time_utc: simTime });
    } else {
      current = next; // already applied (crash-retry path)
    }
  }
  return {
    tick: current,
    requested: n,
    advanced,
    sim_time_utc: clock.timeAt(current).toISOString().replace(".000Z", "+00:00"),
  };
}

const RENEW_MARGIN_TICKS = 1440;

async function renewExpiringLeases(db: import("@prisma/client").PrismaClient, store: EventStore, tick: number) {
  const regions = await db.region.findMany({ orderBy: { regionId: "asc" } });
  const events = regions
    .filter((r) => tick >= r.leaseExpiresTick - RENEW_MARGIN_TICKS)
    .map((r) => ({
      tick,
      type: "region.lease_renewed",
      payload: {
        idempotency_key: `lease-renew-${r.regionId}-${r.leaseExpiresTick}`,
        region_id: r.regionId, owner: r.owner, ttl_ticks: 100000,
      },
    }));
  if (events.length) await store.applyBatch(events);
}
