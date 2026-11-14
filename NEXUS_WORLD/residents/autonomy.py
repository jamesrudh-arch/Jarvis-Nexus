"""Independent-cognition policy layer + autonomy audit (PRIORITY 5).

Honesty contract for "genuine autonomous behaviour":

1. The UTILITY SCRIPT is the baseline: circadian/weekday/needs scoring
   (residents/engine.py). Any world without policy/LLM runs exactly it.
2. The POLICY LAYER gives each resident persistent GOALS (deterministic
   per goal-window from the seed — replay-safe), a derived MOOD, and the
   derived SOCIAL GRAPH (residents/memory.py). These bias the utility
   scores by bounded factors (≤ 1.35) — residents diverge from the
   script in personally-consistent, explainable, non-random ways.
3. The LLM LAYER (when reachable) still chooses among allowed actions
   at ambiguous moments (ADR-003).
4. The AUDIT measures, per tick, WHICH source produced each decision and
   how far the population diverged from a counterfactual pure-utility
   run — the evidence that separates scripted routines from autonomous
   decisions. Nothing is claimed without these numbers.

Goal windows last GOAL_WINDOW ticks; the active goal is a pure function
of (seed, resident_id, window_index) — no hidden state, so replays and
restarts reconstruct identical intentions.
"""
from __future__ import annotations

import hashlib
import json
import math

from residents.memory import FRIEND_THRESHOLD, LongTermMemory

GOAL_WINDOW = 144          # ticks per goal window (1 simulated day)
MAX_BIAS = 1.35            # hard bound on any single score multiplier
GOAL_TYPES = ("purpose_build", "social_bond", "rest_well", "explore")


def _h(*parts) -> int:
    key = "|".join(str(p) for p in parts).encode()
    return int.from_bytes(hashlib.sha256(key).digest()[:8], "big")


# --------------------------------------------------------------- goals
def active_goal(seed: int, rid: str, tick: int) -> dict:
    """The deterministic goal for this resident in this window."""
    window = tick // GOAL_WINDOW
    gtype = GOAL_TYPES[_h(seed, rid, "goal", window) % len(GOAL_TYPES)]
    target = 2 + _h(seed, rid, "target", window) % 3   # 2..4
    return {"type": gtype, "target": target, "window": window,
            "starts_tick": window * GOAL_WINDOW,
            "ends_tick": (window + 1) * GOAL_WINDOW - 1}


def goal_progress(goal: dict, rid: str, store, ltm: LongTermMemory,
                  tick: int) -> dict:
    """Measure progress from the EVENT LOG inside the window (pure)."""
    w0, w1 = goal["starts_tick"], goal["ends_tick"]
    if goal["type"] == "purpose_build":
        n = 0
        for row in store.db.execute(
                "SELECT tick, payload FROM events WHERE "
                "type='resident.memory_recorded' AND tick BETWEEN ? AND ? "
                "ORDER BY seq", (w0, w1)):
            p = json.loads(row["payload"])
            if p["resident_id"] == rid and p.get("kind") == "work":
                n += 1
        return {"progress": n, "target": goal["target"], "unit": "shifts"}
    if goal["type"] == "social_bond":
        rels = ltm.relationships(tick).get(rid, [])
        n = sum(1 for r in rels if r["meetings"] >= 1)
        return {"progress": n, "target": goal["target"], "unit": "people"}
    if goal["type"] == "rest_well":
        n = 0
        for row in store.db.execute(
                "SELECT tick, payload FROM events WHERE "
                "type='resident.memory_recorded' AND tick BETWEEN ? AND ? "
                "ORDER BY seq", (w0, w1)):
            p = json.loads(row["payload"])
            if p["resident_id"] == rid and p.get("kind") == "rest":
                n += 1
        return {"progress": n, "target": goal["target"], "unit": "nights"}
    # explore: distinct buildings visited this window
    seen = set()
    for row in store.db.execute(
            "SELECT tick, payload FROM events WHERE "
            "type='resident.acted' AND tick BETWEEN ? AND ? ORDER BY seq",
            (w0, w1)):
        p = json.loads(row["payload"])
        if p["resident_id"] == rid:
            seen.add((p.get("data") or {}).get("at_building"))
    return {"progress": len(seen), "target": goal["target"],
            "unit": "buildings"}


