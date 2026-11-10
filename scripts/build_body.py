#!/usr/bin/env python3
"""JARVIS NEXUS pre-production package - body PDF builder (Report route).

Pipeline per pdf skill briefs/report.md:
  fonts registered -> install_font_fallback -> TocDocTemplate + multiBuild
  -> (cover rendered separately via html2poster.js and merged with pypdf).

Palette: Template 07 'Crystal Blue' fixed body palette (typesetting/cover.md).
"""
import hashlib
import os
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (CondPageBreak, Image, KeepTogether, PageBreak,
                                Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))
sys.path.insert(0, "/home/z/my-project/scripts")

from pkg_content import (CH1_CALLOUT, CH1_INTRO, CH1_SECTIONS, CH1_TABLE,
                         CH2_ASSETS, CH2_ASSETS_NOTE, CH2_EXPRESSIONS,
                         CH2_FACIAL, CH2_INTRO, CH2_POSES, CH2_SECTIONS,
                         CH3_AREAS, CH3_INTRO, CH3_LIGHT, CH3_PALETTE,
                         CH4_INTRO, CH5_INTRO, CH5_MAPPING, CH5_SECTIONS,
                         CH6_INFERENCE, CH6_INTRO, CH6_MILESTONES,
                         CH6_MODULES, CH6_PROTOCOL, CH7_APPROVALS, CH7_ARTIFACTS,
                         CH7_CLOSE, CH7_DECISIONS, CH7_INTRO, DOC_TITLE, FRAMES)

BASE = "/home/z/my-project/download/jarvis-nexus-preproduction"
OUT = os.path.join(BASE, "build", "body.pdf")

# ---------------------------------------------------------------- fonts ----
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC Bold", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("Noto Sans SC", normal="Noto Sans SC", bold="Noto Sans SC Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

from pdf import install_font_fallback  # noqa: E402  (skill helper)
install_font_fallback()

# ------------------------------------------------- Template 07 body palette
PAGE_BG = colors.HexColor("#f5f8fc")
SECTION_BG = colors.HexColor("#edf2f9")
CARD_BG = colors.HexColor("#e4ecf5")
TABLE_STRIPE = colors.HexColor("#eef3fa")
HEADER_FILL = colors.HexColor("#1a4a7a")
BORDER = colors.HexColor("#c0d0e2")
ACCENT = colors.HexColor("#2d7ab3")
TEXT_PRIMARY = colors.HexColor("#142840")
TEXT_MUTED = colors.HexColor("#5a7a96")

# ---------------------------------------------------------------- layout ----
PAGE_W, PAGE_H = A4
MARGIN = 56.7                       # 2 cm, symmetric
TOP_MARGIN, BOTTOM_MARGIN = 74, 62
AVAIL_W = PAGE_W - 2 * MARGIN       # ~481.9pt
AVAIL_H = PAGE_H - TOP_MARGIN - BOTTOM_MARGIN
H1_THRESHOLD = AVAIL_H * 0.25

# ---------------------------------------------------------------- styles ----
S = {}
S["body"] = ParagraphStyle("body", fontName="FreeSerif", fontSize=10.5,
                           leading=16.5, alignment=TA_JUSTIFY,
                           textColor=TEXT_PRIMARY, spaceAfter=10)
S["h1"] = ParagraphStyle("h1", fontName="FreeSerif", fontSize=20, leading=25,
                         textColor=HEADER_FILL, spaceBefore=18, spaceAfter=4)
S["h2"] = ParagraphStyle("h2", fontName="FreeSerif", fontSize=14, leading=19,
                         textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=7)
S["h3"] = ParagraphStyle("h3", fontName="FreeSerif", fontSize=11.5, leading=16,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=6)
S["caption"] = ParagraphStyle("caption", fontName="FreeSerif", fontSize=8.5,
                              leading=12, alignment=TA_CENTER,
                              textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=6)
S["cell"] = ParagraphStyle("cell", fontName="FreeSerif", fontSize=9,
                           leading=12.5, textColor=TEXT_PRIMARY,
                           alignment=TA_LEFT)
S["cellHead"] = ParagraphStyle("cellHead", fontName="FreeSerif", fontSize=9,
                               leading=12, textColor=colors.white,
                               alignment=TA_LEFT)
S["cellSmall"] = ParagraphStyle("cellSmall", fontName="FreeSerif", fontSize=8,
                                leading=10.8, textColor=TEXT_PRIMARY,
                                alignment=TA_LEFT)
