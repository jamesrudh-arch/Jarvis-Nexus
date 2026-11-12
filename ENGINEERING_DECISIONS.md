# ENGINEERING_DECISIONS — JARVIS NEXUS

Record of binding decisions. Sources: the user's Master Engineering Directive
(Section 1, D1–D9) and verified session findings. Unresolved contradictions are
recorded, never silently resolved (D8).

## Directive decisions (user-approved, 2026-11-12)

| ID | Decision |
|----|----------|
| D1 | Avaturn character retained as PROTOTYPE material only. License must be verified before any commercial/public use; no subscription purchase without demonstrated necessity. |
| D2 | **MetaHuman is the primary digital-human platform** (Unreal as primary high-fidelity render env). Avaturn = temporary prototype / lightweight alternative. No forced GLB-everywhere; no claims that GLB conversion preserves MetaHuman fidelity. Deployment strategy per platform: full-fidelity Unreal, optimized phone companion, future AR/VR, browser presentation. |
| D3 | **Tongtong remains the voice identity.** Separate concerns: identity / model / provider / transport / emotion / ASR / orchestration. Evaluate Qwen speech, CosyVoice, Orpheus, others on: similarity, naturalness, latency, streaming, emotion, language support, deployment, licensing, cost — same reference scripts and audio tests for every candidate. No marketing claims. |
| D4 | Single-user experience first; presence-lite where useful; communication architecture designed so multi-user can be added WITHOUT a rewrite; WebSocket only where real-time requirements justify it; no premature multiplayer infrastructure. |
| D5 | Device priority: (1) working core app, (2) phone companion, (3) desktop, (4) Quest, (5) Vision Pro. AR/VR compatibility is never claimed untested. |
| D6 | Local-first, cloud-optional: provider-independent model interface, local inference where hardware permits, cloud where useful, model selection + fallback, configurable providers, secure credentials, no hard-coded provider dependence, graceful unavailability, orchestration separated from providers. Z.ai is a provider, NOT a single point of failure. |
| D7 | All supplied images inspected and classified by actual content (see RESEARCH_REGISTER.md §Image classification). No invented purposes. |
| D8 | Documentation hierarchy: user decisions > engineering baseline > ENGINEERING_DECISIONS.md > ARCHITECTURE.md > ROADMAP.md > IMPLEMENTATION_BACKLOG.md > PROJECT_STATUS.md > DEVELOPMENT_LOG.md > RESEARCH_REGISTER.md. |
| D9 | P0 = immediate priority: functioning integrated foundation, not every feature. |

## Session engineering decisions (2026-11-12)

