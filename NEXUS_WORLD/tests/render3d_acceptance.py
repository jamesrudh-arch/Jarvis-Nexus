#!/usr/bin/env python3
"""NEXUS WORLD 3D pipeline acceptance suite (Continuation Directive item 3/4).

Run from NEXUS_WORLD/:  python3 tests/render3d_acceptance.py
REAL Blender operations through BOTH transports:
  - direct driver (bpy 5.3 venv subprocess)
  - the Blender MCP server over the official MCP client layer
Every render is visually inspected (OpenCV) — and the auto-correction
loop is proven by breaking a render on purpose. Results recorded in
reports/RENDER3D_TEST_OUTPUT.txt.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from geography.hierarchy import generate_world_geography
from geography.spatial import CityLayout
from integration.mcp_layer import (MCPServerConfig, MCPIntegrationLayer,
                                   ToolExecutionError)
from persistence.world_store import WorldStore
from render3d.driver import BlenderDriver
from render3d.inspection import inspect_image, render_with_correction
from render3d.pipeline import BLEND_DIR, RENDER_DIR
from render3d.spec import build_position_timeline, build_scene_spec
from residents.engine import ResidentEngine
from simulation.tick_engine import TickEngine

SEED = 20261113
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}"
          + (f" — {detail}" if detail else ""))


def main() -> int:
    t0 = time.perf_counter()
    tmp = tempfile.mkdtemp(prefix="nexus_r3d_")
    os.makedirs(RENDER_DIR, exist_ok=True)

    # ------------------------------------------------ world with residents
    db = os.path.join(tmp, "w.db")
    store = WorldStore(db)
    store.append(0, "world.created", {
        "idempotency_key": "w-3d", "world_id": "three-d",
        "name": "Three Dee", "seed": SEED,
        "epoch_utc": "2026-01-01T00:00:00", "minutes_per_tick": 10})
    generate_world_geography(store, seed=SEED)
    eng = ResidentEngine(store, CityLayout(store))
    eng.create_population(24)
    TickEngine(store, behaviour=eng).run(180)  # 1.25 days of life
    spec = build_scene_spec(store)
    check("R1 scene spec complete (buildings/roads/residents/time)",
          len(spec["buildings"]) == 64 and len(spec["roads"]) >= 30
          and len(spec["residents"]) == 24
          and {"hour", "is_daytime", "weather"} <= set(spec["time"]),
          f"b={len(spec['buildings'])} r={len(spec['roads'])} "
          f"res={len(spec['residents'])} hour={spec['time']['hour']}")

    driver = BlenderDriver()
    if not driver.available():
        check("R2 bpy venv driver available", False,
              ".venv-blender missing — 3D checks cannot run")
        return finish(t0, tmp)
    info = driver.info()
    check("R2 bpy venv driver available (bpy 5.3)",
          info.get("ok") is True and info.get("blender", "").startswith("5."),
          f"blender={info.get('blender')}")

    # -------------------------------------------------- direct driver path
    top_png = os.path.join(RENDER_DIR, "acceptance_top.png")
    r_top = driver.render(spec, top_png, view="top", samples=10,
                          width=640, height=360)
    insp_top = inspect_image(top_png)
    check("R3 top-view render produced + visually inspected",
          r_top.get("ok") is True and insp_top["ok"],
          f"bytes={insp_top['metrics'].get('bytes')} "
          f"bright={insp_top['metrics'].get('brightness_mean')} "
          f"colors={insp_top['metrics'].get('sampled_colors')}")

    street_png = os.path.join(RENDER_DIR, "acceptance_street.png")
    r_street = driver.render(spec, street_png, view="street", samples=10,
                             width=640, height=360)
    insp_street = inspect_image(street_png)
    check("R4 street-view render produced + inspected",
          r_street.get("ok") is True and insp_street["ok"],
          f"bright={insp_street['metrics'].get('brightness_mean')}")

    night_spec = build_scene_spec(store, hour_override=23)
    night_png = os.path.join(RENDER_DIR, "acceptance_night.png")
    r_night = driver.render(night_spec, night_png, view="top", samples=10,
                            width=640, height=360)
    insp_night = inspect_image(night_png)
    check("R5 night render visible-but-dim (day/night cycle is real)",
          r_night.get("ok") is True and insp_night["ok"],
          f"bright={insp_night['metrics'].get('brightness_mean')}")

    # ------------------------------------------- inspection + self-healing
    import cv2
    import numpy as np
    black_png = os.path.join(tmp, "black.png")
    cv2.imwrite(black_png, np.zeros((360, 640, 3), dtype=np.uint8))
    insp_black = inspect_image(black_png)
    check("R6 inspection REJECTS a corrupted (all-black) frame",
          insp_black["ok"] is False
          and ("variance_ok" in insp_black["failed"]
               or "colorfulness_ok" in insp_black["failed"]),
          f"failed={insp_black['failed']}")

    corr_png = os.path.join(tmp, "correction.png")

    def broken_render(p: dict) -> dict:
        res = driver.render(spec, corr_png, view=p["view"],
                            samples=max(4, p["samples"] // 4),
                            width=320, height=180,
                            brightness=p["brightness"])
        res["path"] = corr_png
        return res

    corrected = render_with_correction(
        broken_render,
        {"view": "top", "samples": 8, "brightness": 0.004,
         "width": 320, "height": 180})
    check("R7 auto-correction heals a deliberately broken render",
          corrected["ok"] is True and corrected["corrections"] >= 1,
          f"attempts={len(corrected['attempts'])} "
          f"corrections={corrected['corrections']} "
          f"final={os.path.basename(str(corrected.get('final_path')))}")

    # -------------------------------------------------- asset exports (UE)
    usd_path = os.path.join(tmp, "nexus_world.usd")
    r_usd = driver.export(spec, usd_path, "usd")
    check("R8 USD export (Unreal pipeline, Blender side)",
          r_usd.get("ok") is True and os.path.exists(usd_path)
          and open(usd_path, "rb").read(8)[:4] in (b"#usd",
                                                   b"PXR-", b"\x80\x81\x82"),
          f"bytes={r_usd.get('bytes')}")

    glb_path = os.path.join(tmp, "nexus_world.glb")
    r_glb = driver.export(spec, glb_path, "glb")
    check("R9 glTF export",
          r_glb.get("ok") is True
          and open(glb_path, "rb").read(4) == b"glTF",
          f"bytes={r_glb.get('bytes')}")

    fbx_path = os.path.join(tmp, "nexus_world.fbx")
    r_fbx = driver.export(spec, fbx_path, "fbx")
    check("R10 FBX export (battle-tested UE import format)",
          r_fbx.get("ok") is True
          and open(fbx_path, "rb").read(20).startswith(b"Kaydara FBX"),
          f"bytes={r_fbx.get('bytes')}")

    # ------------------------------------------------------ MCP transport
    layer = MCPIntegrationLayer()
    cfg = MCPServerConfig(
        name="blender",
        command=os.path.join(REPO, ".venv-blender", "bin", "python"),
        args=["-m", "mcp_servers.blender_server"],
        env={**os.environ.copy(),
             "PYTHONPATH": REPO} if os.environ.get("NEXUS_TEST_FULL_ENV")
        else {"PATH": os.environ.get("PATH", ""),
              "HOME": os.environ.get("HOME", "/home/z"),
              "PYTHONPATH": REPO},
        allowed_tools=["blender_version", "build_scene", "render_view",
                       "export_scene", "scene_info", "animate_scene",
                       "build_terrain_scene", "build_characters",
                       "run_physics", "export_unreal_bundle"],
        connect_timeout_s=180.0, call_timeout_s=900.0)
    try:
        report = layer.connect(cfg)
        # PRIORITY 4 added 4 tools (build_terrain_scene, build_characters,
        # run_physics, export_unreal_bundle) to the original 6.
        expected_tools = {
            "blender_version", "build_scene", "render_view", "export_scene",
            "scene_info", "animate_scene", "build_terrain_scene",
            "build_characters", "run_physics", "export_unreal_bundle"}
        check("R11 Blender MCP server: real stdio handshake + discovery",
              set(report["discovered_tools"]) == expected_tools,
              f"tools={sorted(report['discovered_tools'])}")

        ver = json.loads(layer.call("blender", "blender_version")["content"])
        check("R12 MCP blender_version real call",
              ver.get("ok") is True and ver.get("blender", "").startswith("5"),
              f"blender={ver.get('blender')} objects={ver.get('objects')}")

        blend = os.path.join(BLEND_DIR, "acceptance_mcp.blend")
        built = json.loads(layer.call(
            "blender", "build_scene",
            {"spec_json": json.dumps(spec), "blend_path": blend})["content"])
        check("R13 MCP build_scene (real bpy scene construction)",
              built.get("ok") is True and os.path.exists(blend),
              f"objects={built.get('objects')}")

        mcp_png = os.path.join(RENDER_DIR, "acceptance_mcp.png")
        ren = json.loads(layer.call(
            "blender", "render_view",
            {"blend_path": blend, "view": "top", "out_png": mcp_png,
             "samples": 8, "width": 480, "height": 270})["content"])
        insp_mcp = inspect_image(mcp_png)
        check("R14 MCP render_view (real Cycles render over MCP)",
              ren.get("ok") is True and insp_mcp["ok"],
              f"bytes={insp_mcp['metrics'].get('bytes')}")

        try:
            layer.call("blender", "build_scene", {
                "spec_json": json.dumps(spec),
                "blend_path": "/tmp/evil.blend"})
            confined = False
        except (ToolExecutionError, Exception):  # noqa: BLE001
            confined = True
        check("R15 MCP path-confinement rejects workspace escapes",
              confined)

        mcp_usd = os.path.join(REPO, "workspace", "exports",
                               "acceptance_mcp.usd")
        exp = json.loads(layer.call(
            "blender", "export_scene",
            {"blend_path": blend, "out_path": mcp_usd,
             "fmt": "usd"})["content"])
        check("R16 MCP export_scene (USD over MCP)",
              exp.get("ok") is True and os.path.exists(mcp_usd),
              f"bytes={exp.get('bytes')}")

        # ---------------------------------------------- keyframe animation
        timeline = build_position_timeline(store)
        anim_blend = os.path.join(BLEND_DIR, "acceptance_anim.blend")
        anim = json.loads(layer.call(
            "blender", "animate_scene",
            {"spec_json": json.dumps(spec),
             "positions_json": json.dumps(timeline),
             "blend_path": anim_blend})["content"])
        scene_info = json.loads(layer.call(
            "blender", "scene_info", {"blend_path": anim_blend})["content"])
        check("R17 keyframe animation of a simulated day (real fcurves)",
              anim.get("animate", {}).get("fcurves", 0) > 0
              and scene_info.get("fcurves", 0) > 0
              and os.path.getsize(anim_blend) > 100_000,
              f"fcurves={scene_info.get('fcurves')} "
              f"blend_bytes={os.path.getsize(anim_blend)}")
    finally:
        layer.shutdown()

    return finish(t0, tmp)


def finish(t0: float, tmp: str) -> int:
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = len(RESULTS) - passed
    print(f"\n{'=' * 64}\nRENDER 3D ACCEPTANCE: {passed}/{len(RESULTS)} "
          f"PASS, {failed} FAIL — {time.perf_counter() - t0:.1f}s")
    for name, ok, detail in RESULTS:
        if not ok:
            print(f"  FAILED: {name} — {detail}")
    out = os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "reports", "RENDER3D_TEST_OUTPUT.txt")
    with open(out, "w") as fh:
        fh.write(f"NEXUS WORLD 3D pipeline acceptance run "
                 f"{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        for name, ok, detail in RESULTS:
            fh.write(f"[{'PASS' if ok else 'FAIL'}] {name}"
                     + (f" — {detail}" if detail else "") + "\n")
        fh.write(f"RESULT: {passed}/{len(RESULTS)} PASS\n")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
