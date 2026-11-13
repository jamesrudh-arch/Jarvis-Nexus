"""Gate 0 Item 2 — CORS explicit origins and production wildcard refusal.

Fails on the pre-Gate-0 baseline (CORS_ORIGINS defaulted to '*' and the server
started happily with it) and passes after Item 2.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.main import app

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_cors_default_is_explicit_dev_origins_not_wildcard():
    """Unset CORS_ORIGINS must resolve to the explicit local dev-server list."""
    assert settings.CORS_ORIGINS, "CORS origins must never be empty"
    assert "*" not in settings.CORS_ORIGINS, "wildcard must not appear in the default origin list"
    assert "http://localhost:5173" in settings.CORS_ORIGINS


def test_cors_preflight_allows_only_listed_origins():
    with TestClient(app) as client:
        # Disallowed origin: no Access-Control-Allow-Origin header may be returned.
        r_bad = client.options(
            "/api/v1/world",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
        )
        assert r_bad.headers.get("access-control-allow-origin") is None

        # Allowed dev origin: the middleware echoes it explicitly.
        r_ok = client.options(
            "/api/v1/world",
            headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
        )
        assert r_ok.headers.get("access-control-allow-origin") == "http://localhost:5173"


def _run_config_import(env_extra: dict) -> subprocess.CompletedProcess:
    env = {
        k: v for k, v in os.environ.items()
        if k not in ("DATABASE_URL", "JARVIS_ENV", "JARVIS_OWNER_TOKEN", "CORS_ORIGINS")
    }
    env.update(env_extra)
    code = "import backend.app.config  # noqa: F401\nprint('IMPORT-OK')"
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(REPO_ROOT), env=env, capture_output=True, text=True, timeout=120,
    )


def test_production_refuses_to_start_with_wildcard_cors():
    result = _run_config_import({
        "JARVIS_ENV": "production",
        "JARVIS_OWNER_TOKEN": "prod-import-probe-token",
        "CORS_ORIGINS": "*",
    })
    assert result.returncode != 0, "server must refuse to start in production with CORS_ORIGINS='*'"
    assert "CORS_ORIGINS" in result.stderr
    assert "wildcard" in result.stderr


def test_production_refuses_to_start_with_wildcard_in_origin_list():
    result = _run_config_import({
        "JARVIS_ENV": "production",
        "JARVIS_OWNER_TOKEN": "prod-import-probe-token",
        "CORS_ORIGINS": "https://jarvis-nexus.vercel.app,*,https://other.example",
    })
    assert result.returncode != 0
    assert "wildcard" in result.stderr


def test_production_starts_with_explicit_origin_list():
    result = _run_config_import({
        "JARVIS_ENV": "production",
        "JARVIS_OWNER_TOKEN": "prod-import-probe-token",
        "CORS_ORIGINS": "https://jarvis-nexus.vercel.app,https://custom-domain.example",
    })
    assert result.returncode == 0, result.stderr
    assert "IMPORT-OK" in result.stdout


def test_production_starts_with_cors_unset_defaults():
    """Unset CORS in production resolves to the explicit dev list (no wildcard)."""
    result = _run_config_import({
        "JARVIS_ENV": "production",
        "JARVIS_OWNER_TOKEN": "prod-import-probe-token",
    })
    assert result.returncode == 0, result.stderr
    assert "IMPORT-OK" in result.stdout
