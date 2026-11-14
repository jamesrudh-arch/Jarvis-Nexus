"""In-process event bus (Tier 0 adapter).

Interface contract: publish(event_dict) after persistence; subscribe(event_type, handler).
Tier 1 replaces this with a NATS JetStream adapter behind the SAME interface
(ADR-001) — the idempotent apply layer in WorldStore already tolerates
at-least-once delivery (Phase 0 evidence), so the swap is a transport change.
"""
from __future__ import annotations

import threading
from typing import Callable


class EventBus:
    """Synchronous in-process pub/sub. Handlers must not raise: exceptions
    are captured and counted so a bad subscriber can never destabilise the
    simulation loop (spec: no specialist service silently destabilises core)."""

    def __init__(self) -> None:
        self._subs: dict[str, list[Callable[[dict], None]]] = {}
        self._lock = threading.Lock()
        self.published = 0
        self.handler_errors = 0

    def subscribe(self, event_type: str,
                  handler: Callable[[dict], None]) -> None:
        with self._lock:
            self._subs.setdefault(event_type, []).append(handler)

    def publish(self, event: dict) -> None:
        self.published += 1
        for handler in list(self._subs.get(event.get("type", "*"), [])):
            try:
                handler(event)
            except Exception:  # noqa: BLE001 — isolation by contract
                self.handler_errors += 1

    def stats(self) -> dict:
        return {"published": self.published,
                "handler_errors": self.handler_errors,
                "subscription_types": sorted(self._subs.keys())}
