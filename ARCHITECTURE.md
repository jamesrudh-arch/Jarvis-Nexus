# ARCHITECTURE — JARVIS NEXUS (verified against the implementation, 2026-11-12)

Next.js 16 (App Router, standalone output) + React 19 + three.js 0.187 (WebGL2
baseline; WebGPU is a P4 path, not a dependency). Prisma + SQLite (`db/custom.db`).
Runtime: Node or Bun for the standalone server. Single user first (D4).

```
┌────────────────────────────── Browser ───────────────────────────────┐
│  NexusExperience.tsx (React shell)                                   │
│   ├─ NexusClient (src/nexus/client.ts) — client orchestrator         │
│   │    ├─ NexusSanctuaryScene (three.js world: architecture, 12      │
│   │    │    zones, post pipeline, light rig)                          │
│   │    │    ├─ JarvisCharacterController (GLB + Mixamo retarget,      │
│   │    │    │    lipsync, character light rig)                        │
│   │    │    ├─ ScenarioDirector3D (stage compiler, branch engine,     │
│   │    │    │    cue camera)  ← branchCondition.js (shared parser)    │
│   │    │    ├─ BehaviorDirector (idle behaviors)                      │
│   │    │    └─ CameraDirector (presets + scenario shots)              │
│   │    └─ snapshot emit loop → HUD components                         │
│   └─ HUD: HudHeader, DialogueDock, ScenarioBar, ModesDrawer,          │
│           InspectorDrawer, HologramBar, BootOverlay, FirstWakeBanner  │
└───────────────────────┬──────────────────────────────────────────────┘
                        │ HTTP (request/response + telemetry polling)
┌───────────────────────┴──────────────────────────────────────────────┐
│ Next.js API routes (src/app/api/v1/*)                                │
│  world, world/{move,mode,interrupt,resume,reduced-motion,...},        │
│  conversations/send, voice/tts, asr, scenarios/*, memories, goals,    │
│  agents(+dispatch), switches, telemetry, security/events, health      │
├───────────────────────────────────────────────────────────────────────┤
│ Intelligence layer (src/lib/nexus/)                                   │
│  brain.ts — persona, directive contract (reply/emotion/activity/       │
│    zone/urgent/mode/scenario_id/memory_writes), JSON coercion         │
│  providers/ — D6 abstraction:                                         │
│    types.ts      LlmProvider | TtsProvider | AsrProvider contracts    │
│    zaiCloud.ts   z-ai SDK behind the contracts (dynamic import)       │
│    registry.ts   env-configured fallback chains (NEXUS_*_PROVIDERS),  │
│                  per-provider failure isolation, route description    │
│  worldHub.ts / seed.ts / telemetry.ts — persistence + measured state  │
├───────────────────────────────────────────────────────────────────────┤
│ Prisma + SQLite — world state, conversation, memory, goals, agents,    │
│  scenarios, owner switches, security audit events                     │
└───────────────────────────────────────────────────────────────────────┘
```

## Key contracts

- **BrainDirective** (`src/lib/nexus/brain.ts`): the single instruction schema
  that drives the 3D world (emotion → face/posture, activity/zone → locomotion,
  scenario_id → stage construction, memory_writes → durable memory).
- **Provider contracts** (`src/lib/nexus/providers/types.ts`): application code
  NEVER imports a provider SDK directly; it calls `runLlm/runTts/runAsr`.
  Adding a provider = implement interfaces + register id + env chain entry.
- **Branch conditions** (`src/nexus/world/branchCondition.js`): the only
  evaluator for scenario branch rules (used by feed AND UI).
- **Honest degradation**: exhausted LLM chain → plain-spoken degraded reply
  (never fabricated); failed TTS → browser TTS fallback; failed ASR → empty.

## Render pipeline (post P0 fixes)

Canvas (device-pixel DPR, clamp ≤ 2) → EffectComposer [RenderPass (MSAA 4×/2×)
→ UnrealBloom (restrained) → Vignette → OutputPass]. Pyramid mode swaps the
RenderPass camera per face and renders through the SAME composer. Adaptive DPR:
EMA frame-time, dead band 22–38 ms, 1.5 s cooldown, steps ±0.25/±0.125, floor 1.0.

## Not yet in the architecture (planned)

Streaming TTS transport (SSE/WS chunks), WebSocket presence layer
(`examples/websocket/` is the seed), scenario ingestion pipeline (GLTF/point
cloud/photo→depth), memory replay holograms, MetaHuman primary character (D2).