S["frameTitle"] = ParagraphStyle("frameTitle", fontName="FreeSerif", fontSize=15,
                                 leading=19, textColor=HEADER_FILL,
                                 spaceBefore=2, spaceAfter=1)
S["frameMode"] = ParagraphStyle("frameMode", fontName="FreeSerif", fontSize=8.5,
                                leading=12, textColor=ACCENT, spaceAfter=6)
S["frameField"] = ParagraphStyle("frameField", fontName="FreeSerif", fontSize=8.5,
                                 leading=11.6, textColor=TEXT_PRIMARY)
S["systems"] = ParagraphStyle("systems", fontName="DejaVuSans", fontSize=6.8,
                              leading=9.5, textColor=TEXT_MUTED,
                              spaceBefore=5, spaceAfter=0)
S["tocTitle"] = ParagraphStyle("tocTitle", fontName="FreeSerif", fontSize=20,
                               leading=25, textColor=HEADER_FILL, spaceAfter=14)
S["quote"] = ParagraphStyle("quote", fontName="FreeSerif-Italic", fontSize=10.5,
                            leading=16, leftIndent=24, textColor=TEXT_MUTED,
                            spaceBefore=6, spaceAfter=10)

TOC_L0 = ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=11.5, leading=20,
                        textColor=TEXT_PRIMARY, leftIndent=6)
TOC_L1 = ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=9, leading=14.5,
                        textColor=TEXT_MUTED, leftIndent=28)


# --------------------------------------------------------------- helpers ----
def P(text, style="body"):
    return Paragraph(text, S[style])


def add_heading(text, style, level=0):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{text}</b>', S[style])
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def h1_block(text, first_para):
    """H1 + accent rule + first paragraph, orphan-protected."""
    rule = Table([[""]], colWidths=[AVAIL_W], rowHeights=[2])
    rule.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 1.4, ACCENT),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [CondPageBreak(H1_THRESHOLD),
            KeepTogether([add_heading(text, "h1", 0), rule, Spacer(1, 8),
                          first_para])]


def h2_block(text, first_para=None):
    # H2 headings are deliberately NOT bookmarked: the TOC carries chapters
    # (level 0) and storyboard frames (level 1) only, keeping it to one page.
    items = [Paragraph(f"<b>{text}</b>", S["h2"])]
    if first_para is not None:
        items.append(first_para)
        return [KeepTogether(items)]
    return items


def safe_keep_together(elements, max_h=None):
    max_h = max_h or (PAGE_H * 0.4)
    total = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total += h
    if total <= max_h:
        return [KeepTogether(elements)]
    if len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def embed_image(path, max_w=None, max_h=None):
    max_w = max_w or AVAIL_W
    max_h = max_h or (PAGE_H * 0.35)
    with PILImage.open(path) as im:
        ow, oh = im.size
    ratio = min(max_w / ow, max_h / oh, 1.0 if ow <= max_w and oh <= max_h else max(max_w / ow, max_h / oh))
    ratio = min(max_w / ow, max_h / oh)
    return Image(path, width=ow * ratio, height=oh * ratio)


def styled_table(spec, cell_style="cell", font_rows=None):
    """Build a spec table: header + rows + caption, all cells Paragraph()."""
    widths = [r * AVAIL_W for r in spec["widths"]]
    assert abs(sum(spec["widths"]) - 1.0) < 0.001, "width ratios must sum to 1"
    data = [[Paragraph(f"<b>{h}</b>", S["cellHead"]) for h in spec["header"]]]
    for row in spec["rows"]:
        data.append([Paragraph(c, S[cell_style]) for c in row])
    t = Table(data, colWidths=widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), TABLE_STRIPE))
        else:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.white))
    t.setStyle(TableStyle(style))
    out = [Spacer(1, 10), t]
    if spec.get("caption"):
        out += [Spacer(1, 4), Paragraph(spec["caption"], S["caption"])]
    out.append(Spacer(1, 8))
    return out


def callout(big, label):
    inner = Table(
        [[Paragraph(f"<b>{big}</b>", ParagraphStyle(
            "co1", fontName="FreeSerif", fontSize=11, leading=16,
            textColor=TEXT_PRIMARY, alignment=TA_CENTER))],
         [Paragraph(label, ParagraphStyle(
             "co2", fontName="FreeSerif", fontSize=8.5, leading=12,
             textColor=TEXT_MUTED, alignment=TA_CENTER))]],
        colWidths=[AVAIL_W * 0.86])
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    inner.hAlign = "CENTER"
    return [Spacer(1, 6), KeepTogether(inner), Spacer(1, 10)]


