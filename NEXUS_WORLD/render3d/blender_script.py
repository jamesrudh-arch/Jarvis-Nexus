"""CLI wrapper around render3d.blender_core — executed by the py3.13
bpy venv (render3d/driver.py). Single JSON result line on stdout.

Usage:
  blender_script.py render  <spec.json> <out.png> [--view top --samples 24
                            --width 960 --height 540 --brightness 1.0]
  blender_script.py export  <spec.json> <out_path> --fmt usd|gltf|glb|fbx
  blender_script.py animate <spec.json> <out.blend> <positions.json>
  blender_script.py world   <spec.json> <world.json> <positions.json>
                            <out.blend> <out.png> [--samples 16]
  blender_script.py bundle  <in.blend> <out_dir>
  blender_script.py info
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from render3d import blender_core  # noqa: E402


def op_world(spec, world, positions, out_blend, out_png, samples,
            bundle_dir=None):
    """Composite PRIORITY-4 op: city + terrain + weather + characters +
    creatures + walk cycles + physics bake + render (+ optional UE bundle
    — slow for big scenes, so it is opt-in)."""
    from render3d import characters_core, physics_core, terrain_core, \
        ue_export
    world["_roads"] = spec.get("roads")
    world["_buildings"] = spec.get("buildings")
    built = json.loads(blender_core.build(spec))
    if not built.get("ok"):
        return built
    terr = json.loads(terrain_core.build_terrain(world, max_height=3.0))
    wx = json.loads(terrain_core.build_weather(
        spec.get("time", {}).get("weather", "clear"), spec["bounds"]))
    chars = json.loads(characters_core.build_characters(spec))
    walks = []
    for rid, timeline in list(positions.items())[:24]:
        w = json.loads(characters_core.animate_walk(
            rid, timeline,
            phase=float(sum(ord(c) for c in rid)) % 7))
        walks.append({"id": rid, "ok": w.get("ok")})
    creatures = json.loads(characters_core.build_creatures(spec["bounds"]))
    phys = json.loads(physics_core.run_physics(spec["bounds"]))
    cam = json.loads(blender_core.setup_camera("top", spec["bounds"]))
    cfg = json.loads(blender_core.setup_render(samples, 960, 540))
    res = json.loads(blender_core.render(out_png))
    ue = {"ok": True, "skipped": True,
          "note": "UE bundle is opt-in (--bundle <dir>)"}
    if bundle_dir:
        ue = json.loads(ue_export.export_unreal_bundle(bundle_dir))
    saved = json.loads(blender_core.save(out_blend))
    return {"ok": all((built.get("ok"), terr.get("ok"),
                       chars.get("ok"), creatures.get("ok"),
                       phys.get("ok"), res.get("ok"))),
            "city": built, "terrain": terr, "weather": wx,
            "characters": chars, "walk_cycles": walks,
            "creatures": creatures, "physics": phys,
            "render": res, "camera": cam, "render_config": cfg,
            "ue_bundle": ue, "save": saved}


def op_bundle(in_blend, out_dir):
    from render3d import ue_export
    loaded = json.loads(blender_core.load(in_blend))
    if not loaded.get("ok"):
        return loaded
    return json.loads(ue_export.export_unreal_bundle(out_dir))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("op", choices=["render", "export", "animate", "info",
                                    "world", "bundle"])
    ap.add_argument("spec", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("pos3", nargs="?", help="world op: positions.json")
    ap.add_argument("pos4", nargs="?", help="world op: out.blend")
    ap.add_argument("pos5", nargs="?", help="world op: out.png")
    ap.add_argument("--view", default="top")
    ap.add_argument("--samples", type=int, default=24)
    ap.add_argument("--width", type=int, default=960)
    ap.add_argument("--height", type=int, default=540)
    ap.add_argument("--brightness", type=float, default=1.0)
    ap.add_argument("--fmt", default="usd")
    ap.add_argument("--positions", default=None)
    ap.add_argument("--world", default=None)
    ap.add_argument("--bundle", default=None,
                    help="world op: also export UE bundle to this dir")
    args = ap.parse_args()

    if args.op == "info":
        print(blender_core.info())
        return 0

    if args.op == "bundle":
        print(json.dumps(op_bundle(args.spec, args.out), sort_keys=True))
        return 0

    with open(args.spec) as fh:
        spec = json.load(fh)
    spec.setdefault("render_opts", {})["brightness"] = args.brightness

    if args.op == "world":
        # positional order: spec world.json positions.json out.blend out.png
        with open(args.out) as fh:
            world = json.load(fh)
        positions = {}
        if args.pos3:
            with open(args.pos3) as fh:
                positions = json.load(fh)
        out_blend = args.pos4
        out_png = args.pos5 or (out_blend or "world").replace(
            ".blend", ".png")
        out = op_world(spec, world, positions, out_blend, out_png,
                       args.samples, bundle_dir=args.bundle)
        print(json.dumps(out, sort_keys=True))
        return 0 if out.get("ok") else 1

    built = blender_core.build(spec)
    built_data = json.loads(built)
    if not built_data.get("ok"):
        print(built)
        return 1

    if args.op == "render":
        cam = blender_core.setup_camera(args.view, spec["bounds"])
        cfg = blender_core.setup_render(args.samples, args.width,
                                        args.height)
        res = blender_core.render(args.out)
        out = {**json.loads(res), "camera": json.loads(cam),
               "render_config": json.loads(cfg), "build": built_data}
    elif args.op == "export":
        res = blender_core.export(args.out, args.fmt)
        out = {**json.loads(res), "build": built_data}
    elif args.op == "animate":
        with open(args.positions) as fh:
            positions = json.load(fh)
        anim = blender_core.animate(positions)
        saved = blender_core.save(args.out)
        out = {**json.loads(anim), "save": json.loads(saved),
               "build": built_data}
    print(json.dumps(out, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
