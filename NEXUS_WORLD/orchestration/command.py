"""Central command orchestrator (spec §35; JARVIS directive Part 6).

Intent → permission check → risk assessment → (approval) → execution →
audit record → result. Idempotent by command_id: a retried command returns
the original outcome instead of executing twice.

This is the SINGLE orchestrator of the platform (no competing orchestrators
allowed by directive Part 6/12). Every future specialist (browser, voice,
vision, world tools) registers capabilities HERE.
"""
from __future__ import annotations

import json
from typing import Callable

from persistence.world_store import WorldStore
from security.permissions import ActionClass, Decision, Role, check


class CommandResult(dict):
    pass


class CommandOrchestrator:
    def __init__(self, store: WorldStore):
        self.store = store
        self.registry: dict[str, Callable[[dict], object]] = {}
        # named capabilities registered by subsystems (agent manager etc.)
        self._register_builtin_capabilities()

    # ------------------------------------------------------------ registry
    def register_capability(self, name: str,
                            fn: Callable[[dict], object]) -> None:
        """Specialised agents/tools register here — the agent-manager hook
        (directive Part 6: agents coordinate through the orchestrator)."""
        if name in self.registry:
            raise ValueError(f"capability {name!r} already registered")
        self.registry[name] = fn

    def _register_builtin_capabilities(self) -> None:
        self.register_capability(
            "world.status",
            lambda p: {"world_id": self.store.meta("world_id"),
                       "tick": self.store.current_tick,
                       "events": self.store.event_count()})
        self.register_capability(
            "world.register_entity",
            self._register_entity)

    def _register_entity(self, params: dict) -> dict:
        entity_type = params.get("entity_type", "generic")
        entity_id = self.store.allocate_id(f"ent-{entity_type[:4]}")
        self.store.append(self.store.current_tick, "entity.registered", {
            "idempotency_key": f"ent-{entity_id}",
            "entity_id": entity_id, "entity_type": entity_type,
            "data": params.get("data", {})})
        return {"entity_id": entity_id, "entity_type": entity_type}

    # ------------------------------------------------------------ execute
    def execute(self, actor: str, role: Role, action_class: ActionClass,
                capability: str, params: dict | None = None,
                command_id: str | None = None,
                approved: bool = False) -> CommandResult:
        params = params or {}
        command_id = command_id or f"cmd-{actor}-{self.store.event_count()+1:06d}"

        # idempotency: a retried command replays its recorded outcome
        prior = self.store.has_event(command_id)
        if prior:
            p = json.loads(prior["payload"])
            return CommandResult(status="duplicate", command_id=command_id,
                                 duplicate=True,
                                 detail=p.get("reason") or p.get("result"))

        decision: Decision = check(role, action_class)
        if not decision.allowed:
            self.store.append(self.store.current_tick, "command.rejected", {
                "idempotency_key": command_id, "command_id": command_id,
                "actor": actor,
                "action_class": action_class.value,
                "intent": capability, "reason": decision.reason})
            return CommandResult(status="rejected", command_id=command_id,
                                 duplicate=False, detail=decision.reason)

        if decision.approval_required and not approved:
            self.store.append(self.store.current_tick, "command.rejected", {
                "idempotency_key": command_id, "command_id": command_id,
                "actor": actor,
                "action_class": action_class.value,
                "intent": capability,
                "reason": "approval_required_but_not_confirmed"})
            return CommandResult(status="approval_required",
                                 command_id=command_id, duplicate=False,
                                 detail="confirm with approved=true")

        fn = self.registry.get(capability)
        if fn is None:
            self.store.append(self.store.current_tick, "command.rejected", {
                "idempotency_key": command_id, "command_id": command_id,
                "actor": actor,
                "action_class": action_class.value,
                "intent": capability, "reason": "unknown_capability"})
            return CommandResult(status="rejected", command_id=command_id,
                                 duplicate=False,
                                 detail=f"unknown capability {capability!r}")

        result = fn(params)
        self.store.append(self.store.current_tick, "command.executed", {
            "idempotency_key": command_id, "command_id": command_id,
            "actor": actor,
            "action_class": action_class.value, "intent": capability,
            "approved": bool(decision.approval_required and approved),
            "result": {"capability": capability, "value": result}})
        return CommandResult(status="executed", command_id=command_id,
                             duplicate=False, detail=result)