| ID | Decision | Rationale (evidence) |
|----|----------|----------------------|
| ED-1 | Composer resolution: `EffectComposer.setPixelRatio()` is called at init, on resize, and in the adaptive DPR loop | Audit B1/B2/B5 — RT was CSS-pixel sized on DPR≥2 devices (zoom-blur root cause); adaptive DPR resized only the renderer (guard was a no-op) |
| ED-2 | Pyramid hologram mode renders through the composer (per-face RenderPass camera swap) | Audit B11 — direct `renderer.render()` bypassed bloom/vignette/tonemap |
| ED-3 | Branch conditions evaluated by a shared recursive-descent boolean parser (`src/nexus/world/branchCondition.js`), used by BOTH the Media Wall feed and the ScenarioBar banner | Audit B3 — `and` conditions silently failed; the UI had a duplicate hardcoded evaluator that could drift. Single source of truth; fail-safe (unparseable → false) |
| ED-4 | Scenario narration uses a bounded queue (max 2) drained on speech end, cleared on interrupt | Audit finding — cues that fired during speech were permanently dropped (cue index consumed + post-TTS isSpeaking guard) |
| ED-5 | Fonts: Geist/Geist Mono variables moved to `<html>`; nexus.css consumes them | Audit H4 — nexus.css declared "Inter"/"JetBrains Mono" which were never loaded |
| ED-6 | Light diet first pass: 21 → 16 realtime lights (removed 3 ceiling washes, +X dead-zone fill, character bounce light; hemisphere 0.48→0.56; Security Vault cove 2.4→2.8; fill 0.3→0.5). Deeper diet deferred to P1 quality tiers | three.js includes every light in every material's fragment shader; 24% shading cut with minimal visual delta, git-reversible. Full 20→10 target lands with tier gating |
| ED-7 | Dependency purge: 77 → 19 packages; deleted `src/components/ui/` (45 shadcn boilerplate files), `src/hooks/`, `src/lib/utils.ts`, `src/nexus/vendor/dynamicbones.mjs` (1,053 lines, never imported) | `scripts/dep_audit.py` evidence: zero app imports outside the boilerplate tree; `xbot_locomotion.glb` + `walking.fbx` KEPT (runtime retarget assets) |
| ED-8 | Strict build: `ignoreBuildErrors: false`, `reactStrictMode: true`, `noImplicitAny: true`; tsconfig excludes non-app dirs (examples/, skills/, tool-results/, scripts/) | Found and fixed real hidden errors: untyped telemetry (unknown-as-ReactNode), HeadersInit union, closure narrowing, missing Web Speech typings |
| ED-9 | Inference provider layer: `src/lib/nexus/providers/` (types + z-ai cloud provider + registry with env-configurable fallback chains `NEXUS_LLM/TTS/ASR_PROVIDERS`); brain.ts, agents dispatch, telemetry rewired; honest degraded reply when the whole chain fails | Directive D6. Runtime-verified: reply source `zai_cloud_route`, telemetry shows `zai_cloud_route (fallback chain)` |
| ED-10 | Voice identity as env: `NEXUS_VOICE_IDENTITY` (default `tongtong`) | Directive D3 — identity decoupled from provider for future engine A/B tests |
| ED-11 | Tests: `node:test` unit suite (`tests/unit/`), zero new dependencies; `npm test` + `npm run typecheck` scripts added | Directive P0 #12 — critical paths covered without framework bloat |
| ED-12 | `examples/websocket/` kept (excluded from typecheck) as the D4 presence-lite seed; requires `socket.io`/`socket.io-client` when activated | Directive D4 — architecture-ready, not yet required |

## Licensing position (D1 — VERIFIED 2026-11-12)

**ED-L1. Avaturn (Goodsize) — prototype-only, commercial use NOT granted by default terms.**

- Source: Terms of Use at avaturn.live/terms-of-use (fetched and read this session)
- The ToS grants a "limited, nonexclusive, nontransferable, non-sublicensable, revocable license to access and use our Services and Goodsize Content **for your own personal use**"; selling/reselling/commercial use of the Services or Goodsize Content is prohibited; IP vests in Goodsize; stated minimum compensation for violation: USD 1,000,000.
- Extracted assets (clothing etc.) carry separate licenses per referenced documents.
- The PRO plan (USD 800/month, avaturn.me/pricing) is the avatar-creation platform/SDK tier (custom branding, own user management, custom garments); Enterprise mentions "custom T&C" — commercial avatar-use rights would be negotiated there (avaturn.live/licensing).
- **Consequence:** `public/models/jarvis_avaturn.glb` (generator string: `Avaturn.me | Blender`, materials `avatarn_*`) is used strictly as prototype material. Any public/commercial launch requires either (a) written commercial licensing from Avaturn/Goodsize, or (b) character replacement — per D2, the MetaHuman primary path is the planned successor; its licensing (Epic MetaHuman EULA) must be verified at migration time before any public deployment.
- THIRD_PARTY_LICENSES: the reference repo registers TalkingHead scripts (MIT). Session additions to register when adopted: threejs-hair-shader (MIT), metahuman-to-glb (MIT), chosen streaming-TTS engine terms.
