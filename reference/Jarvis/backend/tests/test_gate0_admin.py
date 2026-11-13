"""Gate 0 Item 3 — hardened owner-only admin backup/restore.

Every test in this module FAILS on the pre-Gate-0 baseline (commit 1fb4384,
where /admin/backup and /admin/restore were unauthenticated raw-dict imports)
and PASSES after Item 3.

Test ids embed a per-run uuid so repeated runs against a persistent dev
database cannot collide with rows inserted by earlier runs.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.config import BACKUPS_DIR, settings
from backend.app.database import SessionLocal
from backend.app.models import GoalRecord, MemoryRecord, OwnerSwitch
from backend.app.main import app, MAX_RESTORE_PAYLOAD_BYTES


def make_client():
    return TestClient(app, headers={"Authorization": f"Bearer {settings.OWNER_AUTH_TOKEN}"})


def _db_fingerprint() -> dict:
    """A comparable fingerprint of all mutable admin-restorable state."""
    with SessionLocal() as db:
        switches = {s.switch_key: s.enabled for s in db.query(OwnerSwitch).all()}
        memories = sorted(m.id for m in db.query(MemoryRecord).all())
        goals = {g.id: (g.status, g.progress, g.next_action) for g in db.query(GoalRecord).all()}
        return {"switches": switches, "memories": memories, "goals": goals}


def _get_valid_snapshot(client: TestClient) -> dict:
    resp = client.post("/api/v1/admin/backup")
    assert resp.status_code == 200, resp.text
    return resp.json()["snapshot"]


def _post_restore(client: TestClient, snapshot: dict, dry_run: bool = False):
    params = {"dry_run": "true"} if dry_run else {}
    return client.post("/api/v1/admin/restore", params=params, content=json.dumps(snapshot), headers={"Content-Type": "application/json"})


def test_admin_backup_blocked_when_master_off():
    """Master OFF -> 403 + audit event, for both admin routes."""
    with make_client() as client:
        client.patch("/api/v1/switches/master", json={"enabled": False})
        try:
            before = _db_fingerprint()
            r_backup = client.post("/api/v1/admin/backup")
            assert r_backup.status_code == 403
            r_restore = client.post("/api/v1/admin/restore", content="{}", headers={"Content-Type": "application/json"})
            assert r_restore.status_code == 403
            assert _db_fingerprint() == before
            events = client.get("/api/v1/security/events").json()["events"]
            assert any(e["category"] == "admin_blocked" for e in events), "expected admin_blocked audit events"
        finally:
            client.patch("/api/v1/switches/master", json={"enabled": True})


def test_backup_response_documents_secrets_policy_and_excludes_secrets():
    """Backup works with Master ON; the response states the secrets policy
    (excluded, not encrypted) and the payload provably contains no secrets."""
    with make_client() as client:
        # Plant a sensitive memory and real-ish Kaggle credentials to prove exclusion.
        client.post("/api/v1/memories", json={
            "category": "sensitive", "title": "Admin Secret",
            "content": "SN-ADMIN-SECRET-XYZ-99481", "is_sensitive": True,
        })
        profs = client.get("/api/v1/compute/kaggle/profiles").json()
        client.patch(f"/api/v1/compute/kaggle/profiles/{profs[0]['id']}", json={
            "profile_name": "Backup-Exclusion-Probe",
            "kaggle_username": "admin_probe_user",
            "kaggle_key": "admin_probe_key_9f3a11",
        })

        resp = client.post("/api/v1/admin/backup")
        assert resp.status_code == 200
        body = resp.json()
        policy = body["secrets_policy"]
        assert policy["policy"] == "excluded (not encrypted)"
        assert "never exported" in policy["fernet_master_key_worker_and_owner_tokens"]

        text = resp.text
        for secret in (
            "SN-ADMIN-SECRET-XYZ-99481",          # sensitive memory plaintext
            "admin_probe_user",                    # raw Kaggle username
            "admin_probe_key_9f3a11",              # raw Kaggle API key
            settings.FERNET_MASTER_KEY,            # Fernet master key
            settings.WORKER_AUTH_TOKEN,            # worker token
            settings.OWNER_AUTH_TOKEN,             # owner token
        ):
            assert secret not in text, f"secret leaked into backup payload: {secret[:12]}..."
        # The sensitive memory is present only as the redaction marker.
        sens = [m for m in body["snapshot"]["memories"] if m["title"] == "Admin Secret"]
        assert sens and sens[0]["content"] == "[REDACTED_SENSITIVE]"


def test_restore_rejects_oversized_payload():
    """A restore body above the 2 MiB cap is refused with 413 and the DB is untouched."""
    with make_client() as client:
        before = _db_fingerprint()
        huge = _get_valid_snapshot(client)
        huge["world_state"]["owner_name"] = "A" * (MAX_RESTORE_PAYLOAD_BYTES + 4096)
        r = _post_restore(client, huge)
        assert r.status_code == 413
        assert _db_fingerprint() == before


def test_restore_rejects_malformed_json_and_non_object():
    with make_client() as client:
        before = _db_fingerprint()
        r1 = client.post("/api/v1/admin/restore", content="this is not json {{{", headers={"Content-Type": "application/json"})
        assert r1.status_code == 400
        r2 = client.post("/api/v1/admin/restore", content="[1, 2, 3]", headers={"Content-Type": "application/json"})
        assert r2.status_code == 400
        assert _db_fingerprint() == before


def test_restore_rejects_unknown_tables_fields_and_invalid_values():
    """Unknown tables/fields, unknown enum values, duplicate ids, and bad
    references are all rejected with 400 — never silently imported."""
    with make_client() as client:
        base = _get_valid_snapshot(client)

        def mutated(**kw):
            snap = json.loads(json.dumps(base))
            for key, fn in kw.items():
                fn(snap)
            return snap

        cases = {
            "unknown_top_level_table": mutated(evil=lambda s: s.update({"evil_table": [{"x": 1}]})),
            "unknown_field_in_memory": mutated(mem_field=lambda s: s["memories"][0].update({"evil_column": "x"})),
            "unknown_switch_key": mutated(switch=lambda s: s["switches"].append({"switch_key": "telemetry_kill_switch", "enabled": True})),
            "duplicate_switch": mutated(dup_switch=lambda s: s["switches"].append(dict(s["switches"][0]))),
            "unknown_zone": mutated(zone=lambda s: s["world_state"].update({"current_zone": "secret_annex_b13"})),
            "unknown_mode": mutated(mode=lambda s: s["world_state"].update({"active_mode": "evil_override"})),
            "bad_memory_category": mutated(cat=lambda s: s["memories"][0].update({"category": "password_vault"})),
            "bad_epistemic_status": mutated(epi=lambda s: s["memories"][0].update({"epistemic_status": "divine_revelation"})),
            "duplicate_memory_id": mutated(dup_mem=lambda s: s["memories"].append(dict(s["memories"][0]))),
            "bad_goal_status": mutated(gstatus=lambda s: s["goals"][0].update({"status": "obliterated"})),
            "unknown_goal_dependency": mutated(dep=lambda s: s["goals"][0].update({"depends_on": ["goal-does-not-exist"]})),
            "bad_schema_version": mutated(ver=lambda s: s.update({"schema_version": "9.9.9"})),
            "confidence_out_of_range": mutated(conf=lambda s: s["memories"][0].update({"confidence": 7.5})),
        }

        before = _db_fingerprint()
        for name, snap in cases.items():
            r = _post_restore(client, snap)
            assert r.status_code == 400, f"{name}: expected 400, got {r.status_code}"
        assert _db_fingerprint() == before, "a rejected snapshot must never mutate the database"


def test_restore_dry_run_validates_without_mutating():
    with make_client() as client:
        probe_id = f"dry-run-probe-{uuid.uuid4().hex[:8]}"
        snap = _get_valid_snapshot(client)
        # Add one new memory + flip a switch value in the plan.
        snap["memories"].append({
            "id": probe_id, "category": "project",
            "epistemic_status": "owner_stated", "title": "Dry Run Probe",
            "content": "planned only", "is_sensitive": False,
            "confidence": 1.0, "source_ref": None, "project_tag": None,
        })
        for sw in snap["switches"]:
            if sw["switch_key"] == "embodiment":
                sw["enabled"] = not sw["enabled"]

        backups_before = {p.name for p in BACKUPS_DIR.iterdir()}
        before = _db_fingerprint()

        r = _post_restore(client, snap, dry_run=True)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "dry_run"
        assert body["valid"] is True
        assert body["would_restore"]["memories_new"] >= 1
        assert "not restorable" in body["kaggle_profiles"]

        assert _db_fingerprint() == before, "dry-run must not mutate the database"
        assert {p.name for p in BACKUPS_DIR.iterdir()} == backups_before, "dry-run must not write a pre-restore backup"


def test_restore_takes_pre_restore_backup_before_mutating():
    """A real restore: (1) writes a pre_restore_* safety backup reflecting the
    PRE-restore state, (2) then applies the snapshot, (3) reports the file."""
    with make_client() as client:
        probe_id = f"restore-probe-{uuid.uuid4().hex[:8]}"
        snap = _get_valid_snapshot(client)
        snap["memories"].append({
            "id": probe_id, "category": "project",
            "epistemic_status": "owner_stated", "title": "Restore Probe",
            "content": "restored by Item 3 test", "is_sensitive": False,
            "confidence": 1.0, "source_ref": None, "project_tag": None,
        })
        target_goal = snap["goals"][0]
        target_goal["progress"] = (target_goal["progress"] + 7) % 100 or 7
        for sw in snap["switches"]:
            if sw["switch_key"] == "embodiment":
                sw["enabled"] = False

        r = _post_restore(client, snap)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "restored"

        # (1) The pre-restore safety backup exists and reflects the OLD state.
        pre_name = body["pre_restore_backup_file"]
        pre_path = BACKUPS_DIR / pre_name
        assert pre_name.startswith("pre_restore_"), pre_name
        assert pre_path.exists(), "pre-restore backup file must exist on disk"
        pre_snap = json.loads(pre_path.read_text())
        pre_mems = {m["id"] for m in pre_snap["memories"]}
        assert probe_id not in pre_mems, "pre-restore backup must predate the mutation"
        pre_goal = next(g for g in pre_snap["goals"] if g["id"] == target_goal["id"])
        assert pre_goal["progress"] != target_goal["progress"]

        # (2) The snapshot was actually applied.
        after = _db_fingerprint()
        assert probe_id in after["memories"]
        assert after["goals"][target_goal["id"]][1] == target_goal["progress"]
        assert after["switches"]["embodiment"] is False
        assert body["restored_counts"]["memories_restored"] >= 1

        # Leave the world tidy for subsequent test modules.
        client.patch("/api/v1/switches/embodiment", json={"enabled": True})


def test_restore_failure_rolls_back_completely(monkeypatch):
    """Any exception during apply -> HTTP 500, complete rollback, audit event.

    Post-validation apply failures are infrastructure-level by nature, so this
    test injects one (monkeypatched _apply_restore that performs REAL mutations
    and then raises) to prove the route's rollback contract end-to-end.
    """
    import backend.app.main as main_mod

    sabotage_id = f"sabotage-probe-{uuid.uuid4().hex[:8]}"

    def sabotage(db, snap):
        # Real mutation first — the rollback must undo even this.
        db.add(MemoryRecord(
            id=sabotage_id, category="project",
            epistemic_status="owner_stated", title="Sabotage Probe",
            content="this must never survive", is_sensitive=False, confidence=1.0,
        ))
        raise RuntimeError("injected mid-transaction failure")

    monkeypatch.setattr(main_mod, "_apply_restore", sabotage)

    with make_client() as client:
        snap = _get_valid_snapshot(client)
        before = _db_fingerprint()
        r = _post_restore(client, snap)
        assert r.status_code == 500
        assert "unchanged" in r.json()["detail"]

        after = _db_fingerprint()
        assert after == before, "database must be byte-for-byte unchanged after rollback"
        assert sabotage_id not in after["memories"]

        events = client.get("/api/v1/security/events").json()["events"]
        match = next((e for e in events if e["category"] == "admin_restore_failed"), None)
        assert match is not None, "expected a critical admin_restore_failed audit event"
        assert match["severity"] == "critical"
