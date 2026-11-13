"""Gate 0 Item 4 — behavioral probe against BASELINE code (commit 1fb4384).

Proves the pre-hardening package download accepted exactly what Item 4 now
rejects. Run from inside the baseline worktree.
"""
import io
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))  # worktree root: make `backend` importable

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.config import WORKER_PKG_DIR

client = TestClient(app)
client.__enter__()

profs = client.get("/api/v1/compute/kaggle/profiles").json()
pid = profs[0]["id"]

# 1) Baseline accepts non-wss schemes and unlisted hosts, and even no param at
#    all (a default placeholder is embedded).
for label, url in [
    ("ws:// (not TLS)", "ws://evil.example/ws/worker"),
    ("http://", "http://evil.example/ws/worker"),
    ("unlisted host", "wss://evil.example/ws/worker"),
    ("query string", "wss://evil.example/ws/worker?token=in-url"),
    ("wrong path", "wss://evil.example/other"),
]:
    r = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": url} if "default" not in label else {})
    print(f"OLD CODE package core_wss_url={label!r} -> {r.status_code}")
    print("  (new code asserts 400 for all of these => test FAILS on old code, PASSES on new)")

r0 = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package")
print(f"OLD CODE package with NO core_wss_url param -> {r0.status_code} (placeholder URL embedded)")
print("  (new code requires the param => test FAILS on old code, PASSES on new)")

# 2) Baseline writes a deterministic filename and never deletes it after download.
fname = next(p.split("=", 1)[1].strip('"') for p in r0.headers["content-disposition"].split(";") if p.strip().startswith("filename="))
print(f"OLD CODE package file after download: exists={(WORKER_PKG_DIR / fname).exists()} ({fname})")
print("  (new code deletes after download + TTL sweep => test FAILS on old code, PASSES on new)")

# 3) Baseline embeds whatever URL it was given, unvalidated, into the notebook.
r_embed = client.get(f"/api/v1/compute/kaggle/profiles/{pid}/package", params={"core_wss_url": "ws://evil.example/ws/worker"})
zf = zipfile.ZipFile(io.BytesIO(r_embed.content))
nb = zf.read("jarvis_kaggle_worker.ipynb").decode("utf-8")
print(f"OLD CODE notebook embeds unvalidated 'ws://evil.example/ws/worker': {'ws://evil.example/ws/worker' in nb}")
print("  (new code refuses to build the package for that URL => test FAILS on old code, PASSES on new)")
