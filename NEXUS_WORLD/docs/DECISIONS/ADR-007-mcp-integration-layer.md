# ADR-007 — MCP Integration Layer and the System-Wide Integration Pattern

**Status:** Accepted (2026-11-13) · **Phase:** 1B (Integration Directive)
· **Supersedes:** none · **Related:** ADR-002 (event sourcing), ADR-006
(JARVIS NEXUS convergence)

## Context

The Mandatory System-Wide Integration Directive requires: a reusable MCP
integration layer (discovery, tool schemas, registration, permissions,
execution, error handling, logging, health); real connections to relevant
MCP servers; every integrated tool registered with the ONE central
orchestrator; and a live register in which nothing is OPERATIONAL without
evidence.

## Decision

1. **One MCP dependency: the official `mcp` SDK, 1.x line pinned
   `>=1.27,<2`.** The installed 1.27.0 provides both the stdio client
   (`ClientSession`, `stdio_client`) and the server-side `FastMCP` used
   by our exposure server. The SDK's 2.x removes the bundled FastMCP and
   the separate `fastmcp` PyPI package (4.x) is a duplicate capability —
   directive §6 rejects duplicates. Upgrade path documented in the
   register (migrate the exposure server before any 2.x move).

2. **Threading model.** One daemon thread + event loop per connected
   stdio server; the session lives inside that loop; all public layer
   methods are synchronous and thread-safe. Verified constraints encoded
   in code: Playwright sync API gets its own worker thread (never inside
   asyncio); a `Thread` subclass must never define a `_stop` attribute
   (shadows CPython internals); `Event.set()` must be scheduled with
   `loop.call_soon_threadsafe`, not `run_coroutine_threadsafe`.

3. **Child environment hygiene.** The SDK's default child env omits
   `HOME`, which makes `npx` hang indefinitely (empirically verified).
   The layer passes a full environment with credential-like variables
   (TOKEN/SECRET/PASSWORD/API_KEY/CREDENTIAL patterns) stripped — tool
   servers can run, but can never see the founder token.

4. **Least privilege, twice.** External MCP servers are launched with
   server-side restrictions where available (filesystem server:
   `--read-only`) AND a layer-level tool allowlist. Verified: write tools
   are not even served; the allowlist blocks anything the server does
   expose.

5. **One orchestrator, one authority.** Every tool — MCP, browser,
   vision, voice — registers on the single `CommandOrchestrator`
   capability registry and is reachable through the same permission →
   approval → audit path (HTTP `/command`, MCP `execute_command`, or
   direct code). `InstrumentedOrchestrator` adds telemetry only.

6. **Dual-natured register.** `integration/register.json` +
   `INTEGRATION_REGISTER.md` are the durable ledger (states
   evidence-gated in code: no OPERATIONAL without evidence, no state
   regressions); `GET /integrations` + `GET /integrations/health` are the
   live process view. Rejected/deferred technologies are first-class
   entries with precise reasons and triggers — the register is an honest
   record of selection, not a trophy list.

7. **Security loop is part of integration.** bandit + pip-audit run as
   evidence; findings trigger remediation (this phase: 5 starlette CVEs →
   fastapi 0.162.6/starlette 1.10.0 → full regression re-run) before
   anything is recorded as operational.

## Consequences

- Adding an MCP server is a config object (command + args + allowlist) —
  the layer handles discovery, registration, health.
- The JARVIS platform is simultaneously an MCP *client* (consumes
  servers) and an MCP *server* (exposes world capabilities) with one
  permission system.
- Known limits: stdio only at Tier 0 (Streamable HTTP at Tier 1);
  per-call token for the exposure server (stdio carries no headers);
  npx/Node 24 runtime dependency for the filesystem server.
- 39/39 integration acceptance checks + 48/48 Phase 1 + 11/11 Phase 0
  regressions recorded in `reports/INTEGRATION_TEST_OUTPUT.txt`.
