"""Resident engine — the living population of NEXUS WORLD (Phase 2).

Everything here is DETERMINISTIC given (seed, tick, store content):
names, roles, traits, decisions, weather, meetings — all derived from
SHA-256 hashing, never from wall-clock or module-level RNG. Every state
change is an idempotent event on the WorldStore (ADR-002), so the world
replays and survives restarts.

Behaviour model (documented simplifications, Tier 0):
- needs: energy / hunger (satiety) / social / purpose, 0..100
- utility layer picks actions from needs + time-of-day priors
  (ADR-003 layer 1); an optional LLM cognition layer may override at
  ambiguous decision points (layer 2), validated against the allowed
  action set with utility fallback — an LLM can never invent an action.
- movement: kinematic straight-line motion between building centres
  (road-following pathing arrives with the Phase 3 navigation work).
- restart semantics: state persists via `resident.acted` snapshots on
  transitions and 36-tick syncs; a restarted engine re-syncs at the next
  transition or sync point (snapshots, not per-tick state, are truth).
"""
from __future__ import annotations

import hashlib
import json

from geography.spatial import CityLayout
from persistence.world_store import WorldStore
from simulation.world_clock import WorldClock

NEEDS = ("energy", "hunger", "social", "purpose")
ACTIONS = ("sleeping", "eating", "working", "socializing", "leisure",
           "commuting", "idle")

SPEED = 4.0            # world units per tick (locality keeps trips short)
SYNC_EVERY = 36        # full state sync every 36 ticks (6 sim hours)
MEETING_TICKS = 6      # meeting evaluation cadence (1 sim hour)
LLM_BUDGET_PER_TICK = 1   # hosted-LLM calls per tick (cost control)
LOCALITY_K = 4         # work/venue picked among the K nearest options

_FIRST = ["Ari", "Bex", "Cai", "Dov", "Eli", "Fyn", "Gia", "Hal", "Ivo",
          "Juna", "Kex", "Lio", "Mira", "Nox", "Oda", "Pim", "Quill",
          "Ryn", "Sable", "Tess", "Uli", "Vero", "Wren", "Yara", "Zeph",
          "Bram", "Cyra", "Dane", "Esme", "Fiora"]
_LAST = ["Ashvale", "Briarwood", "Coldwater", "Duskbane", "Emberly",
         "Fairholt", "Grimshaw", "Hollybrook", "Ironquill", "Juniper",
         "Kettleburn", "Lorimer", "Marsden", "Northgate", "Oakhollow",
         "Pinefall", "Quarry", "Rushmore", "Stonebrook", "Thornfield"]
_ROLES = ["artisan", "clerk", "engineer", "medic", "teacher", "smith",
          "courier", "grower"]
_TOPICS = ["the weather over the district", "the new workshop orders",
           "a rumour about the northern quarter", "the harvest festival",
           "the council's latest notice", "a strange light at night",
           "the price of bread", "an old story about the founding"]

_WEATHER_TABLE = ["clear", "clear", "clear", "clear", "cloudy", "cloudy",
                  "rain"]


def _h(*parts) -> int:
    blob = ":".join(str(p) for p in parts)
    return int(hashlib.sha256(blob.encode()).hexdigest()[:16], 16)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


