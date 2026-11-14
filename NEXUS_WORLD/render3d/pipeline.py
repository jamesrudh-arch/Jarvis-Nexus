"""Orchestrator-facing render pipeline (py3.12 side).

Single composition point for the 3D capability — registered on the
central orchestrator as render3d.render / .export / .animate / .inspect
(integration/wiring.py). Execution prefers the MCP transport (Blender
MCP server via integration/mcp_layer.py — directive: tools through the
orchestrator, MCP-first) and falls back to the direct subprocess driver
when the MCP server is not connected; the transport actually used is
reported in every result (honest telemetry, never faked).
"""
from __future__ import annotations

import json
import os
import subprocess

from render3d.driver import BlenderDriver, REPO_ROOT
from render3d.inspection import (inspect_image, render_with_correction,
                                 render_with_regeneration)
from render3d.spec import build_position_timeline, build_scene_spec

WORKSPACE = os.path.join(REPO_ROOT, "workspace")
RENDER_DIR = os.path.join(WORKSPACE, "renders")
EXPORT_DIR = os.path.join(WORKSPACE, "exports")
BLEND_DIR = os.path.join(WORKSPACE, "blender")

_MAGIC = {  # first bytes that prove a real asset file
    "usd": (b"#usda", b"PXR-USDC", b"\x80\x81\x82\x83"),  # usd zip/pxr hdr
    "usda": (b"#usda",),
    "usdc": (b"PXR-USDC",),
    "gltf": (b"glTF",),
    "glb": (b"glTF",),
    "fbx": (b"Kaydara FBX Binary", b"Kaydara FBX Binary  "),
}


def _check_magic(path: str, fmt: str) -> bool:
    with open(path, "rb") as fh:
        head = fh.read(32)
    return any(head.startswith(m) for m in _MAGIC.get(fmt, ()))


