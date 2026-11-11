#!/usr/bin/env python3
"""Merge Playwright cover (page 0) + ReportLab body -> final package PDF."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89
BUILD = "/home/z/my-project/download/jarvis-nexus-preproduction/build"
FINAL = "/home/z/my-project/download/JARVIS-NEXUS_PreProduction_Package_v2.pdf"


def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
        page.scale_to(A4_W, A4_H)
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page


writer = PdfWriter()
writer.add_page(normalize(PdfReader(f"{BUILD}/cover.pdf").pages[0]))
for page in PdfReader(f"{BUILD}/body.pdf").pages:
    writer.add_page(normalize(page))
writer.add_metadata({
    "/Title": "JARVIS NEXUS - Pre-Production Package",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Phase Zero: repository inspection, character and environment "
                "direction, visual storyboard, motion and technical plan.",
})
with open(FINAL, "wb") as f:
    writer.write(f)
print("merged ->", FINAL)
