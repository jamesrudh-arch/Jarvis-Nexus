# NEXUS WORLD — Global Technology Discovery Sweep

**Date:** 2026-11-13 · **Method:** three parallel research agents pulling live
from primary sources (PyPI JSON API, npm registry via `npm view`, raw
GitHub files + release/commit Atom feeds, official docs), plus direct
in-sandbox verification (pip wheel checks, npx runs, a Godot binary test,
piper/faster-whisper/whisper.cpp benchmarks, a Playwright chromium launch).
Discovery was NOT limited to any previously supplied list (directive §1).
Every claim below traces to a URL that was actually opened; anything not
verifiable is marked UNVERIFIED.

**Outcome:** 77 register entries (13 OPERATIONAL with real-operation
evidence, 29 DEFER with precise triggers, 35 REJECT with precise reasons).
Full 15-field records: `integration/INTEGRATION_REGISTER.md`.

---

## 1. MCP servers and clients

| Technology | Licence | Status (verified) | Verdict |
|---|---|---|---|
| `mcp` official Python SDK 2.3.0 (1.x line = 1.30.0; **installed 1.27.0**) | MIT | active; v2 removes bundled FastMCP | **INTEGRATED** (1.x pinned `<2`, ADR-007) — https://pypi.org/pypi/mcp/json |
| FastMCP 4.1.8 (PrefectHQ) | Apache-2.0 | very active; 3 majors in 18 months | not adopted (duplicate of SDK's FastMCP; noted for velocity if server needs grow) — https://pypi.org/pypi/fastmcp/json |
| `@modelcontextprotocol/server-filesystem` 2.3.0 | MIT→Apache-2.0 | 2026-11-11; Node ≥24 | **INTEGRATED** (read-only, dual-gated) — npm registry |
| `mcp-server-git` / `mcp-server-fetch` / `mcp-server-time` (official) | MIT | 2026.11.11 releases | DEFER (no current need) |
| `@modelcontextprotocol/server-memory` 2.1.1 | MIT | active | DEFER (Phase 2 memory) |
| `@playwright/mcp` 0.0.85 | Apache-2.0 | 2026-11-09; **ran in sandbox** | DEFER (duplicate of direct Playwright) |
| `chrome-devtools-mcp` 1.13.0 | Apache-2.0 | 2026-11-11; needs Chrome binary | DEFER |
| `mcp-for-blender` 2.2.9 | MIT | active (2026-11-13) | REJECT this runtime (needs Blender GUI app + addon) — https://pypi.org/pypi/mcp-for-blender/json |
| `ue-mcp` 1.4.13 | MIT | very active | REJECT this runtime (needs live UE editor) — https://github.com/db-lyon/ue-mcp |
| 4 smaller Unreal MCPs (kvick-games, chongdashu, VedantRGosavi, flopperam) | — | stale/abandoned/relocated | REJECT |
| Official archived servers (puppeteer, postgres, sqlite) | MIT | archived, "NO SECURITY GUARANTEES" | REJECT — https://github.com/modelcontextprotocol/servers-archived |
| obsidian-mcp 2.0.1 (headless vault) | MIT | 2026-08 | DEFER (lore phase) |
| postgres-mcp 0.3.0 (crystaldba) | MIT | semi-active, SDK 1.x | DEFER (Tier 1 Postgres) |
| Registries | — | official registry live; mcpservers.org lists 9,800+ | discovery channels noted |

## 2. AI plugins and integrations

Covered by the MCP matrix above plus the model-provider abstraction
(`models/provider_registry.py`, Phase 1): provider plugins register behind
a single ModelRouter — the integration point for any hosted LLM, vision or
speech API. EchoProvider proves routing/error paths without credentials.

## 3. APIs and SDKs

| Technology | Licence | Verdict |
|---|---|---|
| httpx 0.28.1 (installed) + httpx-sse | BSD-3 | **INTEGRATED** (Phase 1 provider transport; streaming ready) |
| openai SDK 3.50.0 | Apache-2.0 | REJECT — pulls a second HTTP stack (httpx2+jiter); raw httpx retained |
| pydantic 2.12.5 (installed) | MIT | **INTEGRATED** (schemas) |

## 4. Open-source repositories (world-simulation domain)

Carried over from the Phase 0 evidence ledger (§29 candidate matrix):
Mesa 3.5.2 ADOPT (Phase 2 tick loop), LangGraph / Inspect AI ADOPT at
Phase 2 (credential-gated), Repast4Py PROTOTYPE, Repast HPC REJECT
(unmaintained since 2022). Zero clones were made — this phase needed
none of them (dependency inventory: minimal).

## 5. AI models and inference engines

| Technology | Licence | Verified constraint | Verdict |
|---|---|---|---|
| Hosted OpenAI-compatible API | — | needs Founder credentials | the Tier 0 ADR path (L-14 blocks Phase 2 cognition) |
| Ollama | MIT | sudo + systemd install | REJECT (blocked) |
| llama-cpp-python 0.3.36 | MIT | sdist-only → C++ compile on 2 cores | REJECT |
| onnxruntime 1.32.0 | MIT | cp312 wheel 27.8MB, CPU | DEFER (small-model path) |
| vLLM / SGLang / TRL / PEFT / LLaMA-Factory / H2O | various | GPU / 128-256GB RAM | DEFER to GPU tier (ADR-005 / directive's own rule) |

## 6. Browser automation

| Technology | Licence | Verdict |
|---|---|---|
| Playwright 1.57.0 + chromium-1200 | Apache-2.0 | **INTEGRATED** — headless launch verified in-sandbox (all shared libs resolved via `ldd`); sync API in dedicated thread per official docs |
| Stagehand 4.4.0 | MIT | DEFER (semantic browsing trigger; BYO-LLM) |
| Browserbase MCP / hosted | Apache-2.0 | DEFER (account + per-use cost) |

## 7. Computer-use systems

Anthropic computer-use demo (Docker+X11+creds), OpenAdapt (GUI desktop),
UI-TARS (7B VLM > RAM) — all DEFER/REJECT with the precise blockers
recorded. No option runs fully local-CPU headless today.

## 8. Voice and speech technologies

| Technology | Licence | In-sandbox benchmark (2 cores) | Verdict |
|---|---|---|---|
| piper-tts 1.8.0 | GPL-3.0+ | 4x realtime, 306MB RSS, 34MB wheel | **INTEGRATED** (W1: 3.53s audio in 0.2s) |
| kokoro-onnx 0.6.1 | MIT | 0.66x realtime, 402MB RSS | DEFER (quality alternative) |
| faster-whisper 1.2.1 | MIT | tiny int8 11x realtime, 447MB RSS | DEFER (Phase 2 ASR; pin `av==15.0.0` — verified breakage with av 19) |
| whisper.cpp / pywhispercpp | MIT | 172MB RSS, rootless build 90s | DEFER (lean alternative) |
| coqui-tts / kokoro-official / openai-whisper | various | torch-bound (539MB) | REJECT |

## 9. Computer vision

OpenCV headless 4.13.0.90 (Apache-2.0, installed) — **INTEGRATED**
(analysis + QR, V1–V3). Object detection deferred with onnxruntime
(YOLO-style stacks pull torch → rejected). Frigate REJECT (no cameras,
needs bare-metal Docker). CUT3R REJECT (NC licence, dormant, CUDA).

## 10. 3D modelling and animation

bpy REJECT (cp313-only wheels, 428MB — https://pypi.org/pypi/bpy/json);
trimesh DEFER (installed, Phase 4); usd-core 26.11 DEFER (28MB cp312
wheel verified, TOST-1.0); Blender via apt REJECT (no root).

## 11. Game engines and digital environments

Godot 4.7.2 headless — verified running rootless (74MB binary), DEFER (no
project/bindings today). Bevy REJECT (no Rust toolchain). UE5/CARLA REJECT
(GPU-bound, ~100GB, EULA unverified L-04 — ADR-005 stands). SUMO remains
the Phase 4 ADOPT for transport simulation (Phase 0 ledger).

## 12. Robotics and hardware interfaces

ROS 2 (root+apt+Ubuntu), Gazebo (apt-only), pyserial/pyfirmata (zero
serial hardware) — all REJECT with verified reasons. No robotic hardware
exists in any tier of this deployment today.

## 13. Data processing and databases

SQLite (stdlib, WAL + STRICT tables + JSON1 + `VACUUM INTO` verified in
this interpreter) — **INTEGRATED**. DuckDB 2.0.0 DEFER (OLAP at Tier 1).
PostgreSQL + NATS on Railway — DECIDED at Tier 1 (ADR-001/002); NATS-on-
Railway has no official guide (404 — deploy path UNVERIFIED). Alembic
DEFER (hand-rolled migration table suffices).

## 14. Creative production software

imageio-ffmpeg 0.6.0 (installed; BSD-2; bundles ffmpeg n9.0.2) DEFER
until timeline rendering; pydub DEFER (stale, thin sugar); static ffmpeg
builds REJECT (site unreachable from sandbox — HTTP 000 verified).

## 15. Deployment and infrastructure

Railway CLI — root-free installable, BLOCKED ON CREDENTIALS (login needs
account/browser/token; none supplied). Docker REJECT (no daemon, no
root). PythonAnywhere / Fly.io — creds-gated, one line each. uvicorn
`--workers 1` constraint documented (SQLite single writer). PC runtime =
this sandbox (operational). iPhone/Kaggle runtimes — no hardware/no
requirement (Phase 0 audit Part G blockers stand).

## 16. Monitoring and security systems

prometheus_client **INTEGRATED** (/metrics, O1–O2/A1/A5). psutil system
gauges INTEGRATED (pre-present). stdlib JSON logging INTEGRATED (structlog
/ loguru REJECTED — zero-dep). Grafana DEFER (Tier 1, AGPL). OTel DEFER
(Tier 1). bandit **INTEGRATED** (SAST; found→remediated loop recorded).
pip-audit **INTEGRATED** (CVE scan; found 5 starlette CVEs → fastapi
0.162.6/starlette 1.10.0 upgrade → clean re-scan). safety REJECT
(account-gated). semgrep DEFER (72MB, Tier 1 CI). trufflehog-PyPI REJECT
(abandoned 2021, AGPL). detect-secrets DEFER (slowing; pre-commit stage).

---

## Cross-cutting findings (honest record)

1. **The npm/npx environment stripping issue:** the MCP SDK's default
   child environment omits `HOME`, which makes `npx` hang indefinitely
   (verified empirically). The integration layer therefore passes a
   credential-stripped full environment — documented in ADR-007.
2. **Thread-safety landmines verified, not assumed:** Playwright sync API
   refuses to run inside asyncio loops; `threading.Thread` attribute
   `_stop` is reserved. Both handled in code with comments.
3. **QR encoder quirk:** OpenCV's `QRCodeEncoder` output already includes
   its quiet zone; adding a border breaks `QRCodeDetector` (verified).
4. **Unverifiable items** (never claimed): Railway end-to-end deploy;
   NATS-on-Railway guide (404); 2-core 1B-LLM tokens/s (no credible
   primary source).
