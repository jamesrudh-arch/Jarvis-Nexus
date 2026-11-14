"""Z-AI provider — GLM chat completion via the sandbox-provided `z-ai` CLI.

WHY THIS EXISTS (honest record): the Founder's OpenAI key is configured
in models/openai_provider.py, but api.openai.com rejects requests from
this host's region at the edge (HTTP 403 "Country, region, or territory
not supported" — see reports/CREDENTIAL_VERIFICATION.txt). The sandbox
ships a reachable chat-completion CLI (z-ai, GLM models, OpenAI-
compatible JSON). This provider wraps it so Phase 2 cognition has a REAL
hosted-LLM path today; the router switches to OpenAI wherever it is
actually reachable. Same ModelProvider contract as every other provider
(models/provider_registry.py) — the orchestrator never talks to a vendor
CLI directly.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time

from models.provider_registry import ProviderError


class ZAIProvider:
    """Chat completions through the `z-ai chat` CLI (subprocess, JSON).

    Includes a circuit breaker: on HTTP 429 (rate limit, verified live)
    the provider cools down for 60 s and fails fast — the cognition
    layer falls back to the deterministic utility engine instead of
    stalling the tick loop with retries."""

    name = "zai"

    def __init__(self, cli: str = "z-ai", model: str = "glm-4-plus",
                 timeout_s: float = 90.0):
        self.cli = cli
        self.model = model
        self.timeout_s = timeout_s
        self.calls = 0
        self.errors = 0
        self._cooldown_until = 0.0

    def available(self) -> bool:
        return os.path.exists(f"/usr/local/bin/{self.cli}") or \
            os.environ.get("PATH", "").find(self.cli) >= 0 or \
            self._which()

    def _which(self) -> bool:
        from shutil import which
        return which(self.cli) is not None

    def generate(self, messages: list[dict], **options) -> dict:
        system = next((m["content"] for m in messages
                       if m.get("role") == "system"), None)
        user = next((m["content"] for m in reversed(messages)
                     if m.get("role") == "user"), "")
        if not user:
            raise ProviderError("zai: no user message")
        if time.time() < self._cooldown_until:
            raise ProviderError("zai: cooling down after rate limit (429) — "
                                "deterministic fallback in effect")
        self.calls += 1
        cmd = [self.cli, "chat", "-p", user, "-o", "__RETRY__"]
        if system:
            cmd += ["-s", system]
        last_error = ""
        for attempt in range(3):          # the CLI rate-limits bursts
            with tempfile.TemporaryDirectory(prefix="zai_") as td:
                out_path = os.path.join(td, "reply.json")
                cmd_local = cmd[:-1] + [out_path]
                try:
                    proc = subprocess.run(
                        cmd_local, capture_output=True, text=True,
                        timeout=self.timeout_s, check=False)
                except subprocess.TimeoutExpired as exc:
                    self.errors += 1
                    raise ProviderError(
                        f"zai: cli timeout after {self.timeout_s}s") from exc
                if proc.returncode == 0 and os.path.exists(out_path):
                    try:
                        data = json.load(open(out_path))
                        content = data["choices"][0]["message"]["content"]
                        return {"text": content, "provider": self.name,
                                "model": data.get("model", self.model),
                                "usage": data.get("usage", {})}
                    except (ValueError, KeyError, IndexError, TypeError) as exc:
                        self.errors += 1
                        raise ProviderError(
                            f"zai: unparseable reply: {exc}") from exc
            combined = (proc.stderr or "") + " | " + (proc.stdout or "")
            self.errors += 1
            # NB: search the FULL output BEFORE truncating — the CLI's
            # error embeds a JS source excerpt, so "429" can appear well
            # past the first 200 characters (verified live).
            if "429" in combined or "Too many requests" in combined:
                self._cooldown_until = time.time() + 300.0
                raise ProviderError("zai: rate limited (429) — cooling "
                                    "down 300 s (no retries: they "
                                    "extend the window)")
            last_error = combined.strip()[:200]
            time.sleep(1.5 * (attempt + 1))    # backoff, then retry
        raise ProviderError(f"zai: cli failed rc={proc.returncode} "
                            f"{last_error}")

    def status(self) -> dict:
        return {"provider": self.name, "cli": self.cli,
                "available": self._which(), "calls": self.calls,
                "errors": self.errors,
                "cooling_down": time.time() < self._cooldown_until}
