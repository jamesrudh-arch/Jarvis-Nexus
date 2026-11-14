"""Event-sourced world state store (Tier 0: SQLite WAL).

Contract (ADR-002, TESTED in Phase 0 and re-verified at Phase 1):
- Every state change is an event row keyed by an idempotency key (event_id).
- Duplicate delivery of the same event_id is a no-op.
- Projections (geo_nodes, regions, entity_registry, command_log, world_meta)
  are materialised by an idempotent apply layer.
- Full state is rebuildable from the event log alone (replay).
- state_hash() is a deterministic fingerprint excluding wall-clock metadata.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from typing import Any, Callable, Iterator

SCHEMA_VERSION = "1.0.0"

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS world_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
    event_id   TEXT PRIMARY KEY,   -- idempotency key
    seq        INTEGER NOT NULL UNIQUE,
    tick       INTEGER NOT NULL,
    type       TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS geo_nodes (
    node_id   TEXT PRIMARY KEY,
    parent_id TEXT,
    level     TEXT NOT NULL,
    name      TEXT NOT NULL,
    path      TEXT NOT NULL,
    meta      TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS entity_registry (
    entity_id    TEXT PRIMARY KEY,
    entity_type  TEXT NOT NULL,
    created_tick INTEGER NOT NULL,
    data         TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS id_counters (
    prefix   TEXT PRIMARY KEY,
    next_val INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS regions (
    region_id          TEXT PRIMARY KEY,
    owner              TEXT NOT NULL,
    lease_expires_tick INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS command_log (
    command_id   TEXT PRIMARY KEY,
    actor        TEXT NOT NULL,
    action_class TEXT NOT NULL,
    intent       TEXT NOT NULL,
    status       TEXT NOT NULL,
    result       TEXT,
    approved     INTEGER NOT NULL DEFAULT 0,
    executed_at  TEXT);
CREATE TABLE IF NOT EXISTS memories (          -- Phase 2 resident memory
    memory_id   TEXT PRIMARY KEY,
    resident_id TEXT NOT NULL,
    tick        INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    text        TEXT NOT NULL,
    importance  INTEGER NOT NULL DEFAULT 1);
"""


