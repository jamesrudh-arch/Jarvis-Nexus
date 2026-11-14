"""Model-provider abstraction (JARVIS NEXUS established architecture).

THE contract through which every AI model — hosted API, local runner, or
test double — is accessed. Providers are registered by name and routed
through one point; the orchestrator never talks to a vendor SDK directly.

Phase 1 status: contract + deterministic test provider (EchoProvider).
Real providers (hosted OpenAI-compatible endpoints, Tier 2 local runners)
plug in at Phase 2 when credentials/hardware exist. Nothing here pretends
to be a working LLM integration (no false completion claims).
"""
from __future__ import annotations

import json
from typing import Protocol


class ModelProvider(Protocol):
    name: str

    def generate(self, messages: list[dict], **options) -> dict:
        """Return {"text": str, "provider": str, "model": str, "usage": dict}.
        Implementations must be safe to call concurrently and must raise
        ProviderError (never hang) on failure."""
        ...


class ProviderError(Exception):
    pass


class EchoProvider:
    """Deterministic test double — no network, no AI. Used to verify routing,
    registries and error paths in tests without credentials."""

    def __init__(self, name: str = "echo"):
        self.name = name
        self.calls = 0

    def generate(self, messages: list[dict], **options) -> dict:
        self.calls += 1
        return {"text": json.dumps({"echo": messages[-1]["content"],
                                    "options": options}, sort_keys=True),
                "provider": self.name, "model": "echo-1",
                "usage": {"prompt_tokens": 0, "completion_tokens": 0}}


class ModelRouter:
    """Central registry — the 'Model Router' box of the architecture."""

    def __init__(self) -> None:
        self._providers: dict[str, ModelProvider] = {}
        self.default: str | None = None
        self.route_log: list[dict] = []

    def register(self, provider: ModelProvider, default: bool = False) -> None:
        if provider.name in self._providers:
            raise ProviderError(f"provider {provider.name!r} already registered")
        self._providers[provider.name] = provider
        if default or self.default is None:
            self.default = provider.name

    def generate(self, messages: list[dict], provider: str | None = None,
                 **options) -> dict:
        name = provider or self.default
        if not name or name not in self._providers:
            raise ProviderError(
                f"unknown provider {name!r}; registered: "
                f"{sorted(self._providers)}")
        result = self._providers[name].generate(messages, **options)
        self.route_log.append({"provider": name,
                               "model": result.get("model")})
        return result

    def list_providers(self) -> list[str]:
        return sorted(self._providers)
