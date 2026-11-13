"""Naming conventions + scale constants (blueprint Part 6)."""

PREFIX_STATIC = "SM_"
PREFIX_SKELETAL = "SK_"
PREFIX_MATERIAL = "M_"
PREFIX_TEXTURE = "T_"
PREFIX_ANIM = "A_"
PREFIX_COLLISION = "COL_"

LOD_SUFFIXES = ("", "_LOD1", "_LOD2")
#: LOD0 keeps the bare name (SM_House); LOD1/LOD2 carry explicit suffixes.

UNIT_SCALE_M = 1.0  # 1 Blender unit == 1 metre (validation enforces)

#: Blueprint default triangle budgets: asset -> (LOD0 min, LOD0 max)
TRI_BUDGETS = {
    "house": (15_000, 40_000),
    "shop": (20_000, 50_000),
    "prop": (500, 5_000),
    "character": (30_000, 60_000),
}
#: LOD1 ~ 50% of LOD0, LOD2 ~ 20% of LOD0 (blueprint "LOD suffixes").
LOD_RATIOS = (1.0, 0.5, 0.2)


def static_mesh_name(asset: str, lod: int = 0) -> str:
    return f"{PREFIX_STATIC}{asset}{LOD_SUFFIXES[lod]}"


def collision_name(asset: str, part: str = "") -> str:
    return f"{PREFIX_COLLISION}{asset}" + (f"_{part}" if part else "")


def material_name(asset: str, slot: str) -> str:
    return f"{PREFIX_MATERIAL}{asset}_{slot}"


def texture_name(slot: str, kind: str) -> str:
    return f"{PREFIX_TEXTURE}{slot}_{kind}"


def is_valid_asset_name(name: str) -> bool:
    """Blueprint naming check for mesh datablocks."""
    if name.startswith(PREFIX_COLLISION):
        return name == name  # collision names validated separately
    for pref in (PREFIX_STATIC, PREFIX_SKELETAL):
        if name.startswith(pref):
            base = name[len(pref):]
            if "_LOD" in base:
                base, _, lod = base.rpartition("_LOD")
                if lod not in {"1", "2"}:
                    return False
            return len(base) > 0
    return False
