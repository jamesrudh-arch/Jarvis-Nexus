#!/usr/bin/env python3
"""Isolate: does asyncio subprocess / MCP stdio work inside a thread loop?"""
import asyncio
import sys
import threading
import time


async def echo_child():
    """Minimal subprocess round-trip inside whatever loop is running."""
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-c", "import sys; sys.stdout.write('pong')",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, _ = await asyncio.wait_for(proc.communicate(), 20)
    return out.decode()


def run_in_thread(label, coro_factory, results):
    def target():
        t0 = time.time()
        try:
            results[label] = f"OK {asyncio.run(coro_factory())!r} " \
                             f"in {time.time()-t0:.1f}s"
        except Exception as exc:
            results[label] = f"FAILED {type(exc).__name__}: {exc} " \
                             f"after {time.time()-t0:.1f}s"
    t = threading.Thread(target=target, daemon=True)
    t.start()
    t.join(timeout=45)
    if t.is_alive():
        results[label] = "HUNG (thread still alive after 45s)"


async def mcp_child():
    from mcp.client.session import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client
    params = StdioServerParameters(
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem",
              "--read-only", "/tmp/mcpfs_smoke"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await asyncio.wait_for(session.initialize(), 30)
            tools = await asyncio.wait_for(session.list_tools(), 30)
            return f"{len(tools.tools)} tools"


def main():
    results = {}
    # 1. plain asyncio subprocess in MAIN thread (baseline)
    t0 = time.time()
    try:
        out = asyncio.run(echo_child())
        results["main-echo"] = f"OK {out!r} in {time.time()-t0:.1f}s"
    except Exception as exc:
        results["main-echo"] = f"FAILED {type(exc).__name__}: {exc}"

    # 2. plain asyncio subprocess in WORKER thread
    run_in_thread("thread-echo", echo_child, results)

    # 3. MCP stdio client in WORKER thread
    run_in_thread("thread-mcp", mcp_child, results)

    # 4. MCP stdio client in MAIN thread (baseline)
    t0 = time.time()
    try:
        out = asyncio.run(mcp_child())
        results["main-mcp"] = f"OK {out} in {time.time()-t0:.1f}s"
    except Exception as exc:
        results["main-mcp"] = f"FAILED {type(exc).__name__}: {exc} " \
                              f"after {time.time()-t0:.1f}s"

    for k, v in results.items():
        print(f"{k:12s} → {v}", flush=True)


main()
