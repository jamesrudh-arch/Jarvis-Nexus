#!/usr/bin/env python3
"""Round 4 register additions — definitive-directive session (2026-11-14).

Every entry is evidence-backed from THIS session's verified work
(scripts/test-v2.ts 17/17, browser verification, 184/184 regression).
States are audit conclusions; nothing is marked OPERATIONAL without a test
or live check behind it.
"""
import json
from collections import Counter

REG = "NEXUS_WORLD/integration/register.json"
DOC = "NEXUS_WORLD/integration/INTEGRATION_REGISTER.md"
WEB = "src/data/register-summary.json"

NEW = [
    {
        "name": "JARVIS persistent identity subsystem (versioned, provider-independent)",
        "category": "Assistant intelligence",
        "provider": "in-house (src/lib/nexus/identity.ts)",
        "repo_url": "src/lib/nexus/identity.ts + src/app/api/jarvis/route.ts",
        "purpose": "JARVIS's identity survives restarts, model changes and provider changes: versioned profile in the world event log (jarvis.identity_established), grounding every conversation",
        "integration_method": "event-sourced WorldMeta projection; persona prompt assembled from the profile at request time (the model is replaceable, the identity is not)",
        "install_status": "installed",
        "connection_status": "connected",
        "orchestrator_registration": "boot chain step 1 (ensureIdentity) + /api/chat grounding",
        "operational_test": "test-v2 D2 (v1 established), D6 (survives restart via new connection); /api/jarvis live; chat grounding reports identity v1 + N memories used per reply",
        "security_assessment": "no credentials; profile contains no user data",
        "licensing": "in-house MIT",
        "deployment_location": "sandbox (dev server) — deploy blocked on Railway token",
        "limitations": "identity profile is static v1; versioning machinery ready for v2 evolution",
        "evidence": "scripts/test-v2.ts output (D2/D6 PASS); NEXUS_WORLD/reports/V2_VERIFICATION.txt; /api/jarvis live response",
        "state": "OPERATIONAL",
        "decision": "PROCEED",
        "decision_reason": "PART III §6 persistent identity — delivered as real subsystem, not prompt text",
    },
    {
        "name": "JARVIS as world resident (Sanctum home + resident entity)",
        "category": "World simulation",
        "provider": "in-house (src/lib/nexus/jarvis.ts)",
        "repo_url": "src/lib/nexus/jarvis.ts",
        "purpose": "she has her own home (a real geo building), her own entity, moves/eats/socialises through the SAME engine as the 24 residents; the world does not revolve around her",
        "integration_method": "resident.created event (idempotent jarvis-create key); Sanctum added as real geo building node — same layout drives simulation and renderer",
        "install_status": "installed",
        "connection_status": "connected",
        "orchestrator_registration": "boot chain step 2 (ensureJarvis); world view renders her with a reserved holographic-cyan life-sign",
        "operational_test": "test-v2 D1/D3/D4/D5 (exists, home=Sanctum with 3 rooms, no salary events); browser: entered Sanctum, JARVIS visible inside (cyan pixel scan 123), profile panel via /api/residents/res-000025",
        "security_assessment": "no external surface",
        "licensing": "in-house MIT",
        "deployment_location": "sandbox (dev server)",
        "limitations": "her body is a stylised presence marker, not a MetaHuman (UE rendering hardware-blocked — honest label in UI)",
        "evidence": "test-v2 D1–D5 PASS; screenshots 02 (cyan marker), 05 (Sanctum interior with her present), 06 (profile panel)",
        "state": "OPERATIONAL",
        "decision": "PROCEED",
        "decision_reason": "PART V §26 — she lives in the world, not above it",
    },
    {
        "name": "Functional economy (37 businesses, salaries, purchases, B2B restocks, grants)",
        "category": "World simulation",
        "provider": "in-house (src/lib/nexus/economy.ts)",
        "repo_url": "src/lib/nexus/economy.ts",
        "purpose": "interconnected economy: ateliers pay salaries and produce wares, kitchens sell meals, stores sell supplies, both restock from ateliers (real business-to-business transactions), institution pays civic wages from a daily grant",
        "integration_method": "pluggable EconomyHooks on the resident engine (like Cognition); every change is an idempotent economy.* event; wallets ride resident.acted atomically in the same transaction",
        "install_status": "installed",
        "connection_status": "connected",
        "orchestrator_registration": "engine opts.economy; boot step 3 (ensureEconomy); dashboard economy card + world summary economy section",
        "operational_test": "test-v2 A2–A6: conservation laws verified FROM THE EVENT LOG ALONE (wallets 1035 = init 1184 + salaries 288 − purchases 437; till 5909 = init 5510 + 437 + grants 250 − 288); 122 live transactions at last check incl. B2B restocks; dashboard feed shows real resident/business names",
        "security_assessment": "no external calls; deterministic constants, no RNG",
        "licensing": "in-house MIT",
        "deployment_location": "sandbox (dev server)",
        "limitations": "no taxation (grant is the single exogenous inflow, documented); eating at a shop venue does not transact (kitchens sell meals only); no distinct 'shopping' action in v1",
        "evidence": "scripts/test-v2.ts A2–A6 PASS; dashboard screenshot 01 (live transactions incl. 'Moruholm Works → Wholesale wares · 40')",
        "state": "OPERATIONAL",
        "decision": "PROCEED",
        "decision_reason": "PART V §23 — a purchase must update both parties; verified by conservation laws, not by assertion",
    },
    {
        "name": "Building interiors (52 rooms, 112 objects, enter-building mode)",
        "category": "World simulation / 3D",
        "provider": "in-house (src/lib/nexus/interiors.ts + WorldView)",
        "repo_url": "src/lib/nexus/interiors.ts + src/components/nexus/WorldView.tsx",
        "purpose": "real internal structures: Sanctum (Atrium/Studio/Observatory), civic hall (Hall/Office/Archive), every food venue (Dining/Kitchen), every shop (Floor/Storage); residents are placed in semantically appropriate rooms on arrival",
        "integration_method": "rooms/objects are geo nodes (fractions of parent footprints) — CityLayout derives world rects; Three.js dollhouse mode opens the shell on click; shells are labelled honestly, never faked",
        "install_status": "installed",
        "connection_status": "connected",
        "orchestrator_registration": "boot step 4 (ensureInteriors); /api/layout carries rooms+objects; engine enterBuilding() assigns rooms",
        "operational_test": "test-v2 C1–C3 (all rooms within building bounds; residents with room_id inside that room's rect and building — 11 indoors at check); browser: entered 4 buildings (Ulmoholm House, JARVIS Sanctum, Moruholm Works, shell-note path for Wynuvale House); captured Cyra Ironquill eating indoors at Galedor House · Floor via API",
        "security_assessment": "no external surface",
        "licensing": "in-house MIT",
        "deployment_location": "sandbox (dev server)",
        "limitations": "intra-building transit not simulated (arrival places directly in room — documented); residential/workshop interiors not generated in v1 (honest shells, UI says so)",
        "evidence": "test-v2 C1–C3 PASS; screenshots 04 (interior mode), 05 (Sanctum + JARVIS), 07 (shop interior)",
        "state": "OPERATIONAL",
        "decision": "PROCEED",
        "decision_reason": "PART V §18 — a building shell is not a completed building; these ones are",
    },
    {
        "name": "Multi-model capability router (audit-trailed failover)",
        "category": "Assistant intelligence",
        "provider": "in-house (src/lib/nexus/router.ts)",
        "repo_url": "src/lib/nexus/router.ts",
        "purpose": "capability-aware provider selection per category (reasoning/vision/stt/tts) with explicit routing decisions written to the audit log; unavailable providers are reported as skipped with reasons — never silently chosen or substituted",
        "integration_method": "registry + route() on the chat path; recordRouting() persists AuditEvent rows (no payloads, metadata only)",
        "install_status": "installed",
        "connection_status": "connected",
        "orchestrator_registration": "/api/chat route decision; /api/providers unchanged (manual probes only)",
        "operational_test": "chat requests route reasoning→glm with skipped=[openai(BLOCKED HK egress)]; failures recorded as route:…[failed] (live 429 windows this session produced honest 503s, no fabricated replies)",
        "security_assessment": "audit rows contain category/provider/outcome only — never message content",
        "licensing": "in-house MIT",
        "deployment_location": "sandbox (dev server)",
        "limitations": "exactly one selectable provider per category in this sandbox (OpenAI edge-blocked; documented) — the registry extends without touching callers when keys return",
        "evidence": "AuditEvent rows in db/custom.db; chat 503 responses with provider field this session",
        "state": "OPERATIONAL",
        "decision": "PROCEED",
        "decision_reason": "PART III §9 — routing made explicit and auditable; honest degradation preserved",
    },
    {
        "name": "VLM reference-image study (GLM-4V multimodal)",
        "category": "Vision",
        "provider": "GLM-4V via z-ai-web-dev-sdk",
        "repo_url": "scripts/reference_image_study.ts",
        "purpose": "study the attached reference image with a live vision model and derive the design language for the product",
        "integration_method": "multimodal chat.completions with base64 image input, server-side only",
        "install_status": "installed",
        "connection_status": "blocked (live 429 rate window — three attempts this session, all reported as failures)",
        "orchestrator_registration": "manual script; report at NEXUS_WORLD/reports/REFERENCE_IMAGE_STUDY.txt",
        "operational_test": "attempted 3x: 429 each time — NOT marked operational; design language derived from the platform gateway's own extraction of the actual image with provenance noted; VLM call to be re-run when the window clears",
        "security_assessment": "image is the user's own upload; no credentials",
        "licensing": "n/a",
        "deployment_location": "sandbox",
        "limitations": "rate-window dependent; not retried beyond 3 attempts this session (honest)",
        "evidence": "REFERENCE_IMAGE_STUDY.txt (provenance note); three 429 outputs in session log",
        "state": "EVALUATED",
        "decision": "PROCEED",
        "decision_reason": "honesty rule: a 429 is a failure, reported as such",
    },
    {
        "name": "Sandbox-recycle recovery #2 (python stack, piper, bpy after second recycle)",
        "category": "Infrastructure",
        "provider": "PyPI / HuggingFace / Blender Foundation",
        "repo_url": "NEXUS_WORLD/.venv-blender + NEXUS_WORLD/assets/voices/",
        "purpose": "the sandbox was recycled AGAIN mid-project (mesa/langgraph/fastapi/cv2/piper/bpy destroyed a second time) — full recovery using the documented reproducible process",
        "integration_method": "pip install (11 packages); piper .onnx re-download from huggingface (63 MB, HTTP 200); uv venv --python 3.11 + bpy 5.0.1",
        "install_status": "installed",
        "connection_status": "connected",
        "orchestrator_registration": "same as round-3 recovery entry",
        "operational_test": "all 8 suites re-run after recovery: 184/184 PASS (11/48/28/17/7/14/12/47) — baseline preserved",
        "security_assessment": "official sources only; no credentials",
        "licensing": "unchanged (bpy GPL service boundary, piper MIT, voice Apache-2.0)",
        "deployment_location": "sandbox",
        "limitations": "recycle #2 cost ~15 min of recovery; process is documented in SOURCE_OF_TRUTH §3/§8 — reproducible by design",
        "evidence": "final_regression.sh output this session (184/184); NEXUS_WORLD/reports/*_TEST_OUTPUT.txt refreshed",
        "state": "OPERATIONAL",
        "decision": "PROCEED",
        "decision_reason": "PART II §4: never lose working assets to a recycle again — process is now scripted",
    },
]

