"""Long-term memory + relationship graph (PRIORITY 5) — derived, honest.

Everything here is a PURE PROJECTION of the event log (event-sourcing
compliant): long-term memory with salience decay, an evolving
relationship graph from resident.communication events, and per-resident
autobiographies for the cognition layer. Nothing is fabricated; a world
replayed from its events rebuilds identical relationships and memories.

Distinguishing "long-term" from the existing 3-item recall window: the
engine's _context() shows the newest 3 memories; this module adds
salience-weighted retrieval (importance × recency × relationship
relevance) and the accumulated social graph that the autonomy policy
and the LLM prompt both consume.
"""
from __future__ import annotations

import hashlib
import json
import math

DECAY_HALF_LIFE_TICKS = 576.0     # 4 simulated days at 10 min/tick
AFFINITY_PER_MEETING = 1.0
AFFINITY_RECENCY_BONUS = 0.5
FRIEND_THRESHOLD = 2.5


def _h(*parts) -> int:
    key = "|".join(str(p) for p in parts).encode()
    return int.from_bytes(hashlib.sha256(key).digest()[:8], "big")


def _salience(importance: int, tick: int, mem_tick: int) -> float:
    age = max(0, tick - mem_tick)
    decay = 0.5 ** (age / DECAY_HALF_LIFE_TICKS)
    return round(importance * decay, 4)


class LongTermMemory:
    """Salience-weighted episodic memory + relationship graph, rebuilt
    from events on demand (pure, replay-safe)."""

    def __init__(self, store):
        self.store = store
        self._rel_cache: tuple[int, dict] | None = None
        self._mem_cache: tuple[int, list] | None = None

    # ----------------------------------------------------------- memories
    def memories(self, rid: str, tick: int | None = None,
                 limit: int = 5) -> list[dict]:
        """Salience-ranked memories for a resident."""
        tick = self.store.current_tick if tick is None else tick
        if self._mem_cache and self._mem_cache[0] == tick:
            all_mems = self._mem_cache[1]
        else:
            all_mems = []
            for row in self.store.db.execute(
                    "SELECT tick, payload FROM events WHERE "
                    "type='resident.memory_recorded' ORDER BY seq"):
                p = json.loads(row["payload"])
                all_mems.append({
                    "resident_id": p["resident_id"], "tick": p["tick"],
                    "kind": p.get("kind", "note"),
                    "text": p.get("text", ""),
                    "importance": p.get("importance", 2)})
            self._mem_cache = (tick, all_mems)
        mine = [m for m in all_mems if m["resident_id"] == rid]
        for m in mine:
            m["salience"] = _salience(m["importance"], tick, m["tick"])
        mine.sort(key=lambda m: (-m["salience"], -m["tick"]))
        return mine[:limit]

    def recall_about(self, rid: str, other_id: str,
                     tick: int | None = None) -> list[dict]:
        """Memories mentioning a specific other resident (relationship
        retrieval — 'what do I remember about them?')."""
        out = []
        for m in self.memories(rid, tick=tick, limit=60):
            if other_id in m["text"] or other_id.split("-")[-1] in m["text"]:
                out.append(m)
        return out[:3]

    def autobiography(self, rid: str, data: dict,
                      tick: int | None = None) -> str:
        """A narrative self-summary — the long-term identity the LLM
        prompt receives (and the audit can display)."""
        tick = self.store.current_tick if tick is None else tick
        rels = self.relationships(tick)
        friends = [r for r in rels.get(rid, [])
                   if r["affinity"] >= FRIEND_THRESHOLD]
        top = self.memories(rid, tick=tick, limit=3)
        lines = [
            f"I am {data['name']}, a {data['role']}.",
            f"I have {len(rels.get(rid, []))} acquaintances and "
            f"{len(friends)} friends." +
            (f" My closest are "
             f"{', '.join(r['name'] for r in friends[:2])}."
             if friends else ""),
            "Lately: " + ("; ".join(m["text"] for m in top)
                          if top else "quiet days.")]
        return " ".join(lines)

    # ----------------------------------------------------- relationships
    def relationships(self, tick: int | None = None) -> dict:
        """rid -> [{'other_id','name','meetings','last_tick','affinity'}]
        ranked by affinity. Affinity grows with meetings and recency —
        an honest social graph derived only from real communications."""
        tick = self.store.current_tick if tick is None else tick
        if self._rel_cache and self._rel_cache[0] == tick:
            return self._rel_cache[1]
        names = {e["entity_id"]: e["data"].get("name", e["entity_id"])
                 for e in self.store.entities("resident")}
        graph: dict[str, dict[str, dict]] = {}
        for row in self.store.db.execute(
                "SELECT tick, payload FROM events WHERE "
                "type='resident.communication' ORDER BY seq"):
            p = json.loads(row["payload"])
            a, b = p["from_id"], p["to_id"]
            for x, y in ((a, b), (b, a)):
                edge = graph.setdefault(x, {}).setdefault(y, {
                    "meetings": 0, "last_tick": 0, "first_tick": row["tick"]})
                edge["meetings"] += 1
                edge["last_tick"] = max(edge["last_tick"], row["tick"])
        out: dict[str, list] = {}
        for rid, edges in graph.items():
            ranked = []
            for other, e in edges.items():
                recency = AFFINITY_RECENCY_BONUS if (tick - e["last_tick"]) \
                    < 144 else 0.0
                ranked.append({
                    "other_id": other, "name": names.get(other, other),
                    "meetings": e["meetings"], "last_tick": e["last_tick"],
                    "affinity": round(
                        e["meetings"] * AFFINITY_PER_MEETING + recency, 2)})
            ranked.sort(key=lambda r: (-r["affinity"], r["other_id"]))
            out[rid] = ranked
        self._rel_cache = (tick, out)
        return out

    def friends(self, rid: str, tick: int | None = None) -> list[dict]:
        return [r for r in self.relationships(tick).get(rid, [])
                if r["affinity"] >= FRIEND_THRESHOLD]

    # ------------------------------------------------------ social context
    def social_pressure(self, rid: str, tick: int | None = None) -> float:
        """How strongly the social graph pulls this resident toward
        socializing: friends present in the world × extraversion-agnostic
        factor (0..1). Used by the autonomy policy as a real, derived
        motivation — not a random nudge."""
        rels = self.relationships(tick).get(rid, [])
        if not rels:
            return 0.0
        close = sum(1 for r in rels if r["affinity"] >= FRIEND_THRESHOLD)
        known = len(rels)
        return round(min(1.0, (known * 0.08 + close * 0.18)), 3)


def relationship_summary(store) -> dict:
    """Compact honest stats for the report/audit."""
    ltm = LongTermMemory(store)
    tick = store.current_tick
    graph = ltm.relationships(tick)
    all_edges = [r for rid, rels in graph.items() for r in rels]
    return {
        "tick": tick,
        "residents_with_relationships": len(graph),
        "total_edges": len(all_edges),
        "friendships": sum(1 for r in all_edges
                           if r["affinity"] >= FRIEND_THRESHOLD),
        "strongest": sorted(all_edges, key=lambda r: -r["affinity"])[:5],
        "mean_meetings": round(
            sum(r["meetings"] for r in all_edges) /
            max(1, len(all_edges)), 2),
        "note": "derived purely from resident.communication events "
                "(replay-safe projection)"}
