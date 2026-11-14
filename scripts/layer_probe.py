#!/usr/bin/env python3
"""Probe the MCPIntegrationLayer itself: full env vs safe env."""
import os
import sys
import time

sys.path.insert(0, "/home/z/my-project/NEXUS_WORLD")

from integration.mcp_layer import MCPIntegrationLayer, MCPServerConfig


def try_connect(label, env):
    layer = MCPIntegrationLayer()
    cfg = MCPServerConfig(
        name="filesystem", command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem",
              "--read-only", "/tmp/mcpfs_smoke"],
        env=env, connect_timeout_s=45.0)
    t0 = time.time()
    try:
        report = layer.connect(cfg)
        print(f"[{label}] OK in {time.time()-t0:.1f}s — "
              f"{len(report['discovered_tools'])} tools", flush=True)
    except Exception as exc:
        print(f"[{label}] FAILED after {time.time()-t0:.1f}s — "
              f"{type(exc).__name__}: {exc}", flush=True)
    finally:
        layer.shutdown()


if __name__ == "__main__":
    # env diff inspection
    from integration.mcp_layer import _safe_child_env
    from mcp.client.stdio import get_default_environment
    full = dict(os.environ)
    sdk_default = get_default_environment()
    safe = _safe_child_env()
    print("SDK default env keys:", sorted(sdk_default.keys()), flush=True)
    print("safe-env missing vs full:",
          sorted(set(full) - set(safe)), flush=True)
    print("proxy-ish vars:",
          {k: v[:40] for k, v in full.items()
           if "PROXY" in k.upper() or "npm" in k.lower()}, flush=True)

    try_connect("layer-full-env", dict(os.environ))
    try_connect("layer-safe-env", None)
