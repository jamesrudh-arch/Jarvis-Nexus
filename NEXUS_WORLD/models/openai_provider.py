"""OpenAI provider — Chat Completions over raw httpx (register entry #10:
the openai SDK was REJECTED to keep a single HTTP stack; this module is
that decision, implemented).

Credential handling: the key is read from OPENAI_API_KEY (never logged,
never committed — .env is gitignored). Verified live status is recorded
in reports/CREDENTIAL_VERIFICATION.txt. If the endpoint is unreachable
from the host (e.g. edge geo-block) every call raises ProviderError and
the cognition layer falls back to the utility engine — never a fake
completion.
"""
from __future__ import annotations

import os

import httpx

from models.provider_registry import ProviderError

DEFAULT_BASE_URL = "https://api.openai.com/v1"


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str | None = None, model: str | None = None,
                 base_url: str | None = None, timeout_s: float = 60.0):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        self.base_url = (base_url or
                         os.environ.get("OPENAI_BASE_URL", DEFAULT_BASE_URL))
        self.timeout_s = timeout_s
        self.calls = 0
        self.errors = 0
        self.last_error: str | None = None

    def _headers(self) -> dict:
        if not self.api_key:
            raise ProviderError("openai: OPENAI_API_KEY not configured")
        return {"Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"}

    def generate(self, messages: list[dict], **options) -> dict:
        self.calls += 1
        body: dict = {"model": self.model, "messages": messages}
        if "max_tokens" in options:
            body["max_tokens"] = options["max_tokens"]
        if "max_completion_tokens" in options:
            body["max_completion_tokens"] = options[
                "max_completion_tokens"]
        try:
            resp = httpx.post(f"{self.base_url}/chat/completions",
                              headers=self._headers(), json=body,
                              timeout=self.timeout_s)
        except httpx.HTTPError as exc:
            self.errors += 1
            self.last_error = f"transport: {exc}"[:200]
            raise ProviderError(f"openai: {self.last_error}") from exc
        if resp.status_code != 200:
            self.errors += 1
            try:
                msg = resp.json().get("error", {}).get("message",
                                                       resp.text[:160])
            except ValueError:
                msg = resp.text[:160]
            self.last_error = f"http {resp.status_code}: {msg}"[:200]
            raise ProviderError(f"openai: {self.last_error}")
        data = resp.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            self.errors += 1
            raise ProviderError("openai: malformed completion") from exc
        return {"text": content, "provider": self.name,
                "model": data.get("model", self.model),
                "usage": data.get("usage", {})}

    def probe(self) -> dict:
        """Live reachability check (used by /cognition/status + reports)."""
        if not self.api_key:
            return {"provider": self.name, "configured": False}
        try:
            resp = httpx.get(f"{self.base_url}/models",
                             headers=self._headers(), timeout=20.0)
            return {"provider": self.name, "configured": True,
                    "http": resp.status_code,
                    "reachable": resp.status_code == 200,
                    "detail": "" if resp.status_code == 200 else
                    resp.json().get("error", {}).get("message",
                                                     "")[:120]
                    if resp.status_code != 200 else ""}
        except httpx.HTTPError as exc:
            return {"provider": self.name, "configured": True,
                    "http": None, "reachable": False,
                    "detail": f"transport: {exc}"[:120]}
