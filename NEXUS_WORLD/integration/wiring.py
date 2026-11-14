"""Build the integration bundle + additive FastAPI routes (directive §4).

`build_integrations` connects every approved external technology, registers
its capabilities on the ONE central orchestrator, and wires health/metrics.
Any connection failure is recorded honestly in the bundle status — never
faked as connected.

`integration_routes` attaches /metrics, /integrations and
/integrations/health to an existing FastAPI app WITHOUT touching any
Phase-1 endpoint (regression-safe: the Phase 1 suite must stay 48/48).
"""
from __future__ import annotations

import logging
import os

from fastapi import Header, HTTPException, Response

from integration.browser import BrowserService
from integration.mcp_layer import (MCPIntegrationLayer, MCPServerConfig,
                                   _safe_child_env)
from integration.vision import VisionService
from integration.voice import VoiceService
from observability import metrics

logger = logging.getLogger("jarvis.integration.wiring")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_FS_ROOT = os.path.join(REPO_ROOT, "assets", "mcp_fs_sandbox")
DEFAULT_VOICE_MODEL = os.path.join(REPO_ROOT, "assets", "voices",
                                   "en_US-lessac-medium.onnx")
BLENDER_VENV_PY = os.path.join(REPO_ROOT, ".venv-blender", "bin", "python")

# Module level (NOT closure level): with `from __future__ import
# annotations` FastAPI resolves hints from module globals — a closure-local
# model would 422 on every request.
from pydantic import BaseModel  # noqa: E402


class RenderRequest(BaseModel):
    """POST /render body — renders the current world through the central
    orchestrator (see integration_routes below)."""

    view: str = "top"
    samples: int = 24
    width: int = 960
    height: int = 540
    brightness: float = 1.0

# Least-privilege read-only set (server ALSO runs with --read-only, so the
# gate is enforced twice: layer allowlist + server-side restriction).
FILESYSTEM_ALLOWED_TOOLS = [
    "list_directory", "read_text_file", "read_multiple_files",
    "get_file_info", "directory_tree", "search_files",
    "list_allowed_directories", "list_directory_with_sizes"]

BLENDER_ALLOWED_TOOLS = [
    "blender_version", "build_scene", "render_view", "export_scene",
    "scene_info", "animate_scene",
    # PRIORITY 4 (procedural world / characters / physics / UE bundle)
    "build_terrain_scene", "build_characters", "run_physics",
    "export_unreal_bundle"]

# Unreal MCP server: protocol connects over stdio (real MCP handshake);
# every tool honestly reports editor_reachable:false until a UE 5.4+
# editor is up on Windows/GPU hardware (docs/UNREAL_MCP_REQUIREMENTS.md).
UNREAL_ALLOWED_TOOLS = [
    "unreal_status", "remote_python", "level_info", "import_asset",
    "spawn_actor", "viewport_screenshot", "save_all"]


class IntegrationBundle:
    """Everything the running process has ACTUALLY connected, in one object."""

    def __init__(self, store, founder_token: str, orchestrator, layer,
                 browser, vision, voice, capabilities, mcp_status,
                 render3d=None):
        self.store = store
        self.founder_token = founder_token
        self.orchestrator = orchestrator
        self.layer = layer
        self.browser = browser
        self.vision = vision
        self.voice = voice
        self.capabilities = capabilities
        self.mcp_status = mcp_status
        self.render3d = render3d

    def shutdown(self) -> None:
        try:
            self.layer.shutdown()
        finally:
            self.browser.close()


