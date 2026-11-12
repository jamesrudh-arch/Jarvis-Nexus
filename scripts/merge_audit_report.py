#!/usr/bin/env python3
"""Merge cover + body into the final audit report PDF (A4-normalized)."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.5 or abs(h - A4_H) > 0.5:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
writer.add_page(normalize(PdfReader("/home/z/my-project/scripts/report_cover.pdf").pages[0]))
for p in PdfReader("/home/z/my-project/scripts/report_body.pdf").pages:
    writer.add_page(normalize(p))
writer.add_metadata({
    "/Title": "JARVIS NEXUS - Session 7 Engineering Audit Report",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "EOS authentication, avatar fix, LLM providers, voice, mobile, security and production verification",
})
out = "/home/z/my-project/download/JARVIS-NEXUS_Session-7_Audit_Report.pdf"
with open(out, "wb") as f:
    writer.write(f)
print("merged:", out, "pages:", len(writer.pages))
