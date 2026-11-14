"""Procedural world generation (py3.12 side) — PRIORITY 4.

Deterministic terrain, hydrology, parks and vegetation for NEXUS WORLD.
Every function is pure: outputs depend ONLY on inputs (hash-based value
noise — no RNG state, same discipline as residents/engine.py), so the
same world always regenerates identically (event-sourcing principle).

The generated layers are ADDITIVE to the existing CityLayout: buildings,
roads and resident movement are untouched (regression-safe). Terrain is
flattened under roads/buildings so the city sits naturally on the land;
water and parks are new environmental zones exposed to the 3D layer and
(optionally) to resident cognition as environmental context.
"""
from __future__ import annotations

import hashlib
import math

GRID = 64              # heightfield resolution (64×64 = 4096 verts)
SEA_LEVEL = 0.28       # elevation fraction below which water appears
TREE_CANOPY = 160      # max trees generated


def _h01(*coords) -> float:
    """Deterministic hash → [0,1). The ONLY randomness source (no RNG)."""
    key = "|".join(repr(c) for c in coords).encode()
    return int.from_bytes(hashlib.sha256(key).digest()[:8], "big") / 2 ** 64


def _smooth(t: float) -> float:
    return t * t * (3.0 - 2.0 * t)


def value_noise(x: float, y: float, salt: str = "") -> float:
    """2D value noise on a unit lattice with smoothstep interpolation."""
    xi, yi = math.floor(x), math.floor(y)
    tx, ty = _smooth(x - xi), _smooth(y - yi)
    c = [(xi + dx, yi + dy)
         for dy in (0, 1) for dx in (0, 1)]
    n = [_h01(salt, cx, cy) for cx, cy in c]
    top = n[0] * (1 - tx) + n[1] * tx
    bot = n[2] * (1 - tx) + n[3] * tx
    return top * (1 - ty) + bot * ty


def fbm(x: float, y: float, octaves: int = 4, salt: str = "") -> float:
    """Multi-octave fractal Brownian motion, normalised to [0,1]."""
    total, amp, freq, norm = 0.0, 1.0, 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise(x * freq, y * freq, f"{salt}:{o}")
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


def generate_world(bounds, seed: int = 0, grid: int = GRID) -> dict:
    """Generate the full procedural environment for a bounds box.

    bounds: [minx, miny, maxx, maxy] from CityLayout.bounds()
    Returns a JSON-serialisable world description:
      elevation (grid×grid floats), water cells, parks, trees, rocks.
    """
    minx, miny, maxx, maxy = bounds
    w, h = maxx - minx, maxy - miny
    s = f"nexus-worldgen-v1:{seed}"

    # ---------------- elevation (fBm + gentle island falloff at edges)
    elevation = []
    for j in range(grid):
        for i in range(grid):
            u, v = i / (grid - 1), j / (grid - 1)
            e = fbm(4 + u * 4, 4 + v * 4, 4, f"{s}:elev")
            # soften toward map borders so the city reads as a basin
            edge = min(u, v, 1 - u, 1 - v)
            e *= 0.75 + 0.5 * min(edge * 4.0, 1.0)
            elevation.append(round(e, 5))

    # ---------------- water: low-elevation cells (river/lake network)
    water = []
    for j in range(grid):
        for i in range(grid):
            if elevation[j * grid + i] < SEA_LEVEL:
                water.append([i, j])

    # ---------------- parks: high-vegetation noise, away from water
    parks = []
    for j in range(2, grid - 2, 6):
        for i in range(2, grid - 2, 6):
            veg = fbm(2 + i / 9, 2 + j / 9, 3, f"{s}:veg")
            e = elevation[j * grid + i]
            if veg > 0.62 and e >= SEA_LEVEL and e < 0.62:
                parks.append({"cell": [i, j], "size": round(veg, 3),
                              "center": [minx + (i / (grid - 1)) * w,
                                         miny + (j / (grid - 1)) * h]})

    # ---------------- trees: deterministic scatter inside parks
    trees = []
    for p_idx, park in enumerate(parks):
        quota = max(3, int(park["size"] * 24))
        placed = 0
        tries = 0
        while placed < quota and len(trees) < TREE_CANOPY and tries < 200:
            tries += 1
            rx = _h01(s, "tree", p_idx, tries, "x")
            ry = _h01(s, "tree", p_idx, tries, "y")
            i = int(park["cell"][0] + (rx - 0.5) * 5)
            j = int(park["cell"][1] + (ry - 0.5) * 5)
            if not (0 <= i < grid and 0 <= j < grid):
                continue
            if elevation[j * grid + i] < SEA_LEVEL:
                continue
            x = minx + (i + rx) / grid * w
            y = miny + (j + ry) / grid * h
            trees.append({
                "x": round(x, 2), "y": round(y, 2),
                "h": round(2.2 + _h01(s, "tree-h", len(trees)) * 2.6, 2),
                "kind": ("oak" if _h01(s, "kind", len(trees)) < 0.6
                         else "pine")})
            placed += 1

    # ---------------- rocks: shoreline scatter
    rocks = []
    for j in range(grid):
        for i in range(grid):
            e = elevation[j * grid + i]
            if SEA_LEVEL - 0.04 < e < SEA_LEVEL + 0.03 and \
                    _h01(s, "rock", i, j) > 0.86 and len(rocks) < 40:
                rocks.append({
                    "x": round(minx + (i + 0.5) / grid * w, 2),
                    "y": round(miny + (j + 0.5) / grid * h, 2),
                    "r": round(0.3 + _h01(s, "rock-r", i, j) * 0.9, 2)})

    return {
        "seed": seed, "grid": grid, "bounds": list(bounds),
        "sea_level": SEA_LEVEL,
        "elevation": elevation,
        "water_cells": water,
        "parks": parks, "trees": trees, "rocks": rocks,
        "generator": "render3d/worldgen.py fbm-value-noise "
                     "(deterministic, hash-seeded)"}


