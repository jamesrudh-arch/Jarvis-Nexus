/**
 * Long-term memory + relationship graph (port of residents/memory.py).
 * Pure projection of the event log — salience-weighted recall, the
 * evolving social graph from resident.communication events, and
 * per-resident autobiographies. Nothing fabricated; replay-safe.
 */
import type { EventStore, StoredEvent } from "./store";

export const DECAY_HALF_LIFE_TICKS = 576.0; // 4 simulated days at 10 min/tick
export const AFFINITY_PER_MEETING = 1.0;
export const AFFINITY_RECENCY_BONUS = 0.5;
export const FRIEND_THRESHOLD = 2.5;

export interface MemRow {
  resident_id: string;
  tick: number;
  kind: string;
  text: string;
  importance: number;
  salience?: number;
}

export interface RelationEdge {
  other_id: string;
  name: string;
  meetings: number;
  last_tick: number;
  affinity: number;
}

function salience(importance: number, tick: number, memTick: number): number {
  const age = Math.max(0, tick - memTick);
  const decay = Math.pow(0.5, age / DECAY_HALF_LIFE_TICKS);
  return Math.round(importance * decay * 10000) / 10000;
}

interface CommPayload {
  from_id: string;
  to_id: string;
}
interface MemPayload {
  resident_id: string;
  tick: number;
  kind: string;
  text: string;
  importance: number;
}

export class LongTermMemory {
  private memCache: { tick: number; rows: MemRow[] } | null = null;
  private relCache: { tick: number; graph: Record<string, RelationEdge[]> } | null = null;
  private names = new Map<string, string>();

  constructor(private store: EventStore) {}

  private async allMemories(tick: number): Promise<MemRow[]> {
    if (this.memCache && this.memCache.tick === tick) return this.memCache.rows;
    const evs = await this.store.eventsOfType<MemPayload>("resident.memory_recorded");
    const rows: MemRow[] = evs.map((e) => ({
      resident_id: e.payload.resident_id,
      tick: e.payload.tick,
      kind: e.payload.kind ?? "note",
      text: e.payload.text ?? "",
      importance: e.payload.importance ?? 2,
    }));
    this.memCache = { tick, rows };
    return rows;
  }

  /** Salience-ranked memories for a resident. */
  async memories(rid: string, tick: number, limit = 5): Promise<MemRow[]> {
    const mine = (await this.allMemories(tick)).filter((m) => m.resident_id === rid);
    for (const m of mine) m.salience = salience(m.importance, tick, m.tick);
    mine.sort((a, b) => (b.salience! - a.salience!) || (b.tick - a.tick));
    return mine.slice(0, limit);
  }

  async recallAbout(rid: string, otherId: string, tick: number): Promise<MemRow[]> {
    const mine = await this.memories(rid, tick, 60);
    const suffix = otherId.split("-").pop() ?? "";
    return mine.filter((m) => m.text.includes(otherId) || m.text.includes(suffix)).slice(0, 3);
  }

  /** Narrative self-summary (the identity the UI / LLM prompt receives). */
  async autobiography(rid: string, data: Record<string, unknown>, tick: number): Promise<string> {
    const rels = (await this.relationships(tick))[rid] ?? [];
    const friends = rels.filter((r) => r.affinity >= FRIEND_THRESHOLD);
    const top = await this.memories(rid, tick, 3);
    const lines = [
      `I am ${data.name}, a ${data.role}.`,
      `I have ${rels.length} acquaintances and ${friends.length} friends.` +
        (friends.length
          ? ` My closest are ${friends.slice(0, 2).map((f) => f.name).join(", ")}.`
          : ""),
      "Lately: " + (top.length ? top.map((m) => m.text).join("; ") : "quiet days."),
    ];
    return lines.join(" ");
  }

  /** rid -> ranked relationship edges (derived only from communications). */
  async relationships(tick: number): Promise<Record<string, RelationEdge[]>> {
    if (this.relCache && this.relCache.tick === tick) return this.relCache.graph;
    if (this.names.size === 0) {
      for (const e of await this.store.entitiesOfType("resident")) {
        this.names.set(e.entity_id, (e.data.name as string) ?? e.entity_id);
      }
    }
    const comms = await this.store.eventsOfType<CommPayload>("resident.communication");
    const graph = new Map<string, Map<string, { meetings: number; last_tick: number; first_tick: number }>>();
    for (const ev of comms) {
      const a = ev.payload.from_id;
      const b = ev.payload.to_id;
      for (const [x, y] of [
        [a, b],
        [b, a],
      ] as Array<[string, string]>) {
        const edges = graph.get(x) ?? new Map();
        const edge =
          edges.get(y) ?? { meetings: 0, last_tick: 0, first_tick: ev.tick };
        edge.meetings += 1;
        edge.last_tick = Math.max(edge.last_tick, ev.tick);
        edges.set(y, edge);
        graph.set(x, edges);
      }
    }
    const out: Record<string, RelationEdge[]> = {};
    for (const [rid, edges] of graph) {
      const ranked: RelationEdge[] = [...edges.entries()].map(([other, e]) => {
        const recency = tick - e.last_tick < 144 ? AFFINITY_RECENCY_BONUS : 0;
        return {
          other_id: other,
          name: this.names.get(other) ?? other,
          meetings: e.meetings,
          last_tick: e.last_tick,
          affinity: Math.round((e.meetings * AFFINITY_PER_MEETING + recency) * 100) / 100,
        };
      });
      ranked.sort((a, b) => b.affinity - a.affinity || (a.other_id < b.other_id ? -1 : 1));
      out[rid] = ranked;
    }
    this.relCache = { tick, graph: out };
    return out;
  }

  async friends(rid: string, tick: number): Promise<RelationEdge[]> {
    return ((await this.relationships(tick))[rid] ?? []).filter(
      (r) => r.affinity >= FRIEND_THRESHOLD
    );
  }

  /** Derived social pull (0..1) — a real motivation, not a random nudge. */
  async socialPressure(rid: string, tick: number): Promise<number> {
    const rels = (await this.relationships(tick))[rid] ?? [];
    if (rels.length === 0) return 0;
    const close = rels.filter((r) => r.affinity >= FRIEND_THRESHOLD).length;
    return Math.round(Math.min(1, rels.length * 0.08 + close * 0.18) * 1000) / 1000;
  }
}

export interface RelationshipSummary {
  tick: number;
  residents_with_relationships: number;
  total_edges: number;
  friendships: number;
  strongest: RelationEdge[];
  mean_meetings: number;
  note: string;
}

export async function relationshipSummary(store: EventStore, tick: number): Promise<RelationshipSummary> {
  const ltm = new LongTermMemory(store);
  const graph = await ltm.relationships(tick);
  const allEdges = Object.values(graph).flat();
  return {
    tick,
    residents_with_relationships: Object.keys(graph).length,
    total_edges: allEdges.length,
    friendships: allEdges.filter((r) => r.affinity >= FRIEND_THRESHOLD).length,
    strongest: [...allEdges].sort((a, b) => b.affinity - a.affinity).slice(0, 5),
    mean_meetings:
      Math.round(
        (allEdges.reduce((s, r) => s + r.meetings, 0) / Math.max(1, allEdges.length)) * 100
      ) / 100,
    note: "derived purely from resident.communication events (replay-safe projection)",
  };
}
