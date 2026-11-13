# CHANGES — JARVIS NEXUS Approved Blueprint

Change register for `docs/blueprint/`. Entries below record every intake,
decision, and open question. Blueprint files themselves are VERBATIM extracts
of the approved Master Engineering Directive (owner-supplied 2026-11-13) and
are never edited in place — changes require a new entry here.

Documentation authority order (D8) is unchanged: user-approved decisions >
engineering baseline > ENGINEERING_DECISIONS.md > ARCHITECTURE.md >
IMPLEMENTATION_BACKLOG.md > PROJECT_STATE.md > CHANGELOG.md >
RESEARCH_REGISTER.md. The blueprint files sit with the engineering baseline:
they are the approved build specification extracted from the owner directive.

---

## Entry 001 — 2026-11-13 — INITIAL INTAKE (Phase 0B)

**Action:** Seven blueprint files created verbatim from the Master Engineering
Directive. No wording changed, nothing summarised, no content invented.

**Source:** the approved Master Engineering Directive as supplied by the owner
(the authoritative supplied content; no separate blueprint files were ever
provided — owner GO "extract from directive" received 2026-11-13).

**Verification:** byte-level match of every extracted section against its
source slice (script: `scripts/extract_blueprints.py`, re-runnable);
line-count verification below; coverage accounting closes exactly
(1705 extracted + 60 structural separators + 516 governance = 2281 source
lines; 0 non-structural lines unaccounted).

### 1. Source-to-destination mapping

| Source (directive) | Source lines | Lines | Destination file |
| --- | --- | --- | --- |
| PART 2 — Complete project vision + 2.1 system architecture diagram | 111–181 | 71 | laboratory-and-nexus.md |
| PART 3 — JARVIS (3.1 intelligence, 3.2 voice pipeline diagram, 3.3 embodiment, 3.4 interface philosophy) | 185–330 | 146 | laboratory-and-nexus.md |
| PART 4 — heading + intro + 4.1 world geography diagram + 4.2 geographic standards + 4.3 six regions + 4.4 seven settlements | 334–519 | 186 | world-topology.md |
| 4.5 City planning + 4.6 Village and district requirements | 521–660 | 140 | city-plans.md |
| 4.7 Terrain and water | 662–684 | 23 | world-topology.md |
| PART 5 — Unreal Engine 5: primary world engine (complete) | 688–765 | 78 | world-topology.md |
| PART 6 — Blender: complete asset production pipeline (complete) | 769–886 | 118 | animation-and-blender-pipeline.md |
| PART 7 — heading + register format + "7.1 Mandatory implementation repositories" heading | 890–914 | 25 | laboratory-and-nexus.md |
| 7.1.A Unreal Engine repository entry | 916–922 | 7 | world-topology.md |
| 7.1.B Blender repository entry | 924–930 | 7 | animation-and-blender-pipeline.md |
| 7.1.C FreeMoCap repository entry + capture-to-animation pipeline diagram | 932–963 | 32 | animation-and-blender-pipeline.md |
| 7.1.D Natron repository entry | 965–980 | 16 | animation-and-blender-pipeline.md |
| 7.1.E Theatre.js repository entry | 982–996 | 15 | animation-and-blender-pipeline.md |
| 7.1.F–I CARLA, SUMO, Mesa, PettingZoo + authoritative-state-owner rule | 998–1024 | 27 | population-animals-transport-economy.md |
| 7.2 Additional mandatory technology evaluations | 1026–1074 | 49 | laboratory-and-nexus.md |
| PART 8 — Architecture and building systems (complete) | 1078–1200 | 123 | architecture-bible.md |
| PART 9 — Population and civilisation simulation (9.1–9.5, complete) | 1204–1377 | 174 | population-animals-transport-economy.md |
| PART 10 — Economy and environment (10.1–10.3, complete) | 1381–1488 | 108 | population-animals-transport-economy.md |
| PART 11 — Laboratory (complete, incl. architecture diagram) | 1492–1581 | 90 | laboratory-and-nexus.md |
| PART 12 — NEXUS orchestration and mission system (complete, incl. lifecycle diagram) | 1585–1663 | 79 | laboratory-and-nexus.md |
| PART 13 — Seven owner switches | 1667–1692 | 26 | acceptance-and-evidence.md |
| PART 14 — Security and reliability | 1696–1729 | 34 | acceptance-and-evidence.md |
| PART 15 — Performance and optimisation | 1733–1775 | 43 | acceptance-and-evidence.md |
| PART 17 — Visual evidence and deliverables | 2025–2057 | 33 | acceptance-and-evidence.md |
| PART 20 — Required phase report | 2120–2150 | 31 | acceptance-and-evidence.md |
| PART 21 — Acceptance standard | 2154–2177 | 24 | acceptance-and-evidence.md |

