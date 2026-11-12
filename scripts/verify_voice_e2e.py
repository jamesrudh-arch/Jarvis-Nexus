#!/usr/bin/env python3
"""
JARVIS NEXUS session 7 — REAL voice round-trip + switch-gate E2E.

Verifies with REAL service calls (z-ai TTS/ASR via the app's own routes):
  V1  Speech synthesis: /api/v1/conversations/send reply carries base64 WAV
      audio (RIFF header, non-trivial duration).
  V2  Speech recognition round-trip: the synthesized WAV posted back to
      /api/v1/asr returns a transcript that overlaps the spoken sentence.
  V3  MIC gate: microphone OFF -> voice modality 403; ON -> accepted.
  V4  CAM gate: camera OFF -> vision modality 403.
  V5  MASTER gate (session-7 fix): master OFF -> voice modality 403 even with
      mic ON (server-side kill, not just UI state). Restore afterwards.

Honest scope: browser-side wake-word/mic capture needs real audio hardware —
covered separately by unit tests (wake word decision core) and the headless
degradation check (WAKE DENIED chip on the live page).
"""
import base64
import io
import json
import struct
import sys
import urllib.error
import urllib.request
import wave

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"

results = []


def check(name, ok, detail=""):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def patch_switch(key, enabled):
    st, body = req("PATCH", f"/api/v1/switches/{key}", {"enabled": enabled})
    return st == 200 and body.get("world", {}).get("switches", {}).get(key) == enabled


# --- V1: real TTS via the conversation route -------------------------------
SENTENCE_MARKER = "sanctuary turbine diagnostics nominal"
st, r = req("POST", "/api/v1/conversations/send",
            {"content": f"Say exactly this: {SENTENCE_MARKER}.", "modality": "text"})
audio_b64 = (r.get("jarvis_message") or {}).get("audio") or r.get("audio") or ""
wav_ok = False
duration = 0
if audio_b64:
    raw = base64.b64decode(audio_b64)
    wav_ok = raw[:4] == b"RIFF" and raw[8:12] == b"WAVE"
    if wav_ok:
        with wave.open(io.BytesIO(raw)) as w:
            duration = w.getnframes() / w.getframerate()
check("V1 speech synthesis returns real WAV audio (RIFF, "
      f"{len(base64.b64decode(audio_b64)) if audio_b64 else 0} bytes)",
      wav_ok and duration >= 0.8, f"duration={duration:.2f}s")

# --- V2: real ASR round-trip -----------------------------------------------
transcript = ""
if wav_ok:
    st, body = req("POST", "/api/v1/asr", {"audio_base64": audio_b64})
    transcript = (body or {}).get("text", "")
    words = set(SENTENCE_MARKER.split())
    overlap = len(words & set(transcript.lower().split())) / len(words)
    check("V2 speech recognition round-trip (synthesized voice -> transcript)",
          st == 200 and overlap >= 0.3,
          f"overlap={overlap:.0%} transcript=\"{transcript[:80]}\"")
else:
    check("V2 speech recognition round-trip", False, "skipped: no synthesized audio")

# --- V3: MIC gate ------------------------------------------------------------
assert patch_switch("microphone", False), "could not set microphone OFF"
st, body = req("POST", "/api/v1/conversations/send",
               {"content": "voice test", "modality": "voice"})
check("V3 MIC OFF -> voice modality rejected 403",
      st == 403 and "Microphone" in body.get("detail", ""), body.get("detail", "")[:60])
patch_switch("microphone", True)
st, body = req("POST", "/api/v1/conversations/send",
               {"content": "mic gate check", "modality": "voice"})
check("V3a MIC ON -> voice modality accepted", st == 200)

# --- V4: CAM gate ------------------------------------------------------------
assert patch_switch("camera", False), "could not set camera OFF"
st, body = req("POST", "/api/v1/conversations/send",
               {"content": "vision test", "modality": "vision"})
check("V4 CAM OFF -> vision modality rejected 403",
      st == 403 and "Camera" in body.get("detail", ""), body.get("detail", "")[:60])
patch_switch("camera", True)

# --- V5: MASTER gate (session-7 fix) ----------------------------------------
assert patch_switch("master", False), "could not set master OFF"
st, body = req("POST", "/api/v1/conversations/send",
               {"content": "master gate check", "modality": "voice"})
check("V5 MASTER OFF -> voice modality rejected 403 even with MIC ON",
      st == 403 and "MASTER" in body.get("detail", ""), body.get("detail", "")[:70])
st, body = req("POST", "/api/v1/conversations/send",
               {"content": "text still allowed while master down", "modality": "text"})
check("V5a text modality unaffected by MASTER (text is not a sensor)",
      st == 200)
patch_switch("master", True)
st, body = req("POST", "/api/v1/conversations/send",
               {"content": "restored", "modality": "voice"})
check("V5b MASTER restored -> voice accepted again", st == 200)

ok = sum(1 for _, o in results if o)
print(f"\n=== {ok}/{len(results)} voice/gate checks passed ===")
sys.exit(0 if ok == len(results) else 1)
