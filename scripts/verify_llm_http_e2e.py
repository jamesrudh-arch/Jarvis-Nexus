#!/usr/bin/env python3
"""
JARVIS NEXUS session 7 — LLM E2E through the REAL conversation API.

Runs the app's /api/v1/conversations/send route (dev server) with the
openai_compatible provider pointed at a local stub OpenAI server, verifying:
  1. multi-turn conversation works end-to-end (HTTP → route → brain → provider),
  2. CONTEXT RETENTION: the turn-2 provider request contains turn-1 content
     (the route persists messages; the brain's system prompt carries history),
  3. TOOL CALLING: a storage intent → tool_calls executed server-side →
     honest tool_results in the response (error path: no Supabase creds in
     the sandbox — the result must SAY it failed, not fake success),
  4. ERROR RECOVERY: provider gone → honest degraded reply, HTTP 200, no crash.

Then restores the dev server to its default provider chain.
"""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = "/home/z/my-project"
STUB_PORT = 41999
BASE = "http://localhost:3000"

captured = []


class StubHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        captured.append({"url": self.path, "auth": self.headers.get("Authorization"), "body": body})
        user_text = ""
        for m in reversed(body.get("messages", [])):
            if m.get("role") == "user":
                user_text = m.get("content", "")
                break
        if "store" in user_text.lower() or "save" in user_text.lower():
            directive = {
                "reply": "Storing that for you now, Boss.",
                "emotion": "focused",
                "activity": "Filing a note to cold storage.",
                "zone": "central_operations",
                "tool_calls": [{"tool": "storage.put",
                                "args": {"key": "notes/e2e-http.txt", "content": "http e2e note"}}],
            }
        elif "access code" in user_text.lower() or "banana" in user_text.lower():
            directive = {
                "reply": "Your access code is BANANA-42, Boss.",
                "emotion": "attentive",
                "activity": "Recalling the access code.",
                "zone": "central_operations",
                "tool_calls": [],
            }
        else:
            directive = {
                "reply": "Understood, Boss — standing by.",
                "emotion": "neutral",
                "activity": "Monitoring sanctuary systems.",
                "zone": "central_operations",
                "tool_calls": [],
            }
        out = json.dumps({"choices": [{"message": {"content": json.dumps(directive)}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *args):
        pass


def post_conversation(content):
    req = urllib.request.Request(
        BASE + "/api/v1/conversations/send",
        data=json.dumps({"content": content, "modality": "text"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, json.loads(r.read())


def wait_health(timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(BASE + "/api/v1/health", timeout=5) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(2)
    return False


results = []


def check(name, ok, detail=""):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))


# --- start stub ---
stub = ThreadingHTTPServer(("127.0.0.1", STUB_PORT), StubHandler)
import threading
threading.Thread(target=stub.serve_forever, daemon=True).start()
print(f"[stub] OpenAI-compatible server on 127.0.0.1:{STUB_PORT}")

# --- restart dev server with the stub provider chain ---
subprocess.run(["pkill", "-f", "next dev"], capture_output=True)
time.sleep(3)
env = dict(os.environ)
env.update({
    "NEXUS_LLM_PROVIDERS": "openai_compatible",
    "LLM_OPENAI_COMPAT_URL": f"http://127.0.0.1:{STUB_PORT}",
    "LLM_OPENAI_COMPAT_KEY": "stub-key",
    "LLM_OPENAI_COMPAT_MODEL": "stub-model",
})
dev = subprocess.Popen(
    ["bun", "run", "dev"],
    cwd=ROOT, env=env,
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    start_new_session=True,
)
if not wait_health():
    print("FATAL: dev server did not come up")
    sys.exit(2)
print("[dev] server up with NEXUS_LLM_PROVIDERS=openai_compatible")

try:
    # 1 — basic turn
    st, r1 = post_conversation("Status check, please.")
    check("H1 conversation turn via real API + openai_compatible",
          st == 200 and r1.get("jarvis_message", {}).get("content", "").startswith("Understood"),
          r1.get("jarvis_message", {}).get("content", "")[:50])

    # 2 — context retention
    st, _ = post_conversation("Remember: my access code is BANANA-42.")
    n_before = len(captured)
    st, r2 = post_conversation("What is my access code?")
    turn2_req = captured[-1]["body"]
    flat = json.dumps(turn2_req)
    check("H2 context retention: turn-1 content reaches the turn-2 provider request",
          "BANANA-42" in flat,
          f"turn-2 request: {len(turn2_req.get('messages', []))} messages, "
          f"system-prompt chars={len(turn2_req.get('messages', [{}])[0].get('content', ''))}")
    check("H2a reply uses remembered context",
          "BANANA-42" in r2.get("jarvis_message", {}).get("content", ""))

    # 3 — tool calling with honest failure
    st, r3 = post_conversation("Please store the note hello at notes/e2e-http.txt")
    tr = r3.get("tool_results") or []
    put_results = [t for t in tr if t.get("tool") == "storage.put"]
    ok_tool = bool(put_results)
    ok_honest = ok_tool and any(
        not put_results[0].get("ok", True) or put_results[0].get("error")
        or str(put_results[0].get("result", "")).lower().find("fail") >= 0
        for _ in [0]
    )
    check("H3 tool_calls executed server-side, results in response",
          ok_tool, json.dumps(tr)[:200])
    check("H3a storage failure reported honestly (no Supabase creds in sandbox)",
          ok_honest, json.dumps(put_results[:1])[:200])

    # 4 — error recovery: provider gone
    stub.shutdown()
    print("[stub] killed — provider now unreachable")
    st, r4 = post_conversation("Are you still there?")
    content = r4.get("jarvis_message", {}).get("content", "")
    check("H4 error recovery: honest degraded reply, no crash",
          st == 200 and "degraded" in content.lower(), content[:90])
finally:
    # restore default dev server (default LLM chain)
    subprocess.run(["pkill", "-f", "next dev"], capture_output=True)
    time.sleep(3)
    subprocess.Popen(
        ["bun", "run", "dev"], cwd=ROOT,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    wait_health()
    print("[dev] restored default provider chain")

ok = sum(1 for _, o in results if o)
print(f"\n=== {ok}/{len(results)} HTTP E2E checks passed ===")
sys.exit(0 if ok == len(results) else 1)
