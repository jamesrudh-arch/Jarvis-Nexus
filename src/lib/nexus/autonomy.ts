/**
 * Independent-cognition policy layer + autonomy audit (port of
 * residents/autonomy.py). Goals are deterministic per goal-window from
 * the seed; mood derives from needs + salient memories; the social
 * graph pulls socializing. Biases are bounded (≤ MAX_BIAS) so residents
 * diverge from the pure script in personally-consistent, explainable,
 * non-random ways — and the ledger measures exactly that divergence.
 */
import { ha, mod } from "./hash";
import { FRIEND_THRESHOLD, LongTermMemory, type MemRow } from "./memory";
import type { EventStore, StoredEvent } from "./store";
import type { ResidentState } from "./engine";

export const GOAL_WINDOW = 144; // ticks per goal window (1 simulated day)
export const MAX_BIAS = 1.35;
export const GOAL_TYPES = ["purpose_build", "social_bond", "rest_well", "explore"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export interface Goal {
  type: GoalType;
  target: number;
  window: number;
  starts_tick: number;
  ends_tick: number;
}

export function activeGoal(seed: number, rid: string, tick: number): Goal {
  const window = Math.floor(tick / GOAL_WINDOW);
  const gtype = GOAL_TYPES[mod(ha(seed, rid, "goal", window), GOAL_TYPES.length)];
  const target = 2 + mod(ha(seed, rid, "target", window), 3); // 2..4
  return {
    type: gtype,
    target,
    window,
    starts_tick: window * GOAL_WINDOW,
    ends_tick: (window + 1) * GOAL_WINDOW - 1,
  };
}

interface MemPayload {
  resident_id: string;
  kind: string;
}
interface ActedPayload {
  resident_id: string;
  data?: { at_building?: string };
}

export interface GoalProgress {
  progress: number;
  target: number;
  unit: string;
}

/** Measure progress from the EVENT LOG inside the window (pure). */
export async function goalProgress(
  goal: Goal,
  rid: string,
  store: EventStore,
  ltm: LongTermMemory
): Promise<GoalProgress> {
  const w0 = goal.starts_tick;
  const w1 = goal.ends_tick;
  if (goal.type === "purpose_build") {
    const evs = await store.eventsOfType<MemPayload>("resident.memory_recorded", w0, w1);
    const n = evs.filter(
      (e) => e.payload.resident_id === rid && e.payload.kind === "work"
    ).length;
    return { progress: n, target: goal.target, unit: "shifts" };
  }
  if (goal.type === "social_bond") {
    const rels = (await ltm.relationships(w1))[rid] ?? [];
    const n = rels.filter((r) => r.meetings >= 1).length;
    return { progress: n, target: goal.target, unit: "people" };
  }
  if (goal.type === "rest_well") {
    const evs = await store.eventsOfType<MemPayload>("resident.memory_recorded", w0, w1);
    const n = evs.filter(
      (e) => e.payload.resident_id === rid && e.payload.kind === "rest"
    ).length;
    return { progress: n, target: goal.target, unit: "nights" };
  }
  // explore: distinct buildings visited this window
  const evs = await store.eventsOfType<ActedPayload>("resident.acted", w0, w1);
  const seen = new Set<string>();
  for (const e of evs) {
    if (e.payload.resident_id === rid) seen.add(e.payload.data?.at_building ?? "");
  }
  return { progress: seen.size, target: goal.target, unit: "buildings" };
}

/** Derived emotional valence in [-1, 1] (pure function of needs+memories). */
export function mood(data: { needs: Record<string, number> }, memories: MemRow[]): number {
  const n = data.needs;
  const base =
    ((n.energy - 50) * 0.5 +
      (n.hunger - 50) * 0.3 +
      (n.social - 50) * 0.4 +
      (n.purpose - 50) * 0.3) /
    160.0;
  let mem = 0;
  for (const m of memories.slice(0, 3)) {
    if (m.kind === "meeting" || m.kind === "decision") mem += 0.15;
    else if (m.kind === "work") mem += 0.05;
  }
  return Math.round(Math.max(-1, Math.min(1, base + mem)) * 1000) / 1000;
}

export type ResidentData = ResidentState;

/** Goal + mood + social-graph biases over the utility scores. */
export class AutonomyPolicy {
  private ltm: LongTermMemory;
  private windowEvaluated = new Set<string>();

  constructor(
    private store: EventStore,
    private seed: number
  ) {
    this.ltm = new LongTermMemory(store);
  }

  async applyBias(
    rid: string,
    data: ResidentData,
    scores: Record<string, number>,
    hour: number,
    tick: number
  ): Promise<{ scores: Record<string, number>; reason: string }> {
    const goal = activeGoal(this.seed, rid, tick);
    const reasons: string[] = [];
    const out = { ...scores };
    const cap = (v: number) => Math.min(MAX_BIAS, v);

    if (goal.type === "purpose_build" && hour >= 9 && hour < 17) {
      out.working = out.working * cap(1 + 0.2 * Math.min(1, goal.target / 4));
      reasons.push("goal:purpose");
    } else if (goal.type === "social_bond") {
      const pressure = await this.ltm.socialPressure(rid, tick);
      if (pressure > 0.3) {
        out.socializing = out.socializing * cap(1 + pressure * 0.35);
        reasons.push("goal:social");
      }
    } else if (goal.type === "rest_well" && (hour >= 21 || hour < 6)) {
      out.sleeping = out.sleeping * cap(1.18);
      reasons.push("goal:rest");
    } else if (goal.type === "explore" && hour >= 10 && hour < 20) {
      out.leisure = out.leisure * cap(1.22);
      out.socializing = out.socializing * cap(1.15);
      reasons.push("goal:explore");
    }

    const friends = await this.ltm.friends(rid, tick);
    if (friends.length > 0 && hour >= 17 && hour < 22) {
      out.socializing = out.socializing * cap(1 + 0.1 * Math.min(friends.length, 3));
      reasons.push("friends-present");
    }

    const m = mood(data, await this.ltm.memories(rid, tick, 3));
    if (m < -0.35) {
      out.leisure = out.leisure * cap(1.12);
      out.sleeping = out.sleeping * cap(1.1);
      reasons.push("mood:low");
    } else if (m > 0.35) {
      out.working = out.working * cap(1.08);
      out.socializing = out.socializing * cap(1.08);
      reasons.push("mood:high");
    }

    return { scores: out, reason: reasons.length ? "policy:" + reasons.join("+") : "" };
  }

  /** At a window boundary, evaluate the finished goal → long-term memory. */
  async evaluateWindow(
    rid: string,
    _data: ResidentData,
    tick: number,
    remember: (rid: string, tick: number, kind: string, text: string, importance: number) => void
  ): Promise<{ resident: string; goal: string; progress: GoalProgress; achieved: boolean } | null> {
    const window = Math.floor(tick / GOAL_WINDOW) - 1;
    if (window < 0 || this.windowEvaluated.has(`${rid}:${window}`)) return null;
    if (tick % GOAL_WINDOW !== 0) return null;
    this.windowEvaluated.add(`${rid}:${window}`);
    const goal: Goal = {
      type: GOAL_TYPES[mod(ha(this.seed, rid, "goal", window), GOAL_TYPES.length)],
      target: 2 + mod(ha(this.seed, rid, "target", window), 3),
      window,
      starts_tick: window * GOAL_WINDOW,
      ends_tick: (window + 1) * GOAL_WINDOW - 1,
    };
    const prog = await goalProgress(goal, rid, this.store, this.ltm);
    const achieved = prog.progress >= prog.target;
    remember(
      rid,
      tick,
      "goal",
      `My goal to ${goal.type.replace(/_/g, " ")} reached ${prog.progress}/${prog.target} ${prog.unit} — ${achieved ? "achieved" : "missed"}.`,
      achieved ? 3 : 2
    );
    return { resident: rid, goal: goal.type, progress: prog, achieved };
  }
}

// ------------------------------------------------------------------ audit
export interface LedgerRecord {
  resident: string;
  tick: number;
  source: string;
  chosen: string;
  script_would_choose: string;
}

/** Records the SOURCE of every decision + the counterfactual. */
export class AutonomyLedger {
  records: LedgerRecord[] = [];

  record(rid: string, tick: number, source: string, chosen: string, counterfactual: string) {
    this.records.push({ resident: rid, tick, source, chosen, script_would_choose: counterfactual });
  }

  summary(): Record<string, unknown> {
    if (this.records.length === 0) return { note: "no decisions recorded" };
    const bySource: Record<string, number> = {};
    for (const r of this.records) {
      let root = r.source.split(":")[0];
      if (root === "utility") root = "script"; // the utility layer IS the script
      bySource[root] = (bySource[root] ?? 0) + 1;
    }
    const total = this.records.length;
    const diverged = this.records.filter((r) => r.chosen !== r.script_would_choose).length;
    const perRes = new Map<string, Record<string, number>>();
    for (const r of this.records) {
      const m = perRes.get(r.resident) ?? {};
      m[r.chosen] = (m[r.chosen] ?? 0) + 1;
      perRes.set(r.resident, m);
    }
    const entropies: number[] = [];
    for (const counts of perRes.values()) {
      const n = Object.values(counts).reduce((a, b) => a + b, 0);
      entropies.push(
        -Object.values(counts).reduce((s, c) => s + (c / n) * Math.log(c / n), 0)
      );
    }
    return {
      decisions_recorded: total,
      sources: Object.fromEntries(
        Object.entries(bySource)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, v]) => [k, { count: v, pct: Math.round((1000 * v) / total) / 10 }])
      ),
      divergence_from_script: {
        decisions: diverged,
        pct: Math.round((1000 * diverged) / total) / 10,
      },
      population_action_entropy_mean:
        Math.round((entropies.reduce((a, b) => a + b, 0) / Math.max(1, entropies.length)) * 1000) / 1000,
      residents_deciding: perRes.size,
      honesty_note:
        "script = circadian/needs utility layer; policy = goal/mood/social-graph bias (deterministic, replay-safe); llm = hosted model choice among allowed actions. divergence counts decisions where the taken action differs from what the pure script would choose.",
    };
  }
}
