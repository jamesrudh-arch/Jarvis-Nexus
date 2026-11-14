"""Geography hierarchy (spec §12): world → continent → country → state/province
→ city → district → neighbourhood → building.

Fictional, procedurally generated geography (seeded, deterministic) — kept
separate from any future real-world imports (ODbL isolation, ADR-004).
"""
from __future__ import annotations

import json
import random

from persistence.world_store import WorldStore

GEO_LEVELS = ["world", "continent", "country", "state", "city",
              "district", "neighbourhood", "building"]

# Region level for simulation ownership at Tier 0 (spec §31).
REGION_LEVEL = "state"

_SYLL_A = ["Ar", "Bel", "Cor", "Dra", "Eld", "Fen", "Gal", "Hal", "Ith",
           "Jor", "Kel", "Lum", "Mor", "Nor", "Ost", "Pel", "Quen", "Rav",
           "Sil", "Tor", "Ulm", "Ver", "Wyn", "Xan", "Yal", "Zeph"]
_SYLL_B = ["a", "e", "i", "o", "u", "ae", "ia", "ora", "ei"]
_SYLL_C = ["dor", "gard", "holm", "mark", "mund", "nia", "port", "ridge",
           "shire", "stead", "thal", "ton", "vale", "wick"]

_LEVEL_SUFFIX = {
    "continent": ["Continent", "Landmass", "Expanse"],
    "country": ["Republic", "Kingdom", "Union", "Federation"],
    "state": ["Province", "State", "Territory"],
    "city": ["City", "Metro", "Haven"],
    "district": ["District", "Quarter", "Ward"],
    "neighbourhood": ["Neighbourhood", "Rows", "Heights", "Commons"],
    "building": ["House", "Hall", "Works", "Shop", "Depot"],
}


def _name(rng: random.Random, level: str) -> str:
    base = (rng.choice(_SYLL_A) + rng.choice(_SYLL_B) + rng.choice(_SYLL_C))
    return f"{base} {rng.choice(_LEVEL_SUFFIX.get(level, ['Region']))}"


def generate_world_geography(store: WorldStore, seed: int,
                             continents: int = 2, countries_per_continent: int = 1,
                             states_per_country: int = 2, cities_per_state: int = 2,
                             districts_per_city: int = 2,
                             neighbourhoods_per_district: int = 2,
                             buildings_per_neighbourhood: int = 2,
                             world_name: str = "Nexus Prime") -> dict:
    """Procedurally create the fictional geography as geo.node_created events.

    Deterministic: same seed ⇒ identical hierarchy, names and IDs.
    Countries carry a UTC offset and hemisphere in meta (used by WorldClock).
    """
    rng = random.Random(seed)
    counts = {lvl: 0 for lvl in GEO_LEVELS}

    def emit(level: str, parent_id: str | None, meta: dict) -> str:
        parent = store.geo_node(parent_id) if parent_id else None
        parent_path = parent["path"] if parent else ""
        node_id = store.allocate_id(f"geo-{level[:4]}")
        name = _name(rng, level)
        full_path = f"{parent_path}/{name}".lstrip("/")
        store.append(store.current_tick, "geo.node_created", {
            "idempotency_key": f"geo-{node_id}",
            "node_id": node_id, "parent_id": parent_id, "level": level,
            "name": name, "path": full_path, "meta": meta})
        counts[level] += 1
        return node_id

    world_id = emit("world", None, {"seed": seed, "fictional": True})
    for _ in range(continents):
        hemisphere = rng.choice(["north", "south"])
        cont_id = emit("continent", world_id, {"hemisphere": hemisphere})
        for _c in range(countries_per_continent):
            tz_offset = rng.choice([-4, -2, 0, 1, 3, 5, 8])
            ctry_id = emit("country", cont_id, {
                "tz_offset_hours": tz_offset,
                "hemisphere": hemisphere,
                "currency": f"NXC{abs(tz_offset)}"})
            for _s in range(states_per_country):
                state_id = emit("state", ctry_id, {})
                for _ci in range(cities_per_state):
                    city_id = emit("city", state_id, {
                        "tz_offset_hours": tz_offset})
                    for _d in range(districts_per_city):
                        dist_id = emit("district", city_id, {})
                        for _n in range(neighbourhoods_per_district):
                            nb_id = emit("neighbourhood", dist_id, {})
                            for _b in range(buildings_per_neighbourhood):
                                emit("building", nb_id, {
                                    "kind": rng.choice(
                                        ["residential", "shop", "workshop",
                                         "civic", "food"])})
    return {"world_node": world_id, "counts": counts}


def region_nodes(store: WorldStore) -> list[dict]:
    """All state-level nodes — the Tier 0 simulation regions."""
    rows = store.db.execute(
        "SELECT node_id,name,path,meta FROM geo_nodes WHERE level=? "
        "ORDER BY node_id", (REGION_LEVEL,)).fetchall()
    return [{"region_id": r["node_id"], "name": r["name"],
             "path": r["path"], "meta": json.loads(r["meta"])}
            for r in rows]


def ancestry(store: WorldStore, node_id: str) -> list[dict]:
    """Walk up to the world node."""
    chain, nid = [], node_id
    while nid:
        node = store.geo_node(nid)
        if not node:
            break
        chain.append(node)
        nid = node["parent_id"]
    return list(reversed(chain))
