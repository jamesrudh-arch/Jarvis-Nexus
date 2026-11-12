# JARVIS NEXUS — Blender integration (official Python API `bpy`)
#
# Addon layout:
#   __init__.py      — addon registration (bl_info + operators)
#   operators.py     — real bpy operations (scene, mesh, materials, rig, export, validation)
#   mcp_server.py    — in-Blender JSON command server (MCP-style tool bridge, port 9876)
#
# Exact external execution requirements:
#   1. Blender 4.x installed (blender.org — no API token exists or is needed;
#      Blender is controlled through its Python API).
#   2. Install this addon: Edit → Preferences → Add-ons → Install…
#      → select blender/jarvis_blender.zip (zip this directory) → enable
#      "JARVIS NEXUS Automation".
#   3. The MCP-style server auto-starts on port 9876 (toggle in the N-panel,
#      "JARVIS" tab). JARVIS CORE connects via
#      src/lib/nexus/integrations/blenderMcp.ts (BLENDER_MCP_URL).
#   4. Headless batch: blender --background --python blender/scripts/<script>.py -- <args>

bl_info = {
    "name": "JARVIS NEXUS Automation",
    "author": "JARVIS NEXUS",
    "version": (1, 0, 0),
    "blender": (4, 2, 0),
    "location": "View3D → Sidebar (N) → JARVIS",
    "description": "Official-bpy automation + MCP-style command server for the JARVIS NEXUS asset pipeline (Blender → Unreal/MetaHuman → Web GLB).",
    "category": "Pipeline",
}

import bpy

from . import operators
from . import mcp_server


def register():
    operators.register()
    mcp_server.register()


def unregister():
    mcp_server.unregister()
    operators.unregister()