def height_at(world: dict, x: float, y: float, max_height: float = 3.0,
              roads=None, buildings=None, flatten_radius: float = 2.5,
              flatten_to: float = 0.0) -> float:
    """Sample the heightfield at a world position, with city-flattening:
    near roads/buildings the terrain is pulled to `flatten_to` so nothing
    floats or intersects the existing city geometry."""
    if not world:
        return flatten_to
    minx, miny, maxx, maxy = world["bounds"]
    g = world["grid"]
    if not (minx <= x <= maxx and miny <= y <= maxy):
        return flatten_to
    u = (x - minx) / (maxx - minx)
    v = (y - miny) / (maxy - miny)
    fi, fj = u * (g - 1), v * (g - 1)
    i0, j0 = int(fi), int(fj)
    i1, j1 = min(i0 + 1, g - 1), min(j0 + 1, g - 1)
    tx, ty = _smooth(fi - i0), _smooth(fj - j0)
    e = (world["elevation"][j0 * g + i0] * (1 - tx) * (1 - ty) +
         world["elevation"][j0 * g + i1] * tx * (1 - ty) +
         world["elevation"][j1 * g + i0] * (1 - tx) * ty +
         world["elevation"][j1 * g + i1] * tx * ty)
    h = max(0.0, (e - world["sea_level"])) * max_height
    # city flattening mask (roads/buildings keep the ground buildable)
    near_city = False
    if roads:
        for r in roads:
            x1, y1, x2, y2 = r["x1"], r["y1"], r["x2"], r["y2"]
            if min(x1, x2) - flatten_radius <= x <= max(x1, x2) + \
                    flatten_radius and \
                    min(y1, y2) - flatten_radius <= y <= max(y1, y2) + \
                    flatten_radius:
                near_city = True
                break
    if not near_city and buildings:
        for b in buildings:
            if b["x"] - flatten_radius <= x <= b["x"] + b["w"] + \
                    flatten_radius and \
                    b["y"] - flatten_radius <= y <= b["y"] + b["d"] + \
                    flatten_radius:
                near_city = True
                break
    return flatten_to if near_city else round(h, 4)


def environmental_context(world: dict) -> dict:
    """Compact digest for residents/cognition: park proximity, water
    coverage, vegetation density — pure, additive, no movement changes."""
    if not world:
        return {}
    g = world["grid"]
    water_pct = 100.0 * len(world["water_cells"]) / (g * g)
    veg_pct = 100.0 * len(world["trees"]) / TREE_CANOPY
    return {
        "water_coverage_pct": round(water_pct, 2),
        "parks": len(world["parks"]),
        "trees": len(world["trees"]),
        "vegetation_density": round(min(veg_pct, 100.0), 2),
        "note": "procedural environment from render3d/worldgen.py — "
                "context only; movement/venues unchanged"}
