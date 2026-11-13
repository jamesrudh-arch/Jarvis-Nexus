"""Gate 0 Item 1 — Owner authentication on every REST route and /ws/nexus.

Every test in this module FAILS on the pre-Gate-0 baseline (all routes were
public) and PASSES after Item 1. Verified against baseline commit 1fb4384.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import WebSocketDisconnect
from fastapi.routing import APIRoute
from starlette.routing import Mount
from fastapi.testclient import TestClient

from backend.app import auth as auth_module
from backend.app.config import settings
from backend.app.main import app

REPO_ROOT = Path(__file__).resolve().parents[2]

OWNER = {"Authorization": f"Bearer {settings.OWNER_AUTH_TOKEN}"}
WRONG = {"Authorization": "Bearer definitely-not-the-owner-token"}

# One recipe (request kwargs) per protected REST route, keyed by (METHOD, path).
# The completeness test asserts this table covers EVERY /api/v1 APIRoute
# except /api/v1/health — so no route can silently lose coverage.
RECIPES: dict[tuple[str, str], dict] = {
    ("POST", "/api/v1/auth/ws-ticket"): {},
    ("GET", "/api/v1/world"): {},
    ("POST", "/api/v1/world/complete-onboarding"): {},
    ("POST", "/api/v1/world/reduced-motion"): {"params": {"enabled": "true"}},
    ("POST", "/api/v1/world/mode"): {"json": {"mode_id": "living_presence"}},
    ("POST", "/api/v1/world/move"): {"json": {"zone_id": "central_operations"}},
    ("POST", "/api/v1/world/interrupt"): {},
    ("POST", "/api/v1/world/resume"): {},
    ("GET", "/api/v1/switches"): {},
    ("PATCH", "/api/v1/switches/{switch_key}"): {"json": {"enabled": True}},
    ("GET", "/api/v1/conversations"): {},
    ("POST", "/api/v1/conversations/send"): {"json": {"content": "auth probe"}},
    ("GET", "/api/v1/memories"): {},
    ("POST", "/api/v1/memories"): {"json": {"title": "t", "content": "c"}},
    ("PATCH", "/api/v1/memories/{memory_id}"): {"json": {}},
    ("DELETE", "/api/v1/memories/{memory_id}"): {},
    ("GET", "/api/v1/goals"): {},
    ("POST", "/api/v1/goals"): {"json": {"title": "t", "description": "d"}},
    ("PATCH", "/api/v1/goals/{goal_id}/status"): {"json": {}},
    ("GET", "/api/v1/agents"): {},
    ("POST", "/api/v1/agents/{agent_id}/dispatch"): {"json": {"objective": "probe"}},
    ("POST", "/api/v1/agents/runs/{run_id}/cancel"): {},
    ("GET", "/api/v1/tools"): {},
    ("POST", "/api/v1/tools/execute"): {"json": {"tool_name": "inspect_workspace", "arguments": {}}},
    ("POST", "/api/v1/research/query"): {"json": {"query": "probe"}},
    ("POST", "/api/v1/simulations/run"): {"json": {}},
    ("GET", "/api/v1/scenarios"): {},
    ("POST", "/api/v1/scenarios"): {"json": {"title": "t", "summary": "s"}},
    ("POST", "/api/v1/scenarios/{scenario_id}/activate"): {"json": {}},
    ("POST", "/api/v1/scenarios/restore"): {},
    ("GET", "/api/v1/media"): {},
    ("POST", "/api/v1/media/upload"): {},
    ("GET", "/api/v1/media/files/{filename}"): {},
    ("POST", "/api/v1/media/{media_id}/commentary"): {"json": {"timestamp_sec": 1.0, "label": "l", "analysis": "a"}},
    ("POST", "/api/v1/media/video-state"): {"json": {"media_id": "media-turbine-bench-01", "playing": False, "current_time": 0.0}},
    ("POST", "/api/v1/media/generate"): {"params": {"prompt": "probe"}},
    ("GET", "/api/v1/compute/status"): {},
    ("GET", "/api/v1/compute/worker-setup-info"): {},
    ("GET", "/api/v1/compute/kaggle/profiles"): {},
    ("POST", "/api/v1/compute/kaggle/profiles"): {"json": {"profile_name": "probe"}},
    ("PATCH", "/api/v1/compute/kaggle/profiles/{profile_id}"): {"json": {"profile_name": "probe"}},
    ("DELETE", "/api/v1/compute/kaggle/profiles/{profile_id}"): {},
    ("POST", "/api/v1/compute/kaggle/profiles/{profile_id}/test"): {},
    ("GET", "/api/v1/compute/kaggle/profiles/{profile_id}/package"): {"params": {"core_wss_url": "wss://127.0.0.1:8000/ws/worker"}},
    ("GET", "/api/v1/security/events"): {},
    ("GET", "/api/v1/telemetry"): {},
    ("POST", "/api/v1/admin/backup"): {},
    ("POST", "/api/v1/admin/restore"): {"json": {}},
}


def _fill_path_params(path: str) -> str:
    return (
        path.replace("{switch_key}", "master")
        .replace("{memory_id}", "00000000-0000-0000-0000-000000000000")
        .replace("{goal_id}", "nonexistent-goal")
        .replace("{agent_id}", "agent_architect")
        .replace("{run_id}", "nonexistent-run")
        .replace("{scenario_id}", "cryo_manifold_forensic")
        .replace("{filename}", "nonexistent.bin")
        .replace("{media_id}", "nonexistent-media")
        .replace("{profile_id}", "nonexistent-profile")
    )


def _clear_throttle() -> None:
    with auth_module._LOCK:
        auth_module._FAILURES.clear()


def _iter_api_routes(routes):
    """Yield APIRoute objects, descending into include-containers (FastAPI >=0.162
    wraps included routers in _IncludedRouter) and Mounts."""
    for r in routes:
        if isinstance(r, APIRoute):
            yield r
        elif isinstance(r, Mount):
            yield from _iter_api_routes(r.routes)
        elif type(r).__name__ == "_IncludedRouter" and getattr(r, "original_router", None) is not None:
            yield from _iter_api_routes(r.original_router.routes)


def _protected_api_routes() -> list[tuple[str, str]]:
    """(method, path) for every /api/v1 APIRoute except the public health route."""
    found = []
    for r in _iter_api_routes(app.routes):
        if r.path.startswith("/api/v1") and r.path != "/api/v1/health":
            method = sorted(m for m in r.methods if m in ("GET", "POST", "PATCH", "DELETE", "PUT"))[0]
            found.append((method, r.path))
    return sorted(found)


def test_route_inventory_is_complete():
    """The recipe table must cover every protected route declared by the app."""
    routes = {(m.upper(), p) for m, p in _protected_api_routes()}
    assert routes, "expected protected routes to exist"
    missing = sorted(routes - set(RECIPES))
    assert not missing, f"Routes missing from RECIPES: {missing}"
    extra = sorted(set(RECIPES) - routes)
    assert not extra, f"RECIPES contains unknown routes: {extra}"


def test_every_protected_route_rejects_missing_token():
    _clear_throttle()
    with TestClient(app) as client:
        for method, path in _protected_api_routes():
            fn = getattr(client, method.lower())
            kwargs = dict(RECIPES[(method.upper(), path)])
            r = fn(_fill_path_params(path), **kwargs)
            assert r.status_code == 401, (
                f"{method} {path} returned {r.status_code} without a token (expected 401)"
            )
            _clear_throttle()


def test_every_protected_route_rejects_wrong_token():
    _clear_throttle()
    with TestClient(app) as client:
        for method, path in _protected_api_routes():
            fn = getattr(client, method.lower())
            kwargs = dict(RECIPES[(method.upper(), path)])
            kwargs["headers"] = WRONG
            r = fn(_fill_path_params(path), **kwargs)
            assert r.status_code in (401, 403), (
                f"{method} {path} returned {r.status_code} with a wrong token (expected 401/403)"
            )
            _clear_throttle()


def test_valid_token_reaches_representative_routes():
    _clear_throttle()
    with TestClient(app) as client:
        checks = [
            ("get", "/api/v1/world", {}),
            ("get", "/api/v1/switches", {}),
            ("get", "/api/v1/memories", {}),
            ("get", "/api/v1/goals", {}),
            ("get", "/api/v1/agents", {}),
            ("get", "/api/v1/scenarios", {}),
            ("get", "/api/v1/media", {}),
            ("get", "/api/v1/compute/status", {}),
            ("get", "/api/v1/compute/worker-setup-info", {}),
            ("get", "/api/v1/compute/kaggle/profiles", {}),
            ("get", "/api/v1/security/events", {}),
            ("get", "/api/v1/telemetry", {}),
            ("post", "/api/v1/auth/ws-ticket", {}),
        ]
        for method, path, kwargs in checks:
            r = getattr(client, method)(path, headers=OWNER, **kwargs)
            assert r.status_code != 401 and r.status_code != 403, (
                f"{method} {path} returned {r.status_code} with a valid token"
            )


def test_ws_nexus_rejects_unauthenticated_clients():
    _clear_throttle()
    with TestClient(app) as client:
        # 1) Non-auth first message -> policy-violation close 4401
        with client.websocket_connect("/ws/nexus?device=pc_browser") as ws:
            ws.send_text(json.dumps({"type": "ping"}))
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_text()
            assert exc.value.code == auth_module.WS_POLICY_VIOLATION_CODE

        # 2) Wrong token as first message -> 4401
        with client.websocket_connect("/ws/nexus") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "wrong-token"}))
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_text()
            assert exc.value.code == auth_module.WS_POLICY_VIOLATION_CODE

        # 3) Valid ticket flow: REST-issued single-use ticket as first message
        ticket = client.post("/api/v1/auth/ws-ticket", headers=OWNER).json()["ticket"]
        with client.websocket_connect("/ws/nexus") as ws:
            ws.send_text(json.dumps({"type": "auth", "ticket": ticket}))
            initial = json.loads(ws.receive_text())
            assert initial["type"] == "initial_state"
            assert "owner_name" in initial["payload"]
            ws.send_text(json.dumps({"type": "ping"}))
            pong = json.loads(ws.receive_text())
            assert pong["type"] == "pong"

        # 4) Tickets are single-use: reuse is rejected
        ticket2 = client.post("/api/v1/auth/ws-ticket", headers=OWNER).json()["ticket"]
        with client.websocket_connect("/ws/nexus") as ws:
            ws.send_text(json.dumps({"type": "auth", "ticket": ticket2}))
            assert json.loads(ws.receive_text())["type"] == "initial_state"
        with client.websocket_connect("/ws/nexus") as ws:
            ws.send_text(json.dumps({"type": "auth", "ticket": ticket2}))
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_text()
            assert exc.value.code == auth_module.WS_POLICY_VIOLATION_CODE

        # 5) Owner token directly as first message also works
        with client.websocket_connect("/ws/nexus") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": settings.OWNER_AUTH_TOKEN}))
            assert json.loads(ws.receive_text())["type"] == "initial_state"


def test_failed_authentication_writes_security_audit_event():
    _clear_throttle()
    with TestClient(app) as client:
        before = client.get("/api/v1/security/events", headers=OWNER).json()["events"]
        before_ids = {e["id"] for e in before}
        rejected = client.get("/api/v1/world")  # no token -> 401
        assert rejected.status_code == 401
        after = client.get("/api/v1/security/events", headers=OWNER).json()["events"]
        # /security/events returns only the latest 30 — compare by id, not length.
        new_events = [e for e in after if e["id"] not in before_ids]
        assert new_events, "expected a new SecurityAuditEvent for the rejected request"
        match = next(
            (e for e in new_events if e["category"] == "owner_auth_rejected" and "/api/v1/world" in e["message"]),
            None,
        )
        assert match is not None, f"no owner_auth_rejected event for /api/v1/world in {new_events}"
        # The audit message must never contain the token value.
        assert settings.OWNER_AUTH_TOKEN not in match["message"]


def test_per_ip_throttling_after_repeated_failures():
    _clear_throttle()
    with TestClient(app) as client:
        # Failures 1..THRESHOLD-1 pass through with 401; the THRESHOLD-th failure
        # inside the window is throttled, and even a VALID token stays blocked
        # until the window expires or the history is cleared.
        for i in range(auth_module.AUTH_FAILURE_THRESHOLD - 1):
            r = client.get("/api/v1/world")
            assert r.status_code == 401, f"failure {i + 1} should not be throttled yet"
        r = client.get("/api/v1/world")
        assert r.status_code == 429
        r_valid = client.get("/api/v1/world", headers=OWNER)
        assert r_valid.status_code == 429
        _clear_throttle()
        r_after = client.get("/api/v1/world", headers=OWNER)
        assert r_after.status_code == 200


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


def test_startup_fails_closed_without_owner_token_in_production():
    result = _run_config_import({"JARVIS_ENV": "production"})
    assert result.returncode != 0, "server must refuse to start in production without JARVIS_OWNER_TOKEN"
    assert "JARVIS_OWNER_TOKEN" in result.stderr
    assert "refuses to start" in result.stderr


def test_startup_succeeds_in_production_with_explicit_owner_token():
    result = _run_config_import({"JARVIS_ENV": "production", "JARVIS_OWNER_TOKEN": "prod-import-probe-token"})
    assert result.returncode == 0, result.stderr
    assert "IMPORT-OK" in result.stdout
