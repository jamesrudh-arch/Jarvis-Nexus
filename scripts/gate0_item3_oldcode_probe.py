"""Gate 0 Item 3 — behavioral probe against the BASELINE code (commit 1fb4384).

Proves the pre-hardening /admin/backup + /admin/restore accepted exactly what
Item 3 now rejects. Run from inside the baseline worktree.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))  # worktree root: make `backend` importable

from fastapi.testclient import TestClient

from backend.app.main import app

# Enter the app lifespan (create_all + seed) before probing.
client = TestClient(app)
client.__enter__()

# 1) Baseline restore accepts a hostile snapshot: unknown tables, unknown
#    switch keys, bogus schema_version, oversized fields — no validation at all.
hostile = {
    "world_state": {"owner_name": "A" * 5000, "first_launch_completed": True,
                     "active_mode": "evil_override", "current_zone": "not_a_zone",
                     "reduced_motion": False},
    "switches": [{"switch_key": "telemetry_kill_switch", "enabled": True}],
    "memories": [{"id": "m1", "category": "password_vault", "epistemic_status": "divine_revelation",
                  "title": "t", "content": "c", "is_sensitive": False, "confidence": 99.5}],
    "goals": [{"id": "g1", "title": "t", "description": "d", "priority": 99, "status": "obliterated",
               "progress": 500, "depends_on": ["ghost-goal"], "schedule_spec": "x",
               "assigned_zone": "secret_annex", "next_action": "n"}],
    "kaggle_profiles_masked": [],
    "schema_version": "9.9.9",
    "exported_at": "1970-01-01T00:00:00Z",
    "evil_unknown_table": [{"inject": True}],
}
r = client.post("/api/v1/admin/restore", json=hostile)
print(f"OLD CODE POST /admin/restore hostile snapshot -> {r.status_code} {r.json()}")
print("  (new code asserts 400 with unknown tables/fields/enums, 413 on size => test FAILS on old code, PASSES on new)")

# 2) Baseline has no payload cap: >2 MiB body is accepted and processed.
big = dict(hostile)
big["world_state"] = dict(hostile["world_state"])
big["world_state"]["owner_name"] = "B" * (2 * 1024 * 1024 + 65536)
r2 = client.post("/api/v1/admin/restore", json=big)
print(f"OLD CODE POST /admin/restore >2MiB body -> {r2.status_code} {str(r2.json())[:80]}")
print("  (new code asserts 413 => test FAILS on old code, PASSES on new)")

# 3) Baseline backup response carries no secrets policy statement.
r3 = client.post("/api/v1/admin/backup")
body = r3.json()
print(f"OLD CODE POST /admin/backup -> {r3.status_code}; 'secrets_policy' in response: {'secrets_policy' in body}")
print("  (new code asserts secrets_policy present => test FAILS on old code, PASSES on new)")

# 4) Baseline has no dry-run: dry_run=true still mutates the database.
r4 = client.post("/api/v1/admin/restore?dry_run=true", json=hostile)
print(f"OLD CODE POST /admin/restore?dry_run=true -> {r4.status_code} {r4.json()}")
print("  (new code asserts status=='dry_run' and no mutation => test FAILS on old code, PASSES on new)")

# 5) Baseline never writes a pre-restore safety backup before mutating.
import pathlib
backups = sorted(p.name for p in pathlib.Path("backend/data/backups").iterdir()) if pathlib.Path("backend/data/backups").exists() else []
print(f"OLD CODE backups dir after restore: {backups}")
print("  (new code asserts a pre_restore_* file exists before mutation => test FAILS on old code, PASSES on new)")