def build_integrations(store, founder_token: str = "",
                       fs_root: str | None = None,
                       connect_mcp: bool = True,
                       include_voice: bool = True) -> IntegrationBundle:
    """Connect approved technologies + register capabilities (single place)."""
    from observability.metrics import InstrumentedOrchestrator
    orch = InstrumentedOrchestrator(store)
    capabilities: dict[str, dict] = {}
    mcp_status: dict[str, str] = {}

    # ---------------------------------------------------------- MCP layer
    layer = MCPIntegrationLayer()
    if connect_mcp:
        root = os.path.abspath(fs_root or os.environ.get(
            "NEXUS_MCP_FS_ROOT", DEFAULT_FS_ROOT))
        os.makedirs(root, exist_ok=True)
        cfg = MCPServerConfig(
            name="filesystem",
            command="npx",
            args=["-y", "@modelcontextprotocol/server-filesystem",
                  "--read-only", root],
            allowed_tools=FILESYSTEM_ALLOWED_TOOLS,
            connect_timeout_s=180.0,
            call_timeout_s=60.0)
        try:
            report = layer.connect(cfg)
            caps = layer.register_with_orchestrator(orch, "filesystem")
            capabilities["mcp.filesystem"] = {
                "capabilities": caps,
                "tools_discovered": len(report["discovered_tools"])}
            mcp_status["filesystem"] = "connected"
            metrics.set_mcp_up("filesystem", True)
        except Exception as exc:  # noqa: BLE001 — honest failure record
            mcp_status["filesystem"] = f"connection failed: {exc}"
            metrics.set_mcp_up("filesystem", False)
            logger.error("mcp.filesystem connect failed: %s", exc)

    # --------------------------------------------- blender MCP server (3D)
    # REAL Blender Python API control over MCP stdio: the bpy 5.3 venv
    # (Python 3.13) hosts mcp_servers/blender_server.py. Connect only if
    # the venv exists — absence is reported honestly, never faked.
    if connect_mcp and os.path.exists(BLENDER_VENV_PY):
        child_env = dict(_safe_child_env())
        child_env["PYTHONPATH"] = REPO_ROOT
        bcfg = MCPServerConfig(
            name="blender",
            command=BLENDER_VENV_PY,
            args=["-m", "mcp_servers.blender_server"],
            env=child_env,
            allowed_tools=BLENDER_ALLOWED_TOOLS,
            connect_timeout_s=180.0,
            call_timeout_s=900.0)
        try:
            breport = layer.connect(bcfg)
            bcaps = layer.register_with_orchestrator(orch, "blender")
            capabilities["mcp.blender"] = {
                "capabilities": bcaps,
                "tools_discovered": len(breport["discovered_tools"])}
            mcp_status["blender"] = "connected"
            metrics.set_mcp_up("blender", True)
        except Exception as exc:  # noqa: BLE001 — honest failure record
            mcp_status["blender"] = f"connection failed: {exc}"
            metrics.set_mcp_up("blender", False)
            logger.error("mcp.blender connect failed: %s", exc)
    elif connect_mcp:
        mcp_status["blender"] = ("not installed: bpy venv absent "
                                  "(.venv-blender) — see register entry "
                                  "#78")

    # ------------------------------------------------------------- browser
    browser = BrowserService()
    orch.register_capability(
        "browser.navigate",
        lambda p: browser.navigate(p["url"], p.get("timeout_ms")))
    orch.register_capability(
        "browser.screenshot",
        lambda p: browser.screenshot(p["url"], p["path"],
                                     p.get("timeout_ms")))
    orch.register_capability(
        "browser.links",
        lambda p: browser.links(p["url"], p.get("timeout_ms")))
    capabilities["browser"] = {"capabilities": [
        "browser.navigate", "browser.screenshot", "browser.links"]}

    # -------------------------------------------------------------- vision
    vision = VisionService()
    orch.register_capability("vision.analyze_image",
                             lambda p: vision.analyze_image(p["source"]))
    orch.register_capability("vision.decode_qr",
                             lambda p: vision.decode_qr(p["source"]))
    capabilities["vision"] = {"capabilities": [
        "vision.analyze_image", "vision.decode_qr"]}

    # --------------------------------------------------------------- voice
    voice = None
    if include_voice:
        model = os.environ.get("NEXUS_PIPER_MODEL", DEFAULT_VOICE_MODEL)
        candidate = VoiceService(model)
        if candidate.available():
            voice = candidate
            orch.register_capability(
                "voice.synthesize",
                lambda p: voice.synthesize(p["text"], p["path"]))
            capabilities["voice"] = {
                "capabilities": ["voice.synthesize"],
                "model": os.path.basename(model)}
        else:
            capabilities["voice"] = {
                "capabilities": [],
                "status": "model file not present — capability NOT "
                          "registered (honest absence, not a failure)"}

    # ------------------------------------------ unreal MCP server (P3)
    # Real MCP stdio server; connects over the SAME layer as Blender. The
    # server runs anywhere — its tools call the UE editor over HTTP and
    # honestly report editor_reachable:false while no editor exists.
    if connect_mcp:
        uenv = dict(_safe_child_env())
        uenv["PYTHONPATH"] = REPO_ROOT
        uenv.setdefault("UNREAL_REMOTE_URL",
                        "http://127.0.0.1:30010")
        ucfg = MCPServerConfig(
            name="unreal",
            command="python3",
            args=["-m", "mcp_servers.unreal_server"],
            env=uenv,
            allowed_tools=UNREAL_ALLOWED_TOOLS,
            connect_timeout_s=60.0,
            call_timeout_s=45.0)
        try:
            ureport = layer.connect(ucfg)
            ucaps = layer.register_with_orchestrator(orch, "unreal")
            capabilities["mcp.unreal"] = {
                "capabilities": ucaps,
                "tools_discovered": len(ureport["discovered_tools"]),
                "editor_status": "not reachable (Tier-0 sandbox has no "
                                 "UE editor) — tools report honest "
                                 "editor_reachable:false"}
            mcp_status["unreal"] = "connected (editor not reachable)"
            metrics.set_mcp_up("unreal", True)
        except Exception as exc:  # noqa: BLE001 — honest failure record
            mcp_status["unreal"] = f"connection failed: {exc}"
            metrics.set_mcp_up("unreal", False)
            logger.error("mcp.unreal connect failed: %s", exc)

    # ------------------------------------------------- 3D render pipeline
    # The Blender-backed world renderer, registered on the SAME central
    # orchestrator (directive Part 6): MCP-first transport, subprocess
    # driver fallback, inspection + auto-correction inside the capability.
    from render3d.pipeline import RenderPipeline
    render3d = RenderPipeline(store, layer)
    orch.register_capability("render3d.render", render3d.render)
    orch.register_capability("render3d.export", render3d.export)
    orch.register_capability("render3d.animate", render3d.animate)
    orch.register_capability("render3d.inspect", render3d.inspect)
    orch.register_capability("render3d.worldgen", render3d.worldgen)
    orch.register_capability("render3d.physics", render3d.physics)
    orch.register_capability("render3d.ue_export", render3d.ue_export)
    capabilities["render3d"] = {
        "capabilities": ["render3d.render", "render3d.export",
                          "render3d.animate", "render3d.inspect",
                          "render3d.worldgen", "render3d.physics",
                          "render3d.ue_export"],
        "transport": render3d.available()}

    return IntegrationBundle(store=store, founder_token=founder_token,
                             orchestrator=orch, layer=layer, browser=browser,
                             vision=vision, voice=voice,
                             capabilities=capabilities,
                             mcp_status=mcp_status, render3d=render3d)


