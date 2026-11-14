"""Deterministic 2D spatial layout of the world (Phase 2 + 3D).

Single source of truth for WHERE things are — used by BOTH the resident
movement simulation and the 3D renderer, so the rendered world is always
exactly the world being simulated (directive: no duplicated capability).

Derived purely from the geo tree + world seed via SHA-256 hashing:
same store content ⇒ identical layout, so a replayed world renders
identically (ADR-002 determinism). No wall-clock, no RNG state.
"""
from __future__ import annotations

import hashlib
import json
import math

BLOCK = 34.0          # district block footprint (world units)
ROAD = 4.0            # inter-block road width
LANE = 2.0            # intra-block lane width
MARGIN = 12.0         # world edge margin

KIND_SIZE: dict[str, tuple[float, float, float]] = {
    # kind: (width, depth, height)
    "residential": (6.0, 6.0, 4.5),
    "shop": (7.0, 6.0, 4.0),
    "workshop": (9.0, 8.0, 6.0),
    "civic": (8.0, 7.0, 7.0),
    "food": (6.0, 5.0, 3.5),
}
KIND_FALLBACK = (6.0, 6.0, 4.0)

KIND_COLOR: dict[str, tuple[float, float, float]] = {
    "residential": (0.83, 0.72, 0.56),
    "shop": (0.90, 0.80, 0.38),
    "workshop": (0.56, 0.61, 0.71),
    "civic": (0.76, 0.57, 0.76),
    "food": (0.86, 0.52, 0.40),
}
ACTION_COLOR: dict[str, tuple[float, float, float]] = {
    "sleeping": (0.30, 0.40, 0.85),
    "eating": (0.95, 0.85, 0.25),
    "working": (0.95, 0.55, 0.15),
    "socializing": (0.92, 0.45, 0.65),
    "leisure": (0.25, 0.75, 0.70),
    "commuting": (0.92, 0.92, 0.95),
    "idle": (0.55, 0.55, 0.58),
}


def _unit(*parts) -> float:
    """Deterministic float in [0, 1) from the given parts (no RNG state)."""
    blob = ":".join(str(p) for p in parts)
    return int(hashlib.sha256(blob.encode()).hexdigest()[:12], 16) / \
        float(16 ** 12)


class CityLayout:
    """Lays every district of the world on a grid; buildings inside blocks.

    Deterministic given the store's geo tree + seed. Movement uses building
    centres; rendering uses full boxes + roads. Both come from here.
    """

    def __init__(self, store):
        self.store = store
        self.seed = int(store.meta("seed", "0") or 0)
        rows = store.db.execute(
            "SELECT node_id,parent_id,level,name,meta FROM geo_nodes "
            "ORDER BY node_id").fetchall()
        self.nodes: dict[str, dict] = {}
        self.children: dict[str | None, list[dict]] = {}
        for r in rows:
            node = {"node_id": r["node_id"], "parent_id": r["parent_id"],
                    "level": r["level"], "name": r["name"],
                    "meta": json.loads(r["meta"])}
            self.nodes[r["node_id"]] = node
            self.children.setdefault(r["parent_id"], []).append(node)
        self.districts = sorted(
            (n for n in self.nodes.values() if n["level"] == "district"),
            key=lambda n: n["node_id"])
        self._buildings: list[dict] | None = None
        self._roads: list[dict] | None = None
        self._bounds: tuple[float, float, float, float] | None = None

    # ------------------------------------------------------------ public
    def buildings(self) -> list[dict]:
        self._ensure()
        return self._buildings

    def roads(self) -> list[dict]:
        self._ensure()
        return self._roads

    def bounds(self) -> tuple[float, float, float, float]:
        """(min_x, min_y, max_x, max_y) of the built area incl. margin."""
        self._ensure()
        return self._bounds

    def building(self, building_id: str) -> dict | None:
        return next((b for b in self.buildings() if b["id"] == building_id),
                    None)

    def building_name(self, building_id: str) -> str:
        b = self.building(building_id)
        node = self.nodes.get(building_id)
        if b and node:
            return node["name"]
        return building_id

    # ------------------------------------------------------------ layout
    def _ensure(self) -> None:
        if self._buildings is not None:
            return
        buildings: list[dict] = []
        roads: list[dict] = []
        n = max(1, len(self.districts))
        cols = math.ceil(math.sqrt(n))
        pitch = BLOCK + ROAD
        extent = cols * pitch + ROAD
        # inter-block road grid
        for i in range(cols + 1):
            x = i * pitch
            roads.append({"x1": x, "y1": -ROAD, "x2": x, "y2": extent,
                          "width": ROAD})
            roads.append({"x1": -ROAD, "y1": i * pitch, "x2": extent,
                          "y2": i * pitch, "width": ROAD})
        for idx, district in enumerate(self.districts):
            gx = (idx % cols) * pitch + ROAD
            gy = (idx // cols) * pitch + ROAD
            # intra-block cross lanes
            roads.append({"x1": gx, "y1": gy + BLOCK / 2,
                          "x2": gx + BLOCK, "y2": gy + BLOCK / 2,
                          "width": LANE})
            roads.append({"x1": gx + BLOCK / 2, "y1": gy,
                          "x2": gx + BLOCK / 2, "y2": gy + BLOCK,
                          "width": LANE})
            nbs = sorted(self.children.get(district["node_id"], []),
                         key=lambda x: x["node_id"])
            for j, nb in enumerate(nbs):
                # neighbourhood sub-cell (2x2 grid inside the block)
                cx = gx + (j % 2) * (BLOCK / 2) + BLOCK / 8
                cy = gy + (j // 2) * (BLOCK / 2) + BLOCK / 8
                cell = BLOCK / 2 - BLOCK / 8
                bs = sorted(self.children.get(nb["node_id"], []),
                            key=lambda x: x["node_id"])
                for k, bnode in enumerate(bs):
                    kind = bnode["meta"].get("kind", "residential")
                    w, d, h = KIND_SIZE.get(kind, KIND_FALLBACK)
                    fx = 0.30 + 0.55 * _unit(self.seed, bnode["node_id"], "x")
                    fy = 0.30 + 0.55 * _unit(self.seed, bnode["node_id"], "y")
                    fh = 0.85 + 0.5 * _unit(self.seed, bnode["node_id"], "h")
                    x = cx + fx * (cell - w)
                    y = cy + fy * (cell - d)
                    buildings.append({
                        "id": bnode["node_id"], "kind": kind,
                        "name": bnode["name"], "district": district["name"],
                        "neighbourhood": nb["name"],
                        "x": round(x, 3), "y": round(y, 3),
                        "w": w, "d": d, "h": round(h * fh, 3),
                        "center": (round(x + w / 2, 3), round(y + d / 2, 3)),
                        "color": KIND_COLOR.get(kind, (0.7, 0.7, 0.7))})
        self._buildings = sorted(buildings, key=lambda b: b["id"])
        self._roads = roads
        self._bounds = (-MARGIN, -MARGIN, extent + MARGIN - ROAD / 2,
                        extent + MARGIN - ROAD / 2)
