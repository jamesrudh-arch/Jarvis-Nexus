#!/usr/bin/env python3
"""JARVIS NEXUS - deterministic World Partition test-map builder (Phase 3).

Creates /Game/Maps/L_JarvisTestMap as a World Partition level and places six
labelled reference markers at the blueprint region centres (converted with the
authoritative geo math). Runs INSIDE the UE 5.5 editor Python console:

    unreal.execute_python_command_in_editor? -- no, simply:
    Editor: Tools > Python > enter: exec(open(r"<repo>/world/Unreal/Python/create_test_map.py").read())

Verified API facts (Phase 3, Epic 5.5 Python API reference):
  * LevelEditorSubsystem.new_level(asset_path, is_partitioned_world=False)
  * LandscapeEditorSubsystem is NOT exposed to Python in 5.5 (verified 404);
    terrain is deliberately deferred to the Phase 5 atlas.

The runtime 512 m grid is set in step 5 of world/Unreal/README.md (manual
World Settings step) — the 5.5 Python API does not expose the runtime grid
list, and this script does not fake it.
"""
import os
import sys

try:
    import unreal
except ImportError:
    raise SystemExit(
        "create_test_map.py must run inside the Unreal Editor Python console "
        "(README step 4). It cannot run outside UE.")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_geo  # noqa: E402

MAP_ASSET = "/Game/Maps/L_JarvisTestMap"
MARKER_SIZE_M = (100.0, 100.0, 10.0)   # deterministic marker footprint
CUBE_MESH = "/Engine/BasicShapes/Cube"


def log(msg):
    unreal.log("[create_test_map] {}".format(msg))


def main():
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    log("creating World Partition level at {}".format(MAP_ASSET))
    created = les.new_level(MAP_ASSET, is_partitioned_world=True)
    if not created:
        raise RuntimeError("new_level({}) failed".format(MAP_ASSET))

    cube = unreal.EditorAssetLibrary.load_asset(CUBE_MESH)
    if cube is None:
        raise RuntimeError("missing engine mesh {}".format(CUBE_MESH))

    actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    placed = 0
    for label, east, north in jarvis_geo.region_centres():
        x, y, z = jarvis_geo.local_metres_to_unreal(east, north)
        actor = actor_sub.spawn_actor_from_class(
            unreal.StaticMeshActor, unreal.Vector(x, y, z), unreal.Rotator(0, 0, 0))
        if actor is None:
            raise RuntimeError("spawn failed for {}".format(label))
        actor.set_actor_label("{}_Marker".format(label.replace(" ", "_")))
        # Engine BasicShapes/Cube is 1 m per side at scale 1 -> scale in metres.
        actor.set_actor_scale3d(unreal.Vector(MARKER_SIZE_M[0], MARKER_SIZE_M[1], MARKER_SIZE_M[2]))
        mesh_comp = actor.get_component_by_class(unreal.StaticMeshComponent)
        mesh_comp.set_static_mesh(cube)
        placed += 1
        log("marker {}: local ({:.0f},{:.0f}) m -> unreal ({:.0f},{:.0f},{:.0f})".format(
            label, east, north, x, y, z))

    les.save_current_level()
    unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
    log("DONE: {} markers placed; {} saved.".format(placed, MAP_ASSET))
    print("CREATE_TEST_MAP OK: {} markers".format(placed))


main()
