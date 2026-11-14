#!/usr/bin/env python3
"""Merge cover + body into the final audit report PDF."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.05 or abs(h - A4_H) > 0.05:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
cover = PdfReader('/home/z/my-project/download/jarvis_nexus_cover.pdf').pages[0]
writer.add_page(normalize(cover))
for p in PdfReader('/home/z/my-project/download/jarvis_nexus_session7_audit_body.pdf').pages:
    writer.add_page(normalize(p))

writer.add_metadata({
    '/Title': 'JARVIS NEXUS — Session 7 Production Audit Report',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Embodiment restoration, EOS credential completion, Groq LLM provider, mobile fixes — evidence-based audit',
})
out = '/home/z/my-project/download/JARVIS_NEXUS_Session7_Audit_Report.pdf'
with open(out, 'wb') as f:
    writer.write(f)
print('FINAL PDF:', out, '| pages:', len(writer.pages))
