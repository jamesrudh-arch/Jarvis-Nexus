"""Reusable MCP integration layer (Integration Directive §3).

Built on the official `mcp` Python SDK (1.x line, pinned <2 per ADR-007).
Supports, exactly as the directive requires:
  * discovery          — spawn + initialize + list_tools per server
  * tool schemas       — inputSchema captured for every discovered tool
  * registration       — one orchestrator capability per allowed tool
                         (name: mcp.<server>.<tool>) — no disconnected
                         tool collections
  * permissions        — per-server tool allowlist (least privilege) ON TOP
                         of any server-side restriction (e.g. --read-only)
  * execution          — call_tool with hard timeouts, sync API surface
  * error handling     — MCPError taxonomy (permission / not-connected /
                         timeout / tool-isError / discovery)
  * logging            — one structured JSON log line per operation
  * health monitoring  — per-server status / calls / errors / last_error

Threading model: one daemon thread + event loop per connected stdio
server; the ClientSession lives inside that loop. All public methods are
thread-safe and synchronous (callable from FastAPI handlers, the tick
engine, and tests).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.types import TextContent

logger = logging.getLogger("jarvis.integration.mcp")


# --------------------------------------------------------------------- errors
class MCPError(Exception):
    """Base class for every MCP-layer failure (SDK errors never leak raw)."""


class DiscoveryError(MCPError):
    """Server could not be started / initialized / enumerated."""


class ServerNotConnectedError(MCPError):
    """Call attempted against a server that is not connected."""


class PermissionDeniedError(MCPError):
    """Tool is not on the server's allowlist (least-privilege gate)."""


class ToolTimeoutError(MCPError):
    """call_tool exceeded its deadline."""


class ToolExecutionError(MCPError):
    """Server executed the tool and returned isError=True."""


# --------------------------------------------------------------------- config
@dataclass
class MCPServerConfig:
    name: str
    command: str                      # e.g. "npx" or sys.executable
    args: list[str]
    env: dict[str, str] | None = None
    allowed_tools: list[str] | None = None   # None = every tool (unsafe)
    connect_timeout_s: float = 120.0
    call_timeout_s: float = 60.0


@dataclass
class ServerHealth:
    name: str
    status: str = "connecting"     # connecting | connected | error | stopped
    tools: dict[str, dict[str, Any]] = field(default_factory=dict)
    allowed_tools: list[str] = field(default_factory=list)
    connected_at: float | None = None
    last_call_at: float | None = None
    calls: int = 0
    errors: int = 0
    last_error: str | None = None

    def as_dict(self) -> dict:
        return {"name": self.name, "status": self.status,
                "tool_count": len(self.tools),
                "allowed_tools": self.allowed_tools,
                "connected_at": self.connected_at,
                "last_call_at": self.last_call_at,
                "calls": self.calls, "errors": self.errors,
                "last_error": self.last_error}


_ENV_DENY_PATTERNS = ("TOKEN", "SECRET", "PASSWORD", "API_KEY",
                       "CREDENTIAL")


def _safe_child_env() -> dict[str, str]:
    """Environment for spawned MCP servers: complete enough for npx/node
    (HOME, PATH, npm cache — without HOME, npx hangs), with credential-like
    variables stripped (least privilege: a tool server must never see the
    founder token or API keys)."""
    return {key: value for key, value in os.environ.items()
            if not any(p in key.upper() for p in _ENV_DENY_PATTERNS)}