def figure(path, caption, max_h=None):
    img = embed_image(os.path.join(BASE, path), max_h=max_h)
    return safe_keep_together([img, Paragraph(caption, S["caption"])],
                              max_h=PAGE_H * 0.45)


# ------------------------------------------------------------ doc template --
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            # TOC displays the VISIBLE footer number: doc page 1 is the TOC
            # (roman i), body pages show doc.page - 1.
            self.notify("TOCEntry", (level, text, self.page - 1, key))


def page_deco(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # header
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 42,
                      "JARVIS NEXUS  ·  PRE-PRODUCTION PACKAGE  ·  PHASE ZERO")
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 50, PAGE_W - MARGIN, PAGE_H - 50)
    # footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 44, PAGE_W - MARGIN, 44)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 33, "Z.ai  ·  Owner copy")
    num = "i" if doc.page == 1 else str(doc.page - 1)
    canvas.drawRightString(PAGE_W - MARGIN, 33, num)
    canvas.restoreState()


# ------------------------------------------------------------------ story ---
story = []

# ---- TOC page ----
story.append(Paragraph("<b>Table of Contents</b>", S["tocTitle"]))
toc = TableOfContents()
toc.levelStyles = [TOC_L0, TOC_L1]
story.append(toc)
story.append(PageBreak())

# ---- Chapter 1 ----
story += h1_block("Chapter 1  —  Repository Inspection Report", P(CH1_INTRO))
for title, paras in CH1_SECTIONS:
    story += h2_block(title, P(paras[0]))
    for extra in paras[1:]:
        story.append(P(extra))
story += styled_table(CH1_TABLE)
story += callout(*CH1_CALLOUT)

# ---- Chapter 2 ----
story += h1_block("Chapter 2  —  Character Direction", P(CH2_INTRO))
for title, paras in CH2_SECTIONS:
    story += h2_block(title, P(paras[0]))
    for extra in paras[1:]:
        story.append(P(extra))

# character concept plates: full body + face, side by side
fig_full = embed_image(os.path.join(BASE, "concepts/char_fullbody.png"), max_h=252)
fig_face = embed_image(os.path.join(BASE, "concepts/char_face.png"), max_h=252)
pair = Table([[fig_full, fig_face]],
             colWidths=[fig_full.drawWidth + 14, fig_face.drawWidth + 14],
             hAlign="CENTER")
pair.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ("TOPPADDING", (0, 0), (-1, -1), 0),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
]))
story += safe_keep_together(
    [pair, Spacer(1, 2), Paragraph("Plates 2.1-2.2 - Character concept studies: full figure and face. "
                     "They fix silhouette, wardrobe language and attitude; the shipped "
                     "character comes from the licensed pipeline in Table 2.3.", S["caption"])],
    max_h=PAGE_H * 0.45)

story += h2_block("2.6  Expressions", P(
    "Five expression states cover the working range. Each is defined in FACS action units "
    "so the facial rig, the animation system and any performance capture pass all share "
    "one vocabulary, and each is a modulation of a living baseline - never a frozen mask."))
story += styled_table(CH2_EXPRESSIONS)
story += h2_block("2.7  Poses and locomotion targets", P(
    "The five posed states below are the building blocks every mode composes from; speed "
    "and transition targets are contractual values the controller is tuned against."))
story += styled_table(CH2_POSES)
for title, paras in CH2_FACIAL:
    story += h2_block(title, P(paras[0]))
story += h2_block("2.7  Proposed licensed assets", P(
    "The pipeline below is proposed for licensing. Every entry names its licence basis "
    "and role; nothing enters the repository without that row filled in."))
story += styled_table(CH2_ASSETS, cell_style="cellSmall")
story.append(P(CH2_ASSETS_NOTE))

# ---- Chapter 3 ----
story += h1_block("Chapter 3  —  Environment Direction", P(CH3_INTRO))
story += h2_block("3.1  The floor plan",
                  P("Twelve areas open onto one continuous floor. The plan below is the "
                    "spatial contract: every mode, camera framing and scene in this package "
                    "is composed against it."))
story += figure("build/floorplan.png",
                "Plate 3.1 - The Nexus, operations floor plan. Cool zones carry work; warm "
                "zones carry memory and study; the defensive arc alone holds red.", max_h=300)
story += styled_table(CH3_AREAS, cell_style="cellSmall")
for title, paras in CH3_LIGHT:
    story += h2_block(title, P(paras[0]))
    for extra in paras[1:]:
        story.append(P(extra))
story += styled_table(CH3_PALETTE)
story += figure("concepts/env_hub.png",
                "Plate 3.2 - Central Operations: dais, holotable and console ring under the "
                "overhead light ring.", max_h=280)