class ResidentEngine:
    """Creates and advances the living population on the event store."""

    def __init__(self, store: WorldStore, layout: CityLayout | None = None,
                 cognition=None, enable_policy: bool = True):
        self.store = store
        self.layout = layout or CityLayout(store)
        # ResidentCognition | None (layer 2; None = deterministic only)
        self.cognition = cognition
        self.seed = int(store.meta("seed", "0") or 0)
        # PRIORITY 5: goal/mood/social policy + decision audit. The policy
        # is deterministic and event-derived (replay-safe); pass
        # enable_policy=False to run the pure utility script (the audit's
        # counterfactual uses the same switch).
        self.enable_policy = enable_policy
        from residents.autonomy import AutonomyLedger, AutonomyPolicy
        self.policy = AutonomyPolicy(store, self.seed) if enable_policy \
            else None
        self.autonomy_ledger = AutonomyLedger()
        self._clock = WorldClock.from_store({
            "epoch_utc": store.meta("epoch_utc") or "2026-01-01T00:00:00",
            "minutes_per_tick": store.meta("minutes_per_tick", "10")})
        self._tz = self._primary_tz()
        self._weather_day: int | None = None

    # ------------------------------------------------------------- helpers
    def _primary_tz(self) -> int:
        row = self.store.db.execute(
            "SELECT meta FROM geo_nodes WHERE level='country' "
            "ORDER BY node_id LIMIT 1").fetchone()
        if row:
            try:
                return int(json.loads(row["meta"]).get(
                    "tz_offset_hours", 0))
            except (ValueError, TypeError):
                return 0
        return 0

    def local_hour(self, tick: int) -> int:
        return self._clock.local_time(tick, self._tz).hour

    def is_weekday(self, tick: int) -> bool:
        return self._clock.local_time(tick, self._tz).weekday() < 5

    def residents(self) -> list[dict]:
        """Residents with identity fields merged at the top level."""
        return [{"resident_id": e["entity_id"], **e["data"]}
                for e in self.store.entities("resident")]

    # ------------------------------------------------------------ creation
    def create_population(self, n: int = 24) -> dict:
        if self.residents():
            raise ValueError("population already exists")
        buildings = self.layout.buildings()
        if not buildings:
            raise ValueError("no buildings: create world geography first")
        homes = ([b for b in buildings if b["kind"] == "residential"]
                 or buildings)
        works = ([b for b in buildings
                  if b["kind"] in ("workshop", "civic")] or buildings)
        venues = ([b for b in buildings
                   if b["kind"] in ("food", "shop")] or buildings)
        t0 = self.store.current_tick
        created: list[str] = []

        def nearest(from_b: dict, options: list[dict]) -> list[dict]:
            """The LOCALITY_K nearest options (same district first) —
            commutes stay short and districts feel like neighbourhoods."""
            ranked = sorted(
                options,
                key=lambda b: (abs(b["center"][0] - from_b["center"][0])
                               + abs(b["center"][1] - from_b["center"][1]))
                + (0 if b["district"] == from_b["district"] else 100))
            return ranked[:LOCALITY_K] or [from_b]

        for i in range(n):
            rid = self.store.allocate_id("res")
            name = (f"{_FIRST[_h(self.seed, i, 'first') % len(_FIRST)]} "
                    f"{_LAST[_h(self.seed, i, 'last') % len(_LAST)]}")
            role = _ROLES[_h(self.seed, i, "role") % len(_ROLES)]
            home = homes[_h(self.seed, i, "home") % len(homes)]
            work = nearest(home, works)[
                _h(self.seed, i, "work") % len(nearest(home, works))]
            # venue = THE single nearest venue — district-mates share it,
            # so evenings can actually produce meetings (emergent social
            # life) instead of 24 scattered private outings.
            venue = nearest(home, venues)[0]
            data = {
                "name": name, "role": role,
                "traits": {
                    "extraversion": round(
                        0.3 + 0.6 * (_h(self.seed, i, "ex") % 1000) / 1000,
                        2),
                    "industriousness": round(
                        0.3 + 0.6 * (_h(self.seed, i, "ind") % 1000) / 1000,
                        2)},
                "home_id": home["id"], "work_id": work["id"],
                "venue_id": venue["id"],
                "action": "idle", "pending_action": None,
                "at_building": home["id"], "target_building": None,
                "pos": [home["center"][0], home["center"][1]],
                "needs": {
                    "energy": 60 + _h(self.seed, i, "e") % 30,
                    "hunger": 55 + _h(self.seed, i, "hu") % 30,
                    "social": 45 + _h(self.seed, i, "s") % 30,
                    "purpose": 40 + _h(self.seed, i, "p") % 30},
                "llm_decisions": 0, "updated_tick": t0,
                "last_emitted_action": "idle"}
            self.store.append(t0, "resident.created", {
                "idempotency_key": f"resident-create-{rid}",
                "resident_id": rid, "data": data})
            created.append(rid)
        return {"created": len(created), "resident_ids": created}

    # ------------------------------------------------------------ stepping
    def step(self, tick: int) -> dict:
        """Advance every resident by one tick. The TickEngine calls this
        only for ticks that actually advanced (event keys are idempotent,
        so a crash-retry can never double-apply)."""
        summary = {"tick": tick, "llm_decisions": 0, "communications": 0,
                   "memories": 0, "action_changes": 0,
                   "policy_decisions": 0, "goal_evaluations": 0}
        self._maybe_weather(tick)
        weather = self.store.meta("weather", "clear")
        hour = self.local_hour(tick)
        weekday = self.is_weekday(tick)
        for r in self.residents():  # ordered by resident_id
            data = r
            # PRIORITY 5: goal-window boundary → evaluate the finished
            # goal and record it as a long-term memory (event-sourced)
            if self.policy is not None:
                ev = self.policy.evaluate_window(
                    r["resident_id"], data, tick, self._remember)
                if ev is not None:
                    summary["goal_evaluations"] += 1
                    summary["memories"] += 1
            self._tick_resident(r["resident_id"], data, tick, hour,
                                weekday, weather, summary)
            # Persist a snapshot whenever it is the source of truth the
            # next tick needs: action transitions, the 6-hour sync, and
            # EVERY tick with movement in progress (positions otherwise
            # reset to the last snapshot — movement IS state).
            if (data["action"] != data.get("last_emitted_action")
                    or tick % SYNC_EVERY == 0
                    or data["action"] == "commuting"):
                self._emit_acted(r["resident_id"], data, tick)
                data["last_emitted_action"] = data["action"]
                summary["action_changes"] += 1
        self._meetings(tick, summary)
        # PRIORITY 5: policy decisions surfaced in the step summary
        summary["policy_decisions"] = sum(
            1 for rec in self.autonomy_ledger.records
            if rec["tick"] == tick and rec["source"].startswith("policy"))
        return summary

    def autonomy_report(self) -> dict:
        """PRIORITY 5: the honest autonomy audit — decision sources,
        divergence from the pure script, action diversity."""
        report = self.autonomy_ledger.summary()
        if self.policy is not None:
            from residents.memory import relationship_summary
            report["relationships"] = relationship_summary(self.store)
        return report

    # -------------------------------------------------------- one resident
    def _tick_resident(self, rid: str, data: dict, tick: int, hour: int,
                       weekday: bool, weather: str,
                       summary: dict) -> None:
        needs = data["needs"]
        action = data["action"]

        # --- finish an in-progress commute first
        if action == "commuting":
            self._advance_position(data)
            needs["energy"] = _clamp(needs["energy"] - 0.18)
            needs["hunger"] = _clamp(needs["hunger"] - 0.22)
            self._arrive_if_reached(rid, data, tick)
            return

        # --- needs evolve under the current action
        self._apply_action_effects(action, needs)

        # --- choose the next action (utility layer 1)
        scores = self._scores(data, hour, weekday, weather)
        desired, reason = self._pick(scores, action)

        # --- PRIORITY 5: counterfactual = what the pure script would do
        # (recorded BEFORE any policy/LLM influence, for the audit)
        script_choice = desired

        # --- PRIORITY 5: policy layer (goals + mood + social graph) —
        # bounded, deterministic, event-derived bias. If it changes the
        # argmax, the decision source becomes 'policy'.
        if self.policy is not None:
            biased, policy_reason = self.policy.apply_bias(
                rid, data, scores, hour, tick)
            if policy_reason:
                b_desired, b_reason = self._pick(biased, action)
                if b_desired != desired:
                    desired, reason = b_desired, policy_reason

        # --- optional LLM override (layer 2), validated + fallback
        if (self.cognition is not None
                and summary["llm_decisions"] < LLM_BUDGET_PER_TICK
                and self._decision_point(rid, data, scores, tick)):
            allowed = sorted(scores.items(), key=lambda kv: -kv[1])
            chosen, creason = self.cognition.decide(
                rid, data, self._context(rid, data, hour, weather), allowed)
            if creason.startswith("llm:"):
                summary["llm_decisions"] += 1
                data["llm_decisions"] = data.get("llm_decisions", 0) + 1
                self._remember(rid, tick, "decision",
                               f"Reflected and chose to {chosen}.", 3)
            desired, reason = chosen, creason

        # --- PRIORITY 5: audit record (source of truth for autonomy)
        if desired != action:
            self.autonomy_ledger.record(rid, tick, reason, desired,
                                        script_choice)

        if desired == action:
            return  # no change — hysteresis keeps behaviour stable

        # --- act on the decision
        if desired == "sleeping":
            data["action"] = "sleeping"
            data["target_building"] = None
            data["pending_action"] = None
            self._on_action_start(rid, data, tick, "sleeping")
            return
        location = self._location_for(desired, data, hour)
        if location != data["at_building"]:
            data["action"] = "commuting"
            data["pending_action"] = desired
            data["target_building"] = location
        else:
            data["action"] = desired
            data["pending_action"] = None
            data["target_building"] = None
            self._on_action_start(rid, data, tick, desired)

    # ------------------------------------------------------------- movement
    def _target_pos(self, data: dict) -> list[float]:
        b = (self.layout.building(data["target_building"])
             if data.get("target_building") else None)
        if b is None:
            return data["pos"]
        return [b["center"][0], b["center"][1]]

    def _advance_position(self, data: dict) -> None:
        target = self._target_pos(data)
        px, py = data["pos"]
        tx, ty = target
        dx, dy = tx - px, ty - py
        dist = (dx * dx + dy * dy) ** 0.5
        if dist <= SPEED:
            data["pos"] = [tx, ty]
        else:
            data["pos"] = [round(px + SPEED * dx / dist, 3),
                           round(py + SPEED * dy / dist, 3)]

    def _arrive_if_reached(self, rid: str, data: dict, tick: int) -> None:
        target = data.get("target_building")
        if target is None:
            data["action"] = "idle"
            data["pending_action"] = None
            return
        if data["pos"] != self._target_pos(data):
            return  # still walking
        data["at_building"] = target
        data["action"] = data.get("pending_action") or "idle"
        data["pending_action"] = None
        data["target_building"] = None
        self._on_action_start(rid, data, tick, data["action"])

    def _on_action_start(self, rid: str, data: dict, tick: int,
                         action: str) -> None:
        if action == "working":
            self._remember(rid, tick, "work",
                           "Began work at "
                           f"{self.layout.building_name(data['at_building'])}.",
                           2)
        elif action == "eating":
            self._remember(rid, tick, "meal",
                           "Ate at "
                           f"{self.layout.building_name(data['at_building'])}.",
                           1)
        elif action == "sleeping":
            self._remember(rid, tick, "rest",
                           "Went to sleep at "
                           f"{self.layout.building_name(data['at_building'])}.",
                           1)

    # --------------------------------------------------------------- needs
    def _apply_action_effects(self, action: str, needs: dict) -> None:
        if action == "sleeping":
            needs["energy"] = _clamp(needs["energy"] + 1.0)
            needs["hunger"] = _clamp(needs["hunger"] - 0.22)
            needs["social"] = _clamp(needs["social"] - 0.05)
            needs["purpose"] = _clamp(needs["purpose"] - 0.04)
        elif action == "eating":
            needs["hunger"] = _clamp(needs["hunger"] + 9.0)
            needs["energy"] = _clamp(needs["energy"] + 0.1)
            needs["social"] = _clamp(needs["social"] - 0.05)
        elif action == "working":
            needs["purpose"] = _clamp(needs["purpose"] + 0.38)
            needs["energy"] = _clamp(needs["energy"] - 0.25)
            needs["hunger"] = _clamp(needs["hunger"] - 0.28)
            needs["social"] = _clamp(needs["social"] - 0.08)
        elif action == "socializing":
            needs["social"] = _clamp(needs["social"] + 1.2)
            needs["hunger"] = _clamp(needs["hunger"] - 0.2)
            needs["energy"] = _clamp(needs["energy"] - 0.15)
            needs["purpose"] = _clamp(needs["purpose"] + 0.05)
        elif action == "leisure":
            needs["energy"] = _clamp(needs["energy"] - 0.05)  # rest ≠ sleep
            needs["purpose"] = _clamp(needs["purpose"] - 0.05)
            needs["hunger"] = _clamp(needs["hunger"] - 0.2)
            needs["social"] = _clamp(needs["social"] - 0.12)
        else:  # idle
            needs["purpose"] = _clamp(needs["purpose"] - 0.08)
            needs["energy"] = _clamp(needs["energy"] + 0.05)
            needs["hunger"] = _clamp(needs["hunger"] - 0.2)
            needs["social"] = _clamp(needs["social"] - 0.12)

    # ------------------------------------------------------------- utility
    def _scores(self, data: dict, hour: int, weekday: bool,
                weather: str) -> dict[str, float]:
        n = data["needs"]
        tr = data["traits"]
        rain = 0.7 if weather == "rain" else 1.0
        night = 3.0 if (hour >= 22 or hour < 6) else 0.15
        meal = (1.6 if (7 <= hour < 9 or 12 <= hour < 14 or 18 <= hour < 20)
                else 0.45)
        work = 1.5 if (weekday and 9 <= hour < 17) else 0.08
        evening = 1.5 if 17 <= hour < 22 else (
            0.8 if not weekday and 10 <= hour < 22 else 0.30)
        return {
            "sleeping": (100 - n["energy"]) * 1.05 * night
            + (18.0 if (hour >= 22 or hour < 6) else 0.0),  # circadian
            "eating": (100 - n["hunger"]) * 0.85 * meal,
            "working": (100 - n["purpose"]) * 0.62 * work
            * tr["industriousness"],
            "socializing": (100 - n["social"]) * 0.70 * evening
            * tr["extraversion"] * rain,
            "leisure": 18.0 * (0.5 + (0.5 if 17 <= hour < 23 else 0.0))
            * rain,
            "idle": 4.0}

    def _pick(self, scores: dict[str, float],
              current: str) -> tuple[str, str]:
        best = max(scores.items(), key=lambda kv: kv[1])
        if current in scores:
            # hysteresis: keep the current action unless clearly beaten
            if scores[current] >= best[1] * 0.85 - 4.0:
                return current, "utility:keep"
        return best[0], "utility:best"

    def _decision_point(self, rid: str, data: dict,
                        scores: dict[str, float], tick: int) -> bool:
        """The LLM is consulted when the choice is genuinely ambiguous, or
        on the designated narrative resident's periodic check-in."""
        ranked = sorted(scores.values(), reverse=True)
        ambiguous = (len(ranked) > 1
                     and ranked[0] - ranked[1] < 0.12 * max(ranked[0], 1.0))
        narrative = (rid.endswith("000001") and tick % 24 == 0)
        return ambiguous or narrative

    def _location_for(self, action: str, data: dict, hour: int) -> str:
        if action in ("sleeping", "leisure"):
            return data["home_id"]
        if action == "working":
            return data["work_id"]
        if action == "eating":
            return data["venue_id"] if 12 <= hour < 14 else data["home_id"]
        if action == "socializing":
            return data["venue_id"]
        return data["at_building"]

    # ------------------------------------------------------------ memories
    def _remember(self, rid: str, tick: int, kind: str, text: str,
                  importance: int = 2) -> bool:
        mid = self.store.allocate_id("mem")
        return self.store.append(tick, "resident.memory_recorded", {
            "idempotency_key": f"mem-{mid}", "memory_id": mid,
            "resident_id": rid, "tick": tick, "kind": kind, "text": text,
            "importance": importance})

    def _context(self, rid: str, data: dict, hour: int,
                 weather: str) -> dict:
        mems = self.store.memories(rid, limit=3)
        return {
            "name": data["name"], "role": data["role"],
            "time": f"{hour:02d}:00", "weather": weather,
            "needs": {k: round(v) for k, v in data["needs"].items()},
            "location": self.layout.building_name(data["at_building"]),
            "current_action": data["action"],
            "recent_memories": [m["text"] for m in mems]}

    # ------------------------------------------------------ meet & weather
    def _meetings(self, tick: int, summary: dict) -> None:
        if tick % MEETING_TICKS:
            return
        groups: dict[str, list[dict]] = {}
        for r in self.residents():
            if r["action"] == "socializing" and r["at_building"]:
                groups.setdefault(r["at_building"], []).append(r)
        for building, group in sorted(groups.items()):
            if len(group) < 2:
                continue
            group.sort(key=lambda r: r["resident_id"])
            i = _h(self.seed, tick // MEETING_TICKS, building) \
                % (len(group) - 1)
            a, b = group[i], group[i + 1]
            key = (f"comm-{a['resident_id']}-{b['resident_id']}"
                   f"-{tick // MEETING_TICKS}")
            topic = _TOPICS[_h(self.seed, a["resident_id"],
                               b["resident_id"], tick // 36) % len(_TOPICS)]
            applied = self.store.append(tick, "resident.communication", {
                "idempotency_key": key,
                "from_id": a["resident_id"], "to_id": b["resident_id"],
                "building_id": building, "topic": topic})
            if applied:
                summary["communications"] += 1
                bname = self.layout.building_name(building)
                self._remember(a["resident_id"], tick, "meeting",
                               f"Met {b['name']} at {bname}; "
                               f"talked about {topic}.", 3)
                self._remember(b["resident_id"], tick, "meeting",
                               f"Met {a['name']} at {bname}; "
                               f"talked about {topic}.", 3)
                summary["memories"] += 2

    def _maybe_weather(self, tick: int) -> None:
        day = self._clock.time_at(tick).toordinal()
        if self._weather_day == day:
            return
        self._weather_day = day
        new = _WEATHER_TABLE[_h(self.seed, day) % len(_WEATHER_TABLE)]
        if self.store.meta("weather") != new:
            self.store.append(tick, "world.weather_changed", {
                "idempotency_key":
                    f"weather-{self.store.meta('world_id', 'w')}-{day}",
                "weather": new})

    # -------------------------------------------------------------- events
    def _emit_acted(self, rid: str, data: dict, tick: int) -> bool:
        # last_emitted_action is persisted ON PURPOSE: the next tick reads
        # a fresh copy from the store, so the change-marker must survive
        # the round-trip or every tick would look like a change.
        payload = {k: v for k, v in data.items() if k != "resident_id"}
        return self.store.append(tick, "resident.acted", {
            "idempotency_key": f"act-{rid}-{tick}",
            "resident_id": rid, "data": payload})
