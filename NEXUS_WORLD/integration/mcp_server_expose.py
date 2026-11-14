"""JARVIS NEXUS exposed AS an MCP server (Integration Directive §2.7-2.8).

Runs over stdio with the official SDK's FastMCP. External MCP clients can
then observe and (with the founder token) drive the world through the SAME
central orchestrator + permission system used by the HTTP API — one
authority, two transports.

Honest auth limitation (recorded in the register): the stdio transport
carries no headers, so the founder token is a per-call argument. A wrong
or missing token maps to the OBSERVER role and the single permission path
rejects mutations. Auth is therefore enforced, not bypassed.

Run from NEXUS_WORLD/:
    python -m integration.mcp_server_expose --db world.db --token <secret>
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from infrastructure.event_bus import EventBus          # noqa: E402
from mcp.server.fastmcp import FastMCP                 # noqa: E402
from orchestration.command import CommandOrchestrator  # noqa: E402
from persistence.world_store import WorldStore         # noqa: E402
from security.permissions import ActionClass, Role     # noqa: E402
from simulation.tick_engine import TickEngine          # noqa: E402

_DB_PATH = "world.db"
_FOUNDER_TOKEN = ""

mcp = FastMCP("jarvis-nexus")


def _store() -> WorldStore:
    return WorldStore(_DB_PATH)


def _role_for(token: str) -> Role:
    return Role.FOUNDER if token and token == _FOUNDER_TOKEN else Role.OBSERVER


@mcp.tool()
def get_world_status() -> dict:
    """World summary: id, name, tick, event count, state hash, geo counts."""
    s = _store()
    try:
        if not s.meta("world_id"):
            return {"status": "no_world"}
        return {"status": "ok",
                "world_id": s.meta("world_id"),
                "world_name": s.meta("world_name"),
                "tick": s.current_tick,
                "events": s.event_count(),
                "state_hash": s.state_hash(),
                "geo_counts": s.geo_counts_by_level()}
    finally:
        s.close()


@mcp.tool()
def get_geography(node_id: str = "") -> dict:
    """One geography node plus its children (empty node_id → level counts)."""
    s = _store()
    try:
        if not node_id:
            return {"levels": s.geo_counts_by_level()}
        node = s.geo_node(node_id)
        if not node:
            return {"status": "unknown_node", "node_id": node_id}
        return {"status": "ok", "node": node,
                "children": s.geo_children(node_id)}
    finally:
        s.close()


@mcp.tool()
def run_ticks(n: int = 1, founder_token: str = "") -> dict:
    """Advance the world clock by n ticks (1..10000). Founder token required."""
    if _role_for(founder_token) != Role.FOUNDER:
        return {"status": "rejected",
                "reason": "invalid founder token (observer role)"}
    if not 1 <= n <= 10000:
        return {"status": "rejected", "reason": "n must be 1..10000"}
    s = _store()
    try:
        if not s.meta("world_id"):
            return {"status": "no_world"}
        return TickEngine(s, EventBus()).run(n)
    finally:
        s.close()


@mcp.tool()
def list_capabilities() -> dict:
    """Capabilities registered on this JARVIS orchestrator instance."""
    s = _store()
    try:
        return {"capabilities": sorted(CommandOrchestrator(s).registry)}
    finally:
        s.close()


@mcp.tool()
def execute_command(capability: str, params: dict = {},
                    action_class: str = "simulate",
                    founder_token: str = "",
                    command_id: str = "") -> dict:
    """Route a command through the central orchestrator: permission check,
    risk/approval gate, execution, audit record, idempotent by command_id."""
    s = _store()
    try:
        try:
            ac = ActionClass(action_class)
        except ValueError:
            return {"status": "rejected",
                    "reason": f"unknown action_class {action_class!r}"}
        result = CommandOrchestrator(s).execute(
            actor="mcp-client", role=_role_for(founder_token),
            action_class=ac, capability=capability, params=dict(params),
            command_id=command_id or None)
        return dict(result)
    finally:
        s.close()


def main() -> int:
    global _DB_PATH, _FOUNDER_TOKEN
    parser = argparse.ArgumentParser(description="JARVIS NEXUS MCP server")
    parser.add_argument("--db", default="world.db")
    parser.add_argument("--token",
                        default=os.environ.get("NEXUS_FOUNDER_TOKEN", ""))
    args = parser.parse_args()
    _DB_PATH = args.db
    _FOUNDER_TOKEN = args.token
    mcp.run()  # stdio transport
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
