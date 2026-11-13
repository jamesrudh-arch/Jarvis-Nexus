#!/usr/bin/env python3
"""JARVIS NEXUS — REAL Blender MCP protocol test (editor-control execution).

Runs the actual addon (blender/jarvis_blender/mcp_server.py) under a REAL
Blender runtime (the bpy 5.0.1 module = the same Python API the editor
exposes) and drives it over a REAL TCP socket with the documented JSON
protocol — the same surface src/lib/nexus/integrations/blenderMcp.ts uses.

Threading = the addon's own contract: the socket thread only ENQUEUES;
every bpy call executes on the interpreter MAIN thread (the pump loop
below, exactly the role of Blender's GUI timer). Verified commands:
ping, get_scene, create_sanctuary_reference_scene, apply_pbr_material,
validate_scene, export_glb, import_glb, validate_rig, export_usd_for_unreal.
"""

import json
import os
import socket
import sys
import threading
import time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "blender"))

import bpy  # noqa: E402  (real Blender runtime)

from jarvis_blender import mcp_server  # noqa: E402

RESULTS = []
DONE = threading.Event()


def rpc(payload: dict) -> dict:
    with socket.create_connection(("127.0.0.1", 9876), timeout=30) as s:
        s.sendall((json.dumps(payload) + "\n").encode())
        buf = b""
        while not buf.endswith(b"\n"):
            chunk = s.recv(65536)
            if not chunk:
                break
            buf += chunk
    return json.loads(buf.decode())


def worker():
    """Runs OFF the main thread: pure socket I/O, never touches bpy."""
    def check(name, req, predicate):
        try:
            res = rpc(req)
            ok, detail = predicate(res), json.dumps(res)[:200]
        except Exception as exc:
            ok, detail = False, f"{type(exc).__name__}: {exc}"
        RESULTS.append({"tool": name, "ok": bool(ok)})
        print(f"[mcp-test] {name}: {'PASS' if ok else 'FAIL'} — {detail}", flush=True)

    time.sleep(0.3)
    check("ping", {"tool": "ping"},
          lambda r: r.get("ok") and r["result"]["pong"] is True
          and r["result"]["blender"].startswith("5."))
    check("get_scene", {"tool": "get_scene"},
          lambda r: r.get("ok") and "scene" in r["result"])
    check("create_sanctuary_reference_scene",
          {"tool": "create_sanctuary_reference_scene", "args": {}},
          lambda r: r.get("ok") and r["result"].get("created") is True)
    check("apply_pbr_material",
          {"tool": "apply_pbr_material", "args": {
              "target": "JN_Floor", "base_color": [0.2, 0.25, 0.3],
              "roughness": 0.4, "metallic": 0.2}},
          lambda r: r.get("ok") and "material" in r["result"])
    check("validate_scene", {"tool": "validate_scene"},
          lambda r: r.get("ok") and "valid" in r["result"])
    glb_out = os.path.join(REPO, "world", "Blender", "export",
                           "MCP_PROTOCOL_TEST.glb")
    os.makedirs(os.path.dirname(glb_out), exist_ok=True)
    check("export_glb", {"tool": "export_glb", "args": {"path": glb_out}},
          lambda r: r.get("ok") and os.path.getsize(glb_out) > 1000)
    check("import_glb", {"tool": "import_glb", "args": {"path": glb_out}},
          lambda r: r.get("ok") and r["result"].get("count", 0) >= 1)
    check("validate_rig",
          {"tool": "validate_rig", "args": {"armature_name": "Armature"}},
          lambda r: r.get("ok"))  # honest error JSON when no rig: protocol-level ok
    usd_out = os.path.join(REPO, "world", "Blender", "export",
                           "MCP_PROTOCOL_TEST.usd")
    check("export_usd_for_unreal",
          {"tool": "export_usd_for_unreal", "args": {"path": usd_out}},
          lambda r: r.get("ok") and os.path.exists(usd_out))
    check("unknown tool rejected", {"tool": "execute_arbitrary_code"},
          lambda r: not r.get("ok") and "unknown tool" in r.get("error", ""))
    # raw invalid JSON line
    try:
        with socket.create_connection(("127.0.0.1", 9876), timeout=10) as s:
            s.sendall(b"this is not json\n")
            line = s.recv(65536)
        ok = b'"ok": false' in line
        RESULTS.append({"tool": "invalid-json", "ok": ok})
        print(f"[mcp-test] invalid JSON: {'PASS' if ok else 'FAIL'} — {line[:120]!r}",
              flush=True)
    except Exception as exc:
        RESULTS.append({"tool": "invalid-json", "ok": False})
        print(f"[mcp-test] invalid JSON: FAIL — {exc}", flush=True)
    DONE.set()


def main():
    print("[mcp-test] starting server under real Blender",
          bpy.app.version_string, flush=True)
    print("[mcp-test] start():", mcp_server.start(), flush=True)
    t = threading.Thread(target=worker, daemon=True)
    t.start()
    # MAIN thread = the Blender main-loop role: drain the queue until done
    while not DONE.is_set():
        mcp_server._drain_queue()
        time.sleep(0.005)
    t.join(timeout=5)
    mcp_server.stop()
    passed = sum(1 for r in RESULTS if r["ok"])
    print(f"[mcp-test] RESULT: {passed}/{len(RESULTS)} passed", flush=True)
    report_path = os.path.join(REPO, "world", "Blender", "validation",
                               "McpProtocolTest.json")
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w") as fh:
        json.dump({"runtime": f"bpy {bpy.app.version_string} (headless module)",
                   "threading": "socket thread enqueues; interpreter main thread "
                                "executes all bpy calls (the addon contract)",
                   "results": RESULTS, "passed": passed, "total": len(RESULTS)},
                  fh, indent=2)
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    main()
