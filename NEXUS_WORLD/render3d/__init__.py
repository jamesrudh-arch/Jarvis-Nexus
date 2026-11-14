"""3D NEXUS WORLD pipeline (Phase 2 continuation).

spec.py builds a pure-JSON scene from the event-sourced world;
blender_core.py (bpy 5.3 venv) builds/renders/exports it; pipeline.py
composes the orchestrator capability with MCP-first transport and
inspection-driven auto-correction; mcp_servers/blender_server.py exposes
the same core as a real MCP stdio server.

Imports are LAZY (PEP 562): the bpy side (Python 3.13 venv) imports
render3d.blender_core WITHOUT pulling the py3.12-only deps (cv2, the
pipeline, the store) — the two runtimes share only the pure modules.
"""
from __future__ import annotations

import importlib

_LAZY = {
    "RenderPipeline": "render3d.pipeline",
    "inspect_image": "render3d.inspection",
    "render_with_correction": "render3d.inspection",
    "build_scene_spec": "render3d.spec",
    "build_position_timeline": "render3d.spec",
}


def __getattr__(name: str):
    if name in _LAZY:
        module = importlib.import_module(_LAZY[name])
        return getattr(module, name)
    if not name.startswith("_"):
        try:
            return importlib.import_module(f"render3d.{name}")
        except ModuleNotFoundError as exc:
            if exc.name == f"render3d.{name}":
                raise AttributeError(
                    f"module 'render3d' has no attribute {name!r}"
                ) from exc
            raise
    raise AttributeError(f"module 'render3d' has no attribute {name!r}")


__all__ = sorted(_LAZY)