class RenderPipeline:
    def __init__(self, store_fn, layer):
        # accepts either a WorldStore instance or a () -> WorldStore factory
        self.store_fn = store_fn
        self.layer = layer
        self.driver = BlenderDriver()
        for d in (RENDER_DIR, EXPORT_DIR, BLEND_DIR):
            os.makedirs(d, exist_ok=True)

    def _store(self):
        return self.store_fn() if callable(self.store_fn) else self.store_fn

    # ------------------------------------------------------------- helpers
    def _mcp_ready(self) -> bool:
        try:
            health = self.layer.server_health("blender")
            return health.get("status") == "connected"
        except Exception:  # noqa: BLE001
            return False

    def _tool(self, name: str, **args) -> dict:
        res = self.layer.call("blender", name, args)
        text = res.get("content", "")
        try:
            return json.loads(text)
        except ValueError:
            return {"ok": False, "error": f"unparseable tool reply: "
                                          f"{text[:200]}"}

    def available(self) -> dict:
        return {"mcp_transport": self._mcp_ready(),
                "driver_transport": self.driver.available()}

    # -------------------------------------------------------------- render
    def render(self, params: dict) -> dict:
        store = self._store()
        view = params.get("view", "top")
        base = {"view": view,
                "samples": int(params.get("samples", 24)),
                "width": int(params.get("width", 960)),
                "height": int(params.get("height", 540)),
                "brightness": float(params.get("brightness", 1.0))}
        stem = f"{view}_tick{store.current_tick}"
        out_path = os.path.join(RENDER_DIR, f"{stem}.png")
        spec = build_scene_spec(store)
        transport = "mcp" if self._mcp_ready() else "driver" \
            if self.driver.available() else "none"
        if transport == "none":
            return {"ok": False, "error": "no Blender backend: neither "
                    "the MCP server nor the bpy venv driver is available"}

        attempt_no = {"n": 0}

        def do_render(p: dict) -> dict:
            n = attempt_no["n"]
            attempt_no["n"] += 1
            target = out_path if n == 0 else \
                out_path.replace(".png", f".a{n}.png")
            spec["render_opts"] = {"brightness": p["brightness"]}
            if p.get("hour_override") is not None:
                spec["time"]["hour"] = p["hour_override"]
                spec["time"]["is_daytime"] = 6 <= p["hour_override"] < 18
            if transport == "mcp":
                blend = os.path.join(
                    BLEND_DIR, f"scene_tick{store.current_tick}.a{n}.blend")
                built = self._tool("build_scene",
                                   spec_json=json.dumps(spec),
                                   blend_path=blend)
                if not built.get("ok"):
                    built["path"] = None
                    return built
                res = self._tool("render_view", blend_path=blend,
                                 view=p["view"], out_png=target,
                                 samples=p["samples"],
                                 width=p["width"], height=p["height"])
                res["path"] = target
                return res
            res = self.driver.render(spec, target, view=p["view"],
                                     samples=p["samples"],
                                     width=p["width"],
                                     height=p["height"],
                                     brightness=p["brightness"])
            res["path"] = target if res.get("ok") else None
            return res

        def regen(p: dict) -> dict:
            """Deterministic regeneration: noon light + top view — a
            genuinely different scene, not a re-roll of the same one."""
            p["hour_override"] = 12
            p["view"] = "top"
            p["brightness"] = 1.0
            return p

        result = render_with_regeneration(do_render, base, regen_params_fn=regen)
        result["transport"] = transport
        result["view"] = view
        result["tick"] = store.current_tick
        result["spec_summary"] = {
            "buildings": len(spec["buildings"]),
            "roads": len(spec["roads"]),
            "residents": len(spec["residents"]),
            "time": spec["time"]}
        result["files"] = sorted(
            os.path.join(RENDER_DIR, f) for f in os.listdir(RENDER_DIR)
            if f.startswith(stem))
        return result

    # -------------------------------------------------------------- export
    def export(self, params: dict) -> dict:
        store = self._store()
        fmt = params.get("fmt", "usd")
        if fmt not in ("usd", "gltf", "glb", "fbx"):
            return {"ok": False, "error": f"unsupported format {fmt!r}"}
        ext = {"usd": "usd", "gltf": "gltf", "glb": "glb", "fbx": "fbx"}[fmt]
        out_path = os.path.join(EXPORT_DIR, f"nexus_world.{ext}")
        spec = build_scene_spec(store)
        transport = "mcp" if self._mcp_ready() else "driver" \
            if self.driver.available() else "none"
        if transport == "none":
            return {"ok": False, "error": "no Blender backend available"}
        if transport == "mcp":
            blend = os.path.join(
                BLEND_DIR, f"scene_tick{store.current_tick}.blend")
            built = self._tool("build_scene", spec_json=json.dumps(spec),
                               blend_path=blend)
            if not built.get("ok"):
                return built
            res = self._tool("export_scene", blend_path=blend,
                             out_path=out_path, fmt=fmt)
        else:
            res = self.driver.export(spec, out_path, fmt)
        res["magic_ok"] = (os.path.exists(out_path)
                           and _check_magic(out_path, fmt))
        res["transport"] = transport
        res["format"] = fmt
        res["unreal_pipeline_note"] = (
            "USD/FBX import into UE5 requires a Windows/GPU host with UE "
            "5.4+ — see docs/KNOWN_LIMITATIONS.md (L-04/L-22)")
        return res

    # ------------------------------------------------------------ animation
    def animate(self, params: dict) -> dict:
        store = self._store()
        positions = build_position_timeline(store)
        if not positions:
            return {"ok": False,
                    "error": "no resident position history to animate"}
        spec = build_scene_spec(store)
        out_blend = os.path.join(BLEND_DIR, "nexus_world_animated.blend")
        transport = "mcp" if self._mcp_ready() else "driver" \
            if self.driver.available() else "none"
        if transport == "none":
            return {"ok": False, "error": "no Blender backend available"}
        if transport == "mcp":
            res = self._tool("animate_scene",
                             spec_json=json.dumps(spec),
                             positions_json=json.dumps(positions),
                             blend_path=out_blend)
        else:
            res = self.driver.animate(spec, out_blend, positions)
        res["transport"] = transport
        res["residents_animated"] = len(positions)
        return res

    # ------------------------------------------------------------ inspect
    def inspect(self, params: dict) -> dict:
        return inspect_image(params.get("path", ""))

    # -------------------------------------------------- PRIORITY 4: world
    def worldgen(self, params: dict) -> dict:
        """Procedural world: terrain + environment + characters + physics
        + render, composed over the Blender MCP tools (driver fallback
        via the composite blender_script op when MCP is down)."""
        import hashlib
        from render3d import worldgen as wg
        store = self._store()
        spec = build_scene_spec(store)
        seed = int(params.get("seed", spec.get("seed", 0) or 0))
        world = wg.generate_world(spec["bounds"], seed=seed)
        tick = store.current_tick
        stem = f"world_tick{tick}"
        blend = os.path.join(BLEND_DIR, f"{stem}.blend")
        out_png = os.path.join(RENDER_DIR, f"{stem}.png")

        transport = "mcp" if self._mcp_ready() else "driver" \
            if self.driver.available() else "none"
        if transport == "none":
            return {"ok": False, "error": "no Blender backend available"}

        positions = build_position_timeline(store)
        if transport == "mcp":
            terr = self._tool("build_terrain_scene",
                              spec_json=json.dumps(spec),
                              world_json=json.dumps(world),
                              blend_path=blend)
            chars = self._tool("build_characters",
                               spec_json=json.dumps(spec),
                               positions_json=json.dumps(positions),
                               blend_path=blend) if positions else {"ok": True}
            phys = self._tool("run_physics",
                              bounds_json=json.dumps(spec["bounds"]),
                              blend_path=blend,
                              n_bodies=int(params.get("n_bodies", 12)))
            cam = self._tool("render_view", blend_path=blend, view="top",
                             out_png=out_png,
                             samples=int(params.get("samples", 16)),
                             width=int(params.get("width", 960)),
                             height=int(params.get("height", 540)))
        else:
            terr, chars, phys, cam = self._driver_world(
                spec, world, positions, blend, out_png, params)
        inspection = inspect_image(out_png)
        result = {
            "ok": bool(terr.get("ok") and inspection.get("ok")),
            "transport": transport, "tick": tick, "seed": seed,
            "terrain": terr, "characters": chars, "physics": phys,
            "render": {"path": out_png, "ok": cam.get("ok", False)},
            "inspection": inspection,
            "environment": wg.environmental_context(world),
            "files": {"blend": blend}}
        # persist the world description for reproducibility (additive)
        wpath = os.path.join(WORKSPACE, "worldgen",
                             f"world_tick{tick}.json")
        os.makedirs(os.path.dirname(wpath), exist_ok=True)
        with open(wpath, "w") as fh:
            json.dump(world, fh, sort_keys=True)
        result["files"]["world_json"] = wpath
        return result

    def _driver_world(self, spec, world, positions, blend, out_png,
                      params):
        """Driver fallback: single composite blender_script run."""
        import tempfile
        from render3d.driver import SCRIPT, VENV_PY
        with tempfile.TemporaryDirectory(prefix="nx3d_") as td:
            spec_p = os.path.join(td, "spec.json")
            world_p = os.path.join(td, "world.json")
            pos_p = os.path.join(td, "positions.json")
            for path, obj in ((spec_p, spec), (world_p, world),
                              (pos_p, positions)):
                with open(path, "w") as fh:
                    json.dump(obj, fh)
            proc = subprocess.run(
                [VENV_PY, SCRIPT, "world", spec_p, world_p, pos_p,
                 blend, out_png,
                 "--samples", str(params.get("samples", 16))],
                capture_output=True, text=True, timeout=900, check=False)
            lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
            for line in reversed(lines):
                try:
                    out = json.loads(line)
                    return (out.get("terrain", {}), out.get("characters", {}),
                            out.get("physics", {}), out.get("render", {}))
                except ValueError:
                    continue
            return ({"ok": False, "error": proc.stderr[-300:]},
                    {"ok": False}, {"ok": False}, {"ok": False})

    # -------------------------------------------------- PRIORITY 4: physics
    def physics(self, params: dict) -> dict:
        store = self._store()
        spec = build_scene_spec(store)
        blend = os.path.join(BLEND_DIR,
                             f"world_tick{store.current_tick}.blend")
        if not os.path.exists(blend):
            return {"ok": False,
                    "error": "no world blend; run render3d.worldgen first"}
        if not self._mcp_ready():
            return {"ok": False,
                    "error": "physics requires the blender MCP transport"}
        res = self._tool("run_physics",
                         bounds_json=json.dumps(spec["bounds"]),
                         blend_path=blend,
                         n_bodies=int(params.get("n_bodies", 12)))
        res["transport"] = "mcp"
        return res

    # ---------------------------------------------- PRIORITY 3/4: UE bundle
    def ue_export(self, params: dict) -> dict:
        """Export the current world as a UE-ready bundle + manifest."""
        from render3d import ue_export
        store = self._store()
        tick = store.current_tick
        blend = os.path.join(BLEND_DIR, f"world_tick{tick}.blend")
        if not os.path.exists(blend):
            blend = os.path.join(BLEND_DIR, "scene_tick%d.blend" % tick)
        if not os.path.exists(blend):
            return {"ok": False,
                    "error": "no blend to export; run render3d.worldgen "
                             "or render3d.export first"}
        bundle_dir = os.path.join(EXPORT_DIR, f"ue_bundle_tick{tick}")
        if self._mcp_ready():
            res = self._tool("export_unreal_bundle", blend_path=blend,
                             out_dir=bundle_dir)
        elif self.driver.available():
            res = self.driver._run(["bundle", blend, bundle_dir])
        else:
            return {"ok": False, "error": "no Blender backend available"}
        export_result = res if isinstance(res, dict) else {"ok": False}
        # magic-byte verification (py3.12 side, real file reads)
        for f in (export_result.get("files") or []):
            if f.get("path"):
                ext = os.path.splitext(f["path"])[1].lstrip(".")
                f["magic_ok"] = _check_magic(f["path"], ext)
        manifest = ue_export.build_manifest(
            bundle_dir, export_result,
            world_desc=json.load(open(
                os.path.join(WORKSPACE, "worldgen",
                             f"world_tick{tick}.json")))
            if os.path.exists(os.path.join(
                    WORKSPACE, "worldgen", f"world_tick{tick}.json"))
            else None)
        return {"ok": export_result.get("ok"), "bundle": bundle_dir,
                "export": export_result, "manifest": manifest}
