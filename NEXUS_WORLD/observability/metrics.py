"""Tier-0 observability — metrics, JSON logging, instrumented orchestrator.

ZERO new runtime dependencies (dependency-inventory decision):
  * prometheus_client (already present)  → /metrics exposition
  * stdlib logging + JSON formatter      → structured logs (no structlog/
                                            loguru — rejected as unjustified)
  * psutil (already present, optional)   → system gauges

The InstrumentedOrchestrator keeps the SINGLE central orchestrator
(directive Part 6) and adds telemetry only — same permission path, same
audit trail, plus counters/histograms per capability.
"""
from __future__ import annotations

import json
import logging
import sys
import threading
import time

from orchestration.command import CommandOrchestrator

_LOCK = threading.Lock()
_INITIALIZED = False

COMMANDS_TOTAL = None
TOOL_CALLS_TOTAL = None
TOOL_LATENCY = None
WORLD_TICK = None
WORLD_EVENTS = None
MCP_SERVER_UP = None
SYSTEM_CPU = None
SYSTEM_MEMORY = None


def init_metrics() -> None:
    """Idempotent, cardinality-bounded metric registry."""
    global _INITIALIZED, COMMANDS_TOTAL, TOOL_CALLS_TOTAL, TOOL_LATENCY
    global WORLD_TICK, WORLD_EVENTS, MCP_SERVER_UP, SYSTEM_CPU, SYSTEM_MEMORY
    with _LOCK:
        if _INITIALIZED:
            return
        from prometheus_client import Counter, Gauge, Histogram
        COMMANDS_TOTAL = Counter(
            "jarvis_commands_total", "Orchestrated commands by status",
            ["status"])
        TOOL_CALLS_TOTAL = Counter(
            "jarvis_tool_calls_total",
            "Capability invocations by capability and result",
            ["capability", "result"])
        TOOL_LATENCY = Histogram(
            "jarvis_tool_latency_seconds", "Capability invocation latency",
            ["capability"],
            buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5,
                     5.0, 10.0, 30.0))
        WORLD_TICK = Gauge("jarvis_world_tick",
                           "Current world tick (persisted state)")
        WORLD_EVENTS = Gauge("jarvis_world_events",
                             "Total events in the world event log")
        MCP_SERVER_UP = Gauge("jarvis_mcp_server_up",
                              "MCP server connected (1) or not (0)",
                              ["server"])
        try:
            import psutil  # noqa: F401 — presence check only
            SYSTEM_CPU = Gauge("jarvis_system_cpu_percent",
                               "Process CPU percent")
            SYSTEM_MEMORY = Gauge("jarvis_system_memory_mb",
                                  "Process resident memory (MB)")
        except ImportError:
            pass
        _INITIALIZED = True


class JsonFormatter(logging.Formatter):
    """Minimal structured logging without external dependencies."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S",
                                       time.gmtime(record.created)),
                   "level": record.levelname,
                   "logger": record.name,
                   "msg": record.getMessage()}
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)


def refresh_world_gauges(store) -> None:
    init_metrics()
    try:
        WORLD_TICK.set(store.current_tick)
        WORLD_EVENTS.set(store.event_count())
    except Exception:  # noqa: BLE001 — gauges must never break commands
        pass


def refresh_system_gauges() -> None:
    init_metrics()
    if SYSTEM_CPU is None:
        return
    try:
        import psutil
        proc = psutil.Process()
        SYSTEM_CPU.set(proc.cpu_percent(interval=None))
        SYSTEM_MEMORY.set(round(proc.memory_info().rss / 1e6, 1))
    except Exception:  # noqa: BLE001
        pass


def set_mcp_up(server: str, up: bool) -> None:
    init_metrics()
    MCP_SERVER_UP.labels(server=server).set(1 if up else 0)


def metrics_payload() -> bytes:
    """Render the Prometheus text exposition format (version 0.0.4)."""
    init_metrics()
    refresh_system_gauges()
    from prometheus_client import generate_latest
    return generate_latest()


class InstrumentedOrchestrator(CommandOrchestrator):
    """The single central orchestrator + telemetry only."""

    def execute(self, actor, role, action_class, capability, params=None,
                command_id=None, approved=False):
        init_metrics()
        t0 = time.perf_counter()
        result = super().execute(actor, role, action_class, capability,
                                 params=params, command_id=command_id,
                                 approved=approved)
        status = str(result.get("status", "unknown"))
        latency = time.perf_counter() - t0
        COMMANDS_TOTAL.labels(status=status).inc()
        TOOL_CALLS_TOTAL.labels(capability=capability, result=status).inc()
        TOOL_LATENCY.labels(capability=capability).observe(latency)
        try:
            refresh_world_gauges(self.store)
        except Exception:  # noqa: BLE001
            pass
        return result
