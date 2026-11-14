#!/usr/bin/env python3
"""Smoke-test the composite P4 world op through the bpy venv driver.
Builds a real spec + world + positions, runs blender_script.py world,
prints the JSON result. Real Blender execution — no mocks."""
import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, "/home/z/my-project/NEXUS_WORLD")
from render3d.driver import SCRIPT, VENV_PY  # noqa: E402
from render3d import worldgen as wg  # noqa: E402

bounds = [0, 0, 120, 90]
spec = {
    "world_id": "p4-smoke", "seed": 7, "tick": 40,
    "time": {"hour": 15, "local_time": "15:00", "is_daytime": True,
             "season": "autumn", "weather": "clear"},
    "bounds": bounds,
    "buildings": [
        {"id": "b1", "x": 10, "y": 10, "w": 14, "d": 10, "h": 8,
         "kind": "home", "color": [0.7, 0.6, 0.5]},
        {"id": "b2", "x": 60, "y": 12, "w": 18, "d": 12, "h": 12,
         "kind": "work", "color": [0.5, 0.55, 0.6]},
        {"id": "b3", "x": 30, "y": 55, "w": 12, "d": 12, "h": 6,
         "kind": "venue", "color": [0.6, 0.5, 0.3]}],
    "roads": [
        {"x1": 0, "y1": 45, "x2": 120, "y2": 45, "width": 6},
        {"x1": 60, "y1": 0, "x2": 60, "y2": 90, "width": 6}],
    "residents": [
        {"id": f"r{i}", "name": f"Res {i}", "pos": [20 + i * 3, 40],
         "action": "working", "color": [0.8, 0.5, 0.2]}
        for i in range(4)],
    "render_opts": {}}

world = wg.generate_world(bounds, seed=7)
print("worldgen:", {k: (len(v) if isinstance(v, list) else v)
                    for k, v in world.items() if k != "elevation"},
      flush=True)
positions = {f"r{i}": [[t, 20 + i * 3 + t * 0.5, 40 + (t % 7) * 0.4]
                       for t in range(1, 25, 2)] for i in range(4)}

with tempfile.TemporaryDirectory(prefix="p4smoke_") as td:
    paths = {}
    for name, obj in (("spec", spec), ("world", world),
                      ("positions", positions)):
        p = os.path.join(td, f"{name}.json")
        with open(p, "w") as fh:
            json.dump(obj, fh)
        paths[name] = p
    out_blend = "/home/z/my-project/NEXUS_WORLD/workspace/blender/p4_smoke.blend"
    out_png = "/home/z/my-project/NEXUS_WORLD/workspace/renders/p4_smoke.png"
    proc = subprocess.run(
        [VENV_PY, SCRIPT, "world", paths["spec"], paths["world"],
         paths["positions"], out_blend, out_png, "--samples", "8"],
        capture_output=True, text=True, timeout=800, check=False)
    print("returncode:", proc.returncode, flush=True)
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-2000:], flush=True)
        print("STDOUT tail:", proc.stdout[-1500:], flush=True)
        sys.exit(1)
    lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
    for line in reversed(lines):
        try:
            res = json.loads(line)
            break
        except ValueError:
            continue
    print(json.dumps(res, indent=1)[:3000])
    # file evidence
    for p in (out_blend, out_png):
        print(p, os.path.getsize(p) if os.path.exists(p) else "MISSING")
