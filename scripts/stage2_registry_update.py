#!/usr/bin/env python3
"""Stage 2 — requirements registry update.

Adds Stage-2 requirements (security hardening, visual app restoration, voice,
backup scheduling, adversarial verification, architecture decisions) and updates
statuses of requirements whose truth changed this stage. Machine-readable,
validated by tools/registry-validate.ts afterwards.
"""
import json

REG = "registry/requirements.json"
doc = json.load(open(REG))
reqs = doc["requirements"]
by_id = {q["id"]: q for q in reqs}

def add(q):
    if q["id"] not in by_id:
        reqs.append(q)
        by_id[q["id"]] = q
        print("added", q["id"], q["status"])
    else:
        print("exists", q["id"])

def set_status(qid, status, evidence):
    q = by_id.get(qid)
    if q:
        q["status"] = status
        if evidence:
            q["evidence"] = (q.get("evidence") or []) + evidence if isinstance(q.get("evidence"), list) else evidence
        print("updated", qid, "->", status)

S2 = "Stage 2 (2026-11-15)"

add({"id": "SEC-4", "product": "NEXUS API", "directive": "Stage2 §3 production security",
     "title": "CORS allowlist (least-privilege default)",
     "behaviour": "No cross-origin access unless CORS_ALLOWED_ORIGINS lists the origin exactly; preflight handled; unset = same-origin only",
     "subsystem": "apps/nexus-api", "dependsOn": ["SEC-1"], "status": "VERIFIED",
     "evidence": ["tests/integration/phase3-security.test.ts (allowed/denied/preflight matrix)"]})
add({"id": "SEC-5", "product": "NEXUS API", "directive": "Stage2 §3 production security",
     "title": "Per-IP rate limiting with auth-fail lockout",
     "behaviour": "Global fixed window (RATE_LIMIT_PER_MIN default 240) on all routes; auth-fail budget (default 60/min) locks protected routes for the IP (even valid tokens) while public routes stay readable; 429 + Retry-After",
     "subsystem": "apps/nexus-api", "dependsOn": ["SEC-1"], "status": "VERIFIED",
     "evidence": ["tests/integration/phase3-security.test.ts (burst, separate budgets, lockout semantics)", "tests/adversarial/verifier.test.ts V1"]})
add({"id": "SEC-6", "product": "NEXUS API", "directive": "Stage2 §3 honest model health",
     "title": "Honest model-fabric health + live provider verification",
     "behaviour": "/models/health distinguishes configured/verified/never-probed per provider; POST /models/verify (owner) runs real round-trips; fabricFromEnv rejects whitespace/placeholder credentials",
     "subsystem": "packages/model-fabric + apps/nexus-api", "dependsOn": [], "status": "VERIFIED",
     "evidence": ["tests/integration/phase3-security.test.ts", "adversarial ADV-02 fix + activeProviderIds()"]})
add({"id": "VIS-1", "product": "Visual Application", "directive": "Stage2 §5 V1",
     "title": "Visual application buildability (strict)",
     "behaviour": "next 16 / react 19 / three 0.187 dependencies restored; ignoreBuildErrors removed; dedicated strict tsconfig; clean production build with standalone output",
     "subsystem": "src/ (Next.js app)", "dependsOn": [], "status": "VERIFIED",
     "evidence": ["scripts/build-visual.sh", "build log: compiled + typechecked + 3/3 pages + standalone"]})
add({"id": "VIS-2", "product": "Visual Application", "directive": "Stage2 §5 V2",
     "title": "Backend as single source of truth (adapter architecture)",
     "behaviour": "All 14 API routes are thin adapters over the Hono backend; OWNER_KEY server-side only; duplicate client-side simulation retired from request path (preserved as reference)",
     "subsystem": "src/lib/backend.ts + src/app/api/*", "dependsOn": ["VIS-1"], "status": "VERIFIED",
     "evidence": ["scripts/stage2_visual_integration.sh + evidence/visual_app_integration.txt (live chain incl. consequential writes + restart persistence)"]})
