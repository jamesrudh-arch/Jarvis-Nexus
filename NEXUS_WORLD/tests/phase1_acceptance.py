#!/usr/bin/env python3
"""NEXUS WORLD Phase 1 — acceptance test suite (spec §40 'Persistence'
criteria + JARVIS NEXUS directive Part 9 verification requirements).

Run from NEXUS_WORLD/:  python3 tests/phase1_acceptance.py
Real execution only: every check below ran and its output is recorded in
reports/PHASE1_TEST_OUTPUT.txt. No result is claimed without this file.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from geography.hierarchy import ancestry, generate_world_geography, region_nodes
from infrastructure.api_server import create_app
from infrastructure.event_bus import EventBus
from models.provider_registry import EchoProvider, ModelRouter, ProviderError
from orchestration.command import CommandOrchestrator
from persistence.world_store import WorldStore
from security.permissions import ActionClass, Role
from simulation.region_ownership import OwnershipError, RegionRegistry
from simulation.tick_engine import TickEngine
from simulation.world_clock import WorldClock

SEED = 20261113
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
        "world_id": "nexus-prime", "name": "Nexus Prime", "seed": SEED,
        "epoch_utc": "2026-01-01T00:00:00", "minutes_per_tick": 10})
    generate_world_geography(store, seed=SEED)
    reg = RegionRegistry(store)
    for r in region_nodes(store):
        reg.acquire(r["region_id"], owner="sim-engine-0")


def main() -> int:
    tmp = tempfile.mkdtemp(prefix="nexus_p1_")
    t0 = time.perf_counter()
    try:
        # ================= A. World core & persistence =================
        db = os.path.join(tmp, "world_a.db")
        store = new_store(db)
        build_world(store)
        counts = store.geo_counts_by_level()
        check("A1 world + geography built (8 levels)",
              set(counts) == {"world", "continent", "country", "state",
                              "city", "district", "neighbourhood",
                              "building"}, str(counts))

        # A2 duplicate events are no-ops
        applied = store.append(0, "world.created", {
            "idempotency_key": "world-nexus-prime",
            "world_id": "nexus-prime", "name": "Nexus Prime", "seed": SEED,
            "epoch_utc": "2026-01-01T00:00:00", "minutes_per_tick": 10})
        check("A2 duplicate world.created rejected", applied is False)

        engine = TickEngine(store, EventBus())
        run = engine.run(120)
        check("A3 120 ticks advanced", run["advanced"] == 120,
              f"tick={run['tick']}")
        hash_live = store.state_hash()

        # A4 restart survival (new connection over the same file)
        store.close()
        store2 = WorldStore(db)
        check("A4 state hash identical after restart",
              store2.state_hash() == hash_live,
              f"{store2.state_hash()} vs {hash_live}")
        check("A4b tick preserved across restart",
              store2.current_tick == 120, f"tick={store2.current_tick}")

        # A5 replay reconstruction from the event log alone
        replayed = store2.replay(os.path.join(tmp, "world_a_replay.db"))
        check("A5 replayed state hash identical to live state",
              replayed.state_hash() == hash_live,
              f"{replayed.state_hash()} vs {hash_live}")

        # A6 entity identity + ID counters survive restart & replay
        orch = CommandOrchestrator(store2)
        r1 = orch.execute("founder", Role.FOUNDER, ActionClass.MODIFY_STATE,
                          "world.register_entity",
                          {"entity_type": "organisation", "data": {"n": 1}},
                          command_id="cmd-ent-1")
        eid = r1["detail"]["entity_id"]
        store2.close()
        store3 = WorldStore(db)
        check("A6 entity identity preserved across restart",
              any(e["entity_id"] == eid for e in store3.entities()))
        next_id = store3.allocate_id("ent-orga")
        check("A6b ID counter continues without collision",
              int(next_id.rsplit("-", 1)[1]) ==
              int(eid.rsplit("-", 1)[1]) + 1,
              f"next={next_id} after {eid}")
        store3.close()

        # A7 determinism: fresh world, same seed, same operations
        db_b = os.path.join(tmp, "world_b.db")
        sb = new_store(db_b)
        build_world(sb)
        TickEngine(sb, EventBus()).run(120)
        check("A7 same seed + same ops => identical state hash",
              sb.state_hash() == hash_live,
              f"{sb.state_hash()} vs {hash_live}")
        sb.close()

        # A8 clock correctness
        clock = WorldClock.from_store({
            "epoch_utc": "2026-01-01T00:00:00", "minutes_per_tick": "10"})
        check("A8a 144 ticks = 1 simulated day",
              clock.time_at(144).isoformat().startswith("2026-01-02T00:00"))
        check("A8b timezone offset applied (+3h)",
              clock.local_time(0, 3).hour == 3)
        check("A8c day/night boundary (06:00 local = day)",
              clock.is_daytime(36, 0) and not clock.is_daytime(35, 0)
              and not clock.is_daytime(108, 0))
        check("A8d season: Jan = winter (north), summer (south)",
              clock.season(0, "north") == "winter"
              and clock.season(0, "south") == "summer")
        check("A8e season roll: +90 days = spring (north)",
              clock.season(144 * 90, "north") == "spring")

        # A9 geography integrity
        s9 = WorldStore(db)
        buildings = s9.db.execute(
            "SELECT node_id FROM geo_nodes WHERE level='building' "
            "ORDER BY node_id LIMIT 1").fetchone()
        chain = ancestry(s9, buildings["node_id"])
        check("A9 ancestry walk building→world covers all 8 levels",
              [n["level"] for n in chain] ==
              ["world", "continent", "country", "state", "city",
               "district", "neighbourhood", "building"],
              "→".join(n["level"][:4] for n in chain))
        orphan = s9.db.execute(
            "SELECT COUNT(*) FROM geo_nodes g WHERE g.parent_id IS NOT NULL "
            "AND NOT EXISTS (SELECT 1 FROM geo_nodes p "
            "WHERE p.node_id = g.parent_id)").fetchone()[0]
        check("A9b no orphan geography nodes", orphan == 0)
        s9.close()

        # ================= B. Region ownership =================
        sB = WorldStore(db)
        reg = RegionRegistry(sB)
        regions = reg.list_regions()
        check("B1 all regions owned by single initial owner",
              len(regions) == 4 and all(r["owner"] == "sim-engine-0"
                                        for r in regions),
              f"{len(regions)} regions")
        rid = regions[0]["region_id"]
        try:
            reg.transfer(rid, "wrong-owner", "sim-engine-1")
            ok = False
        except OwnershipError:
            ok = True
        check("B2 transfer with wrong from_owner rejected", ok)
        reg.transfer(rid, "sim-engine-0", "sim-engine-1")
        check("B3 transfer with correct owner succeeds",
              reg.owner_of(rid) == "sim-engine-1")
        reg.renew(rid, "sim-engine-1")
        lease = reg.lease_state(rid)
        check("B4 lease renewal extends expiry",
              lease["lease_expires_tick"] > sB.current_tick
              and not lease["lease_expired"], str(lease))
        sB.close()
        sB2 = WorldStore(db)
        check("B5 ownership survives restart",
          RegionRegistry(sB2).owner_of(rid) == "sim-engine-1")
        sB2.close()

        # ================= C. Orchestrator =================
        sC = WorldStore(db)
        orch = CommandOrchestrator(sC)
        rej = orch.execute("observer-1", Role.OBSERVER,
                           ActionClass.SIMULATE, "world.status",
                           command_id="cmd-obs-1")
        check("C1 observer cannot execute simulate command",
              rej["status"] == "rejected")
        ok = orch.execute("founder", Role.FOUNDER, ActionClass.OBSERVE,
                          "world.status", command_id="cmd-ok-1")
        check("C2 founder executes world.status",
              ok["status"] == "executed"
              and ok["detail"]["world_id"] == "nexus-prime")
        before = len(sC.entities())
        orch.execute("founder", Role.FOUNDER, ActionClass.MODIFY_STATE,
                     "world.register_entity",
                     {"entity_type": "organisation"},
                     command_id="cmd-ent-dup")
        dup = orch.execute("founder", Role.FOUNDER, ActionClass.MODIFY_STATE,
                           "world.register_entity",
                           {"entity_type": "organisation"},
                           command_id="cmd-ent-dup")
        check("C3 duplicate command_id does not execute twice",
              dup["status"] == "duplicate"
              and len(sC.entities()) == before + 1)
        ext = orch.execute("founder", Role.FOUNDER, ActionClass.EXTERNAL,
                           "world.status", command_id="cmd-ext-1")
        check("C4 external action requires explicit approval",
              ext["status"] == "approval_required")
        ext2 = orch.execute("founder", Role.FOUNDER, ActionClass.EXTERNAL,
                            "world.status", command_id="cmd-ext-2",
                            approved=True)
        check("C4b approved external action executes and is audited",
              ext2["status"] == "executed"
              and any(c["approved"] == 1 and c["command_id"] == "cmd-ext-2"
                      for c in sC.commands()))
        unk = orch.execute("founder", Role.FOUNDER, ActionClass.SIMULATE,
                           "nonexistent.capability",
                           command_id="cmd-unk-1")
        check("C5 unknown capability rejected and audited",
              unk["status"] == "rejected"
              and any(c["command_id"] == "cmd-unk-1"
                      and c["status"] == "rejected" for c in sC.commands()))
        expected_cmds = {"cmd-obs-1": "rejected", "cmd-ok-1": "executed",
                          "cmd-ent-dup": "executed",
                          "cmd-ext-1": "rejected",
                          "cmd-ext-2": "executed",
                          "cmd-unk-1": "rejected",
                          "cmd-ent-1": "executed"}  # from section A6
        logged = {c["command_id"]: c["status"] for c in sC.commands()}
        check("C6 all command outcomes present in audit log",
              logged == expected_cmds, f"{len(logged)} entries")
        sC.close()

        # ================= D. API layer =================
        db_d = os.path.join(tmp, "world_api.db")
        app = create_app(db_d, founder_token=TOKEN)
        client = TestClient(app)
        r = client.post("/world/create", json={"seed": SEED},
                        headers={"X-Nexus-Token": TOKEN})
        check("D1 world created via API", r.status_code == 201
              and r.json()["world_id"] == "nexus-prime")
        r409 = client.post("/world/create", json={"seed": SEED},
                           headers={"X-Nexus-Token": TOKEN})
        check("D1b duplicate world creation -> 409", r409.status_code == 409)
        check("D2 /health open to anonymous observers",
              client.get("/health").status_code == 200)
        r403 = client.post("/world/tick", json={"n": 1})
        check("D3 anonymous POST /world/tick forbidden (403)",
              r403.status_code == 403)
        r401 = client.get("/world/state",
                          headers={"X-Nexus-Token": "wrong"})
        check("D4 invalid token -> 401", r401.status_code == 401)
        r = client.post("/world/tick", json={"n": 144},
                        headers={"X-Nexus-Token": TOKEN})
        check("D5 founder advances 144 ticks (1 day)",
              r.status_code == 200 and r.json()["tick"] == 144)
        state = client.get("/world/state").json()
        check("D5b /world/state reports day-2 sim time",
              state["clock"]["sim_time_utc"].startswith("2026-01-02"),
              state["clock"]["sim_time_utc"])
        # duplicate tick re-POST cannot double-apply (deterministic keys)
        r_again = client.post("/world/tick", json={"n": 144},
                              headers={"X-Nexus-Token": TOKEN})
        ev_types = client.get("/world/events",
                              params={"since_seq": 0, "limit": 1000}).json()
        n_ticks = sum(1 for e in ev_types["events"]
                      if e["type"] == "world.tick_advanced")
        check("D6 re-posted tick batch applies no duplicate tick events",
              r_again.json()["tick"] == 288 and n_ticks == 288,
              f"tick={r_again.json()['tick']}, tick_events={n_ticks}")
        r = client.get("/world/events", params={"since_seq": 0,
                                                "limit": 3}).json()
        seqs = [e["seq"] for e in r["events"]]
        r = client.get("/world/events", params={"since_seq": 3,
                                                "limit": 5}).json()
        seqs2 = [e["seq"] for e in r["events"]]
        check("D7 event feed pagination honours since_seq + limit",
              seqs == [1, 2, 3] and seqs2 == [4, 5, 6, 7, 8]
              and seqs2[0] == seqs[-1] + 1,
              f"pages: {seqs} then {seqs2}")
        region_id = client.get("/world/regions").json()["regions"][0][
            "region_id"]
        r = client.post(f"/world/regions/{region_id}/transfer",
                        json={"to_owner": "engine-b", "from_owner": "wrong"},
                        headers={"X-Nexus-Token": TOKEN})
        check("D8 transfer with wrong owner -> 409", r.status_code == 409)
        r = client.post(f"/world/regions/{region_id}/transfer",
                        json={"to_owner": "engine-b",
                              "from_owner": "sim-engine-0"},
                        headers={"X-Nexus-Token": TOKEN})
        check("D8b correct transfer -> 200 + owner updated",
              r.status_code == 200 and r.json()["owner"] == "engine-b")
        r = client.post("/command", json={
            "capability": "world.status", "action_class": "observe",
            "command_id": "api-cmd-1"},
            headers={"X-Nexus-Token": TOKEN})
        check("D9 command endpoint executes via orchestrator",
              r.status_code == 200 and r.json()["status"] == "executed")
        r = client.post("/command", json={
            "capability": "world.status", "action_class": "observe",
            "command_id": "api-cmd-1"},
            headers={"X-Nexus-Token": TOKEN})
        check("D9b duplicate command_id returns prior outcome",
              r.json()["status"] == "duplicate")

        # D10 API-server restart survival: new app over the same DB file
        hash_direct = WorldStore(db_d).state_hash()
        app2 = create_app(db_d, founder_token=TOKEN)  # "restarted" server
        client2 = TestClient(app2)
        state2 = client2.get("/world/state").json()
        check("D10 world survives API-server restart",
              state2["tick"] == 288
              and WorldStore(db_d).state_hash() == hash_direct,
              f"tick after restart={state2['tick']}")
        check("D10b region ownership visible after restart",
              any(x["owner"] == "engine-b"
                  for x in client2.get("/world/regions").json()["regions"]))

        # ================= E. Model-provider registry =================
        router = ModelRouter()
        echo = EchoProvider("echo-test")
        router.register(echo, default=True)
        out = router.generate([{"role": "user", "content": "ping"}],
                              temperature=0.1)
        check("E1 provider routed and result returned",
              out["provider"] == "echo-test" and "ping" in out["text"])
        try:
            router.generate([{"role": "user", "content": "x"}],
                            provider="missing")
            ok = False
        except ProviderError:
            ok = True
        check("E2 unknown provider raises ProviderError", ok)
        try:
            router.register(EchoProvider("echo-test"))
            ok = False
        except ProviderError:
            ok = True
        check("E3 duplicate provider registration rejected", ok)
        check("E4 route log records routing decisions",
              router.route_log == [{"provider": "echo-test",
                                    "model": "echo-1"}])

        # ================= F. Event bus isolation =================
        bus = EventBus()
        seen = []
        bus.subscribe("test.event", lambda e: seen.append(e["v"]))
        def boom(e):
            raise RuntimeError("handler failure must not propagate")
        bus.subscribe("test.event", boom)
        bus.subscribe("test.event", lambda e: seen.append(e["v"] * 10))
        bus.publish({"type": "test.event", "v": 7})
        check("F1 failing handler isolated; others still run",
              seen == [7, 70] and bus.stats()["handler_errors"] == 1,
              f"seen={seen}, errors={bus.stats()['handler_errors']}")

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    elapsed = time.perf_counter() - t0
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = [n for n, ok, _ in RESULTS if not ok]
    print(f"\n=== PHASE 1 RESULT: {passed}/{len(RESULTS)} checks passed "
          f"in {elapsed*1000:.1f} ms "
          f"on {os.cpu_count()}-core host ===")
    if failed:
        print("FAILED:", failed)
    return 0 if passed == len(RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
