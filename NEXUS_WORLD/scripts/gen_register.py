#!/usr/bin/env python3
"""Generate integration/register.json + INTEGRATION_REGISTER.md.

The register is the durable ledger required by the Mandatory System-Wide
Integration Directive §5. States and evidence reflect the ACTUAL runs
recorded in reports/INTEGRATION_TEST_OUTPUT.txt and
reports/SECURITY_SCAN_OUTPUT.txt — nothing is marked OPERATIONAL that did
not pass a real operation in this environment.

Re-run from NEXUS_WORLD/:  python3 scripts/gen_register.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from integration.register import IntegrationRecord, IntegrationRegister

IX_EV = "reports/INTEGRATION_TEST_OUTPUT.txt"
SEC_EV = "reports/SECURITY_SCAN_OUTPUT.txt"
P1_EV = "reports/PHASE1_TEST_OUTPUT.txt"

reg = IntegrationRegister()


def E(**kw) -> None:
    reg.upsert(IntegrationRecord(**kw))


# =====================================================================
# OPERATIONAL — real connections, registered, tested with evidence
# =====================================================================
E(name="MCP Integration Layer (official mcp SDK)", category="MCP client infrastructure",
  provider="modelcontextprotocol (Anthropic + community)",
  repo_url="https://github.com/modelcontextprotocol/python-sdk",
  purpose="Reusable MCP client: discovery, tool schemas, permissions, execution, error mapping, JSON logging, health monitoring (directive §3)",
  integration_method="Python package (mcp 1.27.0, 1.x line pinned <2) wrapped by integration/mcp_layer.py; one worker thread + event loop per stdio server",
  install_status="installed (pre-present in env, pinned mcp>=1.27,<2)",
  connection_status="connected — 2 live stdio servers (filesystem via npx; jarvis self-exposure via python -m)",
  orchestrator_registration="every allowed tool registered as mcp.<server>.<tool>",
  operational_test="PASS — M1-M8 (filesystem server), J1-J6 (self-exposure), X1-X5 (orchestrated)",
  security_assessment="credential-stripped child env (TOKEN/SECRET/PASSWORD/API_KEY/CREDENTIAL patterns removed); per-server tool allowlist; hard call timeouts; error taxonomy never leaks SDK exceptions",
  licensing="MIT",
  deployment_location="Tier 0 sandbox (in-process, integration/mcp_layer.py)",
  limitations="stdio transport only (Streamable HTTP at Tier 1); SDK 2.x removes bundled FastMCP — upgrade needs the exposure server migrated",
  evidence=f"{IX_EV} checks M1-M8, J1-J6, X1-X5",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="core directive requirement; dual-gated (layer allowlist + server --read-only)")

E(name="Filesystem MCP Server", category="MCP server — file & workspace",
  provider="modelcontextprotocol reference servers",
  repo_url="https://github.com/modelcontextprotocol/servers (npm @modelcontextprotocol/server-filesystem)",
  purpose="Sandboxed read-only file access for JARVIS agents (workspace inspection)",
  integration_method="spawned via npx -y @modelcontextprotocol/server-filesystem --read-only <root>; 8-tool read-only allowlist",
  install_status="installed (npx cache; package 2.3.0, requires Node >=24 — host has 24.22.2)",
  connection_status="connected — initialize + list_tools handshake completed (10 tools discovered)",
  orchestrator_registration="8 capabilities: mcp.filesystem.{list_directory,read_text_file,read_multiple_files,get_file_info,directory_tree,search_files,list_allowed_directories,list_directory_with_sizes}",
  operational_test="PASS — M1-M8: list/read/tree real calls, allowlist denial, error mapping, health counters",
  security_assessment="DUAL gate: server-side --read-only (write tools not even served — verified M1b) + layer allowlist (M6); confined to NEXUS_MCP_FS_ROOT",
  licensing="MIT → Apache-2.0 transition in the servers repo (both permissive)",
  deployment_location="Tier 0 sandbox (subprocess via npx)",
  limitations="reference server — explicitly educational, not production-hardened (upstream README); Node 24 runtime dependency; cold npx start needs network once",
  evidence=f"{IX_EV} checks M1-M8",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="mandated file/workspace MCP category; read-only scope matches Tier 0 risk posture")

E(name="JARVIS MCP Server (self-exposure)", category="MCP server — platform exposure",
  provider="NEXUS WORLD (this repository)",
  repo_url="integration/mcp_server_expose.py",
  purpose="Expose world status/geography/ticks/capabilities/commands to external MCP clients through the SAME orchestrator + permission system (directive §2.7-2.8)",
  integration_method="mcp SDK FastMCP over stdio; python -m integration.mcp_server_expose --db ... --token ...",
  install_status="built (module in repo)",
  connection_status="connected — external-client round-trip proven by connecting TO it through the MCP layer",
  orchestrator_registration="tools route through CommandOrchestrator (one authority, two transports)",
  operational_test="PASS — J1-J6: status matches db, run_ticks persists (tick 0→5), wrong token rejected, observer/permission path enforced, capabilities listed",
  security_assessment="stdio has no headers → founder token is a per-call arg; wrong/missing token maps to OBSERVER role and the single permission path rejects mutations (verified J4/J5)",
  licensing="project licence (same as repo)",
  deployment_location="Tier 0 sandbox (subprocess on demand)",
  limitations="per-call token auth (stdio transport constraint, documented); one db per server process",
  evidence=f"{IX_EV} checks J1-J6",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="directive requires exposing capabilities through MCP, not just consuming")

E(name="Playwright", category="Browser automation",
  provider="Microsoft", repo_url="https://github.com/microsoft/playwright-python",
  purpose="Headless chromium automation: navigate, extract text/links, screenshot (computer-use substrate)",
  integration_method="sync API in ONE dedicated worker thread (official constraint: sync API is not thread-safe and must not run inside asyncio); integration/browser.py",
  install_status="installed (playwright 1.57.0 + chromium-1200 browser binaries)",
  connection_status="connected — real chromium 143 launches, renders, closes cleanly",
  orchestrator_registration="browser.navigate / browser.screenshot / browser.links",
  operational_test="PASS — B1-B4 (local fixture + live https://example.com 200), X1 orchestrated screenshot",
  security_assessment="headless, no credentials stored; navigation timeouts enforced; screenshot path caller-supplied (EXTERNAL action class + founder approval required)",
  licensing="Apache-2.0",
  deployment_location="Tier 0 sandbox (in-process thread)",
  limitations="fresh hosts need chromium system libs (deb.deps list; verified present here); sync API single-thread constraint; no interaction ops yet (click/type land with computer-use phase)",
  evidence=f"{IX_EV} checks B1-B4, X1-X2",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="chosen over Stagehand (deferred) and browser MCPs (duplicate capability) per directive Part 3 evaluation")

E(name="OpenCV (headless)", category="Computer vision",
  provider="OpenCV", repo_url="https://github.com/opencv/opencv-python",
  purpose="Torch-free CPU image analysis (dimensions, colour, edges, sharpness, QR)",
  integration_method="opencv-python-headless 4.13.0.90 via integration/vision.py",
  install_status="installed (pre-present, verified Apache-2.0)",
  connection_status="n/a (library, in-process)",
  orchestrator_registration="vision.analyze_image / vision.decode_qr",
  operational_test="PASS — V1 (known fixture 64x32x3), V2 (QR encode→decode roundtrip), V3 (screenshot analysis)",
  security_assessment="pure computation on caller-supplied images; no network; base64 input validated",
  licensing="Apache-2.0",
  deployment_location="Tier 0 sandbox (in-process)",
  limitations="no object detection (needs ONNX models — deferred with onnxruntime entry); QR encoder output includes its own quiet zone (extra border breaks the detector — documented in code)",
  evidence=f"{IX_EV} checks V1-V3",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="strongest existing CPU vision implementation; zero new dependencies")

E(name="piper-tts", category="Voice / speech (TTS)",
  provider="Open Home Foundation (OHF-Voice/piper1-gpl)",
  repo_url="https://github.com/OHF-Voice/piper1-gpl",
  purpose="Local CPU text-to-speech (JARVIS voice output without cloud credentials)",
  integration_method="piper-tts 1.8.0 + en_US-lessac-medium ONNX voice (63 MB) via integration/voice.py",
  install_status="installed (wheel 34 MB + onnxruntime; voice model downloaded from huggingface.co/rhasspy/piper-voices)",
  connection_status="n/a (local inference)",
  orchestrator_registration="voice.synthesize (EXTERNAL action class → founder approval)",
  operational_test="PASS — W1: 3.53s of 22.05kHz PCM16 WAV synthesised in 0.2s wall (~17x realtime on 2 cores)",
  security_assessment="fully local; no network at synthesis time; model file pinned by path",
  licensing="GPL-3.0-or-later (piper code) — internal use; Apache-2.0 voice data. DISTRIBUTION of binaries would trigger GPL obligations (flagged for Founder decision at deployment tier)",
  deployment_location="Tier 0 sandbox (in-process, lazy model load)",
  limitations="English voice only (more voices are downloads); GPL licence scope note above",
  evidence=f"{IX_EV} check W1",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="research benchmark: 4x realtime at 306 MB RSS, torch-free — best CPU TTS; kokoro-onnx deferred as quality alternative")

E(name="prometheus_client", category="Monitoring & observability",
  provider="Prometheus (CNCF)", repo_url="https://github.com/prometheus/client_python",
  purpose="Metrics exposition: commands, tool calls, latency histogram, world tick/events gauges, MCP server up, process CPU/RAM",
  integration_method="0.24.1 via observability/metrics.py; GET /metrics (direct generate_latest route — avoids the /metrics vs /metrics/ 307 redirect)",
  install_status="installed (pre-present, verified Apache-2.0)",
  connection_status="n/a (library)",
  orchestrator_registration="InstrumentedOrchestrator wraps the single central orchestrator (telemetry only)",
  operational_test="PASS — O1-O2 (exposition + tick gauge), A1/A5 (HTTP endpoint before/after traffic)",
  security_assessment="read-only exposition; no external push gateway",
  licensing="Apache-2.0",
  deployment_location="Tier 0 sandbox (FastAPI route)",
  limitations="counters are per-process (Tier 0 single process by design); no scrape persistence",
  evidence=f"{IX_EV} checks O1-O2, A1, A5",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="zero new deps; Grafana/OTel deferred to Tier 1")

E(name="JSON structured logging (stdlib)", category="Monitoring & observability",
  provider="Python stdlib", repo_url="https://docs.python.org/3/library/logging.html",
  purpose="Structured JSON log lines for every integration operation (directive: logging requirement)",
  integration_method="observability/metrics.py JsonFormatter + setup_logging — zero dependencies",
  install_status="built-in",
  connection_status="n/a",
  orchestrator_registration="n/a (cross-cutting)",
  operational_test="PASS — structured lines present in the recorded run output (mcp.connect.ok / mcp.call.ok / browser.launched events)",
  security_assessment="no credentials ever logged (tokens stripped from child env AND never logged)",
  licensing="PSF",
  deployment_location="Tier 0 sandbox (stdout)",
  limitations="single-stream stdout at Tier 0; log shipping at Tier 1",
  evidence=f"{IX_EV} (JSON event lines throughout)",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="structlog/loguru REJECTED as unjustified dependencies (see below)")

E(name="FastAPI + uvicorn", category="API framework",
  provider="FastAPI project / encode", repo_url="https://github.com/fastapi/fastapi",
  purpose="World API gateway: 11 Phase-1 endpoints + additive /metrics, /integrations, /integrations/health",
  integration_method="fastapi 0.162.6 + uvicorn 0.44.0 (workers=1 — SQLite single writer)",
  install_status="installed; UPGRADED 0.128.0 → 0.162.6 during this phase to clear 5 starlette CVEs",
  connection_status="connected (TestClient + live uvicorn in Phase 1 evidence)",
  orchestrator_registration="POST /command routes through the central orchestrator; external capabilities reachable (A4)",
  operational_test=f"PASS — Phase 1 suite 48/48 re-run on the upgraded stack; integration A1-A5",
  security_assessment="pip-audit clean post-upgrade; token auth 401/403 verified in Phase 1; TLS/rate-limiting remain deployment-tier",
  licensing="MIT (fastapi) / BSD-3 (uvicorn, starlette)",
  deployment_location="Tier 0 sandbox; Railway at Tier 1 (creds pending)",
  limitations="workers must stay 1 at Tier 0 (SQLite single writer, L-11)",
  evidence=f"{P1_EV} 48/48 on upgraded stack; {IX_EV} A1-A5; {SEC_EV} section 2-4",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="established architecture component; security-patched this phase")

E(name="SQLite event store (stdlib sqlite3)", category="Data / event store",
  provider="SQLite", repo_url="https://www.sqlite.org",
  purpose="Authoritative append-only event log + projections (event-sourced world state)",
  integration_method="stdlib sqlite3; WAL; check_same_thread=False + writer RLock added this phase for FastAPI threadpool safety",
  install_status="built-in (SQLite 3.53.1 bundled with Python)",
  connection_status="n/a (embedded)",
  orchestrator_registration="WorldStore backs every orchestrator command + audit",
  operational_test="PASS — Phase 0 11/11, Phase 1 48/48 (incl. replay/restart/determinism), integration X3-X4 (audit + idempotency through external tools)",
  security_assessment="SQL injection scan clean (bandit B608 remediated to constant parameterised queries); single-writer by design",
  licensing="Public domain",
  deployment_location="Tier 0 sandbox (file); PostgreSQL at Tier 1 (ADR-001)",
  limitations="single writer process (L-11); no concurrent multi-writer until Tier 1",
  evidence=f"{SEC_EV}; {P1_EV}; {IX_EV} X3-X4",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="strongest existing implementation for Tier 0; DuckDB/Postgres deferred by tier")

E(name="Central orchestrator + permission system", category="Platform core (internal)",
  provider="NEXUS WORLD (this repository)",
  repo_url="orchestration/command.py + security/permissions.py",
  purpose="THE single authority (directive Part 6): intent → permission → approval → execute → audit; idempotent by command_id",
  integration_method="CommandOrchestrator + InstrumentedOrchestrator (telemetry wrapper); capability registry is the integration point for ALL tools",
  install_status="built (Phase 1, extended this phase)",
  connection_status="n/a (in-process)",
  orchestrator_registration="IS the orchestrator: 2 built-ins + 8 MCP filesystem + 3 browser + 2 vision + 1 voice capabilities registered in the acceptance run",
  operational_test="PASS — X1-X5 (approval gate, multi-tool workflow, audit trail, idempotency, unknown-capability rejection), J5 (permission path through MCP transport)",
  security_assessment="action classes observe→irreversible; EXTERNAL/IRREVERSIBLE require explicit approval (verified X1); observers read-only",
  licensing="project licence",
  deployment_location="Tier 0 sandbox",
  limitations="approval UX is a boolean flag at Tier 0 (interactive approval flow at Tier 1)",
  evidence=f"{IX_EV} X1-X5, J5; {P1_EV} C/D sections",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="directive Part 6: one orchestrator, everything registers here")

E(name="bandit", category="Security tooling",
  provider="PyCQA", repo_url="https://github.com/PyCQA/bandit",
  purpose="Python SAST scan of the repository (security assessment evidence)",
  integration_method="pip install bandit==1.9.4; bandit -r . -x ./tests",
  install_status="installed (1.9.4)",
  connection_status="n/a (scanner)",
  orchestrator_registration="n/a (dev tooling)",
  operational_test="PASS — full scan executed twice (found 3 Medium → remediated 1, accepted 2 with justification); 0 High",
  security_assessment="is itself the assessment tool; findings + remediation recorded",
  licensing="Apache-2.0",
  deployment_location="Tier 0 sandbox (dev-time)",
  limitations="AST-based Python only (no dependency analysis — pip-audit covers that)",
  evidence=SEC_EV + " (sections 1-3)",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="account-free SAST; semgrep deferred as heavier Tier 1 option")

E(name="pip-audit", category="Security tooling",
  provider="Python Packaging Authority (pypa)", repo_url="https://github.com/pypa/pip-audit",
  purpose="Dependency CVE scanning against the PyPI advisory database",
  integration_method="pip install pip-audit==2.10.1; pip-audit -r requirements.txt",
  install_status="installed (2.10.1)",
  connection_status="n/a (scanner; queries PyPI advisory service — network verified)",
  orchestrator_registration="n/a (dev tooling)",
  operational_test="PASS — found 5 real CVEs in starlette 0.50.0 → remediated by upgrade → re-scan clean",
  security_assessment="is itself the assessment tool; the found→fixed→verified loop is recorded end-to-end",
  licensing="Apache-2.0",
  deployment_location="Tier 0 sandbox (dev-time)",
  limitations="scans pinned requirements only (whole-venv scan would flag unrelated preinstalled packages)",
  evidence=SEC_EV + " (sections 1-4)",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="account-free CVE scanning; safety REJECTED (account-gated)")


# =====================================================================
# DEFERRED — evaluated, approved-in-principle, precise trigger recorded
# =====================================================================
def D(name, category, provider, url, purpose, reason, limitations="",
      licensing="see provider", security="not yet assessed in depth"):
    E(name=name, category=category, provider=provider, repo_url=url,
      purpose=purpose,
      integration_method="none (deferred)",
      install_status="not installed",
      connection_status="never connected",
      orchestrator_registration="not registered",
      operational_test="not tested (deferred before integration)",
      security_assessment=security, licensing=licensing,
      deployment_location="planned: Tier 0 sandbox or Tier 1",
      limitations=limitations, evidence="research/TECHNOLOGY_DISCOVERY_SWEEP.md",
      state="EVALUATED", decision="DEFER", decision_reason=reason)


D("Stagehand", "Browser automation", "Browserbase", "https://github.com/browserbase/stagehand",
  "AI-driven semantic browsing (natural-language page actions)",
  "no semantic-browsing requirement yet; direct Playwright covers current needs; MIT + v4.4.0 verified healthy — integrate when residents browse by intent",
  "BYO-LLM callback needs LLM credentials (Phase 2 dependency)")
D("@playwright/mcp", "Browser automation (MCP)", "Microsoft", "https://github.com/microsoft/playwright-mcp",
  "Browser automation exposed as an MCP server (accessibility-tree based)",
  "duplicate capability vs direct Playwright integration (directive §6 rejects duplicates); revisit when EXTERNAL MCP clients need browser control",
  "verified runnable in this sandbox (npx --version 0.0.85)")
D("chrome-devtools-mcp", "Browser automation (MCP)", "ChromeDevTools", "https://github.com/ChromeDevTools/chrome-devtools-mcp",
  "DevTools-grade network/console/perf control",
  "secondary to Playwright; requires a Chrome/Chrome-for-Testing binary download + shared-lib check first",
  "telemetry on by default (opt-out env)")
D("mcp-server-git (official)", "MCP server — development", "modelcontextprotocol", "https://github.com/modelcontextprotocol/servers",
  "Git repository operations over MCP",
  "repository managed directly with git CLI; no agent-driven git need yet")
D("mcp-server-fetch (official)", "MCP server — web fetch", "modelcontextprotocol", "https://github.com/modelcontextprotocol/servers",
  "URL fetching for LLM agents",
  "browser.navigate + httpx provider cover fetching; add when an LLM agent needs raw-fetch tool semantics")
D("mcp-server-time (official)", "MCP server — time", "modelcontextprotocol", "https://github.com/modelcontextprotocol/servers",
  "Time/timezone conversion over MCP",
  "the world clock is the authoritative time source inside the simulation")
D("@modelcontextprotocol/server-memory", "MCP server — memory", "modelcontextprotocol", "https://github.com/modelcontextprotocol/servers",
  "Knowledge-graph memory server",
  "Phase 2 resident-memory subsystem will decide between this, Graphiti, and a Postgres schema (L-05)",
  "Node >=24 required (host matches)")
D("obsidian-mcp", "MCP server — workspace/lore", "StevenStavrakis", "https://github.com/StevenStavrakis/obsidian-mcp",
  "Headless markdown vault (world lore) — Obsidian app NOT required",
  "lore/codex subsystem arrives with narrative phases; verified headless-capable")
D("postgres-mcp (Postgres MCP Pro)", "MCP server — database", "crystaldba", "https://github.com/crystaldba/postgres-mcp",
  "Index tuning, EXPLAIN, health checks, restricted SQL for the world DB",
  "trigger: Tier 1 PostgreSQL deployment (ADR-001); pinned to mcp SDK 1.x — matches our pin")
D("faster-whisper", "Voice / speech (ASR)", "SYSTRAN", "https://github.com/SYSTRAN/faster-whisper",
  "Local CPU speech-to-text (tiny 72MB / base 138MB models)",
  "no audio input pipeline until voice commands arrive (Phase 2+); benchmarked: tiny int8 = 11x realtime at 447MB RSS",
  "MUST pin av==15.0.0 (default av 19 breaks decode_audio — verified in research)")
D("whisper.cpp / pywhispercpp", "Voice / speech (ASR)", "ggml-org", "https://github.com/ggml-org/whisper.cpp",
  "Leanest ASR (172MB RSS)",
  "alternative to faster-whisper when RAM is tight; pywhispercpp ships cp312 wheels")
D("kokoro-onnx", "Voice / speech (TTS)", "thewh1teagle", "https://github.com/thewh1teagle/kokoro-onnx",
  "Higher-quality 82M TTS (int8 109MB, 0.66x realtime on 2 cores)",
  "piper chosen for speed (17x realtime measured); kokoro is the quality option when synthesis time is not critical")
D("usd-core (OpenUSD)", "3D modelling / scene description", "Pixar", "https://github.com/PixarAnimationStudios/OpenUSD",
  "3D scene interchange for world visualisation",
  "Phase 4 (visuals); cp312 wheel 28MB verified; TOST-1.0 licence reviewed")
D("trimesh", "3D modelling", "mikedh", "https://github.com/mikedh/trimesh",
  "Lightweight mesh import/export/analysis",
  "installed in env; Phase 4 3D asset pipeline; not wired to avoid dead dependencies")
D("Godot headless", "Game engines / digital environments", "Godot Engine", "https://github.com/godotengine/godot",
  "Open-source engine (MIT); server binary runs rootless (verified 4.7.2)",
  "no game project and no Python bindings — a GDScript shell adds nothing today; revisit if an interactive digital environment is required")
D("imageio-ffmpeg", "Creative production (audio/video)", "imageio", "https://github.com/imageio/imageio-ffmpeg",
  "pip-bundled ffmpeg binary (BSD-2 wrapper)",
  "needed when world timeline audio/video rendering arrives; wav output already covered natively")
D("onnxruntime", "AI models / inference (local)", "Microsoft", "https://github.com/microsoft/onnxruntime",
  "Torch-free CPU inference for small ONNX models",
  "right tool when small local models (embeddings/classifiers) are needed; autoregressive LLM generation stays hosted per ADR")
D("DuckDB", "Data processing / analytics", "DuckDB Labs", "https://github.com/duckdb/duckdb",
  "Columnar OLAP for event-log analytics",
  "event store is append-heavy OLTP; revisit for Tier 1 projection/analytics queries")
D("OpenTelemetry Python SDK", "Monitoring & observability", "OpenTelemetry (CNCF)", "https://github.com/open-telemetry/opentelemetry-python",
  "Traces + metrics export",
  "meaningful only with an OTLP collector at Tier 1; prometheus_client covers Tier 0")
D("Grafana", "Monitoring & observability", "Grafana Labs", "https://github.com/grafana/grafana",
  "Dashboards on top of /metrics",
  "separate stateful service — no host to spare at Tier 0; AGPL-3.0 licence noted for Tier 1 decision")
D("Railway CLI", "Deployment / infrastructure", "Railway", "https://github.com/railwayapp/cli",
  "Tier 1 deployment (PostgreSQL + NATS + API hosting)",
  "CLI v5.74.0 installed via npm, but the CLI REJECTS workspace tokens on its user-scoped auth check (verified: whoami/link/api all Unauthorized) while the SAME token works over GraphQL v2 (projects enumerated, serviceCreate/serviceDelete round-trip proven). Code deployment needs one of: GitHub repo connection / OCI image source / a CLI-compatible account token — public API exposes NO source-upload mutation (introspected all 255 mutations)",
  "MIT licence; docs.railway.com verified reachable")
D("Anthropic computer-use demo", "Computer-use systems", "Anthropic", "https://github.com/anthropics/anthropic-quickstarts",
  "Reference GUI computer-use agent",
  "requires Docker + X11/VNC + Claude API credentials — none available (no daemon, no display, no keys)")
D("OpenAdapt", "Computer-use systems", "OpenAdaptAI", "https://github.com/OpenAdaptAI/OpenAdapt",
  "Desktop record/replay agent",
  "targets an interactive GUI desktop session; headless sandbox has no display")
D("H2O LLM Studio", "AI models / training", "H2O.ai", "https://github.com/h2oai/h2o-llmstudio",
  "No-code LLM fine-tuning",
  "directive's own rule: defer until a real fine-tuning need + GPU tier exist (NVIDIA GPU + 128-256GB RAM mandatory)")
D("vLLM / SGLang", "AI models / inference (serving)", "vLLM / SGLang projects", "https://github.com/vllm-project/vllm",
  "High-throughput LLM serving",
  "GPU-bound (ADR-005); Tier 2+ hardware decision")
D("Notion MCP (hosted remote)", "MCP server — workspace", "Notion", "https://github.com/makenotion/notion-mcp-server",
  "Notion workspace integration",
  "no Notion workspace in scope; self-hosted repo itself is no longer actively maintained (hosted remote is the path if ever needed)")
D("Browserbase MCP", "Browser automation (cloud)", "Browserbase", "https://github.com/browserbase/mcp-server-browserbase",
  "Cloud browser automation",
  "needs BROWSERBASE_API_KEY + paid account; local Playwright covers Tier 0")
D("semgrep", "Security tooling", "Semgrep Inc.", "https://github.com/semgrep/semgrep",
  "Deep SAST with rule packs",
  "72MB heavy for CI-less Tier 0; bandit covers Python AST needs; revisit at Tier 1 CI")
D("detect-secrets", "Security tooling", "Yelp", "https://github.com/Yelp/detect-secrets",
  "Secrets scanning for commits",
  "optional pre-commit hygiene; last release 2024-05 (slowing) — evaluate alternatives when repo goes public")


# =====================================================================
# REJECTED — evaluated and declined, with the precise reason
# =====================================================================
def R(name, category, provider, url, purpose, reason, licensing="varies"):
    E(name=name, category=category, provider=provider, repo_url=url,
      purpose=purpose,
      integration_method="none (rejected)",
      install_status="not installed (rejected at evaluation)",
      connection_status="never connected",
      orchestrator_registration="not registered",
      operational_test="not tested (rejected)",
      security_assessment="rejected before integration",
      licensing=licensing,
      deployment_location="n/a",
      limitations="n/a — rejected",
      evidence="research/TECHNOLOGY_DISCOVERY_SWEEP.md + reports/JARVIS_NEXUS_ARCHITECTURE_AUDIT.md",
      state="EVALUATED", decision="REJECT", decision_reason=reason)


R("RunAnywhere", "Deployment / runtimes", "RunanywhereAI", "https://github.com/RunanywhereAI/runanywhere-sdks",
  "Cross-platform command launcher",
  "custom non-OSI threshold licence; Python SDK alpha and NOT on PyPI (404 verified)")
R("CUT3R", "Computer vision (3D reconstruction)", "CUT3R project", "https://github.com/CUT3R/CUT3R",
  "Streaming 3D reconstruction",
  "CC BY-NC-SA 4.0 (non-commercial), dormant since 2025-08-27, CUDA required")
R("Frigate", "Computer vision (NVR)", "Blake Blackshear", "https://github.com/blakeblackshear/frigate",
  "Local camera NVR with object detection",
  "requires physical cameras + bare-metal Docker host + accelerator — none exist here (MQTT integration path documented for a future hardware tier)")
R("mcp-for-blender (blender-mcp)", "MCP server — 3D", "ahujasid", "https://github.com/ahujasid/mcp-for-blender",
  "AI-driven Blender control",
  "requires the Blender DESKTOP APP with GUI running (addon starts a socket server inside Blender, started from the N-panel) — no display here; SUPERSEDED by our own headless Blender MCP server (see OPERATIONAL entries), which delivers the same capability class without the GUI requirement")
R("ue-mcp", "MCP server — game engine", "db-lyon", "https://github.com/db-lyon/ue-mcp",
  "31-tool Unreal Engine editor control (wraps Epic native MCP, UE 5.8+)",
  "fundamentally needs a live UE 5.4-5.9 editor (GUI) — impossible without GPU/display/100GB disk; best-in-class option recorded for a future workstation tier")
R("kvick-games/UnrealMCP", "MCP server — game engine", "kvick-games", "https://github.com/kvick-games/UnrealMCP",
  "UE editor socket bridge",
  "stale (last commit 2025-06-22), very WIP, Windows-centric")
R("chongdashu/unreal-mcp", "MCP server — game engine", "chongdashu", "https://github.com/chongdashu/unreal-mcp",
  "UE actor/blueprint control",
  "stale (2025-04-22), self-described experimental, needs editor")
R("VedantRGosavi/UE5-MCP", "MCP server — game engine", "VedantRGosavi", "https://github.com/VedantRGosavi/UE5-MCP",
  "Blender→UE pipeline",
  "explicitly abandoned by author ('didn't move forward')")
R("flopperam/unreal-engine-mcp", "MCP server — game engine", "flopperam", "https://github.com/flopperam/unreal-engine-mcp",
  "UE MCP server",
  "project relocated/absorbed elsewhere")
R("@modelcontextprotocol/server-puppeteer", "MCP server — browser", "modelcontextprotocol (archived)", "https://github.com/modelcontextprotocol/servers-archived",
  "Legacy official browser server",
  "ARCHIVED — 'no longer maintained, NO SECURITY GUARANTEES' (upstream), deprecated on npm since 2025-05")
R("@modelcontextprotocol/server-postgres", "MCP server — database", "modelcontextprotocol (archived)", "https://github.com/modelcontextprotocol/servers-archived",
  "Legacy official Postgres reader",
  "ARCHIVED/deprecated (0.6.2, 2024-12-04); postgres-mcp is the maintained successor when Postgres lands")
R("mcp-server-sqlite (official)", "MCP server — database", "modelcontextprotocol (archived)", "https://github.com/modelcontextprotocol/servers-archived",
  "Legacy official SQLite server",
  "removed from npm entirely (E404 verified); PyPI copy unmaintained since 2025-04; ALSO duplicate capability — the native WorldStore already exposes the world DB")
R("mcp-obsidian (PyPI)", "MCP server — workspace", "MarkusPfundstein", "https://github.com/MarkusPfundstein/mcp-obsidian",
  "Obsidian via Local REST API",
  "requires the Obsidian desktop app RUNNING + API key (obsidian-mcp is the headless path)")
R("mcp-obsidian (npm)", "MCP server — workspace", "unknown (no repo field)", "https://www.npmjs.com/package/mcp-obsidian",
  "Obsidian vault server",
  "NO licence, NO repository field — unverifiable provenance, rejected on supply-chain security")
R("safety", "Security tooling", "pyupio", "https://github.com/pyupio/safety",
  "Dependency CVE scanning",
  "account-gated (signup/login required); free tier unsuitable; pip-audit covers this account-free")
R("trufflehog (PyPI)", "Security tooling", "Truffle Security", "https://github.com/trufflesecurity/trufflehog",
  "Secrets scanning",
  "PyPI package abandoned since 2021 (the real tool is a Go binary); AGPL-3.0")
R("Ollama", "AI models / inference (local)", "Ollama", "https://github.com/ollama/ollama",
  "Local model server",
  "install.sh requires sudo + systemd service — neither exists in this sandbox; hosted APIs remain the Tier 0 path (ADR)")
R("llama-cpp-python", "AI models / inference (local)", "abetlen", "https://github.com/abetlen/llama-cpp-python",
  "llama.cpp Python bindings",
  "PyPI ships sdist ONLY (no wheels) — full C++ compile on 2 cores; maintenance liability in a no-root sandbox")
R("openai SDK", "APIs & SDKs", "OpenAI", "https://github.com/openai/openai-python",
  "Official OpenAI client",
  "would drag a SECOND HTTP stack (httpx2 + jiter) alongside pinned httpx 0.28.1; raw httpx keeps one stack and full timeout/retry/SSE control (httpx-sse already present)")
R("structlog", "Monitoring & observability", "hynek", "https://github.com/hynek/structlog",
  "Structured logging",
  "stdlib logging + 15-line JSON formatter delivers the requirement with ZERO dependencies (directive Part 5)")
R("loguru", "Monitoring & observability", "Delgan", "https://github.com/Delgan/loguru",
  "Logging UX library",
  "replaces stdlib global logging state and breaks parity with uvicorn/FastAPI loggers; unjustified dependency")
R("coqui-tts", "Voice / speech (TTS)", "idiap (coqui-ai successor)", "https://github.com/idiap/coqui-ai-TTS",
  "Neural TTS toolkit",
  "148 modules import torch at runtime (539MB wheel) — zero CPU-quality gain over piper/kokoro for our use")
R("kokoro (official package)", "Voice / speech (TTS)", "hexgrad", "https://github.com/hexgrad/kokoro",
  "82M TTS model package",
  "requires torch + transformers; kokoro-onnx is the CPU path (deferred entry)")
R("openai-whisper", "Voice / speech (ASR)", "OpenAI", "https://github.com/openai/whisper",
  "Reference Whisper",
  "torch 539MB + stale releases; faster-whisper is strictly better for CPU")
R("ROS 2", "Robotics / hardware", "Open Robotics", "https://github.com/ros2",
  "Robot operating system",
  "installation requires root + apt + Ubuntu (official docs); Debian Tier-3 at best; no robot hardware exists")
R("Gazebo", "Robotics / simulation", "gz-sim", "https://github.com/gazebosim/gz-sim",
  "Robot simulation",
  "apt-only distribution; no py3.12 pip path")
R("pyserial / pyfirmata", "Robotics / hardware", "pyserial project", "https://github.com/pyserial/pyserial",
  "Serial / microcontroller interfaces",
  "ZERO serial devices exist in this sandbox — nothing to talk to")
R("UI-TARS", "Computer-use systems", "ByteDance", "https://github.com/bytedance/UI-TARS",
  "GUI agent VLM (UI-TARS-1.5-7B)",
  "7B+ vision-language model — impossible in 3.9GB RAM on CPU")
R("Docker", "Deployment / infrastructure", "Docker", "https://www.docker.com",
  "Container runtime",
  "no daemon, no root, cannot install (hard environmental block, verified `docker: command not found`)")
R("Bevy", "Game engines", "Bevy Contributors", "https://github.com/bevyengine/bevy",
  "Rust game engine",
  "no Rust toolchain in sandbox; full crate compile on 2 cores impractical")
R("UE5 / CARLA", "Game engines / digital environments", "Epic Games / CARLA", "https://www.unrealengine.com",
  "Photoreal engine / driving simulator",
  "GPU-bound + ~100GB disk + UE EULA still UNVERIFIED (L-04); Phase 0 ADR-005 deferral stands")
R("johnvansickle static ffmpeg", "Creative production", "John Van Sickle", "https://johnvansickle.com/ffmpeg",
  "Static ffmpeg builds",
  "site unreachable from this sandbox network (HTTP 000, 30s timeouts — verified)")
R("piper-phonemize", "Voice / speech (TTS)", "rhasspy (legacy)", "https://github.com/rhasspy/piper-phonemize",
  "Legacy piper phonemizer",
  "NOT on PyPI (verified); obsolete — piper 1.8 embeds espeak-ng in its wheel")
R("Repast HPC", "Simulation frameworks", "Repast", "https://repast.github.io",
  "Distributed ABM",
  "unmaintained since 2022 (Phase 0 finding); Mesa is the adopted path (ADR-003)")


# =====================================================================
# CONTINUATION DIRECTIVE (2026-11-13) — new OPERATIONAL integrations
# =====================================================================
R3D_EV = "reports/RENDER3D_TEST_OUTPUT.txt"
P2_EV = "reports/PHASE2_TEST_OUTPUT.txt"

E(name="bpy (Blender as module)", category="3D modelling",
  provider="Blender Foundation",
  repo_url="https://github.com/blender/blender",
  purpose="Headless Blender 5.3: real scene construction, Cycles CPU rendering, USD/glTF/FBX export, keyframe animation — the 3D half of NEXUS WORLD",
  integration_method="dedicated sidecar venv (.venv-blender, Python 3.13 + bpy 5.3.0 + mcp<2, 407MB wheel) driven by render3d/driver.py subprocess and the Blender MCP server; DECISION REVERSED from Phase 1B REJECT — the rejection reason (wheels need py3.13, host is 3.12) is void now that uv + a py3.13 sidecar venv exist on this host",
  install_status="installed (uv venv, .venv-blender; recreatable: uv venv .venv-blender --python 3.13 && uv pip install --python .venv-blender/bin/python bpy 'mcp<2')",
  connection_status="connected — in-process bpy import verified (blender 5.3.0), Cycles CPU renders + exports executed",
  orchestrator_registration="via the Blender MCP server tools (mcp.blender.*) and render3d.* capabilities",
  operational_test="PASS — R2 (version), R3-R5 (top/street/night renders), R8-R10 (USD/GLB/FBX export with magic-byte checks), R17 (144 fcurves)",
  security_assessment="subprocess isolation; MCP-server path confinement to workspace dir; no network use",
  licensing="GPL-3.0 (Blender); used as a local tool, not redistributed — Founder decision needed before any binary distribution",
  deployment_location="Tier 0 sandbox (.venv-blender sidecar, gitignored; workspace artifacts under workspace/)",
  limitations="CPU-only rendering (no GPU) — 480x270/8 samples ≈ 1-3 s, 960x540/24 ≈ 15-40 s; buildings are boxes with kind materials; resident markers are body+head meshes (rigged characters are Phase 3+)",
  evidence=f"{R3D_EV} checks R2-R10, R17",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="Continuation Directive items 3+4: Blender Python API + 3D world generation + visual inspection — all delivered with real-operation evidence")

E(name="Blender MCP server (self-built, headless)", category="MCP server — 3D",
  provider="JARVIS NEXUS (own code)",
  repo_url="mcp_servers/blender_server.py",
  purpose="REAL Blender Python API control over the MCP stdio protocol: build_scene, render_view, export_scene, scene_info, animate_scene, blender_version — the headless answer to GUI-editor MCPs the register had to reject",
  integration_method="FastMCP stdio server inside the bpy venv, spawned+managed by integration/mcp_layer.py (official mcp SDK client); registered on the central orchestrator",
  install_status="installed (runs under .venv-blender; PYTHONPATH-scoped)",
  connection_status="connected — initialize + list_tools handshake, 6 tools discovered",
  orchestrator_registration="6 capabilities: mcp.blender.{blender_version,build_scene,render_view,export_scene,scene_info,animate_scene}",
  operational_test="PASS — R11-R17: discovery, version call, scene build, Cycles render over MCP, path-confinement rejection, USD export, keyframe animation",
  security_assessment="workspace path-traversal guard on every file argument (R15); credential-stripped child env from mcp_layer; stdout shielded from Blender C-level prints to keep the JSON-RPC stream clean",
  licensing="project code (JARVIS NEXUS)",
  deployment_location="Tier 0 sandbox (spawned by the integration bundle)",
  limitations="state persists via .blend files (not live scene streaming); one scene per build call",
  evidence=f"{R3D_EV} checks R11-R17; {IX_EV} check A6",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="Continuation Directive item 3: Blender MCP — delivered as a REAL MCP integration, not the GUI-dependent third-party one")

E(name="3D render pipeline (render3d.*)", category="Creative production / visualisation",
  provider="JARVIS NEXUS (own code)",
  repo_url="render3d/",
  purpose="World → scene spec → Blender → PNG renders with OpenCV visual inspection and AUTOMATED CORRECTION (escalating brightness/samples/camera on failed frames), plus asset exports",
  integration_method="orchestrator capabilities render3d.{render,export,animate,inspect}; MCP-first transport with direct-driver fallback; POST /render API route",
  install_status="installed (project code; no new main-env dependencies — cv2 already present)",
  connection_status="connected — both transports exercised",
  orchestrator_registration="4 capabilities + POST /render (founder-gated, audited, idempotent)",
  operational_test="PASS — R3-R7 (renders + inspection + auto-correction of a deliberately broken frame), R8-R10 (exports), A8 (POST /render end-to-end through the orchestrator)",
  security_assessment="founder-token gated; outputs confined to workspace/; renders inspected before being reported as OK",
  licensing="project code",
  deployment_location="Tier 0 sandbox; renders in workspace/renders",
  limitations="inspection is programmatic (brightness/variance/colour diversity), not semantic — a 'passing' frame is well-exposed and non-degenerate, not necessarily beautiful",
  evidence=f"{R3D_EV} all checks; {IX_EV} checks A7-A9",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="Continuation Directive item 4: 3D world generation + visual inspection + automated correction")

E(name="Z-AI CLI (GLM chat completions)", category="AI models / inference (hosted)",
  provider="Z.ai (sandbox-provided CLI)",
  repo_url="/usr/local/bin/z-ai (z-ai-web-dev-sdk)",
  purpose="Reachable hosted-LLM path for Phase 2 resident cognition (OpenAI is edge-geo-blocked from this host); OpenAI-compatible JSON via subprocess",
  integration_method="models/zai_provider.py wraps the CLI behind the ModelProvider contract; routed through the ModelRouter; circuit breaker on HTTP 429",
  install_status="installed (pre-present CLI; verified glm-4-plus responses)",
  connection_status="connected — real completions returned (first live calls succeeded); transient 429 rate-limit windows occur under burst, handled by cooldown + deterministic fallback",
  orchestrator_registration="via ModelRouter (cognition layer 2); /cognition/status reports it",
  operational_test="PASS — live completions verified (reports/LIVE_COGNITION_EVIDENCE.txt); unit checks P19-P21 prove validation + fallback",
  security_assessment="subprocess with argument-passed prompts (no shell); no credentials involved; LLM output validated against the allowed-action set — can never invent actions",
  licensing="sandbox-provided tooling (Z.ai terms)",
  deployment_location="Tier 0 sandbox",
  limitations="rate-limited under burst (429, verified); latency 1-10 s/call; LLM budget capped at 1 call/tick in the engine",
  evidence="reports/LIVE_COGNITION_EVIDENCE.txt + reports/PHASE2_TEST_OUTPUT.txt checks P19-P21",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="Phase 2 cognition needs a REAL reachable LLM; this is the one this host can actually reach")

E(name="OpenAI API (raw httpx provider)", category="AI models / inference (hosted)",
  provider="OpenAI", repo_url="https://platform.openai.com",
  purpose="Founder-designated Phase 2 cognition provider (chat completions)",
  integration_method="models/openai_provider.py — raw httpx per register decision on the openai SDK REJECT (single HTTP stack); OPENAI_API_KEY from gitignored .env, never logged/committed",
  install_status="installed + configured (key length 28 chars — appears TRUNCATED; sk-proj keys are ~160 chars)",
  connection_status="BLOCKED at the edge: HTTP 403 'Country, region, or territory not supported' — geo-restriction hits before key validation; also needs the full-length key",
  orchestrator_registration="registered in the ModelRouter when the key is present; every call raises ProviderError → deterministic fallback (never a fake completion)",
  operational_test="probe executed live: 403 recorded in reports/CREDENTIAL_VERIFICATION.txt — honest failure, no fabricated success",
  security_assessment="key redacted in every report (first-11…last-4); .env untracked + chmod 600; children of MCP servers never see it (env strip)",
  licensing="OpenAI ToS",
  deployment_location="configured Tier 0; usable from any non-blocked egress",
  limitations="UNBLOCK REQUIRES FOUNDER: (1) full-length API key, (2) an egress path from a supported region (proxy or a host outside the geo-block)",
  evidence="reports/CREDENTIAL_VERIFICATION.txt",
  state="INSTALLED", decision="DEFER",
  decision_reason="implemented and configured exactly as directed; blocked by edge geo-restriction + truncated key — precise blocker recorded, needs Founder input")

E(name="Unreal asset pipeline (Blender side)", category="Creative production / game-engine pipeline",
  provider="JARVIS NEXUS (own code) + Blender exporters",
  repo_url="render3d/blender_core.py",
  purpose="Blender→Unreal asset flow: the world scene exported as USD, glTF and FBX (UE-importable) — the achievable half of the Unreal directive",
  integration_method="export_scene via MCP or driver; magic-byte verification (PXR-USDC/usda, glTF, Kaydara FBX)",
  install_status="installed (project code)",
  connection_status="connected — all three formats exported and verified",
  orchestrator_registration="render3d.export capability + mcp.blender.export_scene",
  operational_test="PASS — R8 (USD), R9 (GLB), R10 (FBX), R16 (USD over MCP)",
  security_assessment="output confined to workspace/exports",
  licensing="project code",
  deployment_location="Tier 0 sandbox; artifacts in workspace/exports",
  limitations="UE import side BLOCKED: needs a Windows/GPU host with UE 5.4+ (EULA L-04, ~100GB) — all UE MCP/editor-control entries remain REJECTED with precise reasons; import instructions documented in KNOWN_LIMITATIONS",
  evidence=f"{R3D_EV} checks R8-R10, R16",
  state="OPERATIONAL", decision="PROCEED",
  decision_reason="directive item 3 delivered to the environment's true limit: export side real, import side precisely blocked")


# =====================================================================
out_json = os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "integration", "register.json")
out_md = out_json.replace("register.json", "INTEGRATION_REGISTER.md")
reg.save(out_json)
with open(out_md, "w", encoding="utf-8") as fh:
    fh.write(reg.to_markdown())

ops = [r for r in reg.all() if r.state == "OPERATIONAL"]
defers = [r for r in reg.all() if r.decision == "DEFER"]
rejects = [r for r in reg.all() if r.decision == "REJECT"]
print(f"register: {len(reg.all())} entries — "
      f"{len(ops)} OPERATIONAL, {len(defers)} DEFER, {len(rejects)} REJECT")
print(f"wrote: {out_json}")
print(f"wrote: {out_md}")
