"""Blender subprocess driver (py3.12 side).

Runs render3d/blender_script.py inside the dedicated bpy venv
(.venv-blender, Python 3.13 + bpy 5.3 + mcp). This is the fallback and
test path; the PRODUCTION path is the MCP server
(mcp_servers/blender_server.py) through integration/mcp_layer.py —
same blender_core, different transport.
"""
from __future__ import annotations

import json
import os
import subprocess

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV_PY = os.path.join(REPO_ROOT, ".venv-blender", "bin", "python")
SCRIPT = os.path.join(REPO_ROOT, "render3d", "blender_script.py")


class BlenderDriver:
    def __init__(self, timeout_s: float = 900.0):
        self.timeout_s = timeout_s

    def available(self) -> bool:
        return os.path.exists(VENV_PY)

    def _run(self, args: list[str]) -> dict:
        proc = subprocess.run(
            [VENV_PY, SCRIPT, *args], capture_output=True, text=True,
            cwd=REPO_ROOT, timeout=self.timeout_s, check=False)
        lines = [ln for ln in proc.stdout.strip().splitlines() if ln]
        if proc.returncode != 0 or not lines:
            return {"ok": False,
                    "error": (proc.stderr or proc.stdout or "")[-400:],
                    "returncode": proc.returncode}
        for line in reversed(lines):        # last JSON line is the result
            try:
                return json.loads(line)
            except ValueError:
                continue
        return {"ok": False, "error": "no JSON result line",
                "stdout_tail": proc.stdout[-300:]}

    def _spec_file(self, spec: dict, td: str) -> str:
        path = os.path.join(td, "spec.json")
        with open(path, "w") as fh:
            json.dump(spec, fh)
        return path

    def render(self, spec: dict, out_png: str, view: str = "top",
               samples: int = 24, width: int = 960, height: int = 540,
               brightness: float = 1.0) -> dict:
        import tempfile
        with tempfile.TemporaryDirectory(prefix="nx3d_") as td:
            args = [self._spec_file(spec, td), out_png,
                    "--view", view, "--samples", str(samples),
                    "--width", str(width), "--height", str(height),
                    "--brightness", str(brightness)]
            return self._run(["render", *args])

    def export(self, spec: dict, out_path: str, fmt: str = "usd") -> dict:
        import tempfile
        with tempfile.TemporaryDirectory(prefix="nx3d_") as td:
            return self._run(["export", self._spec_file(spec, td),
                              out_path, "--fmt", fmt])

    def animate(self, spec: dict, out_blend: str,
                positions: dict) -> dict:
        import tempfile
        with tempfile.TemporaryDirectory(prefix="nx3d_") as td:
            pos_path = os.path.join(td, "positions.json")
            with open(pos_path, "w") as fh:
                json.dump(positions, fh)
            return self._run(["animate", self._spec_file(spec, td),
                              out_blend, "--positions", pos_path])

    def info(self) -> dict:
        return self._run(["info"])
