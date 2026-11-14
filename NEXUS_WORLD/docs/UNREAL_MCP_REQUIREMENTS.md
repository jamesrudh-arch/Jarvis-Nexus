# Unreal Engine MCP — Requirements, Protocol and Honest Status

Registry: see `integration/INTEGRATION_REGISTER.md` (Unreal MCP entries).
Directive: "Continue Unreal MCP development. Prepare the integration for
Unreal Engine 5.4+. Document Windows, GPU and storage requirements. Do not
claim operational status until actual Unreal Editor execution has been
verified."

## 1. What exists now (verified)

| Piece | State | Evidence |
|---|---|---|
| `mcp_servers/unreal_server.py` | **DEVELOPED + PROTOCOL-VERIFIED** — real MCP stdio server, 7 tools, genuine Remote Control API HTTP client | `tests/unreal_mcp_acceptance.py` (handshake, tool discovery, honest unreachable-editor responses) |
| Blender→Unreal asset pipeline, Blender side | **OPERATIONAL** since Phase Continuation (USD/glTF/FBX exports, register #26) | R17 export evidence |
| UE-ready export bundle + manifest (`render3d/ue_export.py`) | **OPERATIONAL** (new) | UE1–UE3 checks |
| Unreal Editor execution | **BLOCKED — hardware** (see §2) | none, and none claimed |

## 2. Hardware and software requirements (official Epic specs)

Source: Epic Games, "Hardware and Software Specifications for Unreal Engine"
(dev.epicgames.com/documentation/unreal-engine/hardware-and-software-specifications-for-unreal-engine),
accessed 2026-11-13; plus Remote Control Quick Start for Unreal Engine.

Minimum (editor + Remote Control, no Lumen/Nanite guarantee):
- Windows 10 Version 22H2 (64-bit) or Windows 10 Enterprise 21H2
- Quad-core Intel/AMD 2.5 GHz+
- 8 GB RAM (32 GB recommended for real projects)
- DirectX 12 compatible GPU with current drivers
- DirectX End-User Runtimes (June 2010)

For Lumen / Nanite / Virtual Shadow Maps (what a NEXUS WORLD-quality scene
needs):
- Windows 10 build 1909.1350+ / Windows 11, DirectX 12 (Agility SDK),
  **SM6 enabled** in Project Settings
- GPU: **AMD RX-6000+ / Intel Arc A-Series+ / NVIDIA RTX-2000+**, 8 GB+
  VRAM recommended

Storage (engine + projects; Epic does not publish one number — this is the
installed footprint observed for UE 5.4 class installs):
- Engine alone: ~40–50 GB (no debug symbols)
- Engine + one NEXUS WORLD project + DerivedDataCache: **plan 100+ GB free
  SSD**
- This sandbox has: 2 cores, no GPU, 3.9 GB RAM, ~6 GB free, Linux —
  **the editor cannot run here** (Tier 0, register hardware audit H1–H5).

Editor-side plugins (both first-party, in-editor):
1. **Remote Control API** (Messaging category) — serves HTTP on port 30010
   (configurable); also a WebSocket bridge.
2. **Python Editor Script Plugin** (Scripting category) — enables
   `execPythonCommandEx` remote execution.

## 3. Protocol (how the MCP server talks to the editor)

```
orchestrator (integration/mcp_layer.py)
   └─ stdio JSON-RPC → mcp_servers/unreal_server.py   (this repo, main venv)
         └─ HTTP PUT {UNREAL_REMOTE_URL}/remote/call   (default :30010)
              {"objectPath": "/Script/PythonScriptLibrary.Default__PythonScriptLibrary",
               "functionName": "execPythonCommandEx",
               "parameters": {"command": <python>, "execution_mode": "ExecuteStatement",
                              "file_execution_scope": "Unspecified"}}
              → editor executes and returns ReturnValue
```

Tools exposed (all real HTTP calls; all return `editor_reachable:false`
with the transport error when no editor is up):
`unreal_status`, `remote_python`, `level_info`, `import_asset`,
`spawn_actor`, `viewport_screenshot`, `save_all`.

Security: the server passes no credentials to the editor channel; the MCP
child env is scrubbed (`_safe_child_env`); python payloads are capped at
20 000 chars.

## 4. How to make it OPERATIONAL (user-side checklist)

1. On a Windows 10/11 machine meeting §2, install UE 5.4+ via the Epic
   Games Launcher and create/open a project.
2. Enable the two plugins above; restart the editor; confirm
   `http://127.0.0.1:30010/remote/info` responds.
3. Run the MCP server where it can reach the editor:
   `UNREAL_REMOTE_URL=http://<editor-host>:30010 python -m
   mcp_servers.unreal_server` (already wired in `integration/wiring.py`).
4. Verify with `unreal_status` — it must return engine version +
   project name. That execution evidence is the ONLY acceptable trigger
   to flip the register state to OPERATIONAL.

## 5. Honest status statement

As of 2026-11-13: **no Unreal Editor execution has occurred** — the
sandbox cannot run one (Linux, 2 cores, no GPU, 3.9 GB RAM, ~6 GB disk).
The MCP server is real and protocol-tested; the asset pipeline from
Blender is real and export-tested; every claim above is scoped to exactly
that. Operational status remains **BLOCKED on user-provided hardware**.
