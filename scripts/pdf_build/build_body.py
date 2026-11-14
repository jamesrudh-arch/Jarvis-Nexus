#!/usr/bin/env python3
"""Build the body PDF for the Railway Infrastructure Intelligence final
engineering report (ReportLab, per pdf skill report brief). English document:
FreeSerif body, auto-TOC (TocDocTemplate + multiBuild), cascade palette,
Paragraph-wrapped table cells, proportional column widths."""
import hashlib
import os
import sys

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (CondPageBreak, KeepTogether, PageBreak,
                                Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

# ---- fonts (allowed set only) ------------------------------------------------
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")

from pdf import install_font_fallback  # noqa: E402  (skill helper)
install_font_fallback()

# ---- cascade palette (auto-generated, pasted verbatim) ------------------------
PAGE_BG = colors.HexColor("#eef0f0")
SECTION_BG = colors.HexColor("#ecedee")
CARD_BG = colors.HexColor("#e4e8eb")
TABLE_STRIPE = colors.HexColor("#eceeee")
HEADER_FILL = colors.HexColor("#3c5b6b")
COVER_BLOCK = colors.HexColor("#5b6f78")
BORDER = colors.HexColor("#bfcdd4")
ICON = colors.HexColor("#458db1")
ACCENT = colors.HexColor("#246a8e")
ACCENT_2 = colors.HexColor("#c05a38")
TEXT_PRIMARY = colors.HexColor("#1b1d1e")
TEXT_MUTED = colors.HexColor("#6f7679")
SEM_SUCCESS = colors.HexColor("#47815b")
SEM_WARNING = colors.HexColor("#ac8a46")
SEM_ERROR = colors.HexColor("#a9524a")
TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = TABLE_STRIPE

# ---- document geometry --------------------------------------------------------
OUT = "/home/z/my-project/scripts/pdf_build/body.pdf"
MARGIN = 1.0 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
MAX_KEEP_HEIGHT = PAGE_H * 0.4
H1_ORPHAN_THRESHOLD = AVAIL_H * 0.15

# ---- styles --------------------------------------------------------------------
S = {}
S["body"] = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=16,
                           alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=8)
S["bullet"] = ParagraphStyle("Bullet", parent=S["body"], alignment=TA_LEFT, leftIndent=14,
                             bulletIndent=4, spaceAfter=4)
S["h1"] = ParagraphStyle("H1", fontName="FreeSerif-Bold", fontSize=17, leading=22,
                         textColor=HEADER_FILL, spaceBefore=18, spaceAfter=10)
S["h2"] = ParagraphStyle("H2", fontName="FreeSerif-Bold", fontSize=13, leading=18,
                         textColor=TEXT_PRIMARY, spaceBefore=12, spaceAfter=6)
