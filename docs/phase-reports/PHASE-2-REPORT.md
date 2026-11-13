# PHASE 2 REPORT — TECHNOLOGY REGISTER

**Project:** JARVIS NEXUS
**Directive:** Master Engineering Directive, Part 16 PHASE 2 ("Research every mandatory repository and technology. This phase is research only. No unnecessary installations. Deliver a licence-verified integration register.")
**Session:** 9 (continued)
**Branch:** `phase-2-technology-register`
**Status:** PHASE 2 COMPLETE (research deliverable).

---

## 1. FILES CREATED

| File | Purpose |
| --- | --- |
| `docs/research/TECHNOLOGY_REGISTER.md` | The licence-verified integration register (the phase deliverable) |

## 2. FILES MODIFIED

`RESEARCH_REGISTER.md` (cross-link added) · `PROJECT_STATE.md` · `CHANGELOG.md`.

## 3. REPOSITORIES INTEGRATED

**None — by directive.** Phase 2 is research-only; zero installations were made.
Every adoption lands in its consuming phase with integration evidence.

## 4. COMMANDS EXECUTED

Public web research only: 15 targeted licence/version verification queries
against official repositories and vendor pages (GitHub repos, freemocap.org,
natrongithub.github.io, infinigen.org, pipecat.ai, getzep.com, carla.org,
eclipse.dev/sumo, mesa.readthedocs.io, arize.com/docs/phoenix, openusd.org,
cesium.com, blender-addons.org, gumroad Pro pages). No credentials used
beyond public pages; no paid access.

## 5–7. TESTS PASSED / FAILED / COUNTS

Not applicable (research phase — no code, no tests). Verification is the
register's internal consistency: 9 mandatory repository records (A–I) each
carry all 13 directive-required fields; 27 additional technologies (7.2 list)
each carry purpose/licence/obligations/integration-approach/decision;
every licence claim cites its verification source and date.

## 8. RUNTIME EVIDENCE

Not applicable (research). Key verified facts (sources inline in the register):
FreeMoCap AGPL-3.0 · Natron GPLv2+ · Theatre.js Apache-2.0 core / AGPL-3.0
studio (dev-only) · CARLA MIT + CC-BY assets · SUMO EPL-2.0 · Mesa Apache-2.0 ·
PettingZoo MIT · LangGraph MIT · Pipecat BSD-2-Clause · Graphiti Apache-2.0 ·
OpenHands MIT · Automerge MIT · Phoenix Elastic License 2.0 (self-host OK) ·
OpenUSD Modified Apache 2.0 · Infinigen BSD-3-Clause · Cesium for Unreal
Apache-2.0 (plugin) + commercial ion data · Blosm freemium (Pro PAID ~€18).

## 9. SCREENSHOTS AND CAPTURE PATHS

Not applicable.

## 10. HARDWARE USED

Sandbox (web research only).

## 11. PERFORMANCE MEASUREMENTS

Not applicable.

## 12. BLOCKERS

None new. Existing B1–B5 carried. Adoption of Unreal (B2) and Blender (B3)
proceeds as stated in the register with exact missing executables recorded.

## 13. ROLLBACK COMMAND

```bash
cd /home/z/my-project/repo && git revert <phase-2 commit>
```
(Documentation-only change.)

## 14. REMAINING WORK

Phase 3 — Unreal Foundation (reads `docs/blueprint/world-topology.md`).
Owner rulings still pending: F-C1 (project path/name) directly affects
Phase 3 — **the ruling is requested before the Unreal project layout is
finalised**; absent a ruling, the directive text (`world/Unreal/JarvisWorld.uproject`)
wins per the authority order, with the existing `unreal/` skeleton migrated
and preserved in git history.

## 15. REQUIREMENT STATUS LABELS

| Requirement | Status |
| --- | --- |
| Research every mandatory repository (7.1 A–I) | **IMPLEMENTED AND VERIFIED** (9/9 records, 13 fields each) |
| Research every additional technology (7.2, 27 items) | **IMPLEMENTED AND VERIFIED** (27/27 classified) |
| Licence-verified register with sources | **IMPLEMENTED AND VERIFIED** (every licence verified 2026-11-13, source named) |
| ADOPT NOW / ADOPT LATER / EVALUATE / REJECT classification | **IMPLEMENTED AND VERIFIED** (11 / 6 / 13 / 7, each with documented reason) |
| Licence obligations recorded (AGPL/ELv2/GPL/UE EULA/ASAM/CC0/ODbL) | **IMPLEMENTED AND VERIFIED** (§4 licence-risk register) |
| No unnecessary installations | **IMPLEMENTED AND VERIFIED** (zero installs; register-only phase) |
| Actual integration of adopted items | **NOT STARTED** — by design: each ADOPT lands in its consuming phase (3/4/6/7/9/12/14) with execution evidence |

**PHASE 2 COMPLETE — NEXT: PHASE 3 (UNREAL FOUNDATION).**