**File totals (content lines / bytes):** world-topology.md 297/7,812 ·
city-plans.md 140/2,100 · architecture-bible.md 123/1,816 ·
population-animals-transport-economy.md 311/5,036 ·
animation-and-blender-pipeline.md 192/3,250 · laboratory-and-nexus.md
465/10,232 · acceptance-and-evidence.md 196/4,128.

**Not extracted (process/governance — remains in the master directive only):**
directive preamble (1–110: title, classification, role, objective,
implementation-assignment statements) · PART 1 execution directive · PART 16
phased implementation · PART 18 documentation structure · PART 19 git and
change management · PART 22 owner working agreement · PART 23 execution
instructions + FIRST ACTION.

### 2. Extraction decisions (documented, reversible, not silent)

- **D-B1 Section placement follows the phase "Read:" dependencies in Part 16.**
  Each blueprint file contains every section its consuming phase must read
  (e.g. Phase 3 reads world-topology.md → it holds Part 4 geography + Part 5
  Unreal + the 7.1.A Unreal repository entry).
- **D-B2 Part 7 repository entries are distributed by domain** (world engine →
  world-topology; production/animation stack → animation-and-blender-pipeline;
  simulation/traffic/population → population-animals-transport-economy). The
  register-format preamble and the "7.1" heading are preserved once, in
  laboratory-and-nexus.md (NEXUS = integration infrastructure); the mapping
  table above shows where each entry A–I lives.
- **D-B3 Part 2 + Part 3 (JARVIS) are placed in laboratory-and-nexus.md**
  because Phase 12 (JARVIS embodiment and voice) reads laboratory-and-nexus.md,
  and NEXUS is the intelligence/orchestration/voice substrate of the Part 2
  architecture diagram.
- **D-B4 Part 13/14/15/17/20/21 are placed in acceptance-and-evidence.md**
  because Phase 1 (security) and Phase 14 (missions and observability) read
  that file, and these parts define the acceptance, security, performance and
  evidence standards.
- **D-B5 Structural separators excluded.** Trailing "⸻" part-separator lines
  and trailing blank lines at range ends are delimiters of the master
  directive, not blueprint content. All other lines are byte-preserved.
  Sections are joined with a single blank line, matching the source's own
  section separation. No other normalisation was performed.
- **D-B6 Blueprint files carry no added headers or commentary** — verbatim
  directive text only. All provenance lives in this register.

### 3. Findings — missing, ambiguous, contradictory or incomplete specifications

Identified during intake verification. NOT resolved silently; each requires an
owner ruling or a documented engineering decision at its consuming phase.

**Arithmetic / internal consistency**

