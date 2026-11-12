#!/usr/bin/env python3
"""TEST SUBSTITUTE gateway (Directive §27) — mimics the contract of
scripts/a2f_gateway.py WITHOUT any NVIDIA dependency: returns a synthetic but
well-formed ARKit face track with a recognizable fingerprint (cheekPuff pinned
at 0.42 — the local rule engines NEVER drive cheekPuff; jawOpen follows a slow
full-range sine). Used ONLY to verify the in-app chain end-to-end:

  provider -> runFacialAnimation -> synthesizeVoice -> send route -> client
  -> character.speak -> faceCurve sampling -> _setMorph on the live face.

Run: python3 scripts/mock_a2f_gateway.py   (port 8090)
Then start the app with A2F_SERVICE_URL=http://localhost:8090
"""
import math
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

FPS = 30
DURATION_MS = 3200


def build_track():
    frames = int(DURATION_MS / 1000 * FPS)
    t = [i / FPS for i in range(frames)]
    jaw = [round(0.5 - 0.5 * math.cos(2 * math.pi * f * 0.9), 4) for f in t]  # 0..1 sine
    curves = {
        "jawOpen": jaw,
        "mouthClose": [round(1 - v, 4) for v in jaw],
        "browInnerUp": [round(0.3 + 0.2 * math.sin(f * 5), 4) for f in t],
        "cheekPuff": [0.42] * frames,  # fingerprint: constant, never driven locally
        "mouthSmileLeft": [0.15] * frames,
        "mouthSmileRight": [0.15] * frames,
    }
    return {"fps": FPS, "durationMs": DURATION_MS, "curves": curves}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ready": True, "stub": True}).encode())

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        body = json.loads(self.rfile.read(n) or b"{}")
        print(f"[mock-a2f] request: mime={body.get('mime')} emotion={body.get('emotion')} "
              f"audio~{len(body.get('audio_base64', '')) // 1024}KB -> synthetic track")
        track = build_track()
        payload = json.dumps(track).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print("[mock-a2f] TEST SUBSTITUTE listening on :8090")
    HTTPServer(("127.0.0.1", 8090), Handler).serve_forever()
