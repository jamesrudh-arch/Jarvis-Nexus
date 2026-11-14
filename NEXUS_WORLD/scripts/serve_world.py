#!/usr/bin/env python3
"""Serve the NEXUS WORLD API with uvicorn (real HTTP).

Tier 0 (sandbox):   NEXUS_DB=/path/world.db PORT=8791 python3 scripts/serve_world.py
Railway (Tier 1):   PORT + NEXUS_HOST=0.0.0.0 set by the platform;
                    NEXUS_AUTOSEED=1 seeds a deterministic living world
                    (create + populate + one simulated day) on first boot
                    so the public API immediately serves real state.

Auth: set NEXUS_FOUNDER_TOKEN in the environment — NEVER commit it.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uvicorn  # noqa: E402


def autoseed() -> None:
    """Deterministically create a living world if the database is empty."""
    from infrastructure.api_server import create_app
    from fastapi.testclient import TestClient

    app = create_app(os.environ.get("NEXUS_DB", "/tmp/nexus_world.db"))
    client = TestClient(app)
    token = os.environ.get("NEXUS_FOUNDER_TOKEN", "nexus-tier0-dev-token")
    headers = {"X-Nexus-Token": token}
    health = client.get("/health").json()
    if health.get("world_created"):
        return
    seed = int(os.environ.get("NEXUS_SEED", "20261113"))
    client.post("/world/create", headers=headers,
                json={"name": "Nexus Prime", "seed": seed})
    client.post("/world/populate", headers=headers, json={"n": 24})
    client.post("/world/tick", headers=headers, json={"n": 144})
    print("[serve_world] autoseeded: world created, 24 residents, "
          "one simulated day advanced", flush=True)


def main() -> int:
    db = os.environ.get("NEXUS_DB", "/tmp/nexus_world.db")
    port = int(os.environ.get("PORT", "8791"))
    host = os.environ.get("NEXUS_HOST", "127.0.0.1")
    if os.environ.get("NEXUS_AUTOSEED") == "1":
        autoseed()
    import infrastructure.api_server as api_server
    app = api_server.create_app(db)
    uvicorn.run(app, host=host, port=port, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