with open(REG) as fh:
    data = json.load(fh)
records = data["records"]
existing = {r["name"] for r in records}
added = 0
for rec in NEW:
    if rec["name"] not in existing:
        records.append(rec)
        added += 1

states = dict(Counter(r.get("state") for r in records))
data["records"] = records
with open(REG, "w") as fh:
    json.dump(data, fh, indent=1)

with open(DOC, "a") as fh:
    fh.write("\n\n## Round 4 additions — definitive build directive session (2026-11-14)\n\n")
    fh.write(
        "V2 world layer: JARVIS identity + presence, functional economy, "
        "building interiors, capability router. Verified by "
        "scripts/test-v2.ts (17/17), browser checks and 184/184 regression. "
        f"New totals: {len(records)} records, {states}.\n\n"
    )
    for rec in NEW:
        fh.write(f"### {rec['name']}\n\n")
        fh.write(f"- **State**: {rec['state']} — **Decision**: {rec['decision']}\n")
        fh.write(f"- **Purpose**: {rec['purpose']}\n")
        fh.write(f"- **Operational test**: {rec['operational_test']}\n")
        fh.write(f"- **Evidence**: {rec['evidence']}\n")
        fh.write(f"- **Limitations**: {rec['limitations']}\n\n")

# refresh the web summary (provenance + totals)
summary = {
    "provenance": f"generated from NEXUS_WORLD/integration/register.json ({len(records)} records, 2026-11-14 round-4 audit); state fields are the audit conclusions, not live probes",
    "total": len(records),
    "by_state": states,
    "notable": [
        {
            "name": r["name"],
            "category": r["category"],
            "state": r["state"],
            "purpose": r["purpose"],
            "evidence": r["evidence"],
            "limitations": r["limitations"],
        }
        for r in NEW
        if r["state"] == "OPERATIONAL"
    ][:6],
}
with open(WEB, "w") as fh:
    json.dump(summary, fh, indent=1)

print(f"register updated: +{added} entries -> {len(records)} total; states {states}")
