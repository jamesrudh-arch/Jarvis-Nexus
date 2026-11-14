"""Action → RGB colour (0..1) shared by the sim and 3D layers.

Kept in its own tiny module so BOTH Python versions (3.12 sim side and
3.13 bpy side) import it without pulling heavy deps.
"""
ACTION_COLOR = {
    "sleeping": (0.30, 0.40, 0.85),
    "eating": (0.95, 0.85, 0.25),
    "working": (0.95, 0.55, 0.15),
    "socializing": (0.92, 0.45, 0.65),
    "leisure": (0.25, 0.75, 0.70),
    "commuting": (0.92, 0.92, 0.95),
    "idle": (0.55, 0.55, 0.58),
}
