"""Physics and interactions (Blender side, bpy venv) — PRIORITY 4.

Real Blender rigid-body simulation, headless: drops a deterministic set
of bodies onto the NEXUS WORLD terrain/city, bakes the point cache, then
READS BACK the baked keyframes to report genuine impact/bounce numbers
(no invented physics results — everything measured from the baked fcurves).
"""
from __future__ import annotations

import json
import time

from render3d.worldgen import _h01


def _result(**kw) -> str:
    return json.dumps(kw, sort_keys=True)


def run_physics(bounds, n_bodies: int = 12, frames: int = 96,
                seed: str = "physics") -> str:
    """Rigid-body drop test.

    1. ensure a rigidbody world exists
    2. add an invisible passive ground + the city's buildings as passive
       colliders is NOT needed (terrain already exists — we add bodies)
    3. spawn n_bodies spheres/cubes at hashed positions above the scene
    4. bake the point cache over `frames`
    5. read back baked z-locations per body → rest height, drop distance,
       bounce count (z local minima after the first impact)
    """
    import bpy
    t0 = time.time()
    minx, miny, maxx, maxy = bounds

    scene = bpy.context.scene
    if scene.rigidbody_world is None:
        bpy.ops.rigidbody.world_add()
    rbw = scene.rigidbody_world
    rbw.point_cache.frame_start = 1
    rbw.point_cache.frame_end = frames

    # passive ground collider (catches everything, even off-terrain)
    bpy.ops.mesh.primitive_plane_add(
        size=1, location=((minx + maxx) / 2, (miny + maxy) / 2, -0.4))
    ground = bpy.context.active_object
    ground.name = "nx_phys_ground"
    ground.scale = ((maxx - minx) * 1.5, (maxy - miny) * 1.5, 1.0)
    ground.hide_render = True
    bpy.ops.rigidbody.object_add()
    ground.rigid_body.type = "PASSIVE"
    ground.rigid_body.collision_shape = "BOX"
    ground.rigid_body.restitution = 0.35

    bodies = []
    for i in range(n_bodies):
        rx = _h01(seed, "x", i)
        ry = _h01(seed, "y", i)
        x = minx + (0.2 + 0.6 * rx) * (maxx - minx)
        y = miny + (0.2 + 0.6 * ry) * (maxy - miny)
        z = 14.0 + 6.0 * _h01(seed, "z", i)
        if _h01(seed, "shape", i) < 0.5:
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.45,
                                                 location=(x, y, z))
        else:
            bpy.ops.mesh.primitive_cube_add(size=0.8, location=(x, y, z))
        obj = bpy.context.active_object
        obj.name = f"nx_phys_body:{i}"
        bpy.ops.rigidbody.object_add()
        obj.rigid_body.type = "ACTIVE"
        obj.rigid_body.restitution = 0.45
        obj.rigid_body.friction = 0.6
        bodies.append(obj)

    # ------------------------------------------------ bake the simulation
    try:
        bpy.ops.ptcache.bake_all(bake=True)
    except RuntimeError as exc:  # honest failure surface
        return _result(ok=False, stage="bake", error=str(exc))

    # ------------------------------------------------ read back results
    # Rigid-body results live in the point cache, NOT in object actions:
    # the honest read-back is per-frame scene evaluation (frame_set +
    # evaluated depsgraph), sampling each body's world-space z.
    results = []
    sample_step = 2                       # sample every 2nd frame
    for obj in bodies:
        zs = []
        for f in range(1, frames + 1, sample_step):
            scene.frame_set(f)
            dg = bpy.context.evaluated_depsgraph_get()
            ev = obj.evaluated_get(dg)
            zs.append((f, round(ev.matrix_world.translation.z, 4)))
        if len(zs) < 3 or all(abs(z - zs[0][1]) < 1e-6 for _, z in zs):
            results.append({"body": obj.name, "simulated": False,
                            "note": "no movement recorded"})
            continue
        z_first, z_rest = zs[0][1], zs[-1][1]
        # bounces = local minima after the first descent
        bounces = 0
        for a, b, c in zip(zs, zs[1:], zs[2:]):
            if b[1] < a[1] and b[1] < c[1] and b[0] > zs[0][0]:
                bounces += 1
        results.append({
            "body": obj.name, "simulated": True, "samples": len(zs),
            "drop_from": z_first, "rest_z": z_rest,
            "travelled": round(z_first - z_rest, 3), "bounces": bounces})
    scene.frame_set(1)

    baked_ok = [r for r in results if r.get("simulated")]
    return _result(
        ok=len(baked_ok) == n_bodies,
        bodies=n_bodies, frames=frames, sample_step=sample_step,
        simulated=len(baked_ok),
        total_bounces=sum(r["bounces"] for r in baked_ok),
        mean_rest_z=round(
            sum(r["rest_z"] for r in baked_ok) / max(1, len(baked_ok)), 3),
        detail=results,
        elapsed_ms=round((time.time() - t0) * 1000, 1))
