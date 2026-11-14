"""Resident cognition — ADR-003 layer 2 (hosted LLM at ambiguous moments).

Contract: the LLM CHOOSES among the utility layer's allowed actions; it
can never invent an action, and any invalid/unavailable response falls
back to the utility layer's top choice. Every decision records whether
it came from the LLM or a fallback (honest telemetry).
"""
from __future__ import annotations

import json

from models.provider_registry import ModelRouter, ProviderError


class NullCognition:
    """No-op layer 2 — the world runs fully deterministic."""

    def decide(self, rid: str, data: dict, context: dict,
               allowed: list[tuple[str, float]]) -> tuple[str, str]:
        return allowed[0][0], "deterministic:disabled"


class ResidentCognition:
    """LLM-backed decision layer over the ModelRouter (single route)."""

    def __init__(self, router: ModelRouter, provider: str | None = None):
        self.router = router
        self.provider = provider  # None = router default

    def decide(self, rid: str, data: dict, context: dict,
               allowed: list[tuple[str, float]]) -> tuple[str, str]:
        names = [a for a, _ in allowed]
        system = (
            "You are the inner voice of a resident in the simulated world "
            "NEXUS WORLD. Reply with EXACTLY ONE action name from the "
            "allowed list — no other words, no punctuation.")
        user = json.dumps({
            "you": {"name": context["name"], "role": context["role"]},
            "time": context["time"], "weather": context["weather"],
            "needs_0_to_100": context["needs"],
            "location": context["location"],
            "current_action": context["current_action"],
            "recent_memories": context["recent_memories"],
            "allowed_actions": names,
            "utility_scores": {a: round(s, 2) for a, s in allowed}},
            sort_keys=True)
        try:
            out = self.router.generate(
                [{"role": "system", "content": system},
                 {"role": "user", "content": user}],
                provider=self.provider, max_tokens=24)
        except ProviderError as exc:
            return allowed[0][0], f"fallback:provider_error:{exc}"[:120]
        text = (out.get("text") or "").strip().lower()
        first = text.split()[0].strip(".,!?:;\"'") if text else ""
        for action, _score in allowed:
            if first == action or action.startswith(first) and first:
                return action, f"llm:{out.get('model', '?')}"
        return allowed[0][0], f"fallback:invalid_reply:{text[:40]!r}"
