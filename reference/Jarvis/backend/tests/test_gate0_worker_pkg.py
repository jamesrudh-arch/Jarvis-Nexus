"""Gate 0 Item 4 — authenticated, validated, secrets-free, self-cleaning
Kaggle worker packages.

Every test in this module FAILS on the pre-Gate-0 baseline (commit 1fb4384,
where the package downloaded unauthenticated with an unvalidated,
default-placeholder core_wss_url and lingered on disk forever) and PASSES
after Item 4.
"""
from __future__ import annotations

import io
import os
import time
import zipfile

import pytest
from fastapi.testclient import TestClient

from backend.app.config import WORKER_PKG_DIR, settings
from backend.app.main import app
from backend.app.services.inference_hub import sweep_stale_worker_packages


def make_client():
    return TestClient(app, headers={"Authorization": f"Bearer {settings.OWNER_AUTH_TOKEN}"})


def _first_profile_id(client: TestClient) -> str:
    profs = client.get("/api/v1/compute/kaggle/profiles").json()
    assert profs, "expected seeded Kaggle profiles"
    return profs[0]["id"]


def test_package_rejects_non_wss_schemes():
    with make_client() as client:
        pid = _first_profile_id(client)
        for bad in (
            "ws://127.0.0.1:8000/ws/worker",
            "http://127.0.0.1:8000/ws/worker",
            "https://127.0.0.1/ws/worker",
            "127.0.0.1:8000/ws/worker",
        ):
            r = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": bad})
            assert r.status_code == 400, f"{bad}: expected 400, got {r.status_code}"
            assert "wss://" in r.json()["detail"]


def test_package_rejects_host_outside_allowlist():
    with make_client() as client:
        pid = _first_profile_id(client)
        r = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": "wss://evil.example/ws/worker"})
        assert r.status_code == 400
        assert "not in the worker-dial allowlist" in r.json()["detail"]
        assert "JARVIS_ALLOWED_WORKER_HOSTS" in r.json()["detail"]


def test_package_rejects_wrong_path_query_userinfo_and_missing_param():
    with make_client() as client:
        pid = _first_profile_id(client)
        cases = {
            "wrong_path": "wss://127.0.0.1:8000/ws/notworker",
            "root_path": "wss://127.0.0.1:8000/",
            "query_string": "wss://127.0.0.1:8000/ws/worker?token=should-never-travel-in-urls",
            "fragment": "wss://127.0.0.1:8000/ws/worker#frag",
            "userinfo": "wss://user:pass@127.0.0.1:8000/ws/worker",
        }
        for name, url in cases.items():
            r = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": url})
            assert r.status_code == 400, f"{name}: expected 400, got {r.status_code}"
        # Missing required param -> FastAPI 422 (owner auth ran first: 401 without token).
        r_missing = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package")
        assert r_missing.status_code == 422


def test_package_accepts_loopback_and_allowlisted_hosts_in_dev():
    with make_client() as client:
        pid = _first_profile_id(client)
        for good in ("wss://127.0.0.1:8000/ws/worker", "wss://localhost:8000/ws/worker"):
            r = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": good})
            assert r.status_code == 200, f"{good}: {r.text}"
        # An explicitly allowlisted host works even without loopback semantics.
        saved = list(settings.ALLOWED_WORKER_HOSTS)
        try:
            settings.ALLOWED_WORKER_HOSTS.append("jarvis-nexus-core.up.railway.app")
            r = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": "wss://jarvis-nexus-core.up.railway.app/ws/worker"})
            assert r.status_code == 200
            r_evil = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": "wss://evil.example/ws/worker"})
            assert r_evil.status_code == 400
        finally:
            settings.ALLOWED_WORKER_HOSTS[:] = saved


def test_package_zip_contains_no_secrets():
    """The generated ZIP/notebook must contain NO worker token, NO Fernet key,
    NO owner token, and NO profile secret (raw or encrypted blob)."""
    with make_client() as client:
        pid = _first_profile_id(client)
        # Store real-looking credentials on the profile so exclusion is meaningful.
        client.patch(f"/api/v1/compute/kaggle/profiles/{pid}", json={
            "profile_name": "Secrets-Probe",
            "kaggle_username": "pkg_probe_user",
            "kaggle_key": "pkg_probe_key_5f2b77",
        })
        from backend.app.database import SessionLocal
        from backend.app.models import KaggleProfileRecord
        with SessionLocal() as db:
            enc_blob = db.query(KaggleProfileRecord).filter_by(id=pid).first().encrypted_credentials
        assert enc_blob, "profile should hold an encrypted credential blob"

        r = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": "wss://127.0.0.1:8000/ws/worker"})
        assert r.status_code == 200
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        assert {"jarvis_worker.py", "jarvis_kaggle_worker.ipynb", "README_KAGGLE_SETUP.md"}.issubset(set(zf.namelist()))

        combined = "\n".join(zf.read(n).decode("utf-8", errors="replace") for n in zf.namelist())
        for secret in (
            settings.WORKER_AUTH_TOKEN,
            settings.OWNER_AUTH_TOKEN,
            settings.FERNET_MASTER_KEY,
            "pkg_probe_user",      # raw Kaggle username
            "pkg_probe_key_5f2b77",  # raw Kaggle API key
            enc_blob,              # encrypted credential blob
        ):
            assert secret not in combined, f"secret leaked into worker package: {str(secret)[:12]}..."

        # Positive controls: the notebook really documents the secret mechanism
        # and embeds the validated dial-out URL.
        nb = zf.read("jarvis_kaggle_worker.ipynb").decode("utf-8")
        assert "UserSecretsClient" in nb and "JARVIS_WORKER_TOKEN" in nb
        assert "wss://127.0.0.1:8000/ws/worker" in nb


def test_worker_package_deleted_after_download():
    with make_client() as client:
        pid = _first_profile_id(client)
        r = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": "wss://127.0.0.1:8000/ws/worker"})
        assert r.status_code == 200
        # A valid ZIP body proves the file existed and was served; after the
        # response completes, the background task must have removed it.
        zipfile.ZipFile(io.BytesIO(r.content))  # raises if not a real zip
        fname = next(
            part.split("=", 1)[1].strip('"')
            for part in r.headers["content-disposition"].split(";")
            if part.strip().startswith("filename=")
        )
        assert not (WORKER_PKG_DIR / fname).exists(), "package must be deleted after download"


def test_sweep_removes_stale_packages_only():
    stale = WORKER_PKG_DIR / "jarvis_worker_stale_probe.zip"
    fresh = WORKER_PKG_DIR / "jarvis_worker_fresh_probe.zip"
    stale.write_bytes(b"stale")
    fresh.write_bytes(b"fresh")
    old = time.time() - 3600
    os.utime(stale, (old, old))
    try:
        removed = sweep_stale_worker_packages()
        assert removed >= 1
        assert not stale.exists()
        assert fresh.exists()
    finally:
        stale.unlink(missing_ok=True)
        fresh.unlink(missing_ok=True)