story += figure("concepts/env_spine.png",
                "Plate 3.3 - The Spine axis: Memory Archive warm-left, Plan Wall right, the "
                "Stage volume in the far distance.", max_h=280)

# ---- Chapter 4 ----
story += h1_block("Chapter 4  —  Visual Storyboard", P(CH4_INTRO))
for fr in FRAMES:
    story.append(CondPageBreak(640))
    story.append(add_heading(f"Frame {fr['num']}  ·  {fr['title']}", "frameTitle", level=1))
    story.append(Paragraph(f"{fr['mode']}   —   {fr['loc']}", S["frameMode"]))
    story.append(embed_image(os.path.join(BASE, fr["img"]), max_w=AVAIL_W, max_h=278))
    story.append(Spacer(1, 7))
    cap_rows = [
        ("Action and task state", fr["action"]),
        ("Emotional state", fr["emotion"]),
        ("Camera and framing", fr["camera"]),
        ("Lighting", fr["lighting"]),
        ("Environment", fr["environment"]),
        ("Visible information", fr["visible"]),
        ("Owner interaction", fr["owner"]),
        ("Entry / exit transitions", fr["transitions"]),
    ]
    data = []
    for field, value in cap_rows:
        data.append([Paragraph(f"<b>{field}</b>", S["frameField"]),
                     Paragraph(value, S["frameField"])])
    cap = Table(data, colWidths=[0.215 * AVAIL_W, 0.785 * AVAIL_W], hAlign="CENTER")
    cap_style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(len(data)):
        cap_style.append(("BACKGROUND", (0, i), (0, i), CARD_BG))
        cap_style.append(("BACKGROUND", (1, i), (1, i), colors.white))
    cap.setStyle(TableStyle(cap_style))
    story.append(cap)
    story.append(Paragraph(f"SYSTEMS  ·  {fr['systems']}", S["systems"]))
    story.append(Spacer(1, 12))

# ---- Chapter 5 ----
story += h1_block("Chapter 5  —  Motion and Technical Plan", P(CH5_INTRO))
for title, paras in CH5_SECTIONS:
    story += h2_block(title, P(paras[0]))
story += h2_block("5.11  Storyboard-to-systems mapping",
                  P("Every frame maps to the systems that realise it. The matrix below is "
                    "the traceability contract between the storyboard and the build."))
story += styled_table(CH5_MAPPING, cell_style="cellSmall")

# ---- Chapter 6 ----
story += h1_block("Chapter 6  —  Architecture and Implementation Sequence", P(CH6_INTRO))
story += h2_block("6.1  CORE module register",
                  P("Rendering, orchestration, inference and persistence stay independently "
                    "replaceable behind these module boundaries."))
story += styled_table(CH6_MODULES, cell_style="cellSmall")
for title, paras in CH6_INFERENCE:
    story += h2_block(title, P(paras[0]))
story += h2_block("6.3  Milestones",
                  P("Four milestones, each gated by visible acceptance criteria rather than "
                    "by feature checklists."))
story += styled_table(CH6_MILESTONES, cell_style="cellSmall")
for title, paras in CH6_PROTOCOL:
    story += h2_block(title, P(paras[0]))

# ---- Chapter 7 ----
story += h1_block("Chapter 7  —  Approval Gate and Open Decisions", P(CH7_INTRO))
story += h2_block("7.1  Approvals requested")
for i, (title, desc) in enumerate(CH7_APPROVALS, 1):
    story.append(P(f"<b>{i}.  {title}.</b>  {desc}"))
story.append(Spacer(1, 4))
story += h2_block("7.2  Open decisions requiring your choice")
for code, desc in CH7_DECISIONS:
    story.append(P(f"<b>{code}.</b>  {desc}"))
story += h2_block("7.3  After approval", P(CH7_CLOSE))
story += h2_block("7.4  Phase Zero artifacts",
                  P("Everything produced in this phase is delivered for review at full "
                    "resolution. Nothing in the repository was modified; these artifacts "
                    "sit alongside it, untracked, until your approval starts Milestone 1."))
story += styled_table(CH7_ARTIFACTS)

# ------------------------------------------------------------------ build ---
doc = TocDocTemplate(
    OUT, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
    title=DOC_TITLE, author="Z.ai", creator="Z.ai",
    subject="JARVIS NEXUS Phase Zero pre-production package: character direction, "
            "environment direction, visual storyboard, motion and technical plan.")
doc.multiBuild(story, onFirstPage=page_deco, onLaterPages=page_deco)
print("built", OUT)
