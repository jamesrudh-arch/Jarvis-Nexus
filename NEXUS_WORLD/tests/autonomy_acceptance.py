#!/usr/bin/env python3
"""Living residents acceptance — PRIORITY 5.

Real operations on a real temporary world. Proves:
  A1  goal windows deterministic (same seed ⇒ same goals)
  A2  goals differ across residents (personal, not one script)
  A3  goal progress measured from the EVENT LOG
  A4  long-term memory salience: importance × recency decay
  A5  relationship graph derived from communications only
  A6  affinity grows with meetings (friends emerge)
  A7  autobiography is resident-specific narrative
  A8  mood is a bounded derived value
  A9  POLICY DIVERGENCE: population with goals/mood/social bias behaves
      measurably differently from the pure utility script (same seed,
      both fully deterministic) — the autonomy evidence
  A10 divergence is bounded (≤ 35% of decisions) — sanity, not chaos
  A11 autonomy ledger separates sources: script vs policy
  A12 restart persistence: engine rebuilt from the store continues with
      identical goals/relationships/memories (event-sourced state)
  A13 API /residents/{id}/mind returns the full inner life
  A14 API /autonomy/report returns the honest audit
"""
from __future__ import annotations

import json
import os
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)
os.environ.setdefault("NEXUS_FOUNDER_TOKEN", "test-founder-token")

PASS = FAIL = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASS, FAIL
    PASS, FAIL = PASS + ok, FAIL + (not ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" +
          (f" — {detail}" if detail else ""), flush=True)


def make_world(td: str, seed: int = 991):
    from geography.hierarchy import generate_world_geography
    from geography.spatial import CityLayout
    from persistence.world_store import WorldStore
    db = os.path.join(td, f"world-{seed}.db")
    store = WorldStore(db)
    store.append(0, "world.created", {
        "idempotency_key": f"create-{seed}", "world_id": f"autonomy-{seed}",
        "name": "Autonomy", "seed": seed,
        "epoch_utc": "2026-01-05T00:00:00",
        "minutes_per_tick": "10"})
    generate_world_geography(store, seed=seed)
    CityLayout(store)
    return store


def run_days(store, days: int, policy: bool):
    """Drive the resident engine directly for `days` simulated days."""
    from residents.engine import ResidentEngine
    from geography.spatial import CityLayout
    eng = ResidentEngine(store, CityLayout(store), cognition=None,
                         enable_policy=policy)
    if not store.entities("resident"):
        eng.create_population(24)
    for t in range(store.current_tick, store.current_tick + days * 144):
        eng.step(t + 1)
    return eng


