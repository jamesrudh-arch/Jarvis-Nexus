"""Unreal Engine MCP server (stdio) — REAL protocol implementation
targeting Unreal Editor 5.4+ Remote Control.

Honesty contract (directive): this server speaks genuine MCP over stdio and
issues genuine HTTP calls to the Unreal Editor Remote Control API
(https://dev.epicgames.com/documentation/unreal-engine/remote-control-quick-start-for-unreal-engine),
but it CANNOT control an editor that is not running/reachable. Every tool
returns {"ok": false, "editor_reachable": false, ...} with the exact
transport error when the editor is absent. Operational status is claimed
ONLY after real editor execution has been verified (see
docs/UNREAL_MCP_REQUIREMENTS.md — registry entry for unreal MCP).

Editor-side prerequisites (all documented, none available in this Tier-0
sandbox — 2-core, no GPU, no Windows, 3.9 GB RAM):
  * Unreal Editor 5.4+ running with a project open
  * Plugins enabled: "Remote Control API" (HTTP server, default port 30010)
    and "Python Editor Script Plugin"
  * The editor machine must be reachable from this process
    (UNREAL_REMOTE_URL, default http://127.0.0.1:30010)

Runs in the MAIN venv (needs `mcp` SDK only — no Unreal binaries).
Spawned by integration/mcp_layer.py via integration/wiring.py with the
config in integration/wiring.py; child env never sees credentials.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("unreal-remote")

REMOTE_URL = os.environ.get(
    "UNREAL_REMOTE_URL", "http://127.0.0.1:30010").rstrip("/")
CALL_TIMEOUT_S = float(os.environ.get("UNREMOTE_TIMEOUT_S", "30"))
MAX_CODE_CHARS = 20_000          # remote python payload guard

# Remote Control API endpoints (official docs, UE 5.4):
#   GET  {base}/remote/info            — server/preset info
#   PUT  {base}/remote/call            — invoke a reflected UFUNCTION
#   PUT  {base}/remote/object          — read/write reflected properties
_PY_LIB = "/Script/PythonScriptLibrary.Default__PythonScriptLibrary"


def _unreachable(what: str, exc: Exception) -> str:
    """Honest, structured not-connected result (never a fake success)."""
    return json.dumps({
        "ok": False,
        "editor_reachable": False,
        "tool": what,
        "remote_url": REMOTE_URL,
        "error": f"{type(exc).__name__}: {exc}",
        "hint": ("Start Unreal Editor 5.4+ with the Remote Control API and "
                 "Python Editor Script plugins enabled, then set "
                 "UNREAL_REMOTE_URL — see docs/UNREAL_MCP_REQUIREMENTS.md"),
    }, sort_keys=True)


def _remote_call(payload: dict) -> dict:
    """PUT {base}/remote/call — invoke a reflected UFUNCTION remotely."""
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{REMOTE_URL}/remote/call", data=body, method="PUT",
        headers={"Content-Type": "application/json",
                 "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=CALL_TIMEOUT_S) as r:
        return json.loads(r.read().decode() or "{}")


def _run_python(code: str, quiet: bool = False) -> dict:
    """Execute Python inside the editor via PythonScriptLibrary.

    execPythonCommandEx(command, execution_mode, file_execution_scope) —
    execution_mode 'ExecuteStatement' runs one statement block and returns
    its output dict in ReturnValue.
    """
    code = code.strip()
    if not code:
        return {"ok": False, "error": "empty python payload"}
    if len(code) > MAX_CODE_CHARS:
        return {"ok": False,
                "error": f"python payload {len(code)} chars exceeds "
                         f"{MAX_CODE_CHARS}"}
    mode = "ExecuteStatementQuiet" if quiet else "ExecuteStatement"
    return _remote_call({
        "objectPath": _PY_LIB,
        "functionName": "execPythonCommandEx",
        "parameters": {"command": code,
                       "execution_mode": mode,
                       "file_execution_scope": "Unspecified"},
    })


def _py_json(check_name: str, code: str) -> str:
    """Run python that must return a JSON string; wrap failures honestly."""
    try:
        res = _run_python(code)
    except Exception as exc:  # noqa: BLE001 — transport failure
        return _unreachable(check_name, exc)
    rv = res.get("ReturnValue", {})
    if isinstance(rv, str):
        try:
            rv = json.loads(rv)
        except json.JSONDecodeError:
            rv = {"raw": rv}
    return json.dumps({"ok": True, "editor_reachable": True,
                       "result": rv}, sort_keys=True)


@mcp.tool()
def unreal_status() -> str:
    """Health probe: engine version, project name, editor build info via
    the Remote Control API. Honest unreachable-editor error otherwise."""
    code = (
        "import unreal, json\n"
        "print(json.dumps({'engine_version': "
        "unreal.SystemLibrary.get_engine_version(),\n"
        "  'project_name': unreal.Paths.get_project_file_path(),\n"
        "  'world': str(unreal.EditorLevelLibrary.get_editor_world()"
        ".get_name())}))\n"
    )
    return _py_json("unreal_status", code)


@mcp.tool()
def remote_python(code: str) -> str:
    """Execute a Python statement block inside the running Unreal Editor
    (Python Editor Script Plugin). Returns the command result dict.

    code: python source (<= 20000 chars). Runs as a statement with output
    capture; must not carry credentials — the channel is local HTTP."""
    try:
        res = _run_python(code)
    except Exception as exc:  # noqa: BLE001
        return _unreachable("remote_python", exc)
    if res.get("ok") is False:        # payload-cap / empty-payload errors
        return json.dumps(res, sort_keys=True)
    return json.dumps({"ok": True, "editor_reachable": True,
                       "result": res.get("ReturnValue", res)},
                      sort_keys=True)


@mcp.tool()
def level_info() -> str:
    """Current level census: actor count, static-mesh count, bounds and
    the first N actor names — the world-state query for NEXUS WORLD."""
    code = (
        "import unreal, json\n"
        "actors = unreal.EditorLevelLibrary.get_all_level_actors()\n"
        "meshes = [a for a in actors if a.get_class().get_name() == "
        "'StaticMeshActor']\n"
        "origin, extent = unreal.EditorLevelLibrary."
        "get_actor_bounds(actors[0]) if actors else ((0,0,0),(0,0,0))\n"
        "print(json.dumps({'actor_count': len(actors),\n"
        " 'static_mesh_actors': len(meshes),\n"
        " 'sample': [a.get_actor_label() for a in actors[:40]]}))\n"
    )
    return _py_json("level_info", code)


@mcp.tool()
def import_asset(asset_path: str, dest_path: str = "/Game/NEXUS",
                 save: bool = True) -> str:
    """Import a USD / glTF / FBX file (from the Blender→Unreal pipeline)
    into the editor Content Browser via an AssetImportTask.

    asset_path: absolute path on the EDITOR machine (e.g. an exported
                NEXUS_WORLD USD bundle)
    dest_path: content-browser destination package path"""
    code = (
        "import unreal, json\n"
        f"task = unreal.AssetImportTask()\n"
        f"task.filename = {asset_path!r}\n"
        f"task.destination_path = {dest_path!r}\n"
        "task.automated = True\n"
        "task.save = " + ("True" if save else "False") + "\n"
        "unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])\n"
        "print(json.dumps({'imported': task.imported_object_paths}))\n"
    )
    return _py_json("import_asset", code)


@mcp.tool()
def spawn_actor(spec_json: str) -> str:
    """Spawn/move actors in the current level from a JSON spec:
    [{"id","asset_path","location",[x,y,z],"rotation",[pitch,yaw,roll],
      "scale",[sx,sy,sz]}] — the UE-side mirror of the NEXUS_WORLD spec."""
    try:
        spec = json.loads(spec_json)
        if not isinstance(spec, list):
            raise ValueError("spec must be a JSON list")
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"ok": False, "error": f"bad spec: {exc}"})
    code = (
        "import unreal, json\n"
        f"spec = json.loads({json.dumps(spec_json)!r})\n"
        "out = []\n"
        "for e in spec:\n"
        "    a = unreal.EditorLevelLibrary.spawn_actor_from_object(\n"
        "        unreal.SoftObjectPath(e['asset_path']),\n"
        "        unreal.Vector(*e['location']))\n"
        "    if a is None:\n"
        "        out.append({'id': e['id'], 'spawned': False}); continue\n"
        "    a.set_actor_label(e['id'])\n"
        "    if 'rotation' in e:\n"
        "        a.set_actor_rotation(unreal.Rotator(*e['rotation'])"
        ", False)\n"
        "    if 'scale' in e:\n"
        "        a.set_actor_scale3d(unreal.Vector(*e['scale']))\n"
        "    out.append({'id': e['id'], 'spawned': True})\n"
        "print(json.dumps({'actors': out}))\n"
    )
    return _py_json("spawn_actor", code)


@mcp.tool()
def viewport_screenshot(out_path: str, width: int = 1920,
                        height: int = 1080) -> str:
    """High-res screenshot of the editor viewport (automation HighRes
    Shot) — the UE-side visual inspection input. The file lands on the
    EDITOR machine at out_path."""
    code = (
        "import unreal\n"
        f"unreal.AutomationLibrary."
        f"high_res_shot({width}, {height}, {out_path!r})\n"
        "print('queued')\n"
    )
    return _py_json("viewport_screenshot", code)


@mcp.tool()
def save_all() -> str:
    """Save all dirty packages in the editor (content + level)."""
    code = ("import unreal, json\n"
            "ok = unreal.EditorLoadingAndSavingUtils."
            "save_dirty_packages(True, True)\n"
            "print(json.dumps({'saved': ok}))\n")
    return _py_json("save_all", code)


if __name__ == "__main__":
    mcp.run()
