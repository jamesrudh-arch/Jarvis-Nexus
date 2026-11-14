# JARVIS NEXUS

Autonomous AI ecosystem: **JARVIS** (persistent personal intelligence), **NEXUS WORLD** (persistent civilisation simulation, Unreal Engine 5 primary runtime), **NAEI** (autonomous engineering workforce).

This repository is the authoritative source of the clean-slate reconstruction
(authorised ground-zero reset 2026-11-14; see `RESET.md` and
`download/reset_20261114/RESET_EVIDENCE.md` for the reset evidence record).

## Architecture

Single monorepo, Bun + TypeScript. Subsystems are workspace packages with
versioned contracts — boundaries are real (packages communicate only through
`@nexus/contracts`), and the deployment is one service that can be split
later without contract changes (ADR-003).

```
packages/
  core            ids, clocks, results, errors, seeded RNG        (dependency root)
  contracts       canonical zod schemas: entities, APIs, agents, MCP manifests
  db              bun:sqlite layer, migrations, repositories, event store
  model-fabric    provider-independent model routing: cloudflare (LIVE), openai, echo
  memory          JARVIS memory: 9 tiers, ranked retrieval, consolidation, provenance
  cognition       perception / context / reasoning / planning / evaluation services
  orchestrator    JARVIS state machine: RECEIVED → … → COMPLETED, persisted, recoverable
  naei            agent registry + contracts, task DAG, workspaces, independent verification
  world           event-sourced causal history, snapshots, fidelity-tier simulation,
                  life engine, transactional economy, director, creation engine
  mcp-gateway     MCP registry (server.json-shaped), stdio+HTTP, discovery, validation, audit
  observability   health registry, metrics, structured logging
apps/
  nexus-api       Hono HTTP service wiring all subsystems (owner-auth for consequential routes)
tools/
  blender-pipeline  bpy production pipeline + headless validation harness
  unreal            UE5 project scaffolding (.uproject + C++ world-state bridge)
registry/          machine-readable requirements, technologies, engineering ledger
docs/              architecture, ADRs, acceptance
tests/             unit / integration / scenarios (directive §19 A–H)
```

## Quick start

```bash
bun install
bun run typecheck
bun test                     # unit + integration + scenarios
bun run start                # NEXUS API on :3000
```

Environment (`.env`, never committed): `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID` (live model provider), `OPENAI_API_KEY` (works from
Railway US egress; sandbox region is blocked by OpenAI — ADR-007),
`OWNER_KEY` (owner authentication for consequential routes).

## Deployment

Railway auto-deploys `main` (Dockerfile + `railway.json`; healthcheck
`/health`; SQLite persisted on the `/data` volume). Production:
`https://jarvis-nexus-production.up.railway.app`.

## Engineering control

- `registry/requirements.json` — machine-readable requirements with statuses
  and evidence (directive §16); `bun tools/registry-validate.ts` enforces
  consistency.
- `registry/technologies.json` — acquisition registry: every candidate
  investigated with licence, provenance, decision and rationale (§2–3).
- `registry/ledger.json` — engineering ledger: task scope, files, tests,
  commits (§17).
- `docs/adr/` — architecture decision records.
- `docs/ACCEPTANCE.md` — acceptance report: IMPLEMENTED / VERIFIED /
  DEPLOYED / BLOCKED with evidence, never combined (§22).

## Testing

```bash
bun run test:unit          # 29 unit tests
bun run test:integration   # 14 integration tests (live model + live MCP when credentials present)
bun run test:scenarios     # directive §19 scenarios D–H (A/B in integration)
```

Live tests self-skip without credentials (`test.skipIf`), so CI runs green
with offline providers.