class _ServerWorker(threading.Thread):
    """Owns one event loop and one open stdio MCP session."""

    def __init__(self, cfg: MCPServerConfig):
        super().__init__(daemon=True, name=f"mcp-{cfg.name}")
        self.cfg = cfg
        self.loop: asyncio.AbstractEventLoop | None = None
        self.session: ClientSession | None = None
        self.tools: dict[str, dict[str, Any]] = {}
        self.ready = threading.Event()
        self.init_error: str | None = None
        self._stop_evt: asyncio.Event | None = None

    def run(self) -> None:
        """Thread entry point (MUST be this override — a bare coroutine
        attribute would leave the thread doing nothing)."""
        asyncio.run(self._serve())

    async def _serve(self) -> None:
        self.loop = asyncio.get_running_loop()
        # NB: named _stop_evt — a `_stop` attribute would shadow
        # threading.Thread's internal _stop and break join().
        self._stop_evt = asyncio.Event()
        params = StdioServerParameters(
            command=self.cfg.command,
            args=self.cfg.args,
            env=self.cfg.env if self.cfg.env is not None
            else _safe_child_env())
        try:
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    listed = await session.list_tools()
                    self.tools = {
                        t.name: {"description": t.description or "",
                                 "inputSchema": t.inputSchema}
                        for t in listed.tools}
                    self.session = session
                    self.ready.set()
                    await self._stop_evt.wait()    # keep the session open
        except Exception as exc:                   # noqa: BLE001
            self.init_error = f"{type(exc).__name__}: {exc}"
            self.ready.set()
        finally:
            self.session = None

    def stop(self) -> None:
        if self.loop is not None and self._stop_evt is not None:
            # call_soon_threadsafe takes a plain callable — Event.set() is
            # not a coroutine, so run_coroutine_threadsafe would TypeError.
            self.loop.call_soon_threadsafe(self._stop_evt.set)

    def call(self, tool: str, arguments: dict | None,
             timeout_s: float) -> Any:
        session, loop = self.session, self.loop
        if session is None or loop is None:
            raise ServerNotConnectedError(
                f"server {self.cfg.name!r} has no open session")

        async def _call() -> Any:
            return await session.call_tool(
                tool, arguments,
                read_timeout_seconds=timedelta(seconds=timeout_s))

        future = asyncio.run_coroutine_threadsafe(_call(), loop)
        try:
            return future.result(timeout_s + 5.0)
        except FutureTimeout as exc:
            future.cancel()
            raise ToolTimeoutError(
                f"mcp call {self.cfg.name}.{tool} timed out after "
                f"{timeout_s}s") from exc


