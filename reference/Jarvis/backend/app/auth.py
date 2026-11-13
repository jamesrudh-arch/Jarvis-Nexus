"""Gate 0 Item 1 — Owner authentication dependency, WS ticket store, and per-IP throttling.

One FastAPI dependency (`require_owner`) protects every `/api/v1/*` route except
`/api/v1/health`. `/ws/nexus` clients authenticate with a short-lived ticket
obtained from the authenticated `POST /api/v1/auth/ws-ticket` route, or by
sending the owner token as the first WebSocket message (never in the URL).

Security properties:
- Token comparison uses `hmac.compare_digest` (constant time).
- The token value is NEVER written to logs, audit events, or error messages.
- Every failed attempt is recorded as a `SecurityAuditEvent` (reusing the
  existing audit model — no parallel audit system).
- Simple in-memory per-IP throttling: after `AUTH_FAILURE_THRESHOLD` failures
  inside `AUTH_FAILURE_WINDOW_SEC`, the IP receives HTTP 429 until the window
  expires. A successful authentication clears the IP's failure history.
"""
from __future__ import annotations

import secrets
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import SecurityAuditEvent
from .security_crypto import verify_owner_token

AUTH_FAILURE_THRESHOLD = 5
AUTH_FAILURE_WINDOW_SEC = 60.0
WS_TICKET_TTL_SEC = 60.0
WS_AUTH_MESSAGE_TIMEOUT_SEC = 10.0
WS_POLICY_VIOLATION_CODE = 4401  # application-defined close code: auth policy violation

_FAILURES: Dict[str, Deque[float]] = defaultdict(deque)
_TICKETS: Dict[str, float] = {}
_LOCK = threading.Lock()


def _client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _register_failure(ip: str) -> bool:
    """Record an auth failure for an IP. Returns True if the IP is now throttled."""
    now = time.monotonic()
    with _LOCK:
        dq = _FAILURES[ip]
        dq.append(now)
        while dq and (now - dq[0]) > AUTH_FAILURE_WINDOW_SEC:
            dq.popleft()
        return len(dq) >= AUTH_FAILURE_THRESHOLD


def _is_throttled(ip: str) -> bool:
    now = time.monotonic()
    with _LOCK:
        dq = _FAILURES.get(ip)
        if not dq:
            return False
        while dq and (now - dq[0]) > AUTH_FAILURE_WINDOW_SEC:
            dq.popleft()
        if not dq:
            _FAILURES.pop(ip, None)
            return False
        return len(dq) >= AUTH_FAILURE_THRESHOLD


def _clear_failures(ip: str) -> None:
    with _LOCK:
        _FAILURES.pop(ip, None)


def record_auth_failure(db: Session, *, path: str, ip: str, reason: str) -> bool:
    """Write a SecurityAuditEvent for a failed owner authentication attempt.

    The message deliberately contains route, IP and reason only — never the
    presented token value. Returns True if the IP should now be throttled.
    """
    db.add(SecurityAuditEvent(
        severity="warning",
        category="owner_auth_rejected",
        message=f"Rejected unauthenticated request to '{path}' from {ip} ({reason}).",
        source="OwnerAuth",
    ))
    db.commit()
    return _register_failure(ip)


def issue_ws_ticket() -> Dict[str, object]:
    """Issue a single-use, short-lived ticket usable as the first /ws/nexus message."""
    ticket = f"jnx_ws_{secrets.token_urlsafe(24)}"
    now = time.monotonic()
    with _LOCK:
        # Opportunistic sweep of expired tickets.
        expired = [t for t, exp in _TICKETS.items() if exp <= now]
        for t in expired:
            _TICKETS.pop(t, None)
        _TICKETS[ticket] = now + WS_TICKET_TTL_SEC
    return {"ticket": ticket, "expires_in": int(WS_TICKET_TTL_SEC)}


def consume_ws_ticket(ticket: str) -> bool:
    """Validate and burn a /ws/nexus ticket (single use, TTL enforced)."""
    if not ticket:
        return False
    now = time.monotonic()
    with _LOCK:
        expiry = _TICKETS.pop(ticket, None)
    return expiry is not None and expiry > now


def verify_ws_first_message(message: Dict[str, object]) -> bool:
    """Accept a first WS message that carries either a valid ticket or the owner token."""
    if not isinstance(message, dict) or message.get("type") != "auth":
        return False
    ticket = message.get("ticket")
    if isinstance(ticket, str) and consume_ws_ticket(ticket):
        return True
    token = message.get("token")
    return isinstance(token, str) and verify_owner_token(token)


def require_owner(request: Request, db: Session = Depends(get_db)) -> None:
    """The single owner-authentication dependency applied at the APIRouter level.

    Requires `Authorization: Bearer <JARVIS_OWNER_TOKEN>`; compares with
    `hmac.compare_digest`; fails closed; audits every failure; throttles
    repeat offenders per IP.
    """
    ip = _client_ip(request)
    if _is_throttled(ip):
        raise HTTPException(
            status_code=429,
            detail="Too many failed authentication attempts. Try again later.",
        )

    presented = (request.headers.get("authorization") or "").strip()
    if not presented:
        if record_auth_failure(db, path=request.url.path, ip=ip, reason="missing Authorization header"):
            raise HTTPException(status_code=429, detail="Too many failed authentication attempts. Try again later.")
        raise HTTPException(status_code=401, detail="Owner authentication required (Authorization: Bearer <token>).")

    if not verify_owner_token(presented):
        if record_auth_failure(db, path=request.url.path, ip=ip, reason="invalid token"):
            raise HTTPException(status_code=429, detail="Too many failed authentication attempts. Try again later.")
        raise HTTPException(status_code=401, detail="Invalid owner token.")

    _clear_failures(ip)
