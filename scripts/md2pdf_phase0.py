#!/usr/bin/env python3
"""Convert PHASE-0-REPORT.md to a clean PDF via weasyprint (HTML intermediate)."""
import html
import re
import sys

SRC = "/home/z/my-project/download/PHASE-0-REPORT.md"
DST = "/home/z/my-project/download/PHASE-0-REPORT.pdf"

lines = open(SRC, encoding="utf-8").read().splitlines()
out = []
in_code = False
code_buf = []
in_table = False
table_rows = []


def flush_table():
    global table_rows
    if not table_rows:
        return
    # detect separator row
    has_sep = any(re.fullmatch(r"[\s|:\-]+", r) for r in table_rows)
    rows = [r for r in table_rows if not re.fullmatch(r"[\s|:\-]+", r)]
    parsed = []
    for r in rows:
        cells = [c.strip() for c in r.strip().strip("|").split("|")]
        parsed.append(cells)
    if not parsed:
        table_rows = []
        return
    ncol = max(len(r) for r in parsed)
    h = ['<table>']
    if has_sep and len(parsed) > 1:
        head, body = parsed[0], parsed[1:]
        h.append("<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead>")
    else:
        body = parsed
        h.append("<thead><tr>" + "".join("<th></th>" for _ in range(ncol)) + "</tr></thead>")
    h.append("<tbody>")
    for r in body:
        r = r + [""] * (ncol - len(r))
        h.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
    h.append("</tbody></table>")
    out.append("".join(h))
    table_rows = []


def inline(s):
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s


for line in lines:
    if line.strip().startswith("```"):
        if in_code:
            out.append("<pre>" + html.escape("\n".join(code_buf)) + "</pre>")
            code_buf = []
            in_code = False
        else:
            flush_table()
            in_table = False
            in_code = True
        continue
    if in_code:
        code_buf.append(line)
        continue
    if line.strip().startswith("|"):
        in_table = True
        table_rows.append(line)
        continue
    if in_table:
        flush_table()
        in_table = False
    if re.match(r"^#{1,4} ", line):
        level = len(line) - len(line.lstrip("#"))
        out.append(f"<h{level}>{inline(line[level:].strip())}</h{level}>")
    elif line.strip().startswith("> "):
        out.append(f"<blockquote>{inline(line.strip()[2:])}</blockquote>")
    elif re.match(r"^\s*[-*] ", line):
        out.append(f"<li>{inline(re.sub(r'^\s*[-*] ', '', line))}</li>")
    elif line.strip() == "---":
        out.append("<hr/>")
    elif line.strip():
        out.append(f"<p>{inline(line.strip())}</p>")

flush_table()
if in_code and code_buf:
    out.append("<pre>" + html.escape("\n".join(code_buf)) + "</pre>")

body = "".join(out)
body = body.replace("<li>", "<li>", 1)
# wrap consecutive <li> in <ul>
body = re.sub(r"(<li>.*?</li>)(?=<li>)", r"\1", body)
body = re.sub(r"(?:<li>.*?</li>)+", lambda m: "<ul>" + m.group(0) + "</ul>", body)

html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 18mm 15mm; @bottom-center {{ content: counter(page) " / " counter(pages); font-size: 8pt; color: #666; }} }}
body {{ font-family: 'DejaVu Sans', sans-serif; font-size: 9pt; line-height: 1.45; color: #1a1a1a; }}
h1 {{ font-size: 16pt; color: #0f2a4a; border-bottom: 2px solid #0f2a4a; padding-bottom: 4px; }}
h2 {{ font-size: 12.5pt; color: #0f2a4a; margin-top: 14px; border-bottom: 1px solid #b8c6d8; padding-bottom: 2px; }}
h3 {{ font-size: 10.5pt; color: #24486e; margin-top: 10px; }}
h4 {{ font-size: 9.5pt; color: #24486e; }}
table {{ border-collapse: collapse; width: 100%; margin: 6px 0 10px 0; font-size: 7.6pt; }}
th {{ background: #0f2a4a; color: #fff; padding: 3px 5px; text-align: left; }}
td {{ border: 0.5pt solid #9db1c7; padding: 3px 5px; vertical-align: top; }}
tr:nth-child(even) td {{ background: #f2f6fa; }}
code {{ font-family: 'DejaVu Sans Mono', monospace; font-size: 7.8pt; background: #eef2f7; padding: 0 2px; }}
pre {{ font-family: 'DejaVu Sans Mono', monospace; font-size: 7.5pt; background: #f4f6f9; border: 0.5pt solid #c6d2e0; padding: 6px; white-space: pre-wrap; }}
blockquote {{ border-left: 3px solid #4a7ab5; margin: 6px 0; padding: 2px 10px; color: #333; background: #f6f9fc; }}
hr {{ border: none; border-top: 0.75pt solid #b8c6d8; margin: 10px 0; }}
ul {{ margin: 4px 0 8px 0; padding-left: 16px; }}
li {{ margin: 2px 0; }}
b {{ color: #0f2a4a; }}
</style></head><body>{body}</body></html>"""

open("/tmp/phase0_report.html", "w", encoding="utf-8").write(html_doc)

from weasyprint import HTML
HTML(string=html_doc).write_pdf(DST)
print("PDF written:", DST)