class MCPIntegrationLayer:
    """The single reusable MCP client layer for the whole platform."""

    def __init__(self) -> None:
        self._workers: dict[str, _ServerWorker] = {}
        self._health: dict[str, ServerHealth] = {}
        self._configs: dict[str, MCPServerConfig] = {}
        self._lock = threading.RLock()

    # ------------------------------------------------------------- connect
    def connect(self, cfg: MCPServerConfig) -> dict:
        """Start a server, run the MCP handshake, capture tool schemas.

        Returns a discovery report. Raises DiscoveryError on any failure —
        nothing is ever reported as connected without a completed
        initialize + list_tools round-trip.
        """
        with self._lock:
            if cfg.name in self._workers:
                raise MCPError(f"server {cfg.name!r} already connected")
            worker = _ServerWorker(cfg)
            self._workers[cfg.name] = worker
            self._configs[cfg.name] = cfg
            self._health[cfg.name] = ServerHealth(
                name=cfg.name, allowed_tools=list(cfg.allowed_tools or []))

        logger.info(json.dumps({"evt": "mcp.connect.start",
                                "server": cfg.name, "command": cfg.command,
                                "args": cfg.args}))
        worker.start()
        if not worker.ready.wait(cfg.connect_timeout_s):
            self._health[cfg.name].status = "error"
            self._health[cfg.name].last_error = (
                f"connect timeout after {cfg.connect_timeout_s}s")
            raise DiscoveryError(self._health[cfg.name].last_error or "")
        if worker.init_error is not None:
            self._health[cfg.name].status = "error"
            self._health[cfg.name].last_error = worker.init_error
            raise DiscoveryError(worker.init_error)

        health = self._health[cfg.name]
        health.status = "connected"
        health.tools = dict(worker.tools)
        health.connected_at = time.time()
        requested = (list(cfg.allowed_tools) if cfg.allowed_tools is not None
                     else sorted(worker.tools))
        health.allowed_tools = [t for t in requested if t in worker.tools]
        logger.info(json.dumps({"evt": "mcp.connect.ok",
                                "server": cfg.name,
                                "discovered_tools": len(worker.tools),
                                "allowed_tools": len(health.allowed_tools)}))
        return {"server": cfg.name,
                "discovered_tools": sorted(worker.tools),
                "allowed_tools": health.allowed_tools,
                "schemas": {n: worker.tools[n]["inputSchema"]
                            for n in health.allowed_tools}}

    # ------------------------------------------------------------- execute
    def call(self, server: str, tool: str,
             arguments: dict | None = None,
             timeout_s: float | None = None) -> dict:
        """Execute a real MCP tool call (permission-gated, time-limited)."""
        with self._lock:
            cfg = self._configs.get(server)
            health = self._health.get(server)
            worker = self._workers.get(server)
        if cfg is None or health is None or worker is None:
            raise ServerNotConnectedError(f"unknown server {server!r}")
        if tool not in health.allowed_tools:
            health.errors += 1
            logger.warning(json.dumps({"evt": "mcp.call.denied",
                                       "server": server, "tool": tool,
                                       "reason": "tool_not_on_allowlist"}))
            raise PermissionDeniedError(
                f"tool {tool!r} is not on the allowlist of server "
                f"{server!r}")
        t0 = time.perf_counter()
        try:
            result = worker.call(
                tool, arguments,
                timeout_s if timeout_s is not None else cfg.call_timeout_s)
        except MCPError:
            health.errors += 1
            raise
        health.calls += 1
        health.last_call_at = time.time()
        if getattr(result, "isError", False):
            health.errors += 1
            raise ToolExecutionError(
                f"mcp {server}.{tool} returned isError: "
                f"{_content_text(result)[:400]}")
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
        logger.info(json.dumps({"evt": "mcp.call.ok", "server": server,
                                "tool": tool, "elapsed_ms": elapsed_ms}))
        return {"content": _content_text(result),
                "structured": getattr(result, "structuredContent", None),
                "elapsed_ms": elapsed_ms}

    # ------------------------------------------------- orchestrator bridge
    def register_with_orchestrator(self, orchestrator, server: str,
                                   prefix: str = "mcp") -> list[str]:
        """Expose every allowed tool of `server` as an orchestrator
        capability named <prefix>.<server>.<tool> (directive §4)."""
        with self._lock:
            health = self._health.get(server)
        if health is None or health.status != "connected":
            raise ServerNotConnectedError(f"server {server!r} not connected")

        def _make(server_name: str, tool_name: str):
            def _handler(params: dict):
                return self.call(server_name, tool_name,
                                 dict(params or {}))
            _handler.__name__ = f"mcp_{server_name}_{tool_name}"
            return _handler

        registered: list[str] = []
        for tool in sorted(health.allowed_tools):
            cap = f"{prefix}.{server}.{tool}"
            orchestrator.register_capability(cap, _make(server, tool))
            registered.append(cap)
        logger.info(json.dumps({"evt": "mcp.registered", "server": server,
                                "capabilities": registered}))
        return registered

    # -------------------------------------------------------------- health
    def health(self) -> dict:
        with self._lock:
            return {name: h.as_dict()
                    for name, h in sorted(self._health.items())}

    def server_health(self, server: str) -> dict:
        with self._lock:
            h = self._health.get(server)
        return h.as_dict() if h else {"name": server, "status": "unknown"}

    # ------------------------------------------------------------- teardown
    def shutdown(self) -> None:
        with self._lock:
            workers = list(self._workers.values())
            names = list(self._workers)
        for w in workers:
            w.stop()
        for w in workers:
            w.join(timeout=10)
        for name in names:
            with self._lock:
                if name in self._health:
                    self._health[name].status = "stopped"
        logger.info(json.dumps({"evt": "mcp.shutdown", "servers": names}))


def _content_text(result: Any) -> str:
    parts: list[str] = []
    for block in getattr(result, "content", []) or []:
        if isinstance(block, TextContent):
            parts.append(block.text)
        else:
            parts.append(f"<{type(block).__name__}>")
    return "\n".join(parts)
