"""JARVIS NEXUS — Blender asset-production library (blueprint Part 6).

Runs under a REAL Blender runtime:
  * in-editor:   Blender 4.2+ / 5.x with this repo on PYTHONPATH
  * headless:    ``pip install bpy`` (Blender-as-a-module; used by the
                 sandbox build driver and CI validation)

Everything the blueprint demands of the asset pipeline is implemented here
once and consumed by ``scripts/build_assets.py`` (asset creation),
``scripts/validate.py`` (the executable validator) and
``scripts/export_assets.py`` (batch export + metadata).

Conventions (blueprint "Asset naming"):
  SM_  static mesh      SK_  skeletal mesh    M_  material
  T_   texture          A_   animation       COL_ collision
  _LOD0/_LOD1/_LOD2     level-of-detail suffixes (100% / ~50% / ~20%)
Scale: 1 Blender unit == 1 metre. Transforms applied before export.
"""

__version__ = "1.0.0"
