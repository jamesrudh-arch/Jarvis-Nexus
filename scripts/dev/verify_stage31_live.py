#!/usr/bin/env python3
"""Stage 3.1 LIVE verification — JARVIS Voice on production.

Verifies the NEW capabilities against the real deployment (not mocks):
  1. PWA surface: /app/ shell, manifest, sw, icons, root pointer
  2. Auth boundary: unauthenticated converse -> 401
  3. REAL conversation round-trip through the REAL model provider (cloudflare)
  4. Session persistence: second turn in the same session
  5. Cross-session long-term memory: state a personal fact in session A,
     NEW session B asks for it -> must be recalled from long-term memory
     (the decisive "persistent personal memory" acceptance)
  6. Presence states: SLEEPING -> converse wakes with wokeFrom
  7. Boot backup still healthy on the new deployment (supabase protection)

OWNER_KEY is read from Railway into memory ONLY (never printed/persisted).
Writes docs/dev/evidence/stage31/live-verification.json
"""
import json
import re
import sys
import time
import urllib.request
import urllib.error

BASE = "https://jarvis-nexus-production.up.railway.app"
API = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3"
ENV_ID = "86a07ea1-0e97-4873-9cad-35e5fbfe8807"
SERVICE_ID = "8f8a9401-5e27-4449-a1cb-01271906b8f7"
OUT = "/home/z/my-project/docs/dev/evidence/stage31/live-verification.json"

STAGES = {}


def stage(name, ok, detail, **extra):
    STAGES[name] = {"ok": bool(ok), "detail": str(detail)[:500], **extra}
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {str(detail)[:220]}")
    return ok


def load_token():
    for ln in open("/home/z/my-project/.env"):
        m = re.match(r"^(?:export\s+)?RAILWAY_API_TOKEN=(.+)$", ln.strip())
        if m:
            return m.group(1).strip().strip("'").strip('"')
    return None