class WorldStore:
    """Authoritative world state. Single-writer at Tier 0 (ADR-002).

    Threading: the connection is opened with check_same_thread=False so a
    store created in one thread (e.g. app startup) can serve requests from
    FastAPI's threadpool workers; `append` (the only writer) serialises on
    an RLock. Cross-PROCESS writes remain single-writer by design (L-11).
    """

    def __init__(self, path: str):
        self.path = path
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self._lock = __import__("threading").RLock()
        self.db.executescript(SCHEMA)
        self.db.execute(
            "INSERT OR IGNORE INTO world_meta VALUES ('schema_version', ?)",
            (SCHEMA_VERSION,))
        self.db.commit()

    # ------------------------------------------------------------ meta
    def meta(self, key: str, default: str | None = None) -> str | None:
        row = self.db.execute(
            "SELECT value FROM world_meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default

    def set_meta(self, key: str, value: str) -> None:
        self.db.execute(
            "INSERT INTO world_meta VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))

    @property
    def current_tick(self) -> int:
        return int(self.meta("current_tick", "0"))

    # ------------------------------------------------------------ events
    def append(self, tick: int, etype: str, payload: dict) -> bool:
        """Append event if unseen (idempotent). True if newly applied."""
        event_id = payload.get("idempotency_key") or str(uuid.uuid4())
        with self._lock:
            cur = self.db.execute("SELECT 1 FROM events WHERE event_id=?",
                                  (event_id,))
            if cur.fetchone():
                return False
            row = self.db.execute(
                "SELECT COALESCE(MAX(seq),0)+1 FROM events").fetchone()
            self.db.execute(
                "INSERT INTO events VALUES (?,?,?,?,?,datetime('now'))",
                (event_id, row[0], tick, etype,
                 json.dumps(payload, sort_keys=True)))
            self._apply(etype, payload)
            self.db.commit()
            return True

    def events(self, since_seq: int = 0, limit: int = 100) -> list[dict]:
        rows = self.db.execute(
            "SELECT seq,tick,type,payload FROM events WHERE seq>? "
            "ORDER BY seq LIMIT ?", (since_seq, limit)).fetchall()
        return [{"seq": r["seq"], "tick": r["tick"], "type": r["type"],
                 "payload": json.loads(r["payload"])} for r in rows]

    def event_count(self) -> int:
        return self.db.execute("SELECT COUNT(*) FROM events").fetchone()[0]

    def has_event(self, event_id: str) -> sqlite3.Row | None:
        return self.db.execute(
            "SELECT payload FROM events WHERE event_id=?",
            (event_id,)).fetchone()

    # ------------------------------------------------------------ apply
    def _apply(self, etype: str, p: dict) -> None:
        if etype == "world.created":
            self.set_meta("world_id", p["world_id"])
            self.set_meta("world_name", p["name"])
            self.set_meta("seed", str(p["seed"]))
            self.set_meta("epoch_utc", p["epoch_utc"])
            self.set_meta("minutes_per_tick", str(p["minutes_per_tick"]))
            self.set_meta("current_tick", "0")
        elif etype == "world.tick_advanced":
            self.set_meta("current_tick", str(p["tick"]))
            self.set_meta("sim_time_utc", p["sim_time_utc"])
        elif etype == "geo.node_created":
            self.db.execute(
                "INSERT INTO geo_nodes VALUES (?,?,?,?,?,?)",
                (p["node_id"], p["parent_id"], p["level"], p["name"],
                 p["path"], json.dumps(p.get("meta", {}), sort_keys=True)))
        elif etype == "region.lease_acquired":
            self.db.execute(
                "INSERT OR REPLACE INTO regions VALUES (?,?,?)",
                (p["region_id"], p["owner"],
                 self.current_tick + int(p["ttl_ticks"])))
        elif etype == "region.lease_renewed":
            self.db.execute(
                "UPDATE regions SET owner=?, lease_expires_tick=? "
                "WHERE region_id=?",
                (p["owner"],
                 self.current_tick + int(p["ttl_ticks"]), p["region_id"]))
        elif etype == "region.ownership_transferred":
            self.db.execute(
                "UPDATE regions SET owner=?, lease_expires_tick=? "
                "WHERE region_id=?",
                (p["to_owner"],
                 self.current_tick + int(p.get("ttl_ticks", 10000)),
                 p["region_id"]))
        elif etype == "entity.registered":
            self.db.execute(
                "INSERT INTO entity_registry VALUES (?,?,?,?)",
                (p["entity_id"], p["entity_type"],
                 self.current_tick,
                 json.dumps(p.get("data", {}), sort_keys=True)))
        elif etype in ("command.executed", "command.rejected"):
            result = p.get("result")
            self.db.execute(
                "INSERT OR IGNORE INTO command_log VALUES (?,?,?,?,?,?,?,datetime('now'))",
                (p["command_id"], p["actor"], p["action_class"],
                 p["intent"],
                 "executed" if etype == "command.executed" else "rejected",
                 json.dumps(result, sort_keys=True) if result is not None
                 else p.get("reason"),
                 1 if p.get("approved") else 0))
        elif etype == "resident.created":  # Phase 2 residents
            self.db.execute(
                "INSERT INTO entity_registry VALUES (?,?,?,?)",
                (p["resident_id"], "resident", self.current_tick,
                 json.dumps(p.get("data", p), sort_keys=True)))
        elif etype == "resident.acted":  # full state snapshot (replayable)
            self.db.execute(
                "UPDATE entity_registry SET data=? WHERE entity_id=?",
                (json.dumps(p.get("data", p), sort_keys=True),
                 p["resident_id"]))
        elif etype == "resident.memory_recorded":
            self.db.execute(
                "INSERT OR IGNORE INTO memories VALUES (?,?,?,?,?,?)",
                (p["memory_id"], p["resident_id"], p["tick"], p["kind"],
                 p["text"], int(p.get("importance", 1))))
        elif etype == "resident.communication":
            pass  # world-log fact; its state effect is the memory events
        elif etype == "world.weather_changed":
            self.set_meta("weather", p["weather"])
        else:
            raise ValueError(f"unknown event type: {etype}")

    # ------------------------------------------------------------ ids
    def allocate_id(self, prefix: str) -> str:
        """Deterministic sequential IDs; counter is a replayable projection."""
        row = self.db.execute(
            "SELECT next_val FROM id_counters WHERE prefix=?",
            (prefix,)).fetchone()
        n = row["next_val"] if row else 1
        self.db.execute(
            "INSERT INTO id_counters VALUES (?,?) "
            "ON CONFLICT(prefix) DO UPDATE SET next_val=excluded.next_val",
            (prefix, n + 1))
        return f"{prefix}-{n:06d}"

    def _advance_counter_if_behind(self, prefix: str, used: int) -> None:
        """During replay, keep counters consistent with re-applied IDs."""
        row = self.db.execute(
            "SELECT next_val FROM id_counters WHERE prefix=?",
            (prefix,)).fetchone()
        if row is None or row["next_val"] <= used:
            self.db.execute(
                "INSERT INTO id_counters VALUES (?,?) "
                "ON CONFLICT(prefix) DO UPDATE SET next_val=excluded.next_val",
                (prefix, used + 1))

    # ------------------------------------------------------------ queries
    def geo_node(self, node_id: str) -> dict | None:
        row = self.db.execute(
            "SELECT * FROM geo_nodes WHERE node_id=?", (node_id,)).fetchone()
        if not row:
            return None
        return {"node_id": row["node_id"], "parent_id": row["parent_id"],
                "level": row["level"], "name": row["name"],
                "path": row["path"], "meta": json.loads(row["meta"])}

    def geo_children(self, parent_id: str | None) -> list[dict]:
        rows = self.db.execute(
            "SELECT * FROM geo_nodes WHERE parent_id IS ? ORDER BY node_id",
            (parent_id,)).fetchall()
        return [{"node_id": r["node_id"], "level": r["level"],
                 "name": r["name"], "path": r["path"],
                 "meta": json.loads(r["meta"])} for r in rows]

    def geo_counts_by_level(self) -> dict:
        rows = self.db.execute(
            "SELECT level, COUNT(*) AS n FROM geo_nodes GROUP BY level "
            "ORDER BY level").fetchall()
        return {r["level"]: r["n"] for r in rows}

    def regions(self) -> list[dict]:
        rows = self.db.execute(
            "SELECT * FROM regions ORDER BY region_id").fetchall()
        return [{"region_id": r["region_id"], "owner": r["owner"],
                 "lease_expires_tick": r["lease_expires_tick"]}
                for r in rows]

    def entities(self, entity_type: str | None = None) -> list[dict]:
        # Two constant queries (no dynamic SQL assembly — bandit B608 clean);
        # the caller value is always a bound parameter.
        if entity_type:
            rows = self.db.execute(
                "SELECT * FROM entity_registry WHERE entity_type=? "
                "ORDER BY entity_id", (entity_type,)).fetchall()
        else:
            rows = self.db.execute(
                "SELECT * FROM entity_registry "
                "ORDER BY entity_id").fetchall()
        return [{"entity_id": r["entity_id"],
                 "entity_type": r["entity_type"],
                 "created_tick": r["created_tick"],
                 "data": json.loads(r["data"])} for r in rows]

    def commands(self) -> list[dict]:
        rows = self.db.execute(
            "SELECT * FROM command_log ORDER BY command_id").fetchall()
        return [dict(r) for r in rows]

    def memories(self, resident_id: str | None = None, limit: int = 20,
                 min_importance: int = 0) -> list[dict]:
        """Phase 2: resident memory recall (newest first)."""
        if resident_id:
            rows = self.db.execute(
                "SELECT * FROM memories WHERE resident_id=? AND "
                "importance>=? ORDER BY tick DESC, memory_id DESC LIMIT ?",
                (resident_id, min_importance, limit)).fetchall()
        else:
            rows = self.db.execute(
                "SELECT * FROM memories WHERE importance>=? "
                "ORDER BY tick DESC, memory_id DESC LIMIT ?",
                (min_importance, limit)).fetchall()
        return [{"memory_id": r["memory_id"],
                 "resident_id": r["resident_id"], "tick": r["tick"],
                 "kind": r["kind"], "text": r["text"],
                 "importance": r["importance"]} for r in rows]

    def memory_count(self) -> int:
        return self.db.execute("SELECT COUNT(*) FROM memories").fetchone()[0]

    # ------------------------------------------------------------ hashes
    def state_hash(self) -> str:
        """Deterministic fingerprint of all projections (no wall-clock)."""
        blob = json.dumps({
            "meta": {k: v for k, v in self.db.execute(
                "SELECT key,value FROM world_meta ORDER BY key").fetchall()
                if k not in ("schema_version",)},  # constant, excluded
            "geo": [list(r) for r in self.db.execute(
                "SELECT node_id,parent_id,level,name,path,meta FROM geo_nodes "
                "ORDER BY node_id")],
            "regions": [list(r) for r in self.db.execute(
                "SELECT region_id,owner,lease_expires_tick FROM regions "
                "ORDER BY region_id")],
            "entities": [list(r) for r in self.db.execute(
                "SELECT entity_id,entity_type,created_tick,data FROM "
                "entity_registry ORDER BY entity_id")],
            "commands": [list(r) for r in self.db.execute(
                "SELECT command_id,actor,action_class,intent,status,result,"
                "approved FROM command_log ORDER BY command_id")],
            "memories": [list(r) for r in self.db.execute(
                "SELECT memory_id,resident_id,tick,kind,text,importance "
                "FROM memories ORDER BY memory_id")],
        }, sort_keys=True)
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    # ------------------------------------------------------------ replay
    def replay(self, target_path: str) -> "WorldStore":
        """Rebuild world state from this store's event log into a new file."""
        if os.path.exists(target_path):
            os.remove(target_path)
        fresh = WorldStore(target_path)
        seen_prefixes: dict[str, int] = {}
        for tick, etype, payload_json in self.db.execute(
                "SELECT tick,type,payload FROM events ORDER BY seq"):
            p = json.loads(payload_json)
            fresh.append(tick, etype, p)
            for key in ("node_id", "entity_id", "resident_id", "region_id",
                        "memory_id"):
                if key in p and p[key]:
                    prefix = p[key].rsplit("-", 1)[0]
                    try:
                        used = int(p[key].rsplit("-", 1)[1])
                    except (ValueError, IndexError):
                        continue
                    seen_prefixes[prefix] = max(
                        seen_prefixes.get(prefix, 0), used)
        for prefix, used in seen_prefixes.items():
            fresh._advance_counter_if_behind(prefix, used)
        return fresh

    def close(self) -> None:
        self.db.close()
