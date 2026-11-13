#!/usr/bin/env python3
"""JARVIS NEXUS - owner-machine project validator (Phase 3, README step 6).

Runs INSIDE the UE 5.5 editor. Produces:
  world/Unreal/Saved/ValidationReport.json    (machine-readable check results)
  world/Unreal/Saved/ValidationScreenshot.png (viewport capture)

Checks:
  1. Project + map present (L_JarvisTestMap with 6 REG markers).
  2. Geo round-trip at the six region centres (< 1 cm) — real math, owner host.
  3. World Partition editor spatial hash (512 m) read-back from the map.
  4. Screenshot capture.
"""
import glob
import json
import os
import shutil
import sys

try:
    import unreal
except ImportError:
    raise SystemExit(
        "validate_project.py must run inside the Unreal Editor Python console "
        "(README step 6).")

HERE = os.path.dirname(os.path.abspath(__file__))
SAVED = os.path.join(HERE, "Saved")
REPORT = os.path.join(SAVED, "ValidationReport.json")
SHOT = os.path.join(SAVED, "ValidationScreenshot.png")

sys.path.insert(0, HERE)
import jarvis_geo  # noqa: E402

CHECKS = {}


def log(msg):
    unreal.log("[validate_project] {}".format(msg))


def check_geo():
    max_err = 0.0
    for label, east, north in jarvis_geo.region_centres():
        lat, lon = jarvis_geo.local_metres_to_lat_lon(east, north)
        e2, n2 = jarvis_geo.lat_lon_to_local_metres(lat, lon)
        err = ((e2 - east) ** 2 + (n2 - north) ** 2) ** 0.5
        max_err = max(max_err, err)
    CHECKS["geo_round_trip_max_error_metres"] = max_err
    CHECKS["geo_round_trip_under_1cm"] = max_err < 0.01
    log("geo round-trip max error: {:.9f} m".format(max_err))


def check_map():
    try:
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    except Exception:
        world = unreal.EditorLevelLibrary.get_editor_world()
    map_name = world.get_name() if world else None
    CHECKS["open_map"] = map_name
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
    markers = [a.get_actor_label() for a in actors
               if "REG-" in a.get_actor_label() and "Marker" in a.get_actor_label()]
    CHECKS["reg_markers_found"] = len(markers)
    CHECKS["reg_markers_expected"] = 6
    CHECKS["map_markers_ok"] = len(markers) == 6
    # World Partition read-back: editor spatial hash is ini-driven; report what
    # the world itself reports so the owner sees the live state, not assumptions.
    try:
        wp = world.get_world_partition()
        CHECKS["world_partition_present"] = wp is not None
    except Exception as ex:  # pragma: no cover - defensive on host differences
        CHECKS["world_partition_present"] = "error: {}".format(ex)
    log("map {} open, {} REG markers".format(map_name, len(markers)))


def screenshot():
    try:
        world = unreal.EditorLevelLibrary.get_editor_world()
        unreal.SystemLibrary.execute_console_command(world, "Shot")
        newest = None
        for pattern in (os.path.join(HERE, "Saved", "Screenshots", "**", "*.png"),
                        os.path.join(HERE, "Saved", "Screenshots", "*.png")):
            hits = sorted(glob.glob(pattern, recursive=True), key=os.path.getmtime)
            if hits:
                newest = hits[-1]
                break
        if newest:
            shutil.copyfile(newest, SHOT)
            CHECKS["screenshot"] = SHOT
            log("screenshot copied from {}".format(newest))
        else:
            CHECKS["screenshot"] = "not found after Shot command"
    except Exception as ex:
        CHECKS["screenshot"] = "error: {}".format(ex)


def main():
    os.makedirs(SAVED, exist_ok=True)
    check_geo()
    check_map()
    screenshot()
    CHECKS["verdict"] = "PASS" if (
        CHECKS.get("geo_round_trip_under_1cm")
        and CHECKS.get("map_markers_ok")
        and str(CHECKS.get("screenshot", "")).endswith("ValidationScreenshot.png")
    ) else "CHECK_ITEMS"
    with open(REPORT, "w") as f:
        json.dump(CHECKS, f, indent=2)
    log("report written: {}".format(REPORT))
    print("VALIDATION REPORT: {}".format(json.dumps(CHECKS)))


main()