# ---------------------------------------------------------------- mood
def mood(data: dict, memories: list[dict]) -> float:
    """Derived emotional valence in [-1, 1]: needs + salient memories.
    Pure function of (needs, memories) — replay-safe."""
    n = data["needs"]
    base = ((n["energy"] - 50) * 0.5 + (n["hunger"] - 50) * 0.3 +
            (n["social"] - 50) * 0.4 + (n["purpose"] - 50) * 0.3) / 160.0
    mem = 0.0
    for m in memories[:3]:
        if m["kind"] in ("meeting", "decision"):
            mem += 0.15
        elif m["kind"] in ("work",):
            mem += 0.05
    return round(max(-1.0, min(1.0, base + mem)), 3)


# ------------------------------------------------------------ policy
class AutonomyPolicy:
    """Goal + mood + social-graph biases over the utility scores."""

    def __init__(self, store, seed: int):
        self.store = store
        self.seed = seed
        self.ltm = LongTermMemory(store)
        self._window_evaluated: set[tuple[str, int]] = set()

    def apply_bias(self, rid: str, data: dict, scores: dict[str, float],
                   hour: int, tick: int) -> tuple[dict[str, float], str]:
        """Return biased scores + the policy reason ('policy:goal:...',
        'policy:social', 'policy:mood', or '' when no bias applied)."""
        goal = active_goal(self.seed, rid, tick)
        reasons = []
        out = dict(scores)

        if goal["type"] == "purpose_build" and 9 <= hour < 17:
            out["working"] = out["working"] * min(
                MAX_BIAS, 1.0 + 0.20 * min(1.0, goal["target"] / 4))
            reasons.append("goal:purpose")
        elif goal["type"] == "social_bond":
            pressure = self.ltm.social_pressure(rid, tick)
            if pressure > 0.3:
                out["socializing"] = out["socializing"] * min(
                    MAX_BIAS, 1.0 + pressure * 0.35)
                reasons.append("goal:social")
        elif goal["type"] == "rest_well" and (hour >= 21 or hour < 6):
            out["sleeping"] = out["sleeping"] * min(
                MAX_BIAS, 1.0 + 0.18)
            reasons.append("goal:rest")
        elif goal["type"] == "explore" and 10 <= hour < 20:
            # exploration shows as leisure/venue outings, not work
            out["leisure"] = out["leisure"] * min(MAX_BIAS, 1.0 + 0.22)
            out["socializing"] = out["socializing"] * min(
                MAX_BIAS, 1.0 + 0.15)
            reasons.append("goal:explore")

        # friends at the venue pull socializing (derived social fact)
        friends = self.ltm.friends(rid, tick)
        if friends and 17 <= hour < 22:
            out["socializing"] = out["socializing"] * min(
                MAX_BIAS, 1.0 + 0.10 * min(len(friends), 3))
            reasons.append("friends-present")

        # mood tilts: low mood slightly favours rest/leisure
        m = mood(data, self.ltm.memories(rid, tick=tick, limit=3))
        if m < -0.35:
            out["leisure"] = out["leisure"] * min(MAX_BIAS, 1.0 + 0.12)
            out["sleeping"] = out["sleeping"] * min(MAX_BIAS, 1.0 + 0.10)
            reasons.append("mood:low")
        elif m > 0.35:
            out["working"] = out["working"] * min(MAX_BIAS, 1.0 + 0.08)
            out["socializing"] = out["socializing"] * min(MAX_BIAS, 1.0 + 0.08)
            reasons.append("mood:high")

        return out, ("policy:" + "+".join(reasons) if reasons else "")

    # ------------------------------------------------- window evaluation
    def evaluate_window(self, rid: str, data: dict, tick: int,
                        remember_fn) -> dict | None:
        """At a window boundary, evaluate the finished goal and record a
        memory (event-sourced) — goal outcomes become long-term memories."""
        window = (tick // GOAL_WINDOW) - 1
        if window < 0 or (rid, window) in self._window_evaluated:
            return None
        # only evaluate once per resident/window, at first tick of the
        # new window (deterministic — replay produces the same events)
        if tick % GOAL_WINDOW != 0:
            return None
        self._window_evaluated.add((rid, window))
        goal = {"type": GOAL_TYPES[_h(self.seed, rid, "goal", window)
                                  % len(GOAL_TYPES)],
                "target": 2 + _h(self.seed, rid, "target", window) % 3,
                "window": window,
                "starts_tick": window * GOAL_WINDOW,
                "ends_tick": (window + 1) * GOAL_WINDOW - 1}
        prog = goal_progress(goal, rid, self.store, self.ltm,
                             goal["ends_tick"])
        achieved = prog["progress"] >= prog["target"]
        remember_fn(rid, tick, "goal",
                    f"My goal to {goal['type'].replace('_', ' ')} reached "
                    f"{prog['progress']}/{prog['target']} "
                    f"{prog['unit']} — "
                    f"{'achieved' if achieved else 'missed'}.",
                    3 if achieved else 2)
        return {"resident": rid, "goal": goal["type"],
                "progress": prog, "achieved": achieved}


# ---------------------------------------------------------------- audit
class AutonomyLedger:
    """Records the SOURCE of every decision + the counterfactual (what
    the pure utility script would have chosen). The audit that separates
    scripted routines from autonomous decisions — with numbers."""

    def __init__(self):
        self.records: list[dict] = []

    def record(self, rid: str, tick: int, source: str, chosen: str,
               counterfactual: str) -> None:
        self.records.append({
            "resident": rid, "tick": tick, "source": source,
            "chosen": chosen, "script_would_choose": counterfactual})

    def summary(self) -> dict:
        if not self.records:
            return {"note": "no decisions recorded"}
        by_source: dict[str, int] = {}
        for r in self.records:
            root = r["source"].split(":")[0]
            # the utility layer IS the script — normalise the name so the
            # audit reads unambiguously: script | policy | llm
            if root == "utility":
                root = "script"
            by_source[root] = by_source.get(root, 0) + 1
        total = len(self.records)
        diverged = sum(1 for r in self.records
                       if r["chosen"] != r["script_would_choose"])
        # per-resident action entropy (diversity of chosen actions)
        per_res: dict[str, dict[str, int]] = {}
        for r in self.records:
            per_res.setdefault(r["resident"], {})
            per_res[r["resident"]][r["chosen"]] = \
                per_res[r["resident"]].get(r["chosen"], 0) + 1
        entropies = []
        for counts in per_res.values():
            n = sum(counts.values())
            entropies.append(-sum((c / n) * math.log(c / n)
                                  for c in counts.values()))
        return {
            "decisions_recorded": total,
            "sources": {k: {"count": v, "pct": round(100 * v / total, 1)}
                        for k, v in sorted(by_source.items())},
            "divergence_from_script": {
                "decisions": diverged,
                "pct": round(100 * diverged / total, 1)},
            "population_action_entropy_mean": round(
                sum(entropies) / max(1, len(entropies)), 3),
            "residents_deciding": len(per_res),
            "honesty_note": (
                "script = circadian/needs utility layer; policy = "
                "goal/mood/social-graph bias (deterministic, replay-safe); "
                "llm = hosted model choice among allowed actions. "
                "divergence counts decisions where the taken action "
                "differs from what the pure script would choose.")}