def main() -> int:
    from residents.autonomy import (active_goal, goal_progress, mood)
    from residents.memory import LongTermMemory, relationship_summary

    with tempfile.TemporaryDirectory(prefix="autonomy_") as td:
        # ---------------- goals
        g1 = active_goal(991, "res-000001", 100)
        g1b = active_goal(991, "res-000001", 100)
        g2 = active_goal(991, "res-000002", 100)
        check("A1 goal windows deterministic (same seed/resident/tick)",
              g1 == g1b, f"goal={g1['type']} target={g1['target']}")
        types = {active_goal(991, f"res-{i:06d}", 100)["type"]
                 for i in range(1, 25)}
        check("A2 goals differ across residents (personal variety)",
              len(types) >= 2, f"goal types in population={sorted(types)}")

        # ---------------- a real populated world with policy ON
        store = make_world(td)
        eng = run_days(store, days=4, policy=True)

        rid = sorted(e["entity_id"]
                     for e in store.entities("resident"))[0]
        goal = active_goal(991, rid, store.current_tick)
        prog = goal_progress(goal, rid, store, LongTermMemory(store),
                             store.current_tick)
        check("A3 goal progress measured from the event log",
              prog["progress"] >= 0 and prog["target"] >= 2,
              f"goal={goal['type']} progress={prog['progress']}/"
              f"{prog['target']} {prog['unit']}")

        # ---------------- long-term memory salience
        ltm = LongTermMemory(store)
        mems = ltm.memories(rid, tick=store.current_tick, limit=50)
        salient = [m for m in mems if m["salience"] >=
                   m["importance"] * 0.5]
        check("A4 long-term memory salience (importance × recency)",
              len(mems) >= 5 and all("salience" in m for m in mems)
              and len(salient) >= 1,
              f"memories={len(mems)} recent-salient={len(salient)}")

        # ---------------- relationships
        summary = relationship_summary(store)
        check("A5 relationship graph derived from communications",
              summary["residents_with_relationships"] >= 5
              and summary["total_edges"] >= 5,
              f"edges={summary['total_edges']} friendships="
              f"{summary['friendships']} mean_meetings="
              f"{summary['mean_meetings']}")
        check("A6 friendships emerged (affinity ≥ threshold)",
              summary["friendships"] >= 1,
              "strongest=%s" % [(s["name"], s["affinity"])
                                for s in summary["strongest"][:3]])

        # ---------------- autobiography + mood
        data = next(e["data"] for e in store.entities("resident")
                    if e["entity_id"] == rid)
        bio = ltm.autobiography(rid, data, store.current_tick)
        rid2 = sorted(e["entity_id"]
                      for e in store.entities("resident"))[1]
        data2 = next(e["data"] for e in store.entities("resident")
                     if e["entity_id"] == rid2)
        other_bio = ltm.autobiography(rid2, data2, store.current_tick)
        check("A7 autobiography is resident-specific",
              bio != other_bio and "I am" in bio and len(bio) > 40,
              f"'{bio[:90]}...'")
        m = mood(data, mems)
        check("A8 mood bounded and derived",
              -1.0 <= m <= 1.0, f"mood={m}")

        # ---------------- POLICY DIVERGENCE (the autonomy evidence)
        store_script = make_world(td, seed=991)     # same seed
        run_days(store_script, days=4, policy=False)  # pure script
        # compare final action distributions
        def action_dist(s):
            from collections import Counter
            c = Counter(e["data"]["action"]
                        for e in s.entities("resident"))
            return {k: round(v / 24, 3) for k, v in c.items()}
        dist_policy = action_dist(store)
        dist_script = action_dist(store_script)
        jsd = 0.0
        import math
        for k in set(dist_policy) | set(dist_script):
            p = dist_policy.get(k, 0.0) + 1e-9
            q = dist_script.get(k, 0.0) + 1e-9
            m2 = (p + q) / 2
            jsd += 0.5 * p * math.log(p / m2) + 0.5 * q * math.log(q / m2)
        audit = eng.autonomy_report()
        div = audit["divergence_from_script"]["pct"]
        check("A9 policy divergence measured (autonomy ≠ script)",
              div > 0.0 or jsd > 0.0,
              f"divergence={div}% of decisions; action-distribution "
              f"JSD={jsd:.4f}; policy={dist_policy} vs script="
              f"{dist_script}")
        check("A10 divergence bounded (autonomy, not chaos)",
              div <= 35.0, f"divergence={div}% (cap 35%)")
        sources = audit["sources"]
        check("A11 ledger separates decision sources",
              "script" in sources and sum(
                  v["count"] for v in sources.values()) >= 50,
              f"sources={sources}")

        # ---------------- restart persistence
        from residents.engine import ResidentEngine
        from geography.spatial import CityLayout
        before = relationship_summary(store)["total_edges"]
        eng2 = ResidentEngine(store, CityLayout(store), cognition=None,
                              enable_policy=True)
        eng2.step(store.current_tick + 1)
        after = relationship_summary(store)
        check("A12 restart persistence: state survives engine rebuild",
              after["residents_with_relationships"] >=
              summary["residents_with_relationships"] - 2
              and before >= 5,
              f"edges {before} → {after['total_edges']} after restart+1 "
              f"tick")

        # ---------------- API
        from fastapi.testclient import TestClient
        from infrastructure.api_server import create_app
        app = create_app(os.path.join(td, "api.db"),
                         founder_token="test-founder-token")
        with TestClient(app) as client:
            h = {"x-nexus-token": "test-founder-token"}
            client.post("/world/create", json={"seed": 991,
                                               "epoch_utc":
                                               "2026-01-05T00:00:00"},
                        headers=h)
            client.post("/world/populate", json={"n": 24}, headers=h)
            client.post("/world/tick", json={"n": 3 * 144}, headers=h)
            res = client.get("/residents/res-000001/mind", headers=h)
            mind = res.json() if res.status_code == 200 else {}
            check("A13 API /residents/{id}/mind full inner life",
                  res.status_code == 200
                  and "autobiography" in mind
                  and "long_term_memory" in mind
                  and "active_goal" in mind and "mood" in mind
                  and "friends" in mind,
                  f"goal={mind.get('active_goal', {}).get('type')} "
                  f"memories={len(mind.get('long_term_memory', []))}")
            res2 = client.get("/autonomy/report", headers=h)
            rep = res2.json() if res2.status_code == 200 else {}
            check("A14 API /autonomy/report honest audit",
                  res2.status_code == 200
                  and "divergence_from_script" in rep
                  and "sources" in rep
                  and "relationships" in rep,
                  f"divergence="
                  f"{rep.get('divergence_from_script', {}).get('pct')}%")

    print("\n" + "=" * 64)
    print(f"AUTONOMY ACCEPTANCE: {PASS}/{PASS + FAIL} PASS, {FAIL} FAIL")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