- **F-A1 (AMBIGUOUS — population roster).** Part 9.2 header: "Create 50
  inhabitants"; the enumerated roster sums to **45** (six families ≈ 20 people
  + 29 named single/duo roles = 45; verified by script). To reach 50 either
  the families must be ≈ 25 people or five additional inhabitants must be
  defined. Ruling needed before Phase 7 (default proposed if silent: families
  total 25, preserving every named role — but this will NOT be applied without
  the owner's confirmation).
- **F-A2 (AMBIGUOUS — "Understocked" business state).** Part 10.1 lists
  business states Open / Closed / Understocked but defines no threshold for
  Understocked, and the rules reference per-item "out-of-stock". State
  machine underspecified (is Understocked derived? from what threshold?).
- **F-A3 (AMBIGUOUS — public-facility interior template).** Part 8's
  "enterable public facility" interior (reception, waiting area, two
  consulting rooms, staff room) is clinic-shaped, while the public category
  spans schools, libraries, museums, etc. Consistent with the Phase 6 default
  (clinic) but not with the wider category in later phases.

**Missing specifications (undefined where a value is required)**

- **F-M1 Village ID prefix.** ID examples define REG/CTY/TWN/DST/RDS/BLD/WTR/
  PRK — no prefix for the eight-plus villages (TWN-001 is a town). Proposal
  reserved for owner ruling (e.g. VLG-###) — not applied.
- **F-M2 Railway ID prefix.** Railways are mandatory (4.1, Phase 5) but no ID
  prefix is defined (RDS is roads). Same class as F-M1.
- **F-M3 Atlas storage format.** Part 4/Phase 5 imply GeoJSON ("Never
  substitute empty GeoJSON files") but no explicit format/schema is specified
  for atlas datasets, district polygons, or the SVG master maps' data source
  of truth.
- **F-M4 Village names and placement.** "At least eight villages along rural
  roads in the Western, Southern and Highland regions" — names, counts per
  region and coordinates are undefined (design freedom, to be proposed at
  Phase 5 for approval).
- **F-M5 JARVIS character model source for Unreal.** Part 3.3 requires
  embodiment in Unreal; the approved model exists as a web-optimised GLB
  (Three.js pipeline) plus the MetaHuman bring-up path already documented in
  IMPLEMENTATION_BACKLOG (owner-side, UE 5.6/5.7 + Blender). Directive does
  not name which path is authoritative for the Unreal build.

**Contradictions / tensions with the existing repository**

- **F-C1 (CONTRADICTION — Unreal project path and name).** Directive Part 5
  mandates `world/Unreal/JarvisWorld.uproject`; the repository has
  `unreal/JarvisNexus.uproject` (EOS plugin skeleton, session 4). Decision
  needed at Phase 3: migrate + rename to the directive layout (preserving the
  EOS plugin work) or keep the existing name. Directive text wins unless the
  owner rules otherwise; nothing will be moved before that phase begins.
- **F-C2 (CONTRADICTION — Blender directory layout).** Directive Part 6
  mandates `world/Blender/` with 14 subdirectories; the repository has
  `blender/` (scripts only, no assets — Part 6 explicitly insufficient).
  Phase 4 will create the directive layout; existing scripts migrate.
- **F-C3 (TENSION — public API surface).** Part 14: "Only approved health
  endpoints should be public." The production app currently exposes five
  public status-only GET routes (health, world, switches, scenarios,
  telemetry) by the session-8b engineering decision (boot surface). Needs
  explicit owner confirmation that these count as "approved", or they must be
  gated at Phase 1.

**Incomplete / external dependencies (blocked, tracked, not silently dropped)**

- **F-E1 Performance targets (Part 15) and captures (Part 17)** require a
  running Unreal build; sandbox has no GPU/UE (Phase 0 blocker B2). Deferred
  to owner hardware; targets remain measured-not-claimed.
- **F-E2 Production verification** blocked while Railway is down (Phase 0
  blocker B1).
- **F-E3 Provider credentials.** Part 3.1 lists OpenAI-compatible, Anthropic,
  Gemini and Ollama "where credentials and runtime support exist" — no
  Anthropic/Gemini credentials are in the authorised set; Groq key pending
  (B4); EOS portal association pending (B5).

### 4. Line-count verification summary

| File | Sections | Content lines | Byte-verified |
| --- | --- | --- | --- |
| world-topology.md | 4 | 297 | YES |
| city-plans.md | 1 | 140 | YES |
| architecture-bible.md | 1 | 123 | YES |
| population-animals-transport-economy.md | 3 | 311 | YES |
| animation-and-blender-pipeline.md | 5 | 192 | YES |
| laboratory-and-nexus.md | 6 | 465 | YES |
| acceptance-and-evidence.md | 6 | 196 | YES |
| **Total** | **26** | **1,705** | **ALL** |

Coverage accounting: 1,705 extracted content + 60 structural separators + 516
governance lines = 2,281 = source total. Zero non-structural lines
unaccounted. Cross-reference integrity: every Part 16 phase "Read:" target
exists and contains its required sections (Phase 3→world-topology ✓,
Phase 4→architecture-bible+animation ✓, Phase 5→world-topology+city-plans ✓,
Phase 6→city-plans+architecture-bible ✓, Phase 7→population+animation ✓,
Phase 12/13→laboratory-and-nexus ✓, Phase 14→laboratory-and-nexus+
acceptance-and-evidence ✓, Phase 1→acceptance-and-evidence ✓).
