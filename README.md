# JARVIS NEXUS — Embodied Spatial Sanctuary

A persistent, owner-controlled intelligence (JARVIS/FRIDAY successor, "NEXUS")
embodied as a living woman inside a real-time 3D operations sanctuary:
cinematic character, voice, volumetric scenario reconstruction, typed epistemic
memory, and hardware-grade owner switches.

Stack: Next.js 16 (App Router, standalone) · React 19 · three.js 0.187 ·
Prisma + SQLite · provider-independent inference layer (z-ai cloud today,
local-first providers pluggable).

> Licensing note: the current Avaturn-prototype character is PROTOTYPE-ONLY
> (personal-use terms). See ENGINEERING_DECISIONS.md ED-L1 before any public
> or commercial deployment.

## Quick start

```bash
bun install            # or npm install
cp .env.example .env   # adjust DATABASE_URL (absolute file: URL) and provider chains
npx prisma generate
npx prisma db push     # create/sync the SQLite schema

npm run dev            # dev server on :3000
```

## Production build & run

```bash
npm run build          # next build + assembles .next/standalone (static + public copied in)
npm start              # NODE_ENV=production node/bun .next/standalone/server.js (PORT env to override)
```

The build runs under strict TypeScript (`ignoreBuildErrors: false`,
`noImplicitAny: true`) — a red build is a real error, never suppress it.

## Quality gates

```bash
npm run typecheck      # tsc --noEmit (strict)
npm test               # node:test unit suite (tests/unit/)
npm run lint           # eslint
```

## Configuration (see .env.example)

- `DATABASE_URL` — absolute SQLite file URL
- `NEXUS_LLM_PROVIDERS` / `NEXUS_TTS_PROVIDERS` / `NEXUS_ASR_PROVIDERS` — ordered
  fallback chains (registered id: `zai_cloud_route`; add local providers in
  `src/lib/nexus/providers/`)
- `NEXUS_VOICE_IDENTITY` — TTS voice (default `tongtong`, the locked D3 identity)

## Project map

- `src/nexus/world/` — three.js sanctuary, character controller, scenario director, branch parser
- `src/nexus/client.ts` — client orchestrator (world ↔ HUD snapshots)
- `src/components/nexus/` — HUD components
- `src/lib/nexus/` — brain (persona + directive schema), providers (D6), world/seed/telemetry
- `src/app/api/v1/` — REST API
- `examples/websocket/` — presence-lite seed (D4; requires socket.io when activated)
- Docs: PROJECT_STATE.md (continuation), ENGINEERING_DECISIONS.md, ARCHITECTURE.md,
  IMPLEMENTATION_BACKLOG.md, RESEARCH_REGISTER.md, CHANGELOG.md
