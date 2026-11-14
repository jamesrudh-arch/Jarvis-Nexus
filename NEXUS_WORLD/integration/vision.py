"""Computer vision via OpenCV headless (torch-free, CPU-only, Apache-2.0).

Capabilities registered with the central orchestrator:
    vision.analyze_image — dimensions, mean colour, edge density, sharpness
    vision.decode_qr     — decode a QR code from an image
`make_qr_png` is an ops/test helper (encoder availability verified in this
opencv build; guarded for contrib-less builds).
"""
from __future__ import annotations

import base64
import binascii
import logging
import os

import cv2
import numpy as np

logger = logging.getLogger("jarvis.integration.vision")


class VisionError(Exception):
    """Image could not be loaded or analysed."""


class VisionService:
    @staticmethod
    def _load(source: str) -> np.ndarray:
        """`source` = filesystem path, data: URL, or raw base64 image."""
        if isinstance(source, str) and os.path.isfile(source):
            img = cv2.imread(source, cv2.IMREAD_COLOR)
        else:
            payload = source
            if payload.startswith("data:"):
                payload = payload.split(",", 1)[-1]
            try:
                raw = base64.b64decode(payload, validate=False)
            except (binascii.Error, ValueError) as exc:
                raise VisionError(f"invalid base64 image: {exc}") from exc
            arr = np.frombuffer(raw, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise VisionError("image could not be decoded")
        return img

    def analyze_image(self, source: str) -> dict:
        img = self._load(source)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 100, 200)
        mean_bgr = cv2.mean(img)[:3]
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        report = {"width": int(img.shape[1]),
                  "height": int(img.shape[0]),
                  "channels": int(img.shape[2]) if img.ndim == 3 else 1,
                  "mean_bgr": [round(float(m), 2) for m in mean_bgr],
                  "edge_density": round(
                      float(np.count_nonzero(edges)) / float(edges.size), 4),
                  "sharpness": round(laplacian_var, 2)}
        logger.info("vision.analyze_image %dx%d", report["width"],
                    report["height"])
        return report

    def decode_qr(self, source: str) -> dict:
        img = self._load(source)
        data, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
        return {"decoded": data or None, "found": bool(data)}

    @staticmethod
    def make_qr_png(text: str, path: str, scale: int = 8) -> dict:
        """Render `text` as a QR PNG. Empirically verified: the encoder's
        raw output is a 25x25 canvas that ALREADY includes its quiet zone
        (version-1 QR is 21x21 + 2-module border) — adding another white
        border makes cv2.QRCodeDetector fail to locate the code, so none
        is added here."""
        if not hasattr(cv2, "QRCodeEncoder_create"):
            raise VisionError("cv2.QRCodeEncoder unavailable in this build")
        mat = cv2.QRCodeEncoder_create().encode(text)
        big = cv2.resize(mat, None, fx=scale, fy=scale,
                         interpolation=cv2.INTER_NEAREST)
        if not cv2.imwrite(path, big):
            raise VisionError(f"failed to write QR to {path}")
        return {"path": os.path.abspath(path), "text": text,
                "bytes": os.path.getsize(path)}
