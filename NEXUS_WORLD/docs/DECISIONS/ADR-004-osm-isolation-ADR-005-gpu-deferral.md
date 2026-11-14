# ADR-004: OSM data isolation for ODbL compliance; ADR-005: Defer GPU/UE5 tier

Status: ACCEPTED · Date: 2026-11-13 · Phase: 0

## ADR-004 — OpenStreetMap isolation

Context: OSM data is ODbL 1.0 (VERIFIED, full licence text fetched). §4.4 share-alike: a Derivative Database built from OSM that is publicly used must itself be offered under ODbL. The NEXUS world database must not become accidentally share-alike.

Decision:
1. Imported OSM data lives in a **separate schema/database** (`osm_import`) that the world store references by ID, never merges into its own tables.
2. All public outputs carrying OSM-derived content include the attribution "© OpenStreetMap contributors".
3. Fictional/procedural geography is generated independently of OSM and is the default substrate (spec §12 requires keeping the two distinct).
4. Only Geofabrik city-scale extracts are used at Tier 0/1 (planet file ≈ 89 GiB — cannot fit 8 GB disk; VERIFIED).

Consequences: if the world is ever publicly released, the OSM-derived `osm_import` layer can be published under ODbL while the fictional world database stays under our terms. This is an engineering interpretation, not legal advice; a legal review is listed in KNOWN_LIMITATIONS.

## ADR-005 — GPU / Unreal Engine tier deferral

Context: UE5 verified requirements: 32 GB RAM, GPU with 8 GB VRAM, Ubuntu 22.04/Windows; the EULA text itself is UNVERIFIED from this network (unrealengine.com blocked, 403). CARLA needs ≥8 GB VRAM + 20 GB disk. vLLM/SGLang are GPU-first. Current hardware: none of this can run.

Decision:
1. The rendering tier is deferred to Tier 2 hardware; simulation correctness and persistence do not depend on it (spec §10 honoured).
2. Interim visual observation at Tier 1 is CesiumJS (Apache-2.0) with self-hosted tiles — no Cesium ion dependency (free tier is non-commercial and term-bound; VERIFIED ToS).
3. Before any UE adoption: (a) re-verify the EULA from an unrestricted network, (b) confirm dedicated-server headless usage, (c) ADR on royalty obligations.

Consequences: the "interactive 3D world experience" (spec §26–27) is explicitly a later-phase deliverable; Phase 0–3 focus on the authoritative civilisation. This is a sequencing decision, not a scope reduction.
