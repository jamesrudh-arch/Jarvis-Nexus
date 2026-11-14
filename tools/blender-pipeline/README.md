# NEXUS Blender Production Pipeline

Primary 3D asset production environment (directive §9). Consumes
ConstructionSpec structures emitted by the NEXUS Creation Engine
(`packages/world/src/creation.ts`, exposed via `POST /world/construct`).

## Pipeline stages (directive §9.2)

```
ASSET REQUEST → SPECIFICATION → MODELLING → GEOMETRY VALIDATION →
UV VALIDATION → MATERIALS → TEXTURES → RIGGING → ANIMATION →
OPTIMISATION → EXPORT → UNREAL IMPORT → COLLISION → LOD → RUNTIME TEST
```

Implemented here:

| Stage | Where | Runs |
| --- | --- | --- |
| SPECIFICATION | Creation Engine → `build_spec()` | NEXUS API (verified) |
| MODELLING | `generate_building.py` (bpy, parametric shells, windows, roofs, materials) | Blender 4.x workstation |
| GEOMETRY VALIDATION | `validate_geometry()` + `validate_asset.py` harness | headless (CI) + workstation |
| EXPORT | `export_fbx()` (FBX, unit-scaled) | Blender 4.x workstation |
| UNREAL IMPORT | via Unreal MCP / manual import of exported FBX | owner workstation (UE 5.8+) |

Workstation-only stages (materials/textures beyond defaults, rigging,
animation, LOD) execute through the Blender MCP integration
(`ahujasid/mcp-for-blender`, MIT — registry TECH-013) once the owner's
Blender host is attached to the NEXUS MCP gateway.

## Usage

```bash
# headless spec validation (no Blender required)
python3 validate_asset.py spec.json

# in Blender (4.x) — generation + validation + FBX export
blender --background --python generate_building.py -- \
  --spec spec.json --structure st_3 --out /tmp/building.fbx
```

## Quality standards (directive §9.3)

Automated: dimension ranges (1–200 m), road width >= 3 m, structure overlap
<= 20%, required spec/structure fields, road proximity warnings.
`validate_asset.py` exits non-zero on violations and is CI-runnable.
