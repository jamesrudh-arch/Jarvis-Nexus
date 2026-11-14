#!/usr/bin/env python3
"""Probe: connect to the filesystem MCP server with different env policies."""
import asyncio
import os
import time

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

ARGS = ["-y", "@modelcontextprotocol/server-filesystem", "--read-only",
        "/tmp/mcpfs_smoke"]


async def probe(label: str, env: dict | None) -> None:
    t0 = time.time()
    params = StdioServerParameters(command="npx", args=ARGS, env=env)
    try:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), 45)
                tools = await asyncio.wait_for(session.list_tools(), 45)
                print(f"[{label}] OK in {time.time()-t0:.1f}s — "
                      f"{len(tools.tools)} tools: "
                      f"{sorted(t.name for t in tools.tools)}", flush=True)
    except Exception as exc:
        print(f"[{label}] FAILED after {time.time()-t0:.1f}s — "
              f"{type(exc).__name__}: {exc}", flush=True)


async def main() -> None:
    await probe("default-env(None)", None)
    await asyncio.sleep(1)
    await probe("full-env", dict(os.environ))

asyncio.run(main())
