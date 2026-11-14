#!/usr/bin/env python3
"""Phase 3 sandbox verification of the JarvisWorld geo conversion.

Runs the editor-side mirror (world/Unreal/Python/jarvis_geo.py) through:
  1. Blueprint round-trip accuracy test (< 1 cm over the 400x600 km extent).
  2. Axis-convention checks (X=east, Y=south, Z=up; 1 m = 100 UU).
  3. Anchor and region-centre sanity checks against blueprint 4.3.
  4. INDEPENDENT cross-check against PROJ (pyproj) — the same custom
     Transverse Mercator definition (CM 10 E, lat0 45 N, k0=1, WGS84),
     a completely separate implementation of the same projection.

Prints a machine-readable summary; exit code 0 only if everything passes.
"""

import math
import random
import sys

sys.path.insert(0, "/home/z/my-project/repo/world/Unreal/Python")
import jarvis_geo as jg  # noqa: E402

FAILURES = []


def check(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


def main():
    # --- 1. Round-trip accuracy (blueprint: < 0.01 m) --------------------
    rng = random.Random(20261113)
    max_err = 0.0
    worst = None
    points = [
        (0.0, 0.0),
        (-200000.0, 300000.0), (200000.0, 300000.0),
        (-200000.0, -300000.0), (200000.0, -300000.0),
        (0.0, 220000.0), (0.0, -150000.0), (0.0, -280000.0),
        (-120000.0, 0.0), (120000.0, 0.0),
    ]
    points += [
        (rng.uniform(-200000, 200000), rng.uniform(-300000, 300000))
        for _ in range(10000)
    ]
    for east, north in points:
        lat, lon = jg.local_metres_to_lat_lon(east, north)
        e2, n2 = jg.lat_lon_to_local_metres(lat, lon)
        err = math.hypot(e2 - east, n2 - north)
        if err > max_err:
            max_err, worst = err, (east, north, lat, lon)
    check(
        "Round-trip max error < 1 cm (10,010 points, 400x600 km extent)",
        max_err < 0.01,
        f"max={max_err*1000:.6f} mm at local {worst[0]:.1f},{worst[1]:.1f} m "
        f"(lat/lon {worst[2]:.6f},{worst[3]:.6f})",
    )

    # Lat/lon-origin round trip (degrees in, degrees out).
    max_deg_err = 0.0
    for _ in range(5000):
        lat = 45.0 + rng.uniform(-5.4, 5.4)
        lon = 10.0 + rng.uniform(-2.0, 2.0)
        e, n = jg.lat_lon_to_local_metres(lat, lon)
        lat2, lon2 = jg.local_metres_to_lat_lon(e, n)
        deg_err = max(abs(lat2 - lat), abs(lon2 - lon))
        max_deg_err = max(max_deg_err, deg_err)
    # 1 cm ~ 9e-8 deg latitude; require < 1e-8 deg for margin.
    check("Lat/lon round-trip < 1e-8 degrees (5,000 random points)", max_deg_err < 1e-8,
          f"max={max_deg_err:.3e} deg")

    # --- 2. Axis conventions ---------------------------------------------
    x, y, z = jg.local_metres_to_unreal(1000.0, 500.0, 20.0)
    check("Unreal X = east*100", x == 100000.0, f"x={x}")
    check("Unreal Y = south (north 500 m -> y=-50000)", y == -50000.0, f"y={y}")
    check("Unreal Z = up*100", z == 2000.0, f"z={z}")
    e, n, h = jg.unreal_to_local_metres(x, y, z)
    check("Unreal -> local round trip exact", (e, n, h) == (1000.0, 500.0, 20.0))

    # --- 3. Anchor + region centres (blueprint 4.2 / 4.3) ------------------
    lat, lon = jg.local_metres_to_lat_lon(0.0, 0.0)
    check("Local origin is the anchor 45.0/10.0",
          abs(lat - 45.0) < 1e-9 and abs(lon - 10.0) < 1e-9,
          f"got {lat:.9f}/{lon:.9f}")

    # Anchor lat/lon maps to local (0,0).
    e, n = jg.lat_lon_to_local_metres(45.0, 10.0)
    check("Anchor lat/lon -> local origin (0,0)", abs(e) < 1e-6 and abs(n) < 1e-6,
          f"got ({e:.6f}, {n:.6f})")

    regions = [
        ("REG-001 Northern Highlands", 0.0, 220000.0),
        ("REG-002 Western Industrial", -120000.0, 0.0),
        ("REG-003 Central Metropolitan", 0.0, 0.0),
        ("REG-004 Eastern Technology", 120000.0, 0.0),
        ("REG-005 Southern Agricultural", 0.0, -150000.0),
        ("REG-006 Coastal Maritime", 0.0, -280000.0),
    ]
    all_inside = all(jg.is_inside_world_extent(e, n) for _, e, n in regions)
    check("All six blueprint region centres inside world extent", all_inside)

    # Degrees sanity: 1 degree of latitude ~ 111 km — Highlands 220 km north
    # should be roughly 2 degrees of latitude from the anchor.
    lat_h, _ = jg.local_metres_to_lat_lon(0.0, 220000.0)
    check("Highlands centre latitude plausible (~47 deg)", 46.8 < lat_h < 47.2,
          f"lat={lat_h:.4f}")
    _, lon_e = jg.local_metres_to_lat_lon(120000.0, 0.0)
    check("Eastern region longitude plausible (>10 deg)", 11.0 < lon_e < 11.6,
          f"lon={lon_e:.4f}")

    # --- 4. Independent PROJ cross-check ----------------------------------
    try:
        from pyproj import CRS, Transformer
    except ImportError:
        print("[SKIP] pyproj not installed — PROJ cross-check skipped "
              "(round-trip tests above still ran).")
        pyproj_summary = "SKIPPED (not installed)"
    else:
        crs_tm = CRS.from_proj4(
            "+proj=tmerc +lat_0=45 +lon_0=10 +k_0=1 +x_0=0 +y_0=0 "
            "+ellps=WGS84 +units=m +no_defs"
        )
        tr = Transformer.from_crs(CRS.from_epsg(4326), crs_tm, always_xy=True)

        max_abs = 0.0
        for _ in range(2000):
            lat = 45.0 + rng.uniform(-5.4, 5.4)
            lon = 10.0 + rng.uniform(-2.0, 2.0)
            e, n = jg.lat_lon_to_local_metres(lat, lon)
            pe, pn = tr.transform(lon, lat)
            max_abs = max(max_abs, abs(e - pe), abs(n - pn))
        check(
            "PROJ cross-check: |mirror - PROJ| < 1 mm (2,000 points)",
            max_abs < 0.001,
            f"max abs difference = {max_abs*1000:.6f} mm",
        )
        pyproj_summary = f"max diff {max_abs*1000:.6f} mm over 2,000 points"

    # --- Summary -----------------------------------------------------------
    print()
    print("points tested: 10,010 round-trip + 5,000 degree + 6 region centres"
          " + 2,000 PROJ cross-check")
    print(f"round-trip max error: {max_err*1000:.6f} mm (blueprint limit 10 mm)")
    print(f"PROJ cross-check: {pyproj_summary}")
    if FAILURES:
        print(f"RESULT: {len(FAILURES)} FAILURE(S): {FAILURES}")
        return 1
    print("RESULT: ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
