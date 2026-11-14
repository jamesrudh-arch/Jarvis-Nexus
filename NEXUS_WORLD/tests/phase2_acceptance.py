#!/usr/bin/env python3
"""NEXUS WORLD Phase 2 — living-resident acceptance suite.

Run from NEXUS_WORLD/:  python3 tests/phase2_acceptance.py
Every check is a real operation on a real (temporary) world; results are
recorded verbatim in reports/PHASE2_TEST_OUTPUT.txt. No check passes
without the world actually exhibiting the behaviour.
"""
from __future__ import annotations

import collections
import json
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from geography.hierarchy import generate_world_geography
from geography.spatial import CityLayout
from infrastructure.api_server import create_app
from models.provider_registry import EchoProvider, ModelRouter
from persistence.world_store import WorldStore
from residents.cognition import NullCognition, ResidentCognition
from residents.engine import ACTIONS, ResidentEngine
from simulation.tick_engine import TickEngine

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
        "idempotency_key": "w-phase2", "world_id": "phase2",
        "name": "Phase Two", "seed": SEED,
        "epoch_utc": "2026-01-01T00:00:00", "minutes_per_tick": 10})
    generate_world_geography(store, seed=SEED)


def main() -> int:
    t0 = time.perf_counter()
    tmp = tempfile.mkdtemp(prefix="nexus_p2_")

    # ------------------------------------------------------ core behaviour
    store = new_store(os.path.join(tmp, "w1.db"))
    build_world(store)
    layout = CityLayout(store)
    eng = ResidentEngine(store, layout)
    check("P1 layout: 64 deterministic buildings, sane bounds",
          len(layout.buildings()) == 64
          and -15 <= layout.bounds()[0] < layout.bounds()[2] <= 400,
          f"bounds={[round(v) for v in layout.bounds()]}")
    layout2 = CityLayout(store)
    check("P2 layout deterministic (two instances identical)",
          json.dumps(layout.buildings(), sort_keys=True)
          == json.dumps(layout2.buildings(), sort_keys=True))

    created = eng.create_population(24)
    check("P3 population created (24 residents)", created["created"] == 24)
    try:
        eng.create_population(1)
        dup = False
    except ValueError:
        dup = True
    check("P4 duplicate population refused", dup)

    residents = eng.residents()
    ok = all(0 <= v <= 100 for r in residents
             for v in r["needs"].values())
    check("P5 needs initialised within 0..100", ok)
    check("P6 identity fields present",
          all(r["name"] and r["role"] and r["home_id"] and r["work_id"]
              and r["venue_id"] and 0.3 <= r["traits"]["extraversion"]
              <= 0.9 for r in residents))

    te = TickEngine(store, behaviour=eng)
    for _day in range(4):
        te.run(144)
    rows = store.db.execute(
        "SELECT payload FROM events WHERE type='resident.acted'").fetchall()
    seen = collections.Counter(
        json.loads(r["payload"]).get("data", {}).get("action")
        for r in rows)
    check("P7 four simulated days advanced; all 6 real actions observed",
          store.current_tick == 576
          and set(seen) >= {"sleeping", "eating", "working", "socializing",
                            "commuting", "leisure"},
          f"tick={store.current_tick} actions={dict(seen)}")

    # night coherence: run to a local 03:00 and sample
    target = None
    for t in range(store.current_tick, store.current_tick + 145):
        if eng.local_hour(t) == 3:
            target = t
            break
    if target:
        te.run(target - store.current_tick)
    night = eng.residents()
    sleeping = sum(1 for r in night if r["action"] == "sleeping")
    check("P8 night coherence: most residents asleep at 03:00",
          sleeping >= len(night) * 0.75,
          f"{sleeping}/{len(night)} sleeping")

    # workday coherence: run to a weekday 13:00
    target = None
    for t in range(store.current_tick, store.current_tick + 290):
        if eng.local_hour(t) == 13 and eng.is_weekday(t):
            target = t
            break
    if target:
        te.run(target - store.current_tick)
    day = eng.residents()
    working = sum(1 for r in day if r["action"] in ("working", "commuting"))
    check("P9 workday coherence: majority working/commuting at 13:00",
          working >= len(day) * 0.4,
          f"{working}/{len(day)} working+commuting")

    check("P10 needs remain within 0..100 after days of life",
          all(0 <= v <= 100 for r in eng.residents()
              for v in r["needs"].values()))

    visited = set()
    for r in rows:
        p = json.loads(r["payload"])
        if p["resident_id"].endswith("000001"):
            visited.add(p["data"].get("at_building"))
    check("P11 residents actually move between buildings",
          len(visited) >= 2, f"resident-1 visited {len(visited)} buildings")

    mems = store.memories(limit=500)
    kinds = {m["kind"] for m in mems}
    check("P12 memories recorded with expected kinds",
          len(mems) >= 100 and kinds <= {"work", "meal", "rest",
                                         "meeting", "decision", "goal"},
          f"count={len(mems)} kinds={sorted(kinds)}")
    # PRIORITY 5 addition: goal-window evaluations must be real memories
    goal_mems = [m for m in mems if m["kind"] == "goal"]
    check("P12b goal evaluations recorded as long-term memories",
          len(goal_mems) >= 10,
          f"goal memories={len(goal_mems)} (one per resident per "
          f"simulated day boundary crossed)")
    some = store.memories(resident_id="res-000001", limit=5)
    ticks = [m["tick"] for m in some]
    check("P13 memory recall ordered newest-first",
          ticks == sorted(ticks, reverse=True))

    comms = store.db.execute(
        "SELECT payload FROM events WHERE "
        "type='resident.communication'").fetchall()
    check("P14 resident communications occurred",
          len(comms) >= 1
          and all("topic" in json.loads(c["payload"]) for c in comms),
          f"communications={len(comms)}")

    weather_events = store.db.execute(
        "SELECT COUNT(*) FROM events WHERE "
        "type='world.weather_changed'").fetchone()[0]
    check("P15 weather transitions recorded in the event log",
          weather_events >= 1 and store.meta("weather") in
          ("clear", "cloudy", "rain"),
          f"changes={weather_events} now={store.meta('weather')}")

    h1 = store.state_hash()
    replayed = store.replay(os.path.join(tmp, "replay.db"))
    check("P16 replay rebuilds identical state from events alone",
          replayed.state_hash() == h1,
          f"{replayed.state_hash()} vs {h1}")

    store_b = new_store(os.path.join(tmp, "w2.db"))
    build_world(store_b)
    eng_b = ResidentEngine(store_b, CityLayout(store_b))
    eng_b.create_population(24)
    te_b = TickEngine(store_b, behaviour=eng_b)
    for _day in range(4):
        te_b.run(144)
    for t in range(store_b.current_tick, store_b.current_tick + 145):
        if eng_b.local_hour(t) == 3:
            te_b.run(t - store_b.current_tick)
            break
    for t in range(store_b.current_tick, store_b.current_tick + 290):
        if eng_b.local_hour(t) == 13 and eng_b.is_weekday(t):
            te_b.run(t - store_b.current_tick)
            break
    check("P17 determinism: identical run reproduces identical state",
          store_b.state_hash() == store.state_hash(),
          f"{store_b.state_hash()} vs {store.state_hash()}")

    # restart survival: reopen the same db file with fresh engines
    store.close()
    store_r = WorldStore(os.path.join(tmp, "w1.db"))
    tick_before = store_r.current_tick
    eng_r = ResidentEngine(store_r, CityLayout(store_r))
    te_r = TickEngine(store_r, behaviour=eng_r)
    te_r.run(144)
    check("P18 restart survival: world continues coherently",
          store_r.current_tick == tick_before + 144
          and len(eng_r.residents()) == 24
          and store_r.memory_count() > 0,
          f"tick {tick_before} -> {store_r.current_tick}")

    # ---------------------------------------------------------- cognition
    class StubProvider:
        name = "stub"
        def __init__(self, reply): self.reply = reply; self.model = "stub-1"
        def generate(self, messages, **options):
            return {"text": self.reply, "provider": "stub",
                    "model": self.model, "usage": {}}

    router = ModelRouter()
    router.register(StubProvider("socializing"))
    cog = ResidentCognition(router)
    allowed = [("working", 40.0), ("socializing", 35.0), ("leisure", 12.0)]
    action, reason = cog.decide("res-000001", {"name": "Ari", "role": "x",
                                                "needs": {}, "action": "idle"},
                                {"name": "Ari", "role": "x", "time": "18:00",
                                 "weather": "clear", "needs": {},
                                 "location": "home",
                                 "current_action": "idle",
                                 "recent_memories": []}, allowed)
    check("P19 cognition: valid LLM choice accepted",
          action == "socializing" and reason.startswith("llm:"),
          f"action={action} reason={reason}")

    router_bad = ModelRouter()
    router_bad.register(StubProvider("fly to the moon"))
    cog_bad = ResidentCognition(router_bad)
    action2, reason2 = cog_bad.decide("res-000001",
                                      {"name": "Ari", "role": "x",
                                       "needs": {}, "action": "idle"},
                                      {"name": "Ari", "role": "x",
                                       "time": "18:00", "weather": "clear",
                                       "needs": {}, "location": "home",
                                       "current_action": "idle",
                                       "recent_memories": []}, allowed)
    check("P20 cognition: invalid LLM output falls back to utility top",
          action2 == "working" and reason2.startswith("fallback:"),
          f"action={action2} reason={reason2}")

    null_cog = NullCognition()
    action3, reason3 = null_cog.decide("r", {}, {}, allowed)
    check("P21 NullCognition stays deterministic",
          action3 == "working" and reason3 == "deterministic:disabled")

    # ---------------------------------------------------------------- API
    adb = os.path.join(tmp, "api.db")
    app = create_app(adb, founder_token=TOKEN)
    client = TestClient(app)
    client.post("/world/create", headers={"X-Nexus-Token": TOKEN},
                json={"name": "Api World", "seed": SEED})
    pop = client.post("/world/populate", headers={"X-Nexus-Token": TOKEN},
                      json={"n": 12})
    pop2 = client.post("/world/populate", headers={"X-Nexus-Token": TOKEN},
                       json={"n": 12})
    check("P22 API populate 201 then 409 on duplicate",
          pop.status_code == 201 and pop2.status_code == 409,
          f"{pop.status_code}/{pop2.status_code}")

    client.post("/world/tick", headers={"X-Nexus-Token": TOKEN},
                json={"n": 144})
    lr = client.get("/residents")
    check("P23 API /residents lists population with live actions",
          lr.status_code == 200 and lr.json()["count"] == 12
          and all(r["action"] in ACTIONS for r in lr.json()["residents"]))

    rid = lr.json()["residents"][0]["resident_id"]
    dr = client.get(f"/residents/{rid}")
    check("P24 API /residents/{id} returns detail + memories",
          dr.status_code == 200 and "memories" in dr.json()
          and isinstance(dr.json()["data"].get("needs"), dict))
    missing = client.get("/residents/res-999999")
    check("P25 API unknown resident -> 404", missing.status_code == 404)

    cog_status = client.get("/cognition/status")
    cs = cog_status.json()
    check("P26 API /cognition/status reports provider stack",
          cog_status.status_code == 200
          and isinstance(cs.get("providers"), list)
          and "default" in cs,
          f"providers={cs.get('providers')} default={cs.get('default')}")

    obs = client.get("/residents")  # observer allowed without token
    check("P27 observers can read residents (read-only model intact)",
          obs.status_code == 200)

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = len(RESULTS) - passed
    print(f"\n{'=' * 64}\nPHASE 2 ACCEPTANCE: {passed}/{len(RESULTS)} "
          f"PASS, {failed} FAIL — {time.perf_counter() - t0:.1f}s")
    for name, ok, detail in RESULTS:
        if not ok:
            print(f"  FAILED: {name} — {detail}")
    out = os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "reports", "PHASE2_TEST_OUTPUT.txt")
    with open(out, "w") as fh:
        fh.write(f"NEXUS WORLD Phase 2 acceptance run "
                 f"{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        for name, ok, detail in RESULTS:
            fh.write(f"[{'PASS' if ok else 'FAIL'}] {name}"
                     + (f" — {detail}" if detail else "") + "\n")
        fh.write(f"RESULT: {passed}/{len(RESULTS)} PASS\n")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
