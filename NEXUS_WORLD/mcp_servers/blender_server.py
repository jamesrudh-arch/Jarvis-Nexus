"""Blender headless MCP server (stdio) — REAL Blender Python API control
over the Model Context Protocol.

Runs inside the dedicated bpy venv (.venv-blender, Python 3.13 + bpy
5.3.0 + mcp SDK <2) and is spawned by integration/mcp_layer.py with the
config in integration/wiring.py. Every tool is a genuine bpy operation:
scene graph construction, camera setup, Cycles CPU render, USD/glTF/FBX
export, keyframe animation — the headless equivalent of editor control
(this is the honest Tier-0 substitute for GUI-editor MCPs, which the
register REJECTED because they require a desktop Blender app: see
integration/INTEGRATION_REGISTER.md #33).

Security: every file path argument is confined to the workspace
directory (path-traversal guard); the child env never sees credentials
(mcp_layer._safe_child_env).
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))

from mcp.server.fastmcp import FastMCP  # noqa: E402

from render3d import blender_core  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.join(REPO_ROOT, "workspace")

mcp = FastMCP("blender-headless")


def _shield_stdout() -> None:
    """Blender's C core printf's progress lines ("Saved: …", "USD export
    of … took … ms") straight to fd 1 — the MCP stdio channel. Redirect
    fd 1 to stderr and hand the SDK a private duplicate of the original
    pipe, so the JSON-RPC stream stays clean."""
    saved = os.dup(1)
    os.dup2(2, 1)
    sys.stdout = os.fdopen(saved, "w", buffering=1)


def _count_fcurves() -> int:
    """Blender 5.x slotted Action API: fcurves live in
    layers[].strips[].channelbags[] (legacy action.fcurves is gone)."""
    import bpy
    total = 0
    for action in bpy.data.actions:
        try:
            total += len(action.fcurves)          # ≤4.3 legacy
        except AttributeError:
            for layer in action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        total += len(bag.fcurves)
    return total


def _confined(path: str, what: str = "path") -> str:
    real = os.path.realpath(os.path.abspath(path))
    if not real.startswith(os.path.realpath(WORKSPACE) + os.sep):
        raise ValueError(
            f"{what} escapes the render workspace: {path!r}")
    return real


@mcp.tool()
def blender_version() -> str:
    """Blender/bpy version and scene stats (health probe)."""
    return blender_core.info()


@mcp.tool()
def build_scene(spec_json: str, blend_path: str) -> str:
    """Build the NEXUS WORLD scene from a JSON spec and save a .blend.

    spec_json: scene spec from render3d.spec.build_scene_spec
    blend_path: destination under the render workspace."""
    blend_path = _confined(blend_path, "blend_path")
    spec = json.loads(spec_json)
    built = json.loads(blender_core.build(spec))
    if not built.get("ok"):
        return json.dumps(built)
    saved = json.loads(blender_core.save(blend_path))
    built["save"] = saved
    return json.dumps(built)


@mcp.tool()
def render_view(blend_path: str, view: str, out_png: str, samples: int = 24,
                width: int = 960, height: int = 540) -> str:
    """Open a .blend, position the camera (top|street), render Cycles CPU.

    Returns the PNG path + render time."""
    blend_path = _confined(blend_path, "blend_path")
    out_png = _confined(out_png, "out_png")
    if view not in ("top", "street"):
        return json.dumps({"ok": False, "error": "view must be "
                                                 "top|street"})
    loaded = json.loads(blender_core.load(blend_path))
    if not loaded.get("ok"):
        return json.dumps(loaded)
    # bounds marker is stored in the spec side; the caller passes them in
    # the blend's scene properties at build time — read them back:
    import bpy
    scene = bpy.context.scene
    bounds = list(scene.get("nx_bounds", (0, 0, 100, 100)))
    cam = json.loads(blender_core.setup_camera(view, bounds))
    cfg = json.loads(blender_core.setup_render(samples, width, height))
    res = json.loads(blender_core.render(out_png))
    return json.dumps({"ok": res.get("ok", False), "camera": cam,
                       "config": cfg, "render": res})


@mcp.tool()
def export_scene(blend_path: str, out_path: str, fmt: str = "usd") -> str:
    """Export the built scene to USD / glTF / FBX (Unreal asset pipeline,
    Blender side). out_path must live under the render workspace."""
    blend_path = _confined(blend_path, "blend_path")
    out_path = _confined(out_path, "out_path")
    loaded = json.loads(blender_core.load(blend_path))
    if not loaded.get("ok"):
        return json.dumps(loaded)
    return blender_core.export(out_path, fmt)


@mcp.tool()
def scene_info(blend_path: str) -> str:
    """Object/mesh/material counts + animation fcurve count of a .blend."""
    blend_path = _confined(blend_path, "blend_path")
    loaded = json.loads(blender_core.load(blend_path))
    if not loaded.get("ok"):
        return json.dumps(loaded)
    import bpy
    return json.dumps({"ok": True, "objects": len(bpy.data.objects),
                       "meshes": len(bpy.data.meshes),
                       "materials": len(bpy.data.materials),
                       "actions": len(bpy.data.actions),
                       "fcurves": _count_fcurves()})


@mcp.tool()
def animate_scene(spec_json: str, positions_json: str,
                  blend_path: str) -> str:
    """Build the scene and keyframe every resident along its simulated
    position timeline ([[tick, x, y], ...] per resident) — a real day in
    NEXUS WORLD as Blender keyframe animation."""
    blend_path = _confined(blend_path, "blend_path")
    spec = json.loads(spec_json)
    positions = json.loads(positions_json)
    built = json.loads(blender_core.build(spec))
    if not built.get("ok"):
        return json.dumps(built)
    anim = json.loads(blender_core.animate(positions))
    saved = json.loads(blender_core.save(blend_path))
    return json.dumps({"ok": True, "build": built, "animate": anim,
                       "save": saved})


# ---- PRIORITY 4 tools: procedural world, characters, physics, UE bundle --

@mcp.tool()
def build_terrain_scene(spec_json: str, world_json: str,
                        blend_path: str) -> str:
    """City scene + procedural terrain + water/parks/trees/rocks +
    weather particles. world_json comes from render3d.worldgen
    .generate_world (deterministic)."""
    import json as _json
    blend_path = _confined(blend_path, "blend_path")
    spec = _json.loads(spec_json)
    world = _json.loads(world_json)
    world["_roads"] = spec.get("roads")
    world["_buildings"] = spec.get("buildings")
    built = _json.loads(blender_core.build(spec))
    if not built.get("ok"):
        return _json.dumps(built)
    from render3d import terrain_core
    terr = _json.loads(terrain_core.build_terrain(world, max_height=3.0))
    wx = _json.loads(terrain_core.build_weather(
        spec.get("time", {}).get("weather", "clear"), spec.get("bounds")))
    saved = _json.loads(blender_core.save(blend_path))
    return _json.dumps({"ok": built.get("ok") and terr.get("ok"),
                        "city": built, "terrain": terr, "weather": wx,
                        "save": saved})


@mcp.tool()
def build_characters(spec_json: str, positions_json: str,
                     blend_path: str) -> str:
    """Procedural rigged characters for every resident + creatures
    (birds, quadrupeds) + real bone walk cycles driven by the simulated
    position timeline."""
    import json as _json
    blend_path = _confined(blend_path, "blend_path")
    spec = _json.loads(spec_json)
    positions = _json.loads(positions_json)
    loaded = _json.loads(blender_core.load(blend_path))
    if not loaded.get("ok"):
        return _json.dumps(loaded)
    from render3d import characters_core
    chars = _json.loads(characters_core.build_characters(spec))
    walks = []
    for rid, timeline in list(positions.items())[:24]:
        w = _json.loads(characters_core.animate_walk(
            rid, timeline, phase=float(sum(ord(c) for c in rid)) % 7))
        walks.append({"id": rid, "ok": w.get("ok"),
                      "fcurves": w.get("fcurves_est")})
    creatures = _json.loads(characters_core.build_creatures(spec["bounds"]))
    saved = _json.loads(blender_core.save(blend_path))
    return _json.dumps({"ok": chars.get("ok") and creatures.get("ok"),
                        "characters": chars, "walk_cycles": walks,
                        "creatures": creatures, "save": saved})


@mcp.tool()
def run_physics(bounds_json: str, blend_path: str,
                n_bodies: int = 12) -> str:
    """Rigid-body drop test on the current scene: bake the point cache
    and read back real impact/bounce data from baked keyframes."""
    import json as _json
    blend_path = _confined(blend_path, "blend_path")
    bounds = _json.loads(bounds_json)
    loaded = _json.loads(blender_core.load(blend_path))
    if not loaded.get("ok"):
        return _json.dumps(loaded)
    from render3d import physics_core
    res = physics_core.run_physics(bounds, n_bodies=n_bodies)
    saved = _json.loads(blender_core.save(blend_path))
    return _json.dumps({"physics": _json.loads(res), "save": saved,
                        "ok": _json.loads(res).get("ok", False)})


@mcp.tool()
def export_unreal_bundle(blend_path: str, out_dir: str) -> str:
    """Export the current scene as a UE-ready bundle (USD + FBX + GLB)
    with UE-appropriate exporter settings."""
    import json as _json
    blend_path = _confined(blend_path, "blend_path")
    out_dir = _confined(out_dir, "out_dir")
    loaded = _json.loads(blender_core.load(blend_path))
    if not loaded.get("ok"):
        return _json.dumps(loaded)
    from render3d import ue_export
    return ue_export.export_unreal_bundle(out_dir)


if __name__ == "__main__":
    _shield_stdout()
    mcp.run()  # stdio transport
