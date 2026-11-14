#!/usr/bin/env python3
"""Live verification of the two Founder-provided credentials.

Continuation Directive item 2: securely configure and TEST both.
- OpenAI API key  -> GET /v1/models, then (if authorized) a minimal chat call
- Railway token   -> GraphQL me + projects + services + deployments

NEVER prints or logs credential values — only redacted prefixes and the
HTTP-level facts. Evidence goes to reports/CREDENTIAL_VERIFICATION.txt.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import httpx

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _redact(value: str) -> str:
    if len(value) <= 15:
        return f"<{len(value)} chars, withheld>"
    return f"{value[:11]}…{value[-4:]} (len={len(value)})"


def _load_env() -> None:
    env_path = os.path.join(REPO, "..", ".env")
    env_path = os.path.abspath(env_path)
    if os.path.exists(env_path):
        with open(env_path) as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip())


def verify_openai(out: dict) -> None:
    key = os.environ.get("OPENAI_API_KEY", "")
    rec: dict = {"provided": bool(key), "key": _redact(key) if key else None}
    if not key:
        rec["result"] = "NOT PROVIDED"
        out["openai"] = rec
        return
    headers = {"Authorization": f"Bearer {key}"}
    try:
        r = httpx.get("https://api.openai.com/v1/models",
                      headers=headers, timeout=30.0)
        rec["models_list_http"] = r.status_code
        if r.status_code != 200:
            try:
                rec["error_body"] = r.json().get("error", {}).get("message",
                                                                  r.text[:200])
            except Exception:  # noqa: BLE001
                rec["error_body"] = r.text[:200]
            rec["result"] = "REJECTED_BY_API"
            out["openai"] = rec
            return
        model_ids = sorted(m["id"] for m in r.json().get("data", []))
        rec["models_visible"] = len(model_ids)
        rec["sample_models"] = [m for m in model_ids
                                if any(t in m for t in
                                       ("mini", "nano", "4o", "4.1"))][:12]
        # minimal REAL completion call (cost: a few tokens)
        model = os.environ.get("OPENAI_MODEL", "")
        if not model:
            for cand in ("gpt-4o-mini", "gpt-4.1-mini", "chatgpt-4o-latest"):
                if cand in model_ids:
                    model = cand
                    break
        if not model and model_ids:
            model = model_ids[0]
        body = {"model": model,
                "messages": [{"role": "user",
                              "content": "Reply with the single word: "
                                         "OPERATIONAL"}],
                "max_completion_tokens": 16}
        try:
            c = httpx.post("https://api.openai.com/v1/chat/completions",
                           headers=headers, json=body, timeout=60.0)
            rec["chat_model"] = model
            rec["chat_http"] = c.status_code
            if c.status_code == 200:
                data = c.json()
                rec["chat_reply"] = (data["choices"][0]["message"]
                                     .get("content", "")[:60])
                rec["usage"] = data.get("usage", {})
                rec["result"] = "VALID — real completion performed"
            else:
                rec["chat_error"] = c.text[:300]
                rec["result"] = "MODELS_OK_COMPLETION_REJECTED"
        except Exception as exc:  # noqa: BLE001
            rec["chat_exception"] = repr(exc)[:200]
            rec["result"] = "MODELS_OK_COMPLETION_FAILED"
    except Exception as exc:  # noqa: BLE001
        rec["exception"] = repr(exc)[:200]
        rec["result"] = "UNREACHABLE"
    out["openai"] = rec


def verify_railway(out: dict) -> None:
    tok = os.environ.get("RAILWAY_TOKEN", "")
    rec: dict = {"provided": bool(tok), "token": _redact(tok) if tok else None}
    if not tok:
        rec["result"] = "NOT PROVIDED"
        out["railway"] = rec
        return
    headers = {"Authorization": f"Bearer {tok}",
               "Content-Type": "application/json"}
    gql = ("query { me { id name email } projects { edges { node { id name "
           "updatedAt services { edges { node { id name } } } } } } }")
    try:
        r = httpx.post("https://backboard.railway.app/graphql/v2",
                       headers=headers, json={"query": gql}, timeout=30.0)
        rec["graphql_http"] = r.status_code
        if r.status_code != 200:
            rec["error_body"] = r.text[:300]
            rec["result"] = "REJECTED_BY_API"
            out["railway"] = rec
            return
        data = r.json()
        if "errors" in data and data.get("errors"):
            rec["graphql_errors"] = [e.get("message", "")[:150]
                                     for e in data["errors"]][:5]
            rec["result"] = "REJECTED_BY_API (graphql error)"
            out["railway"] = rec
            return
        d = data.get("data", {}) or {}
        me = d.get("me") or {}
        rec["identity"] = {k: me.get(k) for k in ("name", "email")} | {
            "id": _redact(me.get("id", ""))}
        projects = []
        for edge in (d.get("projects") or {}).get("edges", []):
            node = edge["node"]
            projects.append({
                "name": node["name"],
                "id": _redact(node["id"]),
                "services": [s["node"]["name"] for s in
                             (node.get("services") or {}).get("edges", [])],
                "updatedAt": node.get("updatedAt")})
        rec["projects"] = projects
        rec["project_count"] = len(projects)
        rec["result"] = ("VALID — token authorized, workspace enumerated"
                         if me else "PARTIAL (no me node)")
    except Exception as exc:  # noqa: BLE001
        rec["exception"] = repr(exc)[:200]
        rec["result"] = "UNREACHABLE"
    out["railway"] = rec


def main() -> int:
    _load_env()
    out: dict = {"verified_at_utc":
                 datetime.now(timezone.utc).isoformat(timespec="seconds")}
    verify_openai(out)
    verify_railway(out)
    report = os.path.join(REPO, "reports", "CREDENTIAL_VERIFICATION.txt")
    with open(report, "w") as fh:
        fh.write("CREDENTIAL VERIFICATION (live API calls)\n")
        fh.write(f"verified_at_utc: {out['verified_at_utc']}\n")
        fh.write("values redacted — never printed, never committed\n\n")
        fh.write(json.dumps(out, indent=2, sort_keys=True))
        fh.write("\n")
    print(json.dumps(out, indent=2, sort_keys=True))
    ok = (out.get("openai", {}).get("chat_http") == 200
          or "VALID" in out.get("openai", {}).get("result", ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