add({"id": "VIS-3", "product": "Visual Application", "directive": "Stage2 §5 V3",
     "title": "Interactive universe (backend-driven)",
     "behaviour": "OrbitControls navigation; resident interaction; venue interiors (derived, marked); day/night + weather from backend clock; backend auto-tick; responsive mobile viewport",
     "subsystem": "src/components/nexus/WorldView.tsx", "dependsOn": ["VIS-2"], "status": "VERIFIED",
     "evidence": ["evidence/visual_dom_verification.txt (WebGL canvas, controls, 8 residents real data, zero console errors)", "visual_01..05 screenshots"]})
add({"id": "VIS-4", "product": "Visual Application", "directive": "Stage2 §5 V4",
     "title": "Real-device mobile acceptance (iPhone/Safari)",
     "behaviour": "PWA install, standalone operation, responsive rendering, audio permissions, voice input, TTS playback, lifecycle, network recovery — on an actual device",
     "subsystem": "visual app", "dependsOn": ["VIS-3"], "status": "BLOCKED",
     "evidence": ["viewport evidence only (supplementary); owner test plan in VISUAL_APP_RESTORATION.md §V4; requires deployment"]})
add({"id": "VOI-1", "product": "Voice Intelligence", "directive": "Stage2 §7",
     "title": "Provider-independent voice I/O (client adapters)",
     "behaviour": "speak(): server slot -> speechSynthesis fallback, interruption-safe; listenOnce(): SpeechRecognition with interim transcript; capability detection never assumed; honest 503 server slots",
     "subsystem": "src/lib/voice.ts + ChatView", "dependsOn": ["VIS-2"], "status": "VERIFIED",
     "evidence": ["evidence/voice_chat_verification.txt (all capabilities real in-browser; chat round-trip)"]})
add({"id": "VOI-2", "product": "Voice Intelligence", "directive": "Stage2 §7",
     "title": "Wake-word, discrete VAD, server audio round-trips",
     "behaviour": "Always-on audio session wake-word; server STT/TTS providers with real audio verification",
     "subsystem": "voice", "dependsOn": ["VOI-1"], "status": "DISCOVERED",
     "evidence": ["honestly not implemented; server slots 503; piper-tts reference preserved"]})
add({"id": "BKP-1", "product": "NEXUS API", "directive": "Stage2 §4",
     "title": "Scheduled logical backups with retention + restore verification",
     "behaviour": "Export -> isolated in-memory restore-verify -> volume write -> retention prune; NEXUS_BACKUP_INTERVAL_HOURS (default 24) / NEXUS_BACKUP_RETENTION (14); status view with RPO/RTO",
     "subsystem": "apps/nexus-api backup scheduler", "dependsOn": [], "status": "VERIFIED",
     "evidence": ["tests/integration/phase4-backups.test.ts (owner gate, verification, pruning, status)"]})
add({"id": "VER-1", "product": "Governance", "directive": "Stage2 §9",
     "title": "Independent adversarial verification system",
     "behaviour": "Separate verifier suite (fabrication detection, security attacks, contract validation, evidence provenance, regression landmines) with authority to reject implementation work",
     "subsystem": "tests/adversarial", "dependsOn": [], "status": "VERIFIED",
     "evidence": ["19 tests; found + fixed ADV-01 (malformed JSON world mutation) and ADV-02 (echo listing); 3 verifier self-corrections documented"]})
add({"id": "ARC-RT-1", "product": "Architecture", "directive": "Stage2 §6 realtime sync",
     "title": "Realtime multi-environment synchronization (WebSocket/SSE)",
     "behaviour": "Live push of world events to all connected environments (web, UE5, future clients); current state: request/poll everywhere; WS vs SSE decision pending traffic analysis",
     "subsystem": "backend", "dependsOn": [], "status": "SPECIFIED",
     "evidence": ["investigated Phase 6; honest — not implemented, no fake liveness"]})

# status updates for existing requirements
set_status("SEC-3", "SPECIFIED", None)  # owner switches remain specified; not all implemented
set_status("INFRA-2", "SPECIFIED", None)  # keep as is (warning about unreferenced cleared below if referenced)

doc["generatedAt"] = "2026-11-15T00:00:00Z"
doc["stage2Note"] = "Stage 2 update: +11 requirements (SEC-4..6, VIS-1..4, VOI-1..2, BKP-1, VER-1, ARC-RT-1); statuses carry Stage 2 evidence only where executed this session."

json.dump(doc, open(REG, "w"), indent=2)
print("registry updated:", len(reqs), "requirements")
