#!/usr/bin/env python3
"""
NEXUS WORLD — Phase 0 smoke test (TESTED evidence generator).

Purpose: prove, on the ACTUAL Tier-0 sandbox hardware (2 cores / 3.9 GB RAM /
no GPU), that the three foundation properties required by the specification
(Section 40, "Quantitative acceptance and testing") can be achieved with
Python stdlib + SQLite before any external dependency is adopted:

  T1  Persistence      — world state survives a process "restart" (reopen DB).
  T2  Event idempotency — the same event delivered twice is applied once
                          (spec 30: "A message being delivered at least once
                          must not cause a financial transaction or resident
                          action to be applied twice").
  T3  Event replay      — current state can be reconstructed from the event
                          log alone (spec 40: "Events can be replayed").
  T4  Tick determinism  — the same seed + same events => same state hash.

This is deliberately dependency-free: it validates the ARCHITECTURE PATTERN
(event-sourced world state with idempotent apply), not any third-party library.

Run:  python3 tests/phase0_smoke_test.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import sys
import time
import uuid

DB_PATH = os.environ.get("NEXUS_TEST_DB", "/tmp/nexus_phase0_test.db")

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS world_meta (
    key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,          -- idempotency key (spec 30)
    seq INTEGER NOT NULL UNIQUE,        -- total order
    tick INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS residents (
    resident_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    energy INTEGER NOT NULL,
    money_cents INTEGER NOT NULL,
    activity TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS balances (   -- double-entry ledger stub (spec 17)
    account TEXT PRIMARY KEY,
    balance_cents INTEGER NOT NULL);
"""


# ---------------------------------------------------------------- world core
class WorldStore:
    """Minimal event-sourced world state. Apply is idempotent by event_id."""

    def __init__(self, path: str):
        self.path = path
        self.db = sqlite3.connect(path)
        self.db.executescript(SCHEMA)
        self.db.execute(
            "INSERT OR IGNORE INTO world_meta VALUES ('schema_version','0.1.0')")
        self.db.commit()

    # -- event ingestion ----------------------------------------------------
    def append(self, tick: int, etype: str, payload: dict) -> bool:
        """Append event if unseen; return True if newly applied."""
        event_id = payload.get("idempotency_key", str(uuid.uuid4()))
        cur = self.db.execute(
            "SELECT 1 FROM events WHERE event_id=?", (event_id,))
        if cur.fetchone():
            return False  # duplicate delivery -> no-op (T2)
        self.db.execute(
            "INSERT INTO events(event_id,seq,tick,type,payload,created_at) "
            "VALUES (?,?,?,?,?,datetime('now'))",
            (event_id,
             (self.db.execute("SELECT COALESCE(MAX(seq),0)+1 FROM events")
              .fetchone()[0]),
             tick, etype, json.dumps(payload, sort_keys=True)))
        self._apply(etype, payload)
        self.db.commit()
        return True

    def _apply(self, etype: str, p: dict) -> None:
        if etype == "resident.created":
            self.db.execute(
                "INSERT INTO residents VALUES (?,?,?,?,?,?)",
                (p["resident_id"], p["name"], p["location"],
                 p.get("energy", 100), p.get("money_cents", 0), "idle"))
        elif etype == "resident.moved":
            self.db.execute(
                "UPDATE residents SET location=? WHERE resident_id=?",
                (p["to"], p["resident_id"]))
        elif etype == "payment.made":
            # double-entry: debit payer, credit payee atomically (spec 17)
            self.db.execute(
                "UPDATE residents SET money_cents=money_cents-? "
                "WHERE resident_id=?", (p["amount_cents"], p["payer"]))
            self.db.execute(
                "UPDATE residents SET money_cents=money_cents+? "
                "WHERE resident_id=?", (p["amount_cents"], p["payee"]))
            for acc, delta in ((f"resident:{p['payer']}", -p["amount_cents"]),
                               (f"resident:{p['payee']}", +p["amount_cents"])):
                self.db.execute(
                    "INSERT INTO balances VALUES (?,?) "
                    "ON CONFLICT(account) DO UPDATE SET "
                    "balance_cents=balance_cents+excluded.balance_cents",
                    (acc, delta))
        elif etype == "resident.slept":
            self.db.execute(
                "UPDATE residents SET energy=100, activity='idle' "
                "WHERE resident_id=?", (p["resident_id"],))
        elif etype == "resident.activity":
            self.db.execute(
                "UPDATE residents SET activity=?, energy=energy-? "
                "WHERE resident_id=?",
                (p["activity"], p.get("energy_cost", 5), p["resident_id"]))
        else:
            raise ValueError(f"unknown event type {etype}")

    # -- queries --------------------------------------------------------------
    def residents(self):
        return self.db.execute(
            "SELECT resident_id,name,location,energy,money_cents,activity "
            "FROM residents ORDER BY resident_id").fetchall()

    def state_hash(self) -> str:
        """Deterministic fingerprint of full resident+balance state (T4)."""
        blob = json.dumps(
            {"residents": [list(r) for r in self.residents()],
             "balances": self.db.execute(
                 "SELECT account,balance_cents FROM balances "
                 "ORDER BY account").fetchall()},
            sort_keys=True)
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    def ledger_balances(self) -> int:
        """Sum of all balance entries — must be 0 for a closed system."""
        return self.db.execute(
            "SELECT COALESCE(SUM(balance_cents),0) FROM balances").fetchone()[0]

    def close(self):
        self.db.close()


