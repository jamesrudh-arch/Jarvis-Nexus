# JARVIS NEXUS — Blender Integration (official Python API)

Implementation status: **code complete, prepared for external execution.**
Blender is controlled through its official `bpy` Python API — no API token
exists or is needed (the directive's "do not require a Blender API token
where none exists" is satisfied by design). This sandbox has no Blender
binary; bring-up happens wherever Blender 4.x is installed.

## Components

| Component | File | Purpose |
|---|---|---|
| Addon | `jarvis_blender/` | Registers operators + auto-starts the command server. Install: zip the folder → Blender → Preferences → Add-ons → Install → enable "JARVIS NEXUS Automation" |
| MCP-style bridge | `jarvis_blender/mcp_server.py` | Threaded TCP server on 127.0.0.1:9876. Whitelisted tools (`ping`, `get_scene`, `create_sanctuary_reference_scene`, `import_glb`, `export_glb`, `export_usd_for_unreal`, `apply_pbr_material`, `validate_rig`, `batch_export_glb`, `validate_scene`). Jobs execute on Blender's MAIN THREAD via an app timer (socket threads never touch bpy). JARVIS CORE connects through `src/lib/nexus/integrations/blenderMcp.ts` with `BLENDER_MCP_URL` |
| Headless pipeline | `scripts/validate_and_export_glb.py` | `blender --background --python` batch: structural validation (bones, shape keys, tri counts) + clean GLB re-export for the web embodiment |
| Pipeline | Blender → Unreal | `export_usd_for_unreal` produces USD (environments/props); MetaHuman characters keep their native UE pipeline (`unreal/README.md` step 6) |

## Bring-up (exact external execution requirements)

1. Install Blender 4.2+ (blender.org).
2. `cd blender && zip -r jarvis_blender.zip jarvis_blender/`
3. Blender → Edit → Preferences → Add-ons → Install → select the zip →
   enable. The console prints `[JARVIS] MCP-style server on 127.0.0.1:9876`.
4. In JARVIS CORE set `BLENDER_MCP_URL=127.0.0.1:9876` (or the LAN address).
5. Verify: the Connections panel shows the bridge online after a `ping`.

## Tool catalog (the real command surface)

```
{"tool": "ping"}                          → {"pong": true, "blender": "4.5.x"}
{"tool": "validate_scene"}                → {"valid": bool, "issues": [...]}
{"tool": "validate_rig", "args": {"armature_name": "Armature"}}
                                          → bone audit vs required humanoid set + shape-key count
{"tool": "import_glb", "args": {"path": "..."}}
{"tool": "export_glb", "args": {"path": "...", "selected_only": false}}
{"tool": "export_usd_for_unreal", "args": {"path": "..."}}
{"tool": "apply_pbr_material", "args": {"target": "Body", "base_color": [r,g,b], "roughness": 0.5, "metallic": 0.1}}
{"tool": "create_sanctuary_reference_scene"}   → 3-point light rig + camera + floor blocking
{"tool": "batch_export_glb", "args": {"directory": "..."}}
```

## Delegation from JARVIS CORE

The orchestrator's 3D tool surface routes to this bridge (scene creation,
mesh editing, materials, lighting, camera, rigging checks, animation export,
render, asset conversion, batch processing, scene validation — the full
directive list). Every call reports actual bpy execution results; failures
surface as `{"ok": false, "error": ...}` — never simulated success.
