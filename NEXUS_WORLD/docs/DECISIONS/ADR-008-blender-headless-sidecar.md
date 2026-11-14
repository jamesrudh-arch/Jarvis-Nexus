# ADR-008 — Blender headless via a Python 3.13 sidecar venv

**Date:** 2026-11-13 (Continuation Directive) · **Status:** accepted ·
**Supersedes:** register entry #1 REJECT rationale (Phase 1B), L-15
(Blender half)

## Context

The Continuation Directive requires Blender MCP, the Blender Python API,
and 3D world generation on this sandbox (2 cores, 3.9 GB RAM, no GPU, no
root, no display, host Python 3.12.16). Phase 1B had REJECTED bpy
because its PyPI wheels target Python 3.13 only, and rejected
`mcp-for-blender` because it requires the Blender desktop GUI.

## Decision

Run Blender as a Python module inside a **dedicated sidecar virtual
environment** (`.venv-blender`, Python 3.13 via uv, `bpy 5.3.0` +
`mcp<2`), driven in two ways:

1. **MCP-first (production):** `mcp_servers/blender_server.py` — a
   FastMCP stdio server INSIDE the bpy venv, spawned and managed by the
   existing `integration/mcp_layer.py` (official SDK client), its 6
   tools registered on the central orchestrator as `mcp.blender.*`.
2. **Direct driver (fallback/tests):** `render3d/driver.py` subprocess
   running `render3d/blender_script.py` with a JSON-in/JSON-out
   contract.

The two runtimes (py3.12 platform, py3.13 bpy) share only pure modules
(`render3d/blender_core.py`, `blender_colors.py`); the scene spec JSON
is the sole contract between simulation and 3D — no store access from
bpy, no duplicated state.

## Why the Phase 1B rejection is void

- "wheels require Python 3.13" — uv provisions py3.13 venvs root-free on
  this host (verified: bpy 5.3.0 imports and renders Cycles CPU).
- "blender-mcp needs the GUI app" — we built the headless equivalent
  ourselves over the same MCP protocol the directive mandates.

## Consequences

- 407 MB sidecar (gitignored, recreatable in one command — L-22); disk
  peak measured OK on the 8 GB host.
- Blender 5.3 API differences found and handled: `primitive_*_add` ops
  ignore the legacy `scale=` kwarg (set object scale post-creation);
  slotted Action API replaces `action.fcurves` (counted via
  layers/strips/channelbags); C-level stdout is shielded away from the
  MCP JSON-RPC stream (fd duplication).
- UE import side of the asset pipeline remains blocked on hardware
  (L-04); exports (USD/glTF/FBX) are verified with magic bytes.

## Evidence

`reports/RENDER3D_TEST_OUTPUT.txt` (17/17), `reports/INTEGRATION_TEST_
OUTPUT.txt` (A6-A9), register entries: bpy, Blender MCP server,
render3d pipeline, Unreal asset pipeline — all OPERATIONAL.
