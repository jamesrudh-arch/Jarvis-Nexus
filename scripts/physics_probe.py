#!/usr/bin/env python3
"""Standalone physics_core probe (fast, no terrain)."""
import json
import sys

sys.path.insert(0, "/home/z/my-project/NEXUS_WORLD")
# run in the bpy venv
if __name__ == "__main__" and sys.executable.find(".venv-blender") == -1:
    import os
    import subprocess
    venv_py = "/home/z/my-project/NEXUS_WORLD/.venv-blender/bin/python"
    proc = subprocess.run([venv_py, __file__], capture_output=True,
                          text=True, timeout=600)
    print("rc:", proc.returncode)
    print("stdout:", proc.stdout[-2500:])
    print("stderr:", proc.stderr[-1500:])
    sys.exit(proc.returncode)

from render3d import physics_core  # noqa: E402
res = physics_core.run_physics([0, 0, 100, 80], n_bodies=8, frames=72)
print(res)
