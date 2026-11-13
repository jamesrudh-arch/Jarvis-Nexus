# JARVIS NEXUS — Blender Asset Production (blueprint Part 6)

`world/Blender/` is the REAL asset-production system connected to Unreal
(Master Directive Part 6; blueprint `docs/blueprint/animation-and-blender-pipeline.md`).

**Status: BUILT + VALIDATED + EXPORTED (2026-11-14).** All three initial
assets are actual Blender project files produced by the automation library
under a real Blender 5.0.1 runtime (`pip install bpy` — the same Python API
the editor exposes), validated by the executable validator (exit 0), and
exported to GLB for the Unreal import hop. Evidence:

| Asset | .blend | LOD0 tris (budget) | LOD1/LOD2 | Collision |
| --- | --- | --- | --- | --- |
| SM_House | `architecture/SM_House.blend` | 38,756 (15k–40k) | 19,378 (50%) / 7,750 (20%) | 6 boxes |
| SM_Shop | `architecture/SM_Shop.blend` | 31,764 (20k–50k) | 15,882 (50%) / 6,352 (20%) | 3 boxes |
| SM_Prop_StreetLamp | `assets/SM_Prop_StreetLamp.blend` | 4,128 (500–5k) | 2,064 (50%) / 824 (20%) | 3 cylinders |

Validation report: `validation/ValidationReport.json` (all_valid: true).
Previews (Cycles CPU evidence renders): `validation/previews/*.png`.
MCP protocol test under real Blender: 11/11 —
`validation/McpProtocolTest.json` + `scripts/test_blender_mcp.py`.

## Layout (blueprint-mandated)

```
world/Blender/
├── scenes/            (preview camera/sun live inside each asset .blend)
├── scripts/           automation library + drivers (see below)
├── assets/            SM_Prop_StreetLamp.blend
├── architecture/      SM_House.blend, SM_Shop.blend
├── interiors/ furniture/ characters/ animals/ vehicles/   (next asset waves)
├── materials/         (materials live packed inside the .blends, M_* names)
├── textures/          (T_* maps packed inside the .blends, 512×512 PBR)
├── animations/ rigs/  (character track: blender/scripts/ + public/models)
├── export/            GLB + .meta.json sidecars + ExportReport.json
├── validation/        ValidationReport.json, BuildReport.json, previews/, McpProtocolTest.json
└── documentation/     format decision + pipeline docs
```

## Automation library (`scripts/nexusblender/`)

| Module | Blueprint capability |
| --- | --- |
| `architecture.py` | procedural modelling, architectural modular kits, building generation (house/shop), interiors (shop counter+shelving), furniture parts, props |
| `materials.py` + `textures.py` | PBR materials + procedural power-of-two (512²) base-colour/roughness maps, packed |
| `uvmap.py` | UV automation (headless-safe bmesh box projection) |
| `collision.py` | COL_* collision generation |
| `lods.py` | LOD generation (~50% / ~20%, decimate applied for real) |
| `metadata.py` | metadata JSON (author/licence/source/tris/dimensions/scale/format), packed META_* + sidecar |
| `naming.py` | SM_/SK_/M_/T_/A_/COL_ conventions + budgets |
| `trimesh.py` | triangle counting (evaluated), transform application |

Drivers: `build_all.py` (per-asset subprocess isolation — Blender never
returns freed memory to the OS), `validate.py` (the executable validator),
`export_assets.py` (GLB + metadata), `render_previews.py` (Cycles evidence).

## Blender -> Unreal hop

`world/Unreal/Python/import_blender_assets.py` (run in-editor on the owner
machine) imports every GLB into `/Game/Procedural/...`, attaches the
_LOD1/_LOD2 meshes as real LODs, and writes `Saved/BlenderImportReport.json`.
Format decision (glTF 2.0 GLB over FBX/USD) — rationale in
`documentation/format-decision.md`.

## MCP (editor control)

The in-Blender MCP server (`blender/jarvis_blender/mcp_server.py`, port 9876)
is protocol-tested under a real Blender runtime: 11/11 commands including
scene creation, PBR material application, GLB import/export, USD export,
whitelist rejection of unknown tools and invalid JSON. Two real bugs were
caught and fixed by that test (args-dict dispatcher blow-up; empty wire
floor disc). `BLENDER_MCP_URL` connects JARVIS CORE
(`src/lib/nexus/integrations/blenderMcp.ts`) to a live editor session.

## Regenerate everything

```bash
# headless (sandbox/CI): real Blender via the bpy wheel
.venvs/blender/bin/python world/Blender/scripts/build_all.py     # 3 assets
.venvs/blender/bin/python world/Blender/scripts/validate.py      # exit 0
.venvs/blender/bin/python world/Blender/scripts/export_assets.py # GLB + meta
.venvs/blender/bin/python world/Blender/scripts/render_previews.py

# in-editor (owner machine): install blender/jarvis_blender as an addon,
# then use the MCP surface (see blender/README.md)
```