def integration_routes(app, state: dict, store_fn, founder_token: str) -> None:
    """Attach additive endpoints; the bundle is built lazily on first use."""
    from security.permissions import ActionClass, Role

    def bundle() -> IntegrationBundle:
        if "ix" not in state:
            state["ix"] = build_integrations(store_fn(), founder_token)
            # the /command route must see external capabilities: point the
            # app's orchestrator at the instrumented one (same store, same
            # permission path — only telemetry + external caps differ)
            state["orch"] = state["ix"].orchestrator
        return state["ix"]

    @app.get("/metrics")
    def prometheus_metrics():
        return Response(content=metrics.metrics_payload(),
                        media_type="text/plain; version=0.0.4; "
                                   "charset=utf-8")

    @app.get("/integrations")
    def integrations():
        ix = bundle()
        return {
            "integrations": [
                {"name": "mcp.filesystem", "kind": "mcp-server",
                 "status": ix.mcp_status.get("filesystem",
                                             "not configured"),
                 "health": ix.layer.server_health("filesystem"),
                 "capabilities": ix.capabilities.get(
                     "mcp.filesystem", {}).get("capabilities", [])},
                {"name": "mcp.blender", "kind": "mcp-server",
                 "status": ix.mcp_status.get("blender",
                                             "not configured"),
                 "health": ix.layer.server_health("blender"),
                 "capabilities": ix.capabilities.get(
                     "mcp.blender", {}).get("capabilities", [])},
                {"name": "mcp.unreal", "kind": "mcp-server",
                 "status": ix.mcp_status.get("unreal",
                                             "not configured"),
                 "health": ix.layer.server_health("unreal"),
                 "editor_status": ix.capabilities.get(
                     "mcp.unreal", {}).get("editor_status",
                                            "unknown"),
                 "capabilities": ix.capabilities.get(
                     "mcp.unreal", {}).get("capabilities", [])},
                {"name": "browser", "kind": "service",
                 "status": "registered",
                 "capabilities": ix.capabilities.get(
                     "browser", {}).get("capabilities", [])},
                {"name": "vision", "kind": "service",
                 "status": "registered",
                 "capabilities": ix.capabilities.get(
                     "vision", {}).get("capabilities", [])},
                {"name": "voice", "kind": "service",
                 "status": ("registered" if ix.voice
                            else "not registered (model absent)"),
                 "capabilities": ix.capabilities.get(
                     "voice", {}).get("capabilities", [])},
                {"name": "render3d", "kind": "service",
                 "status": "registered",
                 "transport": ix.capabilities.get(
                     "render3d", {}).get("transport", {}),
                 "capabilities": ix.capabilities.get(
                     "render3d", {}).get("capabilities", [])},
                {"name": "metrics", "kind": "service",
                 "status": "operational", "endpoint": "/metrics"},
            ],
            "orchestrator_capabilities": sorted(ix.orchestrator.registry),
        }

    @app.get("/integrations/health")
    def integrations_health():
        ix = bundle()
        return {"mcp_servers": ix.layer.health(),
                "browser": {"available": True},
                "vision": {"available": True},
                "voice": {"available": bool(ix.voice)},
                "render3d": (ix.render3d.available()
                             if ix.render3d else {}),
                "metrics": {"available": True}}

    # ------------------------------------------------ 3D render (Phase 2)
    # POST /render — renders the CURRENT world through the central
    # orchestrator (permission + audit + idempotency, like every tool).
    @app.post("/render")
    def render_world(req: RenderRequest,
                     x_nexus_token: str | None = Header(default=None)):
        if x_nexus_token != founder_token:
            raise HTTPException(
                401 if x_nexus_token else 403, "founder token required")
        if not store_fn().meta("world_id"):
            raise HTTPException(404, "no world; POST /world/create first")
        ix = bundle()
        result = ix.orchestrator.execute(
            actor="founder", role=Role.FOUNDER,
            action_class=ActionClass.SIMULATE,
            capability="render3d.render", params=req.model_dump())
        if result.get("status") != "executed":
            raise HTTPException(500, str(result.get("detail"))[:400])
        return result["detail"]

    @app.get("/world/renders")
    def list_renders(x_nexus_token: str | None = Header(default=None)):
        from render3d.pipeline import RENDER_DIR
        if x_nexus_token is not None and x_nexus_token != founder_token:
            raise HTTPException(401, "invalid token")
        files = []
        if os.path.isdir(RENDER_DIR):
            for name in sorted(os.listdir(RENDER_DIR)):
                path = os.path.join(RENDER_DIR, name)
                files.append({"file": name, "bytes": os.path.getsize(path)})
        return {"renders": files, "directory": RENDER_DIR}
