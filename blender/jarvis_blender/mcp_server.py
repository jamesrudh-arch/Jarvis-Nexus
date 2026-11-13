"""JARVIS NEXUS — in-Blender MCP-style JSON command server (port 9876).

The standard Blender-MCP integration pattern: Blender's Python API is local;
there is no Blender cloud API or token. External orchestrators (JARVIS CORE)
connect to this socket server and issue whitelisted JSON commands; results
return as JSON. This is the "Blender MCP" transport used by
src/lib/nexus/integrations/blenderMcp.ts (BLENDER_MCP_URL).

Protocol (one JSON request per line, JSON response per line):
  {"tool": "ping"}
  {"tool": "validate_scene"}
  {"tool": "import_glb", "args": {"path": "/data/character.glb"}}
  {"tool": "validate_rig", "args": {"armature_name": "Armature"}}
  {"tool": "export_glb", "args": {"path": "/data/out.glb"}}
  {"tool": "export_usd_for_unreal", "args": {"path": "/data/env.usd"}}
  {"tool": "apply_pbr_material", "args": {"target": "Body", "base_color": [0.1,0.15,0.2], "roughness": 0.5, "metallic": 0.1}}
  {"tool": "create_sanctuary_reference_scene", "args": {}}

NOTE: Blender's main loop must process operator calls on the main thread —
long jobs are queued via a timer and results are picked up on the next call
(the queue model documented in the README).
"""

import json
import socketserver
import threading

import bpy

from . import operators

PORT = 9876

TOOLS = {
    "ping": lambda a: {"pong": True, "blender": bpy.app.version_string},
    "get_scene": lambda a: {"scene": bpy.context.scene.name,
                            "objects": len(bpy.data.objects)},
    # (protocol test 2026-11-14 caught a real bug here: the bare function
    # reference received the whole args DICT as `scale_m` -> 14.5 * {} blew
    # up; wrapped to unpack args explicitly like every other tool)
    "create_sanctuary_reference_scene": lambda a: operators.create_sanctuary_reference_scene(
        float(a.get("scale_m", 1.0))),
    "import_glb": lambda a: operators.import_glb(a["path"]),
    "export_glb": lambda a: operators.export_glb(a["path"], bool(a.get("selected_only", False))),
    "export_usd_for_unreal": lambda a: operators.export_usd_for_unreal(a["path"]),
    "apply_pbr_material": lambda a: operators.apply_pbr_material(
        a["target"], a["base_color"], float(a["roughness"]), float(a["metallic"])),
    "validate_rig": lambda a: operators.validate_rig(a["armature_name"]),
    "batch_export_glb": lambda a: operators.batch_export_glb(a["directory"]),
    "validate_scene": lambda a: operators.validate_scene(),
}

# Commands are queued and executed on Blender's main thread via app timers —
# a socket thread must never touch bpy directly.
_pending = []
_results = {}
_seq = [0]
_lock = threading.Lock()


def _enqueue(tool, args):
    with _lock:
        _seq[0] += 1
        job_id = _seq[0]
        _pending.append((job_id, tool, args))
    return job_id


def _drain_queue():
    """Main-thread timer: run queued jobs, store results."""
    with _lock:
        jobs = _pending[:]
        _pending.clear()
    for job_id, tool, args in jobs:
        try:
            fn = TOOLS.get(tool)
            _results[str(job_id)] = {"ok": True, "result": fn(args) if fn else None} \
                if fn else {"ok": False, "error": f"unknown tool: {tool}"}
        except Exception as exc:  # bridge must never crash Blender
            _results[str(job_id)] = {"ok": False, "error": str(exc)}
    return 0.05  # keep the timer alive


class _Handler(socketserver.StreamRequestHandler):
    def handle(self):
        for raw in self.rfile:
            try:
                req = json.loads(raw.decode("utf-8"))
            except Exception:
                self._send({"ok": False, "error": "invalid JSON"})
                continue
            tool = str(req.get("tool", ""))
            if tool not in TOOLS:
                self._send({"ok": False, "error": f"unknown tool: {tool}"})
                continue
            job_id = _enqueue(tool, req.get("args") or {})
            # poll for the result (main thread executes within ~50 ms ticks)
            import time
            for _ in range(600):  # up to 30 s
                with _lock:
                    res = _results.pop(str(job_id), None)
                if res is not None:
                    break
                time.sleep(0.05)
            self._send(res or {"ok": False, "error": "job timeout"})

    def _send(self, obj):
        self.wfile.write((json.dumps(obj) + "\n").encode("utf-8"))


class _Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


_server = None
_timer_registered = False


def start():
    global _server, _timer_registered
    if _server is not None:
        return {"running": True, "port": PORT}
    _server = _Server(("127.0.0.1", PORT), _Handler)
    threading.Thread(target=_server.serve_forever, daemon=True).start()
    if not _timer_registered:
        bpy.app.timers.register(_drain_queue, first_interval=0.05, persistent=True)
        _timer_registered = True
    print(f"[JARVIS] MCP-style server on 127.0.0.1:{PORT}")
    return {"running": True, "port": PORT}


def stop():
    global _server
    if _server is not None:
        _server.shutdown()
        _server = None
    return {"running": False}


def register():
    """Addon hook — auto-start the server when the addon is enabled."""
    start()


def unregister():
    stop()
