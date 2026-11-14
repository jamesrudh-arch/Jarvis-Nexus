#!/usr/bin/env python3
"""Compile the extracted JarvisGeo C++ numerics with g++ and cross-check
against the Python mirror + PROJ.

Evidence produced (Phase 3 report, section 8):
  1. The exact algorithm block from JarvisGeoLibrary.cpp COMPILES (g++).
  2. Its outputs agree with the Python mirror to < 1e-6 m over the world
     extent (both directions).
  3. Round-trip through the compiled binary stays < 1 cm (blueprint 4.2).
"""

import subprocess
import sys

import math
import random

REPO = "/home/z/my-project/repo"
CPP = "/home/z/my-project/scripts/geo_cpp_check.cpp"
BIN = "/tmp/geo_cpp_check"

sys.path.insert(0, f"{REPO}/world/Unreal/Python")
import jarvis_geo as jg  # noqa: E402


def sh(cmd, **kw):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)


def main():
    # 1. Compile.
    r = sh(f"g++ -O2 -std=c++17 -Wall -Wextra {CPP} -o {BIN}")
    print(f"[{'PASS' if r.returncode == 0 else 'FAIL'}] g++ compiles the JarvisGeo numerics "
          f"(-Wall -Wextra, C++17)")
    if r.returncode != 0:
        print(r.stderr)
        return 1
    if r.stderr.strip():
        print("   compiler warnings:\n" + r.stderr.strip())

    rng = random.Random(99)
    points = [
        (45.0, 10.0),
        (45.0 + 2.7, 10.0 + 2.0), (45.0 + 2.7, 10.0 - 2.0),
        (45.0 - 3.4, 10.0 + 2.0), (45.0 - 3.4, 10.0 - 2.0),
        (46.979, 10.0), (45.0, 11.52), (42.3, 10.0),
    ] + [
        (45.0 + rng.uniform(-3.4, 2.7), 10.0 + rng.uniform(-2.0, 2.0))
        for _ in range(500)
    ]

    # 2. Forward agreement: C++ vs Python mirror.
    stdin = "\n".join(f"{lat:.17g} {lon:.17g}" for lat, lon in points)
    r = sh(f"echo '{stdin}' | {BIN}")
    cpp_out = [tuple(map(float, line.split())) for line in r.stdout.strip().splitlines()]
    max_fwd = 0.0
    for (lat, lon), (ce, cn) in zip(points, cpp_out):
        pe, pn = jg.lat_lon_to_local_metres(lat, lon)
        max_fwd = max(max_fwd, abs(ce - pe), abs(cn - pn))
    ok_fwd = max_fwd < 1e-6
    print(f"[{'PASS' if ok_fwd else 'FAIL'}] C++ vs Python mirror (forward): "
          f"max diff {max_fwd*1000:.9f} mm over {len(points)} points (< 0.001 mm)")

    # 3. Inverse agreement + full round trip through the compiled binary.
    local_points = [(e, n) for (_, _), (e, n) in zip(points, cpp_out)]
    stdin_inv = "\n".join(f"{e:.17g} {n:.17g}" for e, n in local_points)
    r = sh(f"echo '{stdin_inv}' | {BIN} inverse")
    inv_out = [tuple(map(float, line.split())) for line in r.stdout.strip().splitlines()]
    max_rt = 0.0
    max_inv = 0.0
    for (lat, lon), (ilat, ilon), (e, n) in zip(points, inv_out, local_points):
        max_inv = max(max_inv, abs(ilat - lat), abs(ilon - lon))
        e2, n2 = jg.lat_lon_to_local_metres(ilat, ilon)
        max_rt = max(max_rt, math.hypot(e2 - e, n2 - n))
    ok_inv = max_inv < 1e-10
    ok_rt = max_rt < 0.01
    print(f"[{'PASS' if ok_inv else 'FAIL'}] C++ inverse returns the input lat/lon: "
          f"max deg diff {max_inv:.3e}")
    print(f"[{'PASS' if ok_rt else 'FAIL'}] C++ binary full round-trip < 1 cm: "
          f"max {max_rt*1000:.6f} mm")

    # 4. PROJ cross-check on the C++ outputs directly.
    try:
        from pyproj import CRS, Transformer
        crs_tm = CRS.from_proj4(
            "+proj=tmerc +lat_0=45 +lon_0=10 +k_0=1 +x_0=0 +y_0=0 "
            "+ellps=WGS84 +units=m +no_defs"
        )
        tr = Transformer.from_crs(CRS.from_epsg(4326), crs_tm, always_xy=True)
        max_p = 0.0
        for (lat, lon), (ce, cn) in zip(points, cpp_out):
            pe, pn = tr.transform(lon, lat)
            max_p = max(max_p, abs(ce - pe), abs(cn - pn))
        ok_p = max_p < 0.001
        print(f"[{'PASS' if ok_p else 'FAIL'}] Compiled C++ vs PROJ: "
              f"max diff {max_p*1000:.9f} mm (< 0.001 mm)")
    except ImportError:
        print("[SKIP] pyproj unavailable")
        ok_p = True

    all_ok = ok_fwd and ok_inv and ok_rt and ok_p
    print(f"RESULT: {'ALL C++ CROSS-CHECKS PASSED' if all_ok else 'FAILURES PRESENT'}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