def replay_from_log(path: str) -> "WorldStore":
    """Rebuild state purely from the event log into a fresh DB (T3)."""
    replay_path = path + ".replay"
    if os.path.exists(replay_path):
        os.remove(replay_path)
    src = sqlite3.connect(path)
    store = WorldStore(replay_path)
    for tick, etype, payload in src.execute(
            "SELECT tick,type,payload FROM events ORDER BY seq"):
        p = json.loads(payload)
        if etype == "resident.created":
            p.setdefault("idempotency_key",
                         "replay-" + p["resident_id"])  # keep insert idempotent
        store.append(tick, etype, p)
    src.close()
    return store


# ---------------------------------------------------------------- test suite
RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def main() -> int:
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    t0 = time.perf_counter()

    # --- build a miniature world: 2 residents, payments, movement, rest ----
    w = WorldStore(DB_PATH)
    w.append(0, "resident.created",
             {"idempotency_key": "e1", "resident_id": "r-001",
              "name": "Ada", "location": "home", "money_cents": 100000})
    w.append(0, "resident.created",
             {"idempotency_key": "e2", "resident_id": "r-002",
              "name": "Belle", "location": "home", "money_cents": 50000})
    w.append(1, "resident.activity",
             {"idempotency_key": "e3", "resident_id": "r-001",
              "activity": "working", "energy_cost": 20})
    w.append(2, "resident.moved",
             {"idempotency_key": "e4", "resident_id": "r-001", "to": "bakery"})
    w.append(3, "payment.made",
             {"idempotency_key": "e5", "payer": "r-001", "payee": "r-002",
              "amount_cents": 450})
    w.append(4, "resident.slept",
             {"idempotency_key": "e6", "resident_id": "r-001"})

    hash_before = w.state_hash()
    n_events = w.db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    check("world built with 6 events", n_events == 6, f"count={n_events}")

    # T2 — duplicate delivery of the SAME payment must not double-apply
    applied = w.append(3, "payment.made",
                       {"idempotency_key": "e5", "payer": "r-001",
                        "payee": "r-002", "amount_cents": 450})
    check("T2 duplicate payment rejected", applied is False)
    money = dict((r[0], r[4]) for r in w.residents())
    check("T2 payer balance debited exactly once",
          money["r-001"] == 100000 - 450, f"r-001={money['r-001']}")
    check("T2 payee balance credited exactly once",
          money["r-002"] == 50000 + 450, f"r-002={money['r-002']}")
    check("T2 closed-system ledger sums to zero", w.ledger_balances() == 0,
          f"sum={w.ledger_balances()}")
    n_events = w.db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    check("T2 event log still has 6 events", n_events == 6,
          f"count={n_events}")
    w.close()

    # T1 — simulated restart: reopen the database file in a NEW connection
    w2 = WorldStore(DB_PATH)
    hash_after_restart = w2.state_hash()
    check("T1 state hash identical after restart",
          hash_before == hash_after_restart,
          f"{hash_before} vs {hash_after_restart}")
    ada = [r for r in w2.residents() if r[0] == "r-001"][0]
    check("T1 resident location persisted", ada[2] == "bakery", ada[2])
    check("T1 resident energy restored to 100", ada[3] == 100, str(ada[3]))
    w2.close()

    # T3 — replay reconstruction from event log only
    w3 = replay_from_log(DB_PATH)
    hash_replay = w3.state_hash()
    check("T3 replayed state hash identical to live state",
          hash_replay == hash_before,
          f"{hash_replay} vs {hash_before}")
    w3.close()

    # T4 — determinism: rebuild world from scratch with same events
    alt = DB_PATH + ".det"
    if os.path.exists(alt):
        os.remove(alt)
    w4 = WorldStore(alt)
    for tick, etype, payload in [
            (0, "resident.created", {"idempotency_key": "e1",
                                     "resident_id": "r-001", "name": "Ada",
                                     "location": "home",
                                     "money_cents": 100000}),
            (0, "resident.created", {"idempotency_key": "e2",
                                     "resident_id": "r-002", "name": "Belle",
                                     "location": "home",
                                     "money_cents": 50000}),
            (1, "resident.activity", {"idempotency_key": "e3",
                                      "resident_id": "r-001",
                                      "activity": "working",
                                      "energy_cost": 20}),
            (2, "resident.moved", {"idempotency_key": "e4",
                                   "resident_id": "r-001", "to": "bakery"}),
            (3, "payment.made", {"idempotency_key": "e5", "payer": "r-001",
                                 "payee": "r-002", "amount_cents": 450}),
            (4, "resident.slept", {"idempotency_key": "e6",
                                   "resident_id": "r-001"})]:
        w4.append(tick, etype, payload)
    check("T4 same events => same state hash",
          w4.state_hash() == hash_before,
          f"{w4.state_hash()} vs {hash_before}")
    w4.close()

    elapsed = time.perf_counter() - t0
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    print(f"\n=== RESULT: {passed}/{len(RESULTS)} checks passed "
          f"in {elapsed*1000:.1f} ms on $(nproc)-core host ==="
          .replace("$(nproc)", str(os.cpu_count() or 1)))
    for p in (DB_PATH, DB_PATH + ".replay", DB_PATH + ".det",
              DB_PATH + "-wal", DB_PATH + "-shm"):
        if os.path.exists(p):
            os.remove(p)
    return 0 if passed == len(RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
