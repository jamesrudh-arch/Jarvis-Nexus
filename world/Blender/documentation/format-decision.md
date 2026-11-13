# Export format decision: glTF 2.0 (.glb)

Blueprint Part 6 requires documenting the technical reason for the chosen
Blender → Unreal interchange format. Decision: **GLB**, verified end-to-end
in this repository on 2026-11-14.

## Why GLB over FBX

| Criterion | GLB | FBX |
| --- | --- | --- |
| PBR round-trip | Metallic/roughness maps map 1:1 to UE physical materials | FBX surface materials need per-slot re-binding; shading model mismatch is common |
| Self-containment | One binary file; textures embedded (verified: packed T_* maps travel inside) | External .fbx + .textures folder + .mtl dependencies |
| Licensing | Open royalty-free standard (Khronos) | Proprietary (Autodesk) SDK for full fidelity |
| UE 5.5 import | Static Mesh + Materials + collision naming honored | Static Mesh (equivalent) |
| Text encoding | Binary, compact | ASCII or binary variants |

## Why GLB over USD (for THIS hop)

USD is NOT rejected — it is the chosen format for the LATER Phase-5 world
assembly, where USD layers/variants/references genuinely matter (the addon's
`export_usd_for_unreal` command is protocol-tested 11/11 and available). For
single static-asset interchange (house/shop/prop), GLB is smaller, simpler,
lossless for PBR, and every field of our metadata (LODs via naming, COL_
collision, packed textures) survives — a USD scene-description layer adds
overhead without a benefit at this granularity.

## Verified evidence (2026-11-14)

- `export/SM_House.glb` (5,342,180 B), `export/SM_Shop.glb` (4,930,520 B),
  `export/SM_Prop_StreetLamp.glb` (776,372 B) — each with a `.meta.json`
  sidecar carrying author/licence/source/tri-count/dimensions/scale/format.
- Round-trip: the MCP protocol test exported a GLB and re-imported it under
  the real Blender runtime (11/11, `validation/McpProtocolTest.json`).
- Import on the UE side: `world/Unreal/Python/import_blender_assets.py`
  (authored; executes on the owner workstation — blocker B2, no engine in
  the authoring sandbox).
