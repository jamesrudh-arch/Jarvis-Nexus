"""Scene-spec builder (py3.12 side): WorldStore → pure-JSON 3D scene.

The spec is the ONLY contract between the simulation and the Blender
layer (which runs in a separate Python 3.13 venv) — no shared state, no
store access from bpy, deterministic from the event-sourced world.
"""
from __future__ import annotations

import json

from geography.spatial import ACTION_COLOR, CityLayout
from persistence.world_store import WorldStore
from simulation.world_clock import WorldClock


def primary_tz(store: WorldStore) -> int:
    row = store.db.execute(
        "SELECT meta FROM geo_nodes WHERE level='country' "
        "ORDER BY node_id LIMIT 1").fetchone()
    if row:
        try:
            return int(json.loads(row["meta"]).get("tz_offset_hours", 0))
        except (ValueError, TypeError):
            return 0
    return 0


def build_scene_spec(store: WorldStore, layout: CityLayout | None = None,
                     hour_override: int | None = None) -> dict:
    layout = layout or CityLayout(store)
    tick = store.current_tick
    clock = WorldClock.from_store({
        "epoch_utc": store.meta("epoch_utc") or "2026-01-01T00:00:00",
        "minutes_per_tick": store.meta("minutes_per_tick", "10")})
    tz = primary_tz(store)
    desc = clock.describe(tick, tz)
    local = clock.local_time(tick, tz)
    hour = hour_override if hour_override is not None else local.hour
    residents = []
    for e in store.entities("resident"):
        d = e["data"]
        residents.append({
            "id": e["entity_id"], "name": d.get("name", e["entity_id"]),
            "pos": d.get("pos", [0, 0]),
            "action": d.get("action", "idle"),
            "color": ACTION_COLOR.get(d.get("action", "idle"),
                                      (0.8, 0.8, 0.8))})
    return {
        "world_id": store.meta("world_id"),
        "seed": int(store.meta("seed", "0") or 0),
        "tick": tick,
        "time": {"hour": hour,
                 "local_time": desc["local_time"],
                 "is_daytime": 6 <= hour < 18,
                 "season": desc["season"],
                 "weather": store.meta("weather", "clear")},
        "bounds": list(layout.bounds()),
        "buildings": layout.buildings(),
        "roads": layout.roads(),
        "residents": residents,
        "render_opts": {}}


def build_position_timeline(store: WorldStore) -> dict:
    """resident_id -> [[tick, x, y], ...] from resident.acted snapshots
    (the event log IS the animation source — no side-channel state)."""
    timeline: dict[str, list] = {}
    for tick, payload in store.db.execute(
            "SELECT tick,payload FROM events WHERE type='resident.acted' "
            "ORDER BY seq"):
        p = json.loads(payload)
        rid = p.get("resident_id")
        pos = (p.get("data") or {}).get("pos")
        if rid and pos:
            timeline.setdefault(rid, []).append(
                [tick, round(pos[0], 3), round(pos[1], 3)])
    return timeline
