# Architecture Decision Records

Indexed by number; referenced from code, registries and the acceptance report.

---

## ADR-001 — Monorepo with workspace packages (single repository)

**Decision:** one repository; every subsystem is a Bun workspace package with
its own `package.json`; cross-boundary communication exclusively through
`@nexus/contracts`.

**Rationale:** single owner + AI engineering workforce; atomic cross-system
changes; shared contracts; one CI; GitHub free tier; one Railway service.
Splitting repositories would add sync cost without benefit at this team size.
Binaries/large assets excluded from Git (no LFS need yet — none produced).

**Alternatives rejected:** multi-repo (sync overhead), hybrid versioned
services (premature).

## ADR-002 — Sandbox scaffolding untracked from the product repository

**Decision:** the May-2026 platform template (`Caddyfile`, `tailwind.config.ts`,
`examples/`, `mini-services/`, `public/`, `.zscripts/`, …) stays on disk for
the build sandbox but is not part of the product repository.

**Rationale:** it is environment scaffolding, not JARVIS NEXUS
implementation; committing it would blur the product boundary.

## ADR-003 — One deployable service hosting all subsystems

**Decision:** `apps/nexus-api` wires every subsystem into one Hono process.
Package boundaries + contracts are the service boundaries; they can be split
into separate processes/deployments without schema changes.

**Rationale:** Railway trial plan; one volume; the directive (§0) requires
independent *capability* and controlled integration — logical boundaries with
versioned contracts provide this; process separation is a deployment-time
concern. `CONTRACT_VERSION` pins compatibility for the split.

## ADR-004 — SQLite (bun:sqlite) as the operational store

**Decision:** `bun:sqlite` with WAL, explicit versioned migrations, JSON
documents for evolving shapes, relational columns for query paths; event
store + snapshots for causal history; `/data` volume persistence on Railway.

**Rationale:** zero native-dependency deploy risk; synchronous transactions
fit the transactional economy requirements (§7.8); proven by the previous
implementation's SQLite-on-volume operation. Postgres (Supabase) migration
path documented: repository layer isolates SQL dialect; migrations are
portable modulo `json_each` usage.

## ADR-005 — Supabase preserved but not required for v1 persistence

**Decision:** keep the Supabase project and credentials; do not migrate the
operational store to Postgres in v1.

**Rationale:** Supabase schema was empty (verified during reset); the
single-service deploy keeps state on its volume; Supabase becomes relevant
for auth/realtime/multi-service Postgres when the deployment splits (ADR-003).
No silent downgrade: this is a scoped decision with a documented reversal
path.

## ADR-006 — Event sourcing for world causal history

**Decision:** append-only `world_events` (sequence-ordered, idempotent
appends) + `world_snapshots` + write-through entity projections; restart
recovery = latest snapshot + event continuity audit (Scenario D verified).

**Rationale:** directive §7.5/§11 require rigorously auditable causal
history and restart survival; knowledge levels (world truth vs observation
vs rumour) are modelled on the event itself.

## ADR-007 — Model providers: Cloudflare Workers AI (live), OpenAI (deployment egress), echo (offline)

**Decision:** provider-independent `ModelFabric`; Cloudflare adapter verified
live from the build environment; OpenAI adapter identical in shape and
verified from Railway's US egress (the sandbox's egress region is blocked by
OpenAI with `unsupported_country_region_territory` — provider-level
geo-restriction, not a credential failure); `echo` deterministic provider for
tests and degraded operation (never silently: `NEXUS_DISABLE_ECHO` guards
production paths; routing always prefers real providers).

**Rationale:** directive §5.3 forbids hardcoding one provider; fallback
chains, health tracking and cost accounting are first-class.

## ADR-008 — Voice architecture deferred to an audio-capable host

**Decision:** voice pipeline (STT → intent → TTS with interruption handling)
is specified at the orchestrator seam but not implemented as live I/O.

**Rationale:** the build environment and the Railway service have no audio
input/output or telephony gateway. Recording this as BLOCKED (not silently
dropped) per directive §20: exact limitation, and the minimum additional
capability (a host with audio sessions or a telephony/SIP integration).

## ADR-009 — Unreal and Blender are workstation-hosted integrations

**Decision:** UE5 project source and Blender pipeline scripts live in this
repo (`tools/unreal`, `tools/blender-pipeline`); their *runtimes* (UE 5.8+
editor with native MCP / Blender 4.x with mcp-for-blender) execute on the
owner's workstation, reached through the MCP gateway (HTTP/stdio) — never
faked in this environment.

**Rationale:** verified environment facts: no GPU, no Windows, no UE
toolchain, no Blender binary in the build sandbox (and a ~700 MB install
exceeds free disk alongside the reset backups). The backend world-state,
creation engine and asset specifications are real and verified; geometry
production and editor automation connect when the workstation host is
attached. Requirement UE-2/BLD-2/BLD-3/SCEN-C are recorded BLOCKED with
exactly this evidence.

## ADR-010 — NAEI verification is adversarial by construction

**Decision:** the implementing agent and the verification agent are always
different agents (different registry entries); when the verification model is
unreachable, the verdict defaults to FAIL ("refusing to self-certify"), never
to PASS.

**Rationale:** directive §6.4 ("the engineering agent must not independently
certify its own work") and §14 (diagnostics must never mask failures).
Observed live: the verifier returned FAIL on weak implementations during
integration testing.

## ADR-011 — MCP registration follows the MCP Registry server.json shape

**Decision:** gateway registrations use reverse-DNS names + title/
description/version/transport fields compatible with the official MCP
Registry manifest (`registry.modelcontextprotocol.io`, schema 2025-12-11).

**Rationale:** day-one compatibility with the standard registry; the
official TypeScript SDK (`@modelcontextprotocol/sdk`, MIT) is the transport
implementation, verified live by the bundled test server (§4.4 acceptance).

## ADR-012 — Approval gates for consequential operations

**Decision:** world construction, simulation advance, NAEI execution/
commit, MCP approval-required servers, and JARVIS steps touching
consequential tools require `OWNER_KEY` (bearer) or an explicit approval
record before proceeding.

**Rationale:** directive §13 (approval for destructive/external/financial
operations) and §6.3 (human approval for consequential operations).