def get_owner_key(token):
    q = ('query { variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }'
         % (PROJECT_ID, ENV_ID, SERVICE_ID))
    req = urllib.request.Request(API, data=json.dumps({"query": q}).encode(), headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0"}, method="POST")
    d = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    raw = ((d.get("data") or {}).get("variables"))
    parsed = json.loads(raw) if isinstance(raw, str) else (raw or {})
    return parsed.get("OWNER_KEY")


def http(method, path, key=None, body=None, timeout=90):
    req = urllib.request.Request(BASE + path, method=method)
    if key:
        req.add_header("Authorization", f"Bearer {key}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "Mozilla/5.0")
    try:
        with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def main():
    token = load_token()
    if not token:
        print("FAIL: no RAILWAY_API_TOKEN")
        sys.exit(2)
    owner_key = get_owner_key(token)
    if not owner_key:
        print("FAIL: OWNER_KEY not recoverable from Railway")
        sys.exit(2)

    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # 1) PWA surface ----------------------------------------------------------
    code, body = http("GET", "/app/")
    stage("pwa.shell", code == 200 and "JARVIS" in body and "manifest.webmanifest" in body,
          f"/app/ -> {code}, html shell with manifest link, {len(body)} bytes")
    code, body = http("GET", "/app/manifest.webmanifest")
    mf = json.loads(body) if code == 200 else {}
    stage("pwa.manifest", code == 200 and mf.get("start_url") == "/app/" and len(mf.get("icons", [])) >= 2,
          f"manifest -> {code}, start_url={mf.get('start_url')}, icons={len(mf.get('icons', []))}")
    code, _ = http("GET", "/app/sw.js")
    stage("pwa.service_worker", code == 200, f"/app/sw.js -> {code}")
    code, body = http("GET", "/app/icon-192.png")
    stage("pwa.icon", code == 200 and len(body) > 1000, f"icon-192 -> {code}, {len(body)} bytes")
    code, body = http("GET", "/app/nothing.js")
    stage("pwa.allowlist_404", code == 404, f"unknown asset -> {code} (404 expected)")
    code, body = http("GET", "/")
    root = json.loads(body) if code == 200 else {}
    stage("root.pointer", code == 200 and root.get("app") == "/app/", "root JSON points at /app/")

    # 2) auth boundary ---------------------------------------------------------
    code, _ = http("POST", "/jarvis/converse", body={"message": "hello"})
    stage("auth.boundary", code == 401, f"unauthenticated converse -> {code} (401 expected)")

    # 3) REAL conversation -----------------------------------------------------
    code, body = http("POST", "/jarvis/converse", key=owner_key,
                      body={"message": "Hello JARVIS. Reply with one short sentence confirming you can hear me."}, timeout=120)
    d = json.loads(body).get("data", {}) if code == 201 else {}
    reply1 = d.get("reply", {})
    stage("converse.real_model",
          code == 201 and reply1.get("meta", {}).get("degraded") is False
          and reply1.get("meta", {}).get("provider") == "cloudflare"
          and len(reply1.get("content", "")) > 10,
          f"real reply via {reply1.get('meta', {}).get('modelId')} in {reply1.get('meta', {}).get('latencyMs')}ms: "
          f"{str(reply1.get('content'))[:140]!r}")
    session_a = d.get("session", {}).get("id")
    stage("converse.session_created", bool(session_a), f"session A: {session_a}")

    # 4) second turn, same session ----------------------------------------------
    code, body = http("POST", "/jarvis/converse", key=owner_key,
                      body={"sessionId": session_a, "message": "In one word, how are you today?"}, timeout=120)
    d2 = json.loads(body).get("data", {}) if code == 201 else {}
    stage("converse.second_turn",
          code == 201 and d2.get("session", {}).get("id") == session_a and d2.get("reply", {}).get("meta", {}).get("degraded") is False,
          f"same session continued: {str(d2.get('reply', {}).get('content'))[:100]!r}")

    # 5) cross-session long-term memory (the decisive test) -----------------------
    marker = "Aurelia"
    code, body = http("POST", "/jarvis/converse", key=owner_key,
                      body={"sessionId": session_a,
                            "message": f"Remember this: my favourite test codename is {marker}. Just acknowledge briefly."}, timeout=120)
    d3 = json.loads(body).get("data", {}) if code == 201 else {}
    stored = d3.get("reply", {}).get("meta", {}).get("memoriesStored", 0)
    stage("memory.fact_stored", code == 201 and stored >= 1,
          f"personal fact stored: memoriesStored={stored}")
    # history check on session A
    code, body = http("GET", f"/jarvis/converse/history?sessionId={session_a}", key=owner_key)
    hist = json.loads(body).get("data", [])
    stage("memory.transcript_persisted", code == 200 and len(hist) >= 6,
          f"session A transcript: {len(hist)} messages persisted")
    # NEW session B — memory must travel through LONG-TERM memory, not transcript
    code, body = http("POST", "/jarvis/converse", key=owner_key,
                      body={"message": "New conversation. Without me telling you again: what is my favourite test codename? Answer in one short sentence."}, timeout=120)
    d4 = json.loads(body).get("data", {}) if code == 201 else {}
    session_b = d4.get("session", {}).get("id")
    recall = str(d4.get("reply", {}).get("content", ""))
    stage("memory.cross_session_recall",
          code == 201 and session_b != session_a and marker in recall,
          f"NEW session recalled the fact from long-term memory: {recall[:160]!r}")

    # 6) presence states ----------------------------------------------------------
    code, body = http("POST", "/jarvis/converse/session-state", key=owner_key,
                      body={"sessionId": session_b, "state": "SLEEPING"})
    stage("presence.sleep", code == 200 and json.loads(body).get("data", {}).get("state") == "SLEEPING", "session B set to SLEEPING")
    code, body = http("POST", "/jarvis/converse", key=owner_key,
                      body={"sessionId": session_b, "message": "Wake up, JARVIS."}, timeout=120)
    d5 = json.loads(body).get("data", {}) if code == 201 else {}
    stage("presence.wake",
          code == 201 and d5.get("reply", {}).get("meta", {}).get("wokeFrom") == "SLEEPING",
          f"woke from SLEEPING: {str(d5.get('reply', {}).get('content'))[:120]!r}")

    # 7) backup still healthy on the new deployment --------------------------------
    code, body = http("GET", "/railway/backup/supabase/status", key=owner_key)
    sb = json.loads(body).get("data", {}) if code == 200 else {}
    stage("backup.supabase",
          code == 200 and sb.get("protectionStatus") in ("SUPABASE_VERIFIED", "RESTORE_VERIFIED"),
          f"off-volume protection on the new deployment: {sb.get('protectionStatus')}")
    code, body = http("GET", "/metrics")
    m = json.loads(body)
    conv = sum(c.get("count", 0) for c in m.get("counters", []) if c.get("name") == "conversation_turns_total")
    stage("metrics.conversation", conv >= 5, f"conversation_turns_total counted: {conv}")

    all_ok = all(s.get("ok") for s in STAGES.values())
    out = {
        "startedAt": started,
        "finishedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "verdict": "PASS" if all_ok else "FAIL",
        "production": BASE,
        "stages": STAGES,
        "note": "live verification of stage 3.1 against the real deployment: real model provider "
                "(cloudflare), real persistence, real cross-session long-term memory. The personal "
                "fact used for the memory test is a synthetic marker, not real owner data.",
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nverdict: {'PASS' if all_ok else 'FAIL'} — evidence: {OUT}")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