S["muted"] = ParagraphStyle("Muted", parent=S["body"], textColor=TEXT_MUTED, fontSize=9.5)
S["callout"] = ParagraphStyle("Callout", fontName="FreeSerif", fontSize=11, leading=17,
                              textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S["th"] = ParagraphStyle("TH", fontName="FreeSerif-Bold", fontSize=9.5, leading=13,
                         textColor=colors.white, alignment=TA_LEFT)
S["td"] = ParagraphStyle("TD", fontName="FreeSerif", fontSize=9.5, leading=13,
                         textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S["tdc"] = ParagraphStyle("TDC", parent=S["td"], alignment=TA_CENTER)
S["toc_title"] = ParagraphStyle("TocTitle", fontName="FreeSerif-Bold", fontSize=20,
                                leading=26, textColor=HEADER_FILL, spaceAfter=14)

toc_l0 = ParagraphStyle("TOC0", fontName="FreeSerif-Bold", fontSize=10.5, leading=16, leftIndent=6)
toc_l1 = ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=9.5, leading=14, leftIndent=24)


# ---- doc template with TOC + footer --------------------------------------------
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            self.notify("TOCEntry", (level, text, self.page, key))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("FreeSerif", 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch,
                      "JARVIS NEXUS  ·  Railway Infrastructure Intelligence  ·  Final Engineering Report")
    canvas.drawRightString(PAGE_W - MARGIN, 0.55 * inch, f"Page {doc.page}")
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    canvas.restoreState()


# ---- helpers --------------------------------------------------------------------
def heading(text, level=0):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    style = S["h1"] if level == 0 else S["h2"]
    p = Paragraph(f'<a name="{key}"/><b>{text}</b>', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        _, h = el.wrap(AVAIL_W, PAGE_H)
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def section(title, first_para=None):
    out = [CondPageBreak(H1_ORPHAN_THRESHOLD), heading(title, 0)]
    if first_para:
        out.append(Paragraph(first_para, S["body"]))
    return out


def body(text):
    return Paragraph(text, S["body"])


def bullets(items):
    return [Paragraph(f"•  {t}", S["bullet"]) for t in items]


def make_table(header, rows, ratios, center_cols=()):
    assert abs(sum(ratios) - 1.0) < 1e-6
    col_widths = [r * AVAIL_W for r in ratios]
    assert sum(col_widths) <= AVAIL_W + 0.01
    data = [[Paragraph(f"<b>{h}</b>", S["th"]) for h in header]]
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            style = S["tdc"] if i in center_cols else S["td"]
            cells.append(Paragraph(cell, style))
        data.append(cells)
    t = Table(data, colWidths=col_widths, hAlign="CENTER", repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        style_cmds.append(("BACKGROUND", (0, i), (-1, i),
                           TABLE_ROW_ODD if i % 2 == 1 else TABLE_ROW_EVEN))
    t.setStyle(TableStyle(style_cmds))
    return t


def callout(text):
    inner = Paragraph(text, S["callout"])
    t = Table([[inner]], colWidths=[AVAIL_W * 0.96], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


# ---- story ------------------------------------------------------------------------
story = []

story.append(Paragraph("<b>Table of Contents</b>", S["toc_title"]))
toc = TableOfContents()
toc.levelStyles = [toc_l0, toc_l1]
story.append(toc)
story.append(PageBreak())

# -- 1 --------------------------------------------------------------------------------
story += section("1. Initial Repository Findings",
    "The repository is the post-ground-zero-rebuild monorepo: a Hono single deployable "
    "(apps/nexus-api) plus eleven workspace packages with @nexus/contracts as the single boundary "
    "source, @nexus/db SQLite persistence (migrations 1-2), a fail-visible HealthRegistry, "
    "constant-time owner-bearer authentication, orchestrator approval gates and an MCP gateway "
    "with per-server permissions. The baseline recorded before this work: typecheck clean, 70 "
    "tests (66 pass / 4 credential-gated LLM skips / 0 fail), 77 registry requirements "
    "consistent, CI green.")
story.append(body(
    "Two security findings existed at intake. First, the untracked credentials.env file was not "
    "gitignored; it was added to .gitignore as the first change of this engagement. Second, .env "
    "appears in pre-rebuild git history, so any credentials of that era must be considered "
    "exposed unless already rotated (see Section 24). The prior acceptance report also recorded "
    "that the auditor's Railway token had been rejected with a 403, leaving deployment-status "
    "monitoring unavailable - precisely the gap this directive closed."))
story.append(body(
    "Untracked legacy residue (src/, NEXUS_WORLD/, prisma/ and the ad-hoc scripts/ probes from "
    "earlier sessions) was confirmed to be outside the committed architecture and was excluded "
    "from every change made in this work."))

# -- 2/3 ------------------------------------------------------------------------------
story += section("2. Existing Railway Capabilities (Before)",
    "Before this directive the integration surface consisted of: health probes wired to the "
    "Railway healthcheck (the /health endpoint fails visible with HTTP 503 when unhealthy), the "
    "Dockerfile and railway.json deployment configuration, and an LLM-usage cost sink inside the "
    "model fabric. Deployment evidence existed only as registry records. There was no Railway "
    "API client, no deployment introspection, no infrastructure monitoring, cost intelligence, "
    "webhook handling, backup verification or recovery control - the entire capability was "
    "greenfield.")
story += section("3. Missing Capabilities (Gap Analysis - All Built)",
    "The gap analysis identified thirteen missing capabilities; all were implemented and tested: "
    "a GraphQL client with error classification, retry, backoff, rate-budget protection and a "
    "circuit breaker; schema-contract intelligence; complete infrastructure discovery; "
    "five-dimension monitoring; cost intelligence; a fourteen-step diagnostics workflow; an "
    "L1-L4 recovery authorization model with verified execution; webhook and polling event "
    "intelligence; state reconciliation; a tamper-evident audit trail; backup verification; "
    "JARVIS architectural integration; and a formal threat model with comprehensive tests "
    "including live read-only verification.")

# -- 4/5 ------------------------------------------------------------------------------
story += section("4. Architecture and Integration Changes",
    "A new workspace package @nexus/railway (18 modules) integrates at the established seams of "
    "the monorepo. Database migration 3 adds the railway_events, railway_audit and railway_state "
    "tables. The contracts package gains the webhook event schema, permission levels and request "
    "schemas. The API exposes twenty new HTTP routes. JARVIS gains four tools, of which "
    "railway.recovery.execute is consequential and dual-gated. A railway health probe joins the "
    "fail-visible health registry. Infrastructure observations are written to the memory scope "
    "'railway' (tier operational) and bounded metric labels are preserved.")
story.append(body(
    "Credential isolation is architectural: the Railway token lives only inside @nexus/railway "
    "and never reaches MCP registrations, NAEI workspaces, tool parameters, logs or HTTP "
    "responses - a control now enforced by an integration test. Zero new runtime dependencies "
    "were added: the package uses only fetch and node:crypto."))
story += section("5. Files Created or Modified",
    "Created: packages/railway (18 source modules plus the committed contract baseline), the "
    "shared test mock helper, eleven test files, two documentation files and three registry or "
    "evidence scripts. Modified: packages/contracts, packages/db, packages/core (id prefixes), "
    "apps/nexus-api/src/index.ts, tsconfig.json, .gitignore and the three registries. The "
    "implementation commit e7d4e39 contains 8,971 insertions; the verifier-remediation commit "
    "a808727 adds 80 further insertions.")

# -- 6/7 ------------------------------------------------------------------------------
story += section("6. Security Assessment",
    "A fifteen-threat formal model is committed in the package, each threat documented with "
    "attack surface, potential impact, existing controls, required mitigation, verification "
    "method and residual risk. Credential theft is contained by env-only intake, redaction on "
    "every surface and rotation support. Compromised agents and prompt injection can at worst "
    "produce recommendations: language never reaches an execution path, agents are never "
    "granted, and the recovery tool is consequential in the orchestrator with the railway grant "
    "as a second independent gate. Webhook spoofing and replay are blunted by constant-time "
    "secret comparison, a replay window, fingerprint deduplication, reconciliation of every "
    "accepted event against the authoritative API, and throttled rejection auditing. The audit "
    "trail is hash-chained and detects both modification and deletion.")
story += section("7. Credential Configuration Status",
    "The active workspace token (rlwy_wksp prefix, 50 characters) is stored only in the "
    "gitignored, chmod-600 .env file and read once by the credential manager. The previous "
    "token is retained solely as RAILWAY_API_TOKEN_PREVIOUS for revocation verification. "
    "No token-shaped string or secret file is tracked in git - verified by scanning both commit "
    "diffs and the tree.")
story.append(callout(
    "<b>Security finding:</b> the previous workspace token is <b>still valid</b> - rotation is "
    "incomplete. Revoke it in the Railway dashboard. The active token was also transmitted in "
    "owner chat during this engagement, so rotating it afterwards is recommended."))

# -- 8/9 ------------------------------------------------------------------------------
story += section("8. Live API Verification",
    "Authentication was verified live against https://backboard.railway.com/graphql/v2 with the "
    "workspace token. Token-type semantics were confirmed from official documentation and live "
    "probes: the me query returns Not Authorized on HTTP 200 for workspace tokens (personal "
    "queries require account tokens), and project tokens must use the Project-Access-Token "
    "header instead of Bearer. The observed rate limit is a Hobby-tier 1000 requests per hour, "
    "advertised through RateLimit-Policy, X-RateLimit-Limit, X-RateLimit-Remaining, "
    "X-RateLimit-Reset and Retry-After headers. A full introspection captured the live schema - "
    "387 object types, 165 queries, 262 mutations - which is committed as the versioned contract "
    "baseline. The error-classification matrix, retries, budget guard and circuit breaker are "
    "unit-tested with a mocked transport, and the live suite exercises the real client end to "
    "end in read-only mode.")
story += section("9. Infrastructure Discovery Results (Live)",
    "Discovery against production on 15 November 2026 found: project reasonable-heart; "
    "environment production; service instance Jarvis-Nexus whose latest deployment 3bed9747 is "
    "SUCCESS (built 2026-11-14T12:58Z); the service domain "
    "jarvis-nexus-production.up.railway.app in ACTIVE state; one volume (READY, 49.4 of 500 MB "
    "used, mounted at /data); fifty recent events ingested; platform status stable with no "
    "incident or maintenance; and zero inaccessible classifications. The variables query - "
    "which returns secret values inline - is never issued, a control enforced by the contract "
    "test suite.")

# -- 10 -------------------------------------------------------------------------------
story += section("10. Monitoring Results (Live)",
    "All five monitoring dimensions report independently and were healthy at capture time: the "
    "Railway API is reachable, all latest deployments are healthy, application endpoints are "
    "responding, dependencies are nominal and infrastructure is nominal. Dimensions are "
    "computed and reported separately by design - a successful deployment is never reported as "
    "a healthy application, and Scenario B of the exercise suite proves the independence by "
    "constructing exactly that divergence. The public status route exposes statuses only; "
    "evidence and topology detail are owner-gated.")

# -- 11 -------------------------------------------------------------------------------
story += section("11. Diagnostic Results",
    "The fourteen-step investigation workflow is exercised end to end. With a failed deployment "
    "and error-bearing logs, the engine classifies the cause CONFIRMED at confidence 0.9 with "
    "the log lines attached as evidence and rollback and redeploy recommendations carrying "
    "their L3 permission level. With a successful deployment but a failing application it "
    "classifies PROBABLE runtime failure at 0.6. Credential failures are CONFIRMED with "
    "owner-only rotation guidance. When evidence is insufficient the engine answers UNKNOWN "
    "rather than speculating. All evidence sources were additionally verified live: the "
    "deployment detail query, real deployment logs (volume mount, container start) and the "
    "real lifecycle event chain SNAPSHOT_CODE, BUILD_IMAGE, PUBLISH_IMAGE, CREATE_CONTAINER, "
    "CONFIGURE_NETWORK.")

# -- 12 -------------------------------------------------------------------------------
story += section("12. Recovery Results",
    "Level-1 read intelligence and Level-2 planning are automatic and side-effect free. "
    "Level-3 and Level-4 execution requires the owner-bearer route, a single-use fifteen-minute "
    "resource-scoped grant, and non-read-only mode. Agents are never granted under any "
    "circumstances. Executed operations (in the isolated environment) are followed by an "
    "independent re-query of the resulting state for deployment and service operations; other "
    "operation classes record the acknowledgement explicitly labelled as not independent "
    "verification. The full authorized loop - diagnose, plan, grant, execute, verify - passes, "
    "and grant replay, forged grants, wrong-scope grants and read-only refusals are all "
    "correctly rejected. No production mutation has ever been executed; the live suite asserts "
    "the read-only refusal with the real token.")

# -- 13 -------------------------------------------------------------------------------
story += section("13. Cost Intelligence Results (Live)",
    "Measured usage (workspaceUsageTotals) and estimated usage (estimatedUsage) are reported "
    "separately and never mixed: at capture time, measured CPU_USAGE 1.352 and NETWORK_RX_GB "
    "0.0096, with estimates reported alongside under their own label. Observed volume pressure "
    "(49.4 of 500 MB) raised no alert. Thresholds are configurable per measurement, and anomaly "
    "detection is explicitly labelled a heuristic. The verified schema exposes no workspace USD "
    "billing total for workspace tokens, so no currency figure is fabricated - the limitation "
    "is stated in every report the service produces.")

# -- 14 -------------------------------------------------------------------------------
story += section("14. Event Processing Results",
    "Webhook intelligence was built on verified facts: Railway webhooks are not "
    "cryptographically signed, delivery is unordered and best-effort with three retries, and "
    "verification is a custom secret header configured per project in the dashboard. The "
    "receiver fails closed when unconfigured (HTTP 503), verifies the X-Webhook-Secret header "
    "in constant time (401 otherwise), validates the payload against the zod contract (400), "
    "enforces a replay tolerance window, deduplicates by event fingerprint with accepted-once "
    "semantics, persists out-of-order arrivals safely, and reconciles every accepted event "
    "against the authoritative API because webhooks are prompts rather than truth. Rejection "
    "auditing is throttled to twenty records per ten minutes to prevent an unauthenticated "
    "flood from growing the audit table. The controlled poller ingested fifty real events "
    "during live discovery with zero duplicates, defers when the rate budget is low, and "
    "checkpoints its cursor for restart recovery.")

# -- 15 -------------------------------------------------------------------------------
story += section("15. Reconciliation Results",
    "A full live cycle was executed: persist the authoritative snapshot, re-discover, compare. "
    "The result was zero discrepancies - internal state matches authoritative Railway state. "
    "The discrepancy classes (missing in actual, missing in internal, status mismatch, stale "
    "record) are unit-tested with injected divergence, internal records are never silently "
    "overwritten because reconciliation only reports while snapshots advance through the "
    "explicit persistence path, history is retained, and the what-changed difference powers "
    "the owner's question of the same name.")

# -- 16 -------------------------------------------------------------------------------
story += section("16. Backup and Restoration Results",
    "Application-level logical backups are proven recoverable: a full read-only export of all "
    "twenty-four tables with per-table SHA-256 digests is restored into an isolated in-memory "
    "database and compared row-exactly; tampering with the export breaks verification. The "
    "owner-facing export route performs both steps and reports the verification result. Railway "
    "volume backups are a different matter: existence and schedule metadata are reported "
    "honestly as UNVERIFIED for recovery, restoring one is an L4 destructive operation blocked "
    "under the read-only directive, and the live discovery found that the production volume "
    "currently has zero backups - a data-loss exposure surfaced explicitly by the backup report.")

# -- 17 -------------------------------------------------------------------------------
story += section("17. Operational Independence Results",
    "The intelligence module runs as a standalone library and proved in Scenario G that it can "
    "monitor an unreachable primary application from outside the application process, "
    "preserving diagnostic evidence in its own store. In the current production topology it "
    "runs inside the same deployable as the application, which is a documented single point of "
    "failure: if the entire service is down, monitoring of that service is down with it, while "
    "the Railway platform status and API remain independently queryable from anywhere the "
    "package runs. Poller and webhook state survive restarts through checkpoints and the "
    "append-only store.")

# -- 18 -------------------------------------------------------------------------------
story += section("18. Test Execution Summary")
story.append(callout(
    "<b>163 pass / 4 skip / 0 fail</b> - 167 tests, 628 assertions, 23 files, run twice "
    "(full suite, then post-remediation) on 15 November 2026."))
story.append(body(
    "The four skips are the pre-existing credential-gated live-LLM tests (Cloudflare "
    "completions, a live JARVIS objective and a live NAEI scenario) which self-skip without "
    "provider credentials - they predate this work and are unrelated to Railway. The railway "
    "capability contributes 97 tests: client (8), credentials (6), contract (6), authorization "
    "(6), webhook (7), audit (5), reconciliation (6), diagnostics (5), routes integration (15), "
    "live read-only (8) and scenario exercises (12), plus the shared mock helper. Every mock is "
    "explicitly labelled and no unit test touches the network."))
story.append(make_table(
    ["Suite", "Result", "Character"],
    [
        ["Unit (railway-*)", "48 pass", "Mocked transport, deterministic, labelled MOCK"],
        ["Integration (routes)", "15 pass", "Real app via createApp + mocked Railway transport"],
        ["Integration (live)", "8 pass", "LIVE read-only against production Railway API"],
        ["Scenarios (exercises A-I)", "12 pass", "End-to-end operational exercises"],
        ["Pre-existing regression", "66 pass + 4 skips", "Unchanged, no test weakened or deleted"],
    ],
    [0.30, 0.22, 0.48], center_cols=(1,)))

# -- 19/20 ----------------------------------------------------------------------------
story += section("19. Regression Results",
    "The pre-existing suite is fully preserved: all sixty-six passing tests still pass and the "
    "four credential-gated skips remain skips. No existing test was modified, weakened or "
    "deleted - every change is additive. Typecheck is clean across the whole repository and "
    "the registry validator reports the registries consistent, with only pre-existing warnings.")
story += section("20. End-to-End Exercise Results")
story.append(make_table(
    ["Scenario", "Result", "Evidence"],
    [
        ["A - Deployment failure investigation", "PASS (isolated)", "CONFIRMED cause, logs attached, L3 recommendations, plan created"],
        ["B - App outage with healthy deployment", "PASS", "Deployment and application dimensions reported independently"],
        ["C - Credential failure", "PASS", "Live garbage-token AUTH classification; previous-token probe; no secret exposure"],
        ["D - Infrastructure discrepancy", "PASS", "Status mismatch detected and classified"],
        ["E - Abnormal consumption", "PASS", "Threshold and volume-pressure anomalies; measured/estimated kept distinct"],
        ["F - Lost event", "PASS", "Poller re-ingests, deduplicates, checkpoints"],
        ["G - Monitoring outage", "PASS", "Module monitors the down application from outside the process"],
        ["H - Authorized recovery", "PASS (isolated)", "Full loop verified; read-only, agent and forged-grant refusals"],
        ["I - Backup restoration", "PASS (logical) / BLOCKED (production volume restore)", "Isolated restore row-exact; volume restore awaits owner authorization"],
    ],
    [0.26, 0.22, 0.52]))

# -- 21 -------------------------------------------------------------------------------
story += section("21. Independent Verification Report",
    "A separate adversarial verifier with read-only access and explicit rejection authority "
    "re-ran the suite itself, re-verified all five evidence claims, and attempted six classes "
    "of authorization bypass - forged principals, grant replay, scope creep, agent "
    "self-approval and orchestrator bypass. Every bypass attempt failed. The verifier audited "
    "test honesty and secret hygiene and returned ACCEPT with six minor findings and three "
    "nits, none of which invalidated an acceptance-matrix claim.")
story.append(body(
    "All actionable findings were remediated in commit a808727: the live suite now skips "
    "honestly without credentials, acknowledgement-only verification is labelled as not "
    "independent and conservatively marked unverified, the public status route was stripped of "
    "topology detail, webhook rejection auditing is throttled, the phantom test reference in "
    "the threat model was replaced by a real credential-isolation test, and the "
    "has-an-operation-succeeded question now answers from real plan records. The suite was "
    "re-run green afterwards. Items the verifier could not independently confirm - external "
    "documentation citations, snapshot provenance, and the historical no-mutation claim - are "
    "disclosed in Sections 23 and 24."))

# -- 22 -------------------------------------------------------------------------------
story += section("22. Acceptance Matrix")
story.append(body(
    "Every requirement is assessed with the directive's statuses. Seventeen pass, two are "
    "partial, and none fail; both partials are gated on owner action rather than "
    "implementation gaps."))
story.append(make_table(
    ["Requirement", "Status", "Evidence"],
    [
        ["Credential security", "PASS", "Gitignored chmod-600 env; redaction tests; no secret in tree or diffs"],
        ["Authentication", "PASS", "Live authCheck; token-type semantics verified from docs and live probes"],
        ["API integration", "PASS", "Live discovery, monitoring, usage and contract queries against production"],
        ["API resilience", "PASS", "Error matrix, retry, breaker, budget guard; live drift check with no BREAKING"],
        ["Infrastructure discovery", "PASS", "Live full discovery, zero inaccessible classifications"],
        ["Deployment monitoring", "PASS", "Live five-dimension monitoring across the 13-value status enum"],
        ["Application health", "PASS", "Independent HTTP checks, live healthy; Scenario B proves independence"],
        ["Diagnostics", "PASS", "Workflow tested end to end; evidence sources verified live"],
        ["Recovery controls", "PASS", "Unauthorized operations blocked, including live read-only refusal"],
        ["Agent security", "PASS", "Agents never granted; credential isolation test-enforced"],
        ["Event intelligence", "PARTIAL", "Receiver and polling fully tested; live Railway delivery awaits owner webhook configuration"],
        ["Reconciliation", "PASS", "Live cycle with zero discrepancies; divergence classes unit-tested"],
        ["Cost intelligence", "PASS", "Live measured/estimated separation; thresholds; no fabricated currency"],
        ["Backup verification", "PARTIAL", "Logical backups proven restorable; volume restore blocked (L4, read-only); volume has zero backups"],
        ["Disaster recovery", "PASS", "Resilience suite plus scenarios A-I; checkpoints; restart-safe stores"],
        ["Operational independence", "PASS", "Standalone monitoring of a down application; SPOFs documented"],
        ["Observability", "PASS", "Hash-chained audit with tamper tests; redacted evidence; bounded metrics"],
        ["JARVIS integration", "PASS", "20 routes with 401 matrix; dual-gated recovery tool; health probe; memory"],
        ["Regression testing", "PASS", "66 of 66 original tests preserved; 163/4/0 total"],
        ["End-to-end testing", "PASS", "Scenarios A-I with recorded outcomes"],
        ["Independent verification", "PASS", "Adversarial verifier ACCEPT; remediation; green re-run"],
    ],
    [0.20, 0.10, 0.70], center_cols=(1,)))

# -- 23 -------------------------------------------------------------------------------
story += section("23. Remaining Defects",
    "No defects remain open. The six minor findings from independent verification were all "
    "remediated and re-tested. Known documented limitations - distinct from defects - are: the "
    "mutation network-retry residual double-apply window (a connection reset after the request "
    "was sent also surfaces as a network error; the comment and threat model document the risk "
    "and recommend idempotent operations), the audit chain detecting partial tampering only (a "
    "local attacker controlling the SQLite file can rewrite the whole chain; external log "
    "shipping is future work), and the absence of a workspace USD billing total for workspace "
    "tokens in the verified schema.")

# -- 24 -------------------------------------------------------------------------------
story += section("24. Outstanding Blockers",
    "Five items require owner action, all documented with the registry's five-point blocker "
    "format where applicable:")
story += bullets([
    "<b>INFRA-24 - production deployment</b> of the railway intelligence: pushing to main "
    "auto-deploys; until authorized, the capability runs from the repository against the live API.",
    "<b>INFRA-23 - Railway volume backup restore</b>: blocked as an L4 destructive operation "
    "under the read-only directive; and the production volume currently has <b>zero backups</b>, "
    "so enabling the backup schedule or taking a first logical backup is recommended.",
    "<b>Previous workspace token still valid</b>: revoke it in the Railway dashboard.",
    "<b>Live webhook delivery</b>: configure the project webhook and RAILWAY_WEBHOOK_SECRET "
    "per the runbook in docs/RAILWAY_INTELLIGENCE.md.",
    "<b>.env in pre-rebuild git history</b>: purge the history or confirm those credentials "
    "were rotated.",
])

# -- 25 -------------------------------------------------------------------------------
story += section("25. Production Changes Requiring Authorization",
    "The following production changes were deliberately not performed and require explicit "
    "owner authorization: deploying this capability to Railway (push to main or a manual "
    "redeploy); setting the production variables RAILWAY_WEBHOOK_SECRET and "
    "RAILWAY_PROJECT_ID; disabling RAILWAY_READ_ONLY or granting any L3/L4 operation "
    "(restart, redeploy, rollback, stop, remove, variable, domain, volume, service or project "
    "mutations, backup restore); enabling volume backup schedules or creating the first volume "
    "backup; and revoking or rotating Railway tokens.")
story.append(Spacer(1, 12))
story.append(callout(
    "<b>No production change was performed.</b> The evidence determines the result: 17 of 21 "
    "requirements PASS, 2 PARTIAL (owner-action-gated), 0 FAIL - with live, read-only proof "
    "against the real infrastructure."))

# ---- build ---------------------------------------------------------------------------
doc = TocDocTemplate(
    OUT, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
    title="Railway Infrastructure Intelligence - Final Engineering Report",
    author="Z.ai",
)
doc.multiBuild(story, onFirstPage=footer, onLaterPages=footer)
print(f"body built: {OUT}")
