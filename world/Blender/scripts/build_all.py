#!/usr/bin/env python3
"""JARVIS NEXUS — build launcher (pure Python, NO bpy import).

Runs build_assets.py once per asset in a SEPARATE process: Blender's
allocator never returns freed memory to the OS, so per-asset process
isolation is mandatory under the sandbox's 4 GB RAM budget. This launcher
deliberately does not import bpy (the parent must stay tiny).
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # world/Blender  (HERE == scripts/)
BLENDER_PY = os.environ.get("NEXUS_BLENDER_PY",
                            os.path.join(ROOT, "..", "..", ".venvs", "blender", "bin", "python"))

ASSETS = ("House", "Shop", "Prop_StreetLamp")


def main():
    results = []
    for key in ASSETS:
        print(f"[launcher] building {key}...", flush=True)
        proc = subprocess.run([BLENDER_PY, "-u",
                               os.path.join(HERE, "build_assets.py"), "--asset", key],
                              capture_output=True, text=True)
        if proc.returncode != 0:
            print(f"[launcher] {key} FAILED rc={proc.returncode}")
            print(proc.stdout[-1500:])
            print(proc.stderr[-1500:], file=sys.stderr)
            sys.exit(proc.returncode)
        # last JSON object printed by the child is the build result
        result = None
        for line in reversed(proc.stdout.strip().splitlines()):
            line = line.strip()
            if line.startswith("{") :
                # result is pretty-printed multi-line; rebuild it below instead
                break
        # the child prints pretty JSON; slice from the first '{' of the last block
        out = proc.stdout.strip()
        last_brace = out.rfind("}\n")
        start = out.rfind("{", 0, out.rfind('"asset"'))
        try:
            result = json.loads(out[start:])
        except Exception:
            result = {"asset": key, "note": "built (result JSON not parsed)"}
        results.append(result)
        print(f"[launcher] {key} OK", flush=True)
    report_path = os.path.join(ROOT, "validation", "BuildReport.json")
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump({"generated_utc": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                   "assets": results}, fh, indent=2)
    print(json.dumps(results, indent=2))
    print(f"[launcher] report -> {report_path}")


if __name__ == "__main__":
    main()
