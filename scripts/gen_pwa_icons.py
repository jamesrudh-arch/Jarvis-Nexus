#!/usr/bin/env python3
"""Generate JARVIS Voice PWA icons: dark navy tile, glowing cyan ring + core
(arc-reactor minimal — an APP icon, deliberately NOT a digital-human substitute)."""
from PIL import Image, ImageDraw
import math

BG = (8, 12, 24, 255)
RING = (56, 224, 255, 255)
CORE = (140, 240, 255, 255)
GLOW = (30, 120, 160, 255)


def icon(size: int, path: str) -> None:
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    # outer faint glow ring
    for i, r in enumerate((0.42, 0.40, 0.38)):
        w = max(2, int(size * 0.016))
        d.ellipse([cx - size * r, cy - size * r, cx + size * r, cy + size * r],
                  outline=GLOW if i == 0 else RING, width=w)
    # inner ring
    r2 = 0.24
    d.ellipse([cx - size * r2, cy - size * r2, cx + size * r2, cy + size * r2],
              outline=RING, width=max(2, int(size * 0.02)))
    # core dot
    r3 = 0.085
    d.ellipse([cx - size * r3, cy - size * r3, cx + size * r3, cy + size * r3], fill=CORE)
    # three tick marks (upper arc) — subtle "alive" accent
    for ang in (-60, -30, 0):
        a = math.radians(ang - 90)
        x1 = cx + math.cos(a) * size * 0.33
        y1 = cy + math.sin(a) * size * 0.33
        x2 = cx + math.cos(a) * size * 0.37
        y2 = cy + math.sin(a) * size * 0.37
        d.line([x1, y1, x2, y2], fill=CORE, width=max(2, int(size * 0.018)))
    img.save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")


base = "/home/z/my-project/apps/nexus-api/web/app"
icon(512, f"{base}/icon-512.png")
icon(192, f"{base}/icon-192.png")
icon(180, f"{base}/apple-touch-icon.png")
