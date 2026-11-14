#!/usr/bin/env python3
"""NEXUS WORLD — System-Wide Integration Directive acceptance suite.

Run from NEXUS_WORLD/:  python3 tests/integration_acceptance.py

Every check performs a REAL operation: a live stdio connection to the
official filesystem MCP server (via npx), a live stdio connection to the
JARVIS NEXUS MCP server (our own exposure, as an external client would),
real headless-chromium page loads, real OpenCV image analysis, real piper
speech synthesis, real Prometheus exposition, and real multi-tool
orchestration with audit records. No result below is claimed without the
recorded output file (reports/INTEGRATION_TEST_OUTPUT.txt).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO_ROOT)  # required for `python -m integration.mcp_server_expose`

from fastapi.testclient import TestClient

from geography.hierarchy import generate_world_geography, region_nodes
from infrastructure.api_server import create_app
from infrastructure.event_bus import EventBus
from integration.browser import BrowserService
from integration.mcp_layer import (MCPIntegrationLayer, MCPServerConfig,
                                   PermissionDeniedError,
                                   ToolExecutionError)
from integration.register import (IntegrationRecord, IntegrationRegister,
                                  STATES)
from integration.vision import VisionService
from integration.voice import VoiceService
from integration.wiring import build_integrations
from observability import metrics
from persistence.world_store import WorldStore
from security.permissions import ActionClass, Role
from simulation.region_ownership import RegionRegistry
from simulation.tick_engine import TickEngine

TOKEN = "test-founder-token"
RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}"
          + (f" — {detail}" if detail else ""))


def new_store(path: str) -> WorldStore:
    for suffix in ("", "-wal", "-shm"):
        if os.path.exists(path + suffix):
            os.remove(path + suffix)
    return WorldStore(path)


def build_world(store: WorldStore) -> None:
    store.append(0, "world.created", {
        "idempotency_key": "world-nexus-prime",
        "world_id": "nexus-prime", "name": "Nexus Prime", "seed": 20261113,
        "epoch_utc": "2026-01-01T00:00:00", "minutes_per_tick": 10})
    generate_world_geography(store, seed=20261113)
    reg = RegionRegistry(store)
    for r in region_nodes(store):
        reg.acquire(r["region_id"], owner="sim-engine-0")


def mcp_json(payload: dict) -> dict:
    """Parse a FastMCP dict-returning tool result."""
    if payload.get("structured"):
        return payload["structured"]
    return json.loads(payload["content"])


def main() -> int:
    tmp = tempfile.mkdtemp(prefix="nexus_ix_")
    t0 = time.perf_counter()
    layers: list[MCPIntegrationLayer] = []
    browsers: list[BrowserService] = []

    # ----------------------------------------------------------- fixtures
    fs_root = os.path.join(tmp, "mcpfs")
    os.makedirs(os.path.join(fs_root, "nested"), exist_ok=True)
    note_path = os.path.join(fs_root, "note.txt")
    data_path = os.path.join(fs_root, "data.json")
    deep_path = os.path.join(fs_root, "nested", "deep.txt")
    with open(note_path, "w") as fh:
        fh.write("NEXUS WORLD filesystem MCP fixture\n")
    with open(data_path, "w") as fh:
        fh.write('{"ok": true, "fixture": 1}\n')
    with open(deep_path, "w") as fh:
        fh.write("nested content\n")

    html_path = os.path.join(tmp, "page.html")
    with open(html_path, "w") as fh:
        fh.write("<html><head><title>Nexus Browser Fixture</title></head>"
                 "<body><h1>NEXUS WORLD BROWSER FIXTURE</h1>"
                 "<p>Integration directive live render.</p>"
                 "<a href='https://example.com'>example</a>"
                 "</body></html>")
    fixture_url = "file://" + html_path

    import cv2
    import numpy as np
    grad_path = os.path.join(tmp, "grad.png")
    grad = np.tile(np.linspace(0, 255, 64, dtype=np.uint8), (32, 1))
    grad = np.stack([grad, grad[::-1], grad], axis=-1)
    cv2.imwrite(grad_path, grad)

    try:
        # ================= M. MCP layer — filesystem server (real) ========
        layer = MCPIntegrationLayer()
        layers.append(layer)
        fs_cfg = MCPServerConfig(
            name="filesystem",
            command="npx",
            args=["-y", "@modelcontextprotocol/server-filesystem",
                  "--read-only", fs_root],
            allowed_tools=[
                "list_directory", "read_text_file", "read_multiple_files",
                "get_file_info", "directory_tree", "search_files",
                "list_allowed_directories", "list_directory_with_sizes"],
            connect_timeout_s=180.0)
        report = layer.connect(fs_cfg)
        check("M1 filesystem MCP connected, tools discovered + schemas",
              len(report["discovered_tools"]) >= 6
              and bool(report["allowed_tools"])
              and all(s.get("type") == "object"
                      for s in report["schemas"].values()),
              f"discovered={len(report['discovered_tools'])} "
              f"allowed={len(report['allowed_tools'])}")
        check("M1b write tools not served (server --read-only enforced)",
              "write_file" not in report["discovered_tools"]
              and "edit_file" not in report["discovered_tools"])

        r = layer.call("filesystem", "list_directory", {"path": fs_root})
        check("M2 list_directory real call",
              "note.txt" in r["content"] and "data.json" in r["content"],
              r["content"][:80].replace("\n", " | "))

        r = layer.call("filesystem", "read_text_file",
                       {"path": note_path})
        check("M3 read_text_file real call returns exact content",
              "NEXUS WORLD filesystem MCP fixture" in r["content"])

        r = layer.call("filesystem", "read_multiple_files",
                       {"paths": [note_path, data_path]})
        check("M4 read_multiple_files real call",
              "fixture" in r["content"] and '"ok": true' in r["content"])

        r = layer.call("filesystem", "directory_tree", {"path": fs_root})
        check("M5 directory_tree real call (nested entry)",
              "deep.txt" in r["content"])

        try:
            layer.call("filesystem", "write_file",
                       {"path": os.path.join(tmp, "evil.txt"),
                        "content": "must not pass"})
            denied = False
        except PermissionDeniedError:
            denied = True
        check("M6 allowlist gate blocks non-allowed tool", denied,
              "PermissionDeniedError raised before any server round-trip")

        try:
            layer.call("filesystem", "read_text_file",
                       {"path": "/nonexistent/definitely-missing.txt"})
            mapped = False
        except ToolExecutionError:
            mapped = True
        check("M7 server-side error mapped to ToolExecutionError", mapped)

        h = layer.server_health("filesystem")
        check("M8 health monitoring reports connected + call counters",
              h["status"] == "connected" and h["calls"] >= 4
              and h["tool_count"] >= 6,
              f"calls={h['calls']} tool_count={h['tool_count']}")

        # ================= J. JARVIS exposed AS an MCP server =============
        jdb = os.path.join(tmp, "jarvis_world.db")
        js = new_store(jdb)
        build_world(js)
        js.close()

        jlayer = MCPIntegrationLayer()
        layers.append(jlayer)
        jcfg = MCPServerConfig(
            name="jarvis",
            command=sys.executable,
            args=["-m", "integration.mcp_server_expose",
                  "--db", jdb, "--token", TOKEN],
            connect_timeout_s=90.0)
        jreport = jlayer.connect(jcfg)
        check("J1 JARVIS MCP server spawned + handshake + tool discovery",
              len(jreport["discovered_tools"]) == 5,
              f"tools={jreport['discovered_tools']}")

        r = mcp_json(jlayer.call("jarvis", "get_world_status", {}))
        check("J2 get_world_status over MCP matches world db",
              r.get("status") == "ok" and r.get("tick") == 0
              and r.get("world_id") == "nexus-prime"
              and bool(r.get("state_hash")),
              f"tick={r.get('tick')} hash={str(r.get('state_hash'))[:12]}")

        r = mcp_json(jlayer.call("jarvis", "run_ticks",
                                 {"n": 5, "founder_token": TOKEN}))
        reopened = WorldStore(jdb)
        tick_after = reopened.current_tick
        reopened.close()
        check("J3 run_ticks over MCP advances the persisted world",
              r.get("tick") == 5 and r.get("advanced") == 5
              and tick_after == 5,
              f"result tick={r.get('tick')} db tick={tick_after}")

        r = mcp_json(jlayer.call("jarvis", "run_ticks",
                                 {"n": 3, "founder_token": "WRONG"}))
        check("J4 wrong founder token rejected over MCP",
              r.get("status") == "rejected")

        r = mcp_json(jlayer.call("jarvis", "execute_command",
                                 {"capability": "world.status",
                                  "action_class": "simulate"}))
        r2 = mcp_json(jlayer.call("jarvis", "execute_command",
                                  {"capability": "world.status",
                                   "action_class": "observe"}))
        check("J5 permission system enforced through MCP transport",
              r.get("status") == "rejected"
              and r2.get("status") == "executed",
              f"simulate/observer={r.get('status')} "
              f"observe/observer={r2.get('status')}")

        r = mcp_json(jlayer.call("jarvis", "list_capabilities", {}))
        check("J6 list_capabilities over MCP",
              "world.status" in r.get("capabilities", [])
              and "world.register_entity" in r.get("capabilities", []))

        # ================= B. Browser automation (real chromium) ==========
        browser = BrowserService()
        browsers.append(browser)
        nav = browser.navigate(fixture_url)
        check("B1 navigate local fixture (real headless chromium)",
              nav["title"] == "Nexus Browser Fixture"
              and nav["text_chars"] > 20,
              f"title={nav['title']!r} chars={nav['text_chars']}")

        lnk = browser.links(fixture_url)
        # DOM URL serialisation appends "/" to the empty path, so compare
        # normalised URLs.
        check("B2 link extraction from rendered page",
              any(str(l).rstrip("/") == "https://example.com"
                  for l in lnk["links"]),
              f"links={lnk['links']}")

        shot = os.path.join(tmp, "fixture.png")
        scr = browser.screenshot(fixture_url, shot)
        with open(shot, "rb") as fh:
            magic = fh.read(8)
        check("B3 screenshot rendered to PNG",
              scr["bytes"] > 3000 and magic == b"\x89PNG\r\n\x1a\n",
              f"bytes={scr['bytes']}")

        try:
            web = browser.navigate("https://example.com")
            ok = web["status"] == 200 and web["title"] == "Example Domain"
            detail = f"status={web['status']} title={web['title']!r}"
        except Exception as exc:  # noqa: BLE001 — honest recording
            ok, detail = False, f"network navigation failed: {exc}"
        check("B4 navigate live site https://example.com", ok, detail)

        # ================= V. Computer vision (real OpenCV) ===============
        vision = VisionService()
        ana = vision.analyze_image(grad_path)
        check("V1 analyze_image on known fixture (64x32x3)",
              ana["width"] == 64 and ana["height"] == 32
              and ana["channels"] == 3,
              f"{ana['width']}x{ana['height']} edge_density="
              f"{ana['edge_density']}")

        qr_path = os.path.join(tmp, "qr.png")
        vision.make_qr_png("NEXUS-WORLD-2026", qr_path)
        dec = vision.decode_qr(qr_path)
        check("V2 QR encode→decode roundtrip", dec["decoded"]
              == "NEXUS-WORLD-2026", f"decoded={dec['decoded']!r}")

        ana2 = vision.analyze_image(shot)
        check("V3 analyze_image on browser screenshot (chained artifact)",
              ana2["width"] > 0 and ana2["height"] > 0,
              f"{ana2['width']}x{ana2['height']} sharpness="
              f"{ana2['sharpness']}")

        # ================= W. Voice (real piper synthesis) =================
        voice = VoiceService(os.path.join(
            REPO_ROOT, "assets", "voices", "en_US-lessac-medium.onnx"))
        wav_path = os.path.join(tmp, "voice_check.wav")
        try:
            syn = voice.synthesize(
                "Nexus world online. Integration directive voice check.",
                wav_path)
            ok = (syn["bytes"] > 20000 and syn["duration_s"] > 0.5
                  and os.path.isfile(wav_path))
            detail = (f"duration={syn['duration_s']}s bytes={syn['bytes']} "
                      f"elapsed={syn['elapsed_s']}s")
        except Exception as exc:  # noqa: BLE001
            ok, detail = False, f"synthesis failed: {exc}"
        check("W1 piper TTS real synthesis to WAV", ok, detail)

        # ============ X. Multi-tool workflow via central orchestrator =====
        xdb = os.path.join(tmp, "x_world.db")
        xstore = new_store(xdb)
        build_world(xstore)
        bundle = build_integrations(xstore, TOKEN, fs_root=fs_root)
        layers.append(bundle.layer)
        browsers.append(bundle.browser)

        shot2 = os.path.join(tmp, "orchestrated.png")
        r1 = bundle.orchestrator.execute(
            actor="founder", role=Role.FOUNDER,
            action_class=ActionClass.EXTERNAL,
            capability="browser.screenshot",
            params={"url": fixture_url, "path": shot2},
            command_id="cmd-x1", approved=True)
        check("X1 orchestrator → browser.screenshot (approval-gated, "
              "audited)",
              r1["status"] == "executed" and os.path.isfile(shot2),
              f"status={r1['status']}")

        r2 = bundle.orchestrator.execute(
            actor="founder", role=Role.FOUNDER,
            action_class=ActionClass.INSPECT,
            capability="vision.analyze_image", params={"source": shot2},
            command_id="cmd-x2")
        check("X2 orchestrator → vision.analyze_image on X1 artifact",
              r2["status"] == "executed"
              and r2["detail"]["width"] > 0,
              f"{r2['detail']['width']}x{r2['detail']['height']}")

        intents = {e["payload"].get("intent")
                   for e in xstore.events(0, 1000)
                   if e["type"] == "command.executed"}
        check("X3 both tool invocations present in the audit event log",
              "browser.screenshot" in intents
              and "vision.analyze_image" in intents,
              f"intents={sorted(i for i in intents if i)}")

        r3 = bundle.orchestrator.execute(
            actor="founder", role=Role.FOUNDER,
            action_class=ActionClass.EXTERNAL,
            capability="browser.screenshot",
            params={"url": fixture_url, "path": shot2},
            command_id="cmd-x1", approved=True)
        check("X4 command idempotency across the integration layer",
              r3["status"] == "duplicate")

        r4 = bundle.orchestrator.execute(
            actor="founder", role=Role.FOUNDER,
            action_class=ActionClass.INSPECT,
            capability="nope.nope", params={}, command_id="cmd-x5")
        check("X5 unknown capability rejected + audited (no crash)",
              r4["status"] == "rejected")

        # ================= O. Observability ================================
        payload = metrics.metrics_payload().decode()
        check("O1 Prometheus exposition has orchestrator + tool metrics",
              "jarvis_commands_total" in payload
              and "jarvis_tool_latency_seconds" in payload
              and "jarvis_mcp_server_up" in payload
              and 'capability="browser.screenshot"' in payload)

        TickEngine(xstore, EventBus()).run(3)
        metrics.refresh_world_gauges(xstore)
        payload = metrics.metrics_payload().decode()
        m = re.search(r"^jarvis_world_tick (\d+)", payload, re.M)
        check("O2 world tick gauge tracks persisted tick",
              m is not None and m.group(1) == str(xstore.current_tick),
              f"gauge={m.group(1) if m else '?'} "
              f"store={xstore.current_tick}")

        # ================= R. Integration register =========================
        reg = IntegrationRegister()
        rec = IntegrationRecord(
            name="sample-tech", category="test", provider="Sample Inc",
            repo_url="https://example.com/repo", purpose="test record")
        reg.upsert(rec)
        reg.advance("sample-tech", "EVALUATED")
        try:
            reg.advance("sample-tech", "OPERATIONAL")
            guarded = False
        except ValueError:
            guarded = True
        check("R1 OPERATIONAL refused without evidence", guarded)
        for st in ("APPROVED", "INSTALLED", "CONNECTED", "REGISTERED",
                   "TESTED"):
            reg.advance("sample-tech", st)
        try:
            reg.advance("sample-tech", "EVALUATED")
            regressed = False
        except ValueError:
            regressed = True
        check("R2 state regression refused", regressed)
        reg.advance("sample-tech", "OPERATIONAL",
                    evidence="reports/INTEGRATION_TEST_OUTPUT.txt")
        md = reg.to_markdown()
        reg_path = os.path.join(tmp, "register.json")
        reg.save(reg_path)
        reloaded = IntegrationRegister.load(reg_path)
        check("R3 markdown rendering + JSON persistence roundtrip",
              "| 1 | sample-tech |" in md
              and "## Detail records" in md
              and reloaded.get("sample-tech").state == "OPERATIONAL")

        try:
            IntegrationRecord(name="bad", category="c", provider="p",
                              repo_url="u", purpose="x", state="FINISHED")
            validated = False
        except ValueError:
            validated = True
        check("R4 invalid state rejected at construction", validated)

        # ============ A. Additive API routes (Phase-1 endpoints intact) ===
        adb = os.path.join(tmp, "api_world.db")
        app = create_app(adb, founder_token=TOKEN)
        client = TestClient(app)

        m1 = client.get("/metrics")
        check("A1 GET /metrics serves Prometheus exposition",
              m1.status_code == 200 and "jarvis_world_tick" in m1.text
              and "text/plain" in m1.headers.get("content-type", ""))

        i1 = client.get("/integrations")
        body = i1.json()
        mcp_entry = next((x for x in body["integrations"]
                          if x["name"] == "mcp.filesystem"), {})
        caps = body.get("orchestrator_capabilities", [])
        check("A2 GET /integrations lists connected stack",
              i1.status_code == 200
              and mcp_entry.get("status") == "connected"
              and "mcp.filesystem.list_directory" in caps
              and "browser.navigate" in caps
              and "vision.analyze_image" in caps
              and "voice.synthesize" in caps)

        h1 = client.get("/integrations/health")
        hj = h1.json()
        check("A3 GET /integrations/health live component status",
              h1.status_code == 200
              and hj["mcp_servers"]["filesystem"]["status"] == "connected"
              and hj["voice"]["available"] is True)

        c1 = client.post("/command",
                         headers={"X-Nexus-Token": TOKEN},
                         json={"capability": "browser.links",
                               "action_class": "inspect",
                               "params": {"url": fixture_url},
                               "command_id": "cmd-api-1"})
        cb = c1.json()
        check("A4 external capability reachable through HTTP /command",
              c1.status_code == 200 and cb["status"] == "executed"
              and any("example.com" in str(l)
                      for l in cb["detail"]["links"]),
              f"status={cb.get('status')} links={len(cb['detail']['links'])}")

        m2 = client.get("/metrics")
        check("A5 /metrics now shows command + tool telemetry",
              m2.status_code == 200
              and "jarvis_commands_total" in m2.text
              and 'capability="browser.links"' in m2.text)

        # ==== P2/3D additions (Continuation Directive: Blender MCP + 3D) ==
        w1 = client.post("/world/create",
                         headers={"X-Nexus-Token": TOKEN},
                         json={"name": "Nexus Live", "seed": 20261113})
        check("P2A POST /world/create on integrated app",
              w1.status_code in (201, 409), f"status={w1.status_code}")

        p1 = client.post("/world/populate",
                         headers={"X-Nexus-Token": TOKEN}, json={"n": 16})
        pb = p1.json() if p1.status_code == 200 else {}
        check("P2B POST /world/populate creates residents",
              p1.status_code == 201 and p1.json().get("created") == 16,
              f"status={p1.status_code}")

        t1 = client.post("/world/tick",
                         headers={"X-Nexus-Token": TOKEN}, json={"n": 72})
        check("P2C 72 ticks with living residents advance",
              t1.status_code == 200 and t1.json().get("tick") == 72,
              f"body={t1.json() if t1.status_code != 200 else ''}")

        rs = client.get("/residents")
        check("P2D GET /residents lists living residents",
              rs.status_code == 200 and rs.json().get("count") == 16
              and all(r.get("action") for r in rs.json()["residents"]))

        i2 = client.get("/integrations")
        i2b = i2.json()
        bl = next((x for x in i2b["integrations"]
                   if x["name"] == "mcp.blender"), {})
        caps2 = i2b.get("orchestrator_capabilities", [])
        check("A6 blender MCP server connected + registered on orchestrator",
              bl.get("status") == "connected"
              and "mcp.blender.blender_version" in caps2
              and "render3d.render" in caps2,
              f"status={bl.get('status')} caps={len(caps2)}")

        r_bad = client.post("/render", json={"view": "top"})
        check("A7 POST /render rejects unauthenticated",
              r_bad.status_code in (401, 403),
              f"status={r_bad.status_code}")

        r1 = client.post("/render",
                         headers={"X-Nexus-Token": TOKEN},
                         json={"view": "top", "samples": 8,
                               "width": 480, "height": 270})
        rb = r1.json() if r1.status_code == 200 else {}
        check("A8 POST /render renders the live world (real Blender)",
              r1.status_code == 200 and rb.get("ok") is True
              and rb.get("transport") in ("mcp", "driver")
              and (rb.get("final_inspection") or {}).get("ok") is True,
              f"status={r1.status_code} transport={rb.get('transport')} "
              f"ok={rb.get('ok')}")

        lst = client.get("/world/renders")
        check("A9 GET /world/renders lists render artifacts",
              lst.status_code == 200
              and len(lst.json().get("renders", [])) >= 1)

    finally:
        for b in browsers:
            b.close()
        for l in layers:
            l.shutdown()
        print(f"\n(fixtures kept at {tmp})")

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = len(RESULTS) - passed
    print(f"\n{'=' * 64}\nINTEGRATION ACCEPTANCE: {passed}/{len(RESULTS)} "
          f"PASS, {failed} FAIL — {time.perf_counter() - t0:.1f}s")
    for name, ok, detail in RESULTS:
        if not ok:
            print(f"  FAILED: {name} — {detail}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
