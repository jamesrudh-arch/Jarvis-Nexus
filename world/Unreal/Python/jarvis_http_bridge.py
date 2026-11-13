"""
JARVIS NEXUS — Unreal Engine in-editor HTTP bridge (runtime communication).

Runs INSIDE the Unreal editor/game via the PythonScriptPlugin. JARVIS CORE
(Next.js backend, src/lib/nexus/integrations/unrealBridge.ts) sends JSON
commands to http://<this-machine>:8765/jarvis — this bridge executes ONLY
whitelisted, argument-checked operations and answers with JSON results.

Bring-up (exact external execution requirements):
  1. Windows PC with Unreal Engine 5.4/5.5/5.6 installed (Epic Games Launcher).
  2. Open JarvisNexus.uproject (generates project files on first open).
  3. Enable Python Script Plugin (already in .uproject) → restart editor.
  4. In-editor Python console:  import jarvis_http_bridge; jarvis_http_bridge.start()
     (or place this file in <Project>/Content/Python/ to autoload).
  5. JARVIS CORE env: UNREAL_BRIDGE_URL=http://<ue-host>:8765

Whitelist (no arbitrary exec, ever):
  ping | get_state | load_level | spawn_character | play_animation
  | set_camera | set_light | capture_frame | list_assets
"""
import json
import socketserver
import threading

import unreal

PORT = 8765

# ---------------------------------------------------------------------------
# Whitelisted command implementations (all return plain JSON-safe dicts)
# ---------------------------------------------------------------------------


def _cmd_ping(args):
    return {"pong": True, "engine": unreal.SystemLibrary.get_engine_version()}


def _cmd_get_state(args):
    world = unreal.EditorLevelLibrary.get_editor_world()
    return {
        "world": world.get_name(),
        "actors": len(unreal.EditorLevelLibrary.get_all_level_actors()),
    }


def _cmd_load_level(args):
    level_path = str(args.get("asset_path", ""))
    if not level_path.endswith(".umap"):
        return {"error": "asset_path must reference a .umap level"}
    unreal.EditorLevelLibrary.load_level(level_path)
    return {"loaded": level_path}


def _cmd_spawn_character(args):
    """Spawn the MetaHuman/character blueprint at a world location."""
    bp_path = str(args.get("blueprint", ""))
    location = args.get("location", [0.0, 0.0, 0.0])
    yaw = float(args.get("yaw", 0.0))
    asset = unreal.EditorAssetLibrary.load_blueprint_class(bp_path) if bp_path else None
    if asset is None:
        return {"error": f"blueprint not found: {bp_path}"}
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        asset, unreal.Vector(location[0], location[1], location[2]))
    actor.set_actor_rotation(unreal.Rotator(0.0, yaw, 0.0), False)
    return {"spawned": actor.get_name()}


def _cmd_play_animation(args):
    """Play a Level Sequence (MetaHuman facial/body clips route via Sequencer)."""
    seq_path = str(args.get("asset_path", ""))
    asset = unreal.EditorAssetLibrary.load_asset(seq_path)
    if asset is None:
        return {"error": f"animation asset not found: {seq_path}"}
    if isinstance(asset, unreal.LevelSequence):
        unreal.LevelSequenceEditorLibrary.open_level_sequence(seq_path)
        unreal.LevelSequenceEditorLibrary.play()
        return {"playing": seq_path}
    return {"error": "asset is not a LevelSequence"}


def _cmd_set_camera(args):
    name = str(args.get("camera_actor", ""))
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if actor.get_name() == name and isinstance(actor, unreal.CameraActor):
            unreal.EditorLevelLibrary.set_level_viewport_camera_actor(actor)
            return {"camera": name}
    return {"error": f"camera actor not found: {name}"}


def _cmd_set_light(args):
    name = str(args.get("light_actor", ""))
    intensity = float(args.get("intensity", 1.0))
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if actor.get_name() == name:
            try:
                actor.set_editor_property("intensity", intensity)
                return {"light": name, "intensity": intensity}
            except Exception:
                continue
    return {"error": f"light actor not found: {name}"}


def _cmd_capture_frame(args):
    """High-res frame capture (holographic projection / VLM vision input)."""
    out = str(args.get("save_path", "jarvis_frame.png"))
    unreal.SystemLibrary.execute_console_command(None, f"shot {out}")
    return {"captured": out}


def _cmd_list_assets(args):
    path = str(args.get("path", "/Game"))
    assets = unreal.EditorAssetLibrary.list_assets(path, recursive=False)
    return {"assets": [a for a in assets][:200]}


COMMANDS = {
    "ping": _cmd_ping,
    "get_state": _cmd_get_state,
    "load_level": _cmd_load_level,
    "spawn_character": _cmd_spawn_character,
    "play_animation": _cmd_play_animation,
    "set_camera": _cmd_set_camera,
    "set_light": _cmd_set_light,
    "capture_frame": _cmd_capture_frame,
    "list_assets": _cmd_list_assets,
}

# ---------------------------------------------------------------------------
# Threaded HTTP server (stdlib only — no external deps inside the editor)
# ---------------------------------------------------------------------------


class _BridgeHandler(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            data = b""
            while b"\r\n\r\n" not in data:
                chunk = self.request.recv(65536)
                if not chunk:
                    return
                data += chunk
            header, _, body = data.partition(b"\r\n\r\n")
            request_line = header.split(b"\r\n")[0].decode("utf-8", "replace")
            method, path, _ = request_line.split(" ", 2)
            if method != "POST" or path.split("?")[0] != "/jarvis":
                self._respond(404, {"error": "not found"})
                return
            payload = json.loads(body.decode("utf-8")) if body else {}
            cmd = str(payload.get("command", ""))
            fn = COMMANDS.get(cmd)
            if fn is None:
                self._respond(400, {"error": f"unknown command: {cmd}"})
                return
            unreal.log(f"[JARVIS] bridge command: {cmd}")
            result = fn(payload.get("args") or {})
            self._respond(200, result)
        except Exception as exc:  # bridge must never crash the editor
            try:
                self._respond(500, {"error": str(exc)})
            except Exception:
                pass

    def _respond(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        head = (
            f"HTTP/1.1 {code} {'OK' if code == 200 else 'ERROR'}\r\n"
            "Content-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Connection: close\r\n\r\n"
        ).encode("utf-8")
        self.request.sendall(head + body)


class _BridgeServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


_server = None


def start(port=PORT):
    """Start the bridge (idempotent). Call from the editor Python console."""
    global _server
    if _server is not None:
        unreal.log(f"[JARVIS] bridge already running on port {port}")
        return
    _server = _BridgeServer(("0.0.0.0", port), _BridgeHandler)
    threading.Thread(target=_server.serve_forever, daemon=True).start()
    unreal.log(f"[JARVIS] HTTP bridge listening on 0.0.0.0:{port} (POST /jarvis)")


def stop():
    global _server
    if _server is not None:
        _server.shutdown()
        _server = None
        unreal.log("[JARVIS] bridge stopped")
