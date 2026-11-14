#!/usr/bin/env python3
"""Analyze sanctuary screenshots: is a humanoid avatar visible?
Objective pixel evidence — no guessing. Checks:
  1. Overall scene variance (blank vs rendered)
  2. Skin-tone pixel presence + location clustering (avatar presence)
  3. Center-region detail (where the avatar stands in conversation framing)
"""
import sys
from PIL import Image

def analyze(path, label):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()

    # Sample grid
    total = 0
    skin = 0
    skin_x, skin_y = [], []
    bright = 0
    colors = set()
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            r, g, b = px[x, y]
            total += 1
            colors.add((r // 16, g // 16, b // 16))
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if lum > 80:
                bright += 1
            # skin-tone heuristic (broad): r>g>b, warm, not too dark/bright
            if r > 90 and r > g + 12 and g > b + 5 and r < 250 and lum > 60 and lum < 235:
                skin += 1
                skin_x.append(x)
                skin_y.append(y)

    print(f"=== {label} ({w}x{h}) ===")
    print(f"  distinct color buckets (of {total} samples): {len(colors)}")
    print(f"  bright pixels (lum>80): {bright*100//total}%")
    print(f"  skin-tone pixels: {skin} ({skin*100//total}%)")
    if skin > 20:
        cx = sum(skin_x) / len(skin_x)
        cy = sum(skin_y) / len(skin_y)
        import statistics
        sx = statistics.pstdev(skin_x) if len(skin_x) > 1 else 0
        sy = statistics.pstdev(skin_y) if len(skin_y) > 1 else 0
        print(f"  skin-tone centroid: ({cx:.0f},{cy:.0f}) spread x:{sx:.0f} y:{sy:.0f}")
        print(f"  -> CLUSTERED HUMANOID PRESENCE: {'likely' if sy > 30 and sx > 10 and skin > 60 else 'weak/uniform'}")
    else:
        print("  -> NO significant skin-tone cluster (avatar likely NOT visible)")

    # Center strip vertical detail (conversation framing zone)
    strip_colors = set()
    for y in range(h // 4, 3 * h // 4, 2):
        for x in range(w // 3, 2 * w // 3, 2):
            r, g, b = px[x, y]
            strip_colors.add((r // 16, g // 16, b // 16))
    print(f"  center-strip color variety: {len(strip_colors)} buckets")
    print(f"  verdict: {'RENDERED SCENE' if len(colors) > 40 else 'NEAR-BLANK / FLAT'}")
    print()

for p, l in [
    ("/home/z/my-project/audit/prod_desktop_boot.png", "Desktop boot overlay"),
    ("/home/z/my-project/audit/prod_desktop_entered.png", "Desktop sanctuary entered"),
]:
    analyze(p, l)
