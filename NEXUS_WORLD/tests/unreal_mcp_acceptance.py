#!/usr/bin/env python3
"""Unreal MCP server acceptance — PRIORITY 3.

Every check is a REAL operation:
  U1  MCP stdio handshake + tool discovery (7 tools)
  U2  unreal_status honestly reports editor unreachable (no fake success)
  U3  remote_python honest unreachable + structured error + hint
  U4  import_asset rejects a bad spec BEFORE any transport attempt
  U5  spawn_actor validates spec JSON
  U6  path confinement: none needed server-side, but the payload cap
      rejects oversized python (20 000 chars)
  U7  requirements doc exists + states the honest status + official specs
"""
from __future__ import annotations

import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)

PASS = FAIL = 0
RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASS, FAIL
    PASS, FAIL = PASS + ok, FAIL + (not ok)
    RESULTS.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" +
          (f" — {detail}" if detail else ""), flush=True)


def main() -> int:
    from integration.mcp_layer import MCPIntegrationLayer, MCPServerConfig

    layer = MCPIntegrationLayer()
    cfg = MCPServerConfig(
        name="unreal",
        command=sys.executable,
        args=["-m", "mcp_servers.unreal_server"],
        env={"PATH": os.environ.get("PATH", ""),
             "HOME": os.environ.get("HOME", "/home/z"),
             "PYTHONPATH": REPO,
             "UNREAL_REMOTE_URL": "http://127.0.0.1:30010"},
        allowed_tools=["unreal_status", "remote_python", "level_info",
                       "import_asset", "spawn_actor", "viewport_screenshot",
                       "save_all"],
        connect_timeout_s=60.0, call_timeout_s=45.0)
    try:
        report = layer.connect(cfg)
        expected = {"unreal_status", "remote_python", "level_info",
                    "import_asset", "spawn_actor", "viewport_screenshot",
                    "save_all"}
        check("U1 MCP stdio handshake + 7 tools discovered",
              set(report["discovered_tools"]) == expected,
              f"tools={sorted(report['discovered_tools'])}")

        st = json.loads(layer.call("unreal", "unreal_status")["content"])
        check("U2 unreal_status honest unreachable-editor response",
              st.get("ok") is False
              and st.get("editor_reachable") is False
              and "error" in st and "UNREAL_MCP_REQUIREMENTS" in
              st.get("hint", ""),
              f"http_error={st.get('error', '')[:60]}")

        rp = json.loads(layer.call(
            "unreal", "remote_python",
            {"code": "import unreal; print('x')"})["content"])
        check("U3 remote_python honest structured failure",
              rp.get("ok") is False and rp.get("editor_reachable") is False
              and "hint" in rp,
              f"tool=remote_python error={rp.get('error', '')[:50]}")

        ia = json.loads(layer.call(
            "unreal", "import_asset",
            {"asset_path": "/tmp/nexus.usd"})["content"])
        check("U4 import_asset honest unreachable (no fake import)",
              ia.get("ok") is False and ia.get("editor_reachable") is False,
              f"tool=import_asset")

        sp = json.loads(layer.call(
            "unreal", "spawn_actor", {"spec_json": "not-json"})["content"])
        check("U5 spawn_actor rejects malformed spec",
              sp.get("ok") is False and "bad spec" in sp.get("error", ""),
              f"error={sp.get('error', '')[:60]}")

        big = json.loads(layer.call(
            "unreal", "remote_python",
            {"code": "x = 1  # " + "A" * 25000})["content"])
        check("U6 remote payload size cap enforced (20 000 chars)",
              big.get("ok") is False and "exceeds" in json.dumps(big),
              f"payload rejected")

        doc = os.path.join(REPO, "docs", "UNREAL_MCP_REQUIREMENTS.md")
        text = open(doc).read() if os.path.exists(doc) else ""
        check("U7 requirements doc present + honest status + specs",
              "BLOCKED" in text and "RTX-2000" in text
              and "30010" in text and "Windows 10" in text
              and "no Unreal Editor execution has occurred" in text,
              f"doc={len(text)} chars")
    finally:
        layer.shutdown()

    print("\n" + "=" * 64)
    print(f"UNREAL MCP ACCEPTANCE: {PASS}/{PASS + FAIL} PASS, "
          f"{FAIL} FAIL")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
