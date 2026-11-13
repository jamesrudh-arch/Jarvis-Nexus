"""Gate 0 Item 5 — embedding honesty (Option A: honest lexical placeholder).

Every test in this module FAILS on the pre-Gate-0 baseline (commit 1fb4384,
where the column was `embedding_json`, the helper was named
`_simple_lexical_embedding` and described as 'semantic', and the migration
SQL suggested a pgvector embedding column) and PASSES after Item 5.
"""
from __future__ import annotations

import json
import sqlite3
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text

from backend.app.config import settings
from backend.app.database import migrate_legacy_memory_embedding_column
from backend.app.main import app, _lexical_fingerprint
from backend.app.models import MemoryRecord


def make_client():
    return TestClient(app, headers={"Authorization": f"Bearer {settings.OWNER_AUTH_TOKEN}"})


def test_model_has_no_embedding_json_attribute():
    """The dishonest name is gone from the ORM layer."""
    assert not hasattr(MemoryRecord, "embedding_json")
    assert not hasattr(MemoryRecord, "embedding")
    assert hasattr(MemoryRecord, "lexical_fingerprint_json")


def test_helper_name_and_fingerprint_shape():
    """_lexical_fingerprint (not _simple_lexical_embedding): 16-dim, normalized,
    stable across processes (crc32, not the per-process-salted builtin hash)."""
    a = _lexical_fingerprint("cryogenic manifold forensic reconstruction")
    assert len(a) == 16
    assert all(isinstance(v, float) for v in a)
    assert abs(sum(v * v for v in a) - 1.0) < 0.01  # normalized
    assert a == _lexical_fingerprint("cryogenic manifold forensic reconstruction")
    # Different text -> different fingerprint (sanity, not a semantic claim).
    assert _lexical_fingerprint("cryogenic manifold") != a


def test_created_memory_stores_lexical_fingerprint():
    with make_client() as client:
        r = client.post("/api/v1/memories", json={"title": "Fingerprint probe", "content": "lexical only"})
        assert r.status_code == 200
        mid = r.json()["id"]
        from backend.app.database import SessionLocal
        with SessionLocal() as db:
            rec = db.query(MemoryRecord).filter_by(id=mid).first()
            fp = json.loads(rec.lexical_fingerprint_json)
            assert len(fp) == 16
        # Direct attribute access must fail: the old name is gone.
        try:
            rec.embedding_json  # type: ignore[attr-defined]
            raise AssertionError("embedding_json attribute must not exist")
        except AttributeError:
            pass


def test_migration_renames_legacy_column_and_preserves_data():
    """A database created with the OLD schema gets its column renamed, data
    preserved — so existing dev databases keep working across the rename."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)
    try:
        conn = sqlite3.connect(db_path)
        conn.execute(
            "CREATE TABLE memory_records (id VARCHAR(36) PRIMARY KEY, category VARCHAR(40), "
            "epistemic_status VARCHAR(32), title VARCHAR(200), content TEXT, "
            "is_sensitive BOOLEAN DEFAULT FALSE, confidence DOUBLE PRECISION DEFAULT 1.0, "
            "source_ref TEXT, project_tag VARCHAR(100), embedding_json TEXT, "
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )
        conn.execute("INSERT INTO memory_records (id, category, title, content, embedding_json) "
                     "VALUES ('legacy-1', 'project', 'Legacy row', 'kept across rename', '[0.1, 0.9]')")
        conn.commit()
        conn.close()

        legacy_engine = create_engine(f"sqlite:///{db_path}")
        renamed = migrate_legacy_memory_embedding_column(legacy_engine)
        assert renamed is True

        cols = {c["name"] for c in inspect(legacy_engine).get_columns("memory_records")}
        assert "lexical_fingerprint_json" in cols
        assert "embedding_json" not in cols
        with legacy_engine.connect() as c:
            row = c.execute(text("SELECT lexical_fingerprint_json FROM memory_records WHERE id='legacy-1'")).fetchone()
        assert row[0] == "[0.1, 0.9]"

        # Idempotent: a second run must not raise and must report no rename.
        assert migrate_legacy_memory_embedding_column(legacy_engine) is False
    finally:
        db_path.unlink(missing_ok=True)


def test_no_semantic_embedding_claims_remain_in_code_or_docs():
    """The words that made the placeholder sound like an embedding are gone."""
    repo = Path(__file__).resolve().parents[2]
    offenders = []
    for rel in (
        "backend/app/models.py",
        "backend/app/main.py",
        "backend/migrations/001_initial_nexus_schema.sql",
        "README.md",
    ):
        content = (repo / rel).read_text(encoding="utf-8")
        for bad in ("embedding_json", "_simple_lexical_embedding", "local semantic ranking", "ADD COLUMN IF NOT EXISTS embedding"):
            if bad in content:
                offenders.append(f"{rel}: {bad}")
    assert not offenders, f"semantic-embedding language remains: {offenders}"
