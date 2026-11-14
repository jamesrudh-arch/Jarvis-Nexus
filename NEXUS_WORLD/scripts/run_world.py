#!/usr/bin/env python3
"""NEXUS WORLD Phase 1 — runnable world demo.

Usage (from NEXUS_WORLD/):
    python3 scripts/run_world.py --db /tmp/nexus_world.db --ticks 288

Creates a world (if absent), advances ticks, prints a summary. This is the
manual-reproduction entry point for the Phase 1 acceptance evidence.
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from geography.hierarchy import generate_world_geography, region_nodes  # noqa: E402
from infrastructure.event_bus import EventBus  # noqa: E402
from persistence.world_store import WorldStore  # noqa: E402
from simulation.region_ownership import RegionRegistry  # noqa: E402
from simulation.tick_engine import TickEngine  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="/tmp/nexus_world.db")
    ap.add_argument("--ticks", type=int, default=144)
    ap.add_argument("--seed", type=int, default=20261113)
    ap.add_argument("--fresh", action="store_true",
                    help="delete the DB and start a new world")
    args = ap.parse_args()

    if args.fresh and os.path.exists(args.db):
        for suffix in ("", "-wal", "-shm"):
            p = args.db + suffix
            if os.path.exists(p):
                os.remove(p)

    store = WorldStore(args.db)
    if not store.meta("world_id"):
        store.append(0, "world.created", {
            "idempotency_key": "world-nexus-prime",
            "world_id": "nexus-prime", "name": "Nexus Prime",
            "seed": args.seed, "epoch_utc": "2026-01-01T00:00:00",
            "minutes_per_tick": 10})
        geo = generate_world_geography(store, seed=args.seed)
        print(f"world created: {geo['counts']}")
        reg = RegionRegistry(store)
        for r in region_nodes(store):
            reg.acquire(r["region_id"], owner="sim-engine-0")

    bus = EventBus()
    engine = TickEngine(store, bus)
    result = engine.run(args.ticks)
    print(f"advanced to tick {result['tick']} "
          f"({result['advanced']}/{result['requested']} newly applied)")
    summary = engine.summary()
    print(f"sim time: {summary['sim_time_utc']}")
    print(f"geography: {summary['geo_counts']}")
    print(f"regions: {summary['regions']}  entities: {summary['entities']}  "
          f"events: {summary['events']}")
    print(f"state hash: {store.state_hash()}")
    store.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
