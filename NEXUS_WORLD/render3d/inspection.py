"""Visual inspection + automated correction (Continuation Directive item 4).

inspect_image() runs REAL programmatic checks on a rendered PNG (OpenCV):
existence, size, brightness band, variance (non-blank), colour diversity.
render_with_correction() closes the loop: a failed inspection escalates
render parameters (brightness, samples, camera) and re-renders — up to
max_attempts — recording every correction step. Nothing is reported as
"visually verified" without a passing inspection.
"""
from __future__ import annotations

import os

import cv2
import numpy as np

MIN_BYTES = 8 * 1024          # a real 640x360 render is far bigger
BRIGHTNESS_BAND = (6.0, 248.0)
MIN_STD = 10.0                # flat/black/white frames fail here
MIN_COLORS = 40               # diverse scene ⇒ many sampled colours
# Calibrated against ALL accepted render evidence (2026-11-13): known-good
# night/street renders measure lap_var 4.3–36, saturation 27–70 — bands
# below catch catastrophic degradation only; they never retroactively
# fail previously verified evidence.
MIN_SHARPNESS = 1.5           # Laplacian variance floor (softest good: 4.3)
SATURATION_BAND = (5.0, 160.0)


def inspect_image(path: str) -> dict:
    checks: dict[str, bool] = {}
    metrics: dict = {}
    if not os.path.exists(path):
        checks["exists"] = False
        return {"ok": False, "checks": checks, "metrics": metrics,
                "failed": ["exists"]}
    checks["exists"] = True
    size = os.path.getsize(path)
    checks["nonempty"] = size >= MIN_BYTES
    metrics["bytes"] = size
    img = cv2.imread(path)
    if img is None:
        checks["readable"] = False
        return {"ok": False, "checks": checks, "metrics": metrics,
                "failed": sorted(k for k, v in checks.items() if not v)}
    checks["readable"] = True
    metrics["shape"] = list(img.shape)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mean = float(gray.mean())
    std = float(gray.std())
    metrics["brightness_mean"] = round(mean, 2)
    metrics["brightness_std"] = round(std, 2)
    checks["brightness_ok"] = BRIGHTNESS_BAND[0] <= mean <= \
        BRIGHTNESS_BAND[1]
    checks["variance_ok"] = std >= MIN_STD
    small = cv2.resize(img, (160, 90))
    colors = len(np.unique(small.reshape(-1, 3), axis=0))
    metrics["sampled_colors"] = int(colors)
    checks["colorfulness_ok"] = colors >= MIN_COLORS
    # --- P4 additions: sharpness + saturation (calibrated bands above)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    metrics["sharpness_laplacian"] = round(lap_var, 2)
    checks["sharpness_ok"] = lap_var >= MIN_SHARPNESS
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    sat = float(hsv[:, :, 1].mean())
    metrics["saturation_mean"] = round(sat, 2)
    checks["saturation_ok"] = SATURATION_BAND[0] <= sat <= SATURATION_BAND[1]
    metrics["edge_density"] = round(
        float(cv2.Canny(gray, 80, 160).mean()), 2)   # informational
    failed = sorted(k for k, v in checks.items() if not v)
    return {"ok": not failed, "checks": checks, "metrics": metrics,
            "failed": failed}


def render_with_correction(render_fn, base_params: dict,
                           max_attempts: int = 3) -> dict:
    """render_fn(params) -> dict must include a "path" key pointing at the
    file it actually produced; that file is what gets inspected.

    Escalation policy per failed attempt:
      1st retry: brightness × 1.8, samples × 2 (dark/flat frames)
      2nd retry: brightness × 2.6, samples × 2, view -> top (rescue
                 camera geometry), resolution × 1.25
    Every attempt + inspection result is recorded (audit trail)."""
    attempts: list[dict] = []
    params = dict(base_params)
    last_path = None
    for i in range(max_attempts):
        res = render_fn(params)
        path = (res or {}).get("path")
        if not path or not os.path.exists(path):
            attempts.append({"attempt": i + 1, "params": dict(params),
                             "render_ok": False,
                             "error": str(res)[:200]})
        else:
            inspection = inspect_image(path)
            attempts.append({"attempt": i + 1, "params": dict(params),
                             "path": path, "render_ok": True,
                             "inspection_ok": inspection["ok"],
                             "failed": inspection.get("failed", [])})
            last_path = path
            if inspection["ok"]:
                return {"ok": True, "attempts": attempts,
                        "final_inspection": inspection,
                        "corrections": i, "final_path": path}
        params = dict(params)
        params["brightness"] = max(
            params.get("brightness", 1.0) * (1.8 if i == 0 else 2.6),
            0.6 if i == 0 else 1.2)   # floor: heal toward known-good
        params["samples"] = int(params.get("samples", 24) * 2)
        if i >= 1:
            params["view"] = "top"
            params["width"] = int(params.get("width", 960) * 1.25)
            params["height"] = int(params.get("height", 540) * 1.25)
    final = inspect_image(last_path) if last_path else {"ok": False}
    return {"ok": final["ok"], "attempts": attempts,
            "final_inspection": final,
            "corrections": max_attempts - 1, "final_path": last_path}


def render_with_regeneration(render_fn, base_params: dict,
                             regen_params_fn=None,
                             max_attempts: int = 3) -> dict:
    """PRIORITY 4: correction, then REGENERATION.

    1. Standard correction loop (render_with_correction above).
    2. If every correction failed and the caller supplies
       regen_params_fn(base_params) -> params, regenerate ONCE with a
       deterministically different scene (e.g. daytime override, top
       view) and inspect that — the automated correction chain now ends
       in regeneration, not resignation.

    regen_params_fn must return a NEW params dict (deterministic — no
    randomness); its result is recorded as attempt "regen"."""
    corrected = render_with_correction(render_fn, base_params,
                                       max_attempts=max_attempts)
    if corrected["ok"] or regen_params_fn is None:
        return corrected

    regen_params = regen_params_fn(dict(base_params))
    res = render_fn(regen_params)
    path = (res or {}).get("path")
    attempts = corrected.get("attempts", [])
    if path and os.path.exists(path):
        inspection = inspect_image(path)
        attempts = attempts + [{
            "attempt": "regen", "params": dict(regen_params),
            "path": path, "render_ok": True,
            "inspection_ok": inspection["ok"],
            "failed": inspection.get("failed", [])}]
        return {"ok": inspection["ok"], "attempts": attempts,
                "final_inspection": inspection, "corrections":
                    max_attempts - 1, "regenerated": True,
                "final_path": path}
    attempts = attempts + [{"attempt": "regen", "params": dict(regen_params),
                            "render_ok": False, "error": str(res)[:200]}]
    return {"ok": False, "attempts": attempts,
            "final_inspection": corrected.get("final_inspection", {}),
            "corrections": max_attempts - 1, "regenerated": True,
            "final_path": corrected.get("final_path")}
