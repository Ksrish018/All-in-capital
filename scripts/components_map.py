"""Draws Components_Map.svg: the whole built system on one page.

Two loops, joined: Loop 1 screens an application up to Kushal's sign off, Loop 2 runs outreach up to the call.
The learning loops (A to G) carry what people decide back into the system.
Usage: python scripts/components_map.py   (then render the PNG, see the end of this file)
"""
import html
from pathlib import Path

W, H = 2400, 1660
out: list[str] = []

STYLE = {
    "code": ("#eef2f7", "#334e68"),
    "ai": ("#f3e8ff", "#7c3aed"),
    "person": ("#fdecea", "#c0392b"),
    "service": ("#e6f6f4", "#0f766e"),
    "setup": ("#fff7e6", "#b7791f"),
    "plain": ("#ffffff", "#9aa5b1"),
}
INK = "#1f2933"
MUTED = "#52606d"
LOOP = "#d97706"


def text(x, y, s, size=15, weight=400, color=INK, anchor="start", italic=False):
    st = ' font-style="italic"' if italic else ""
    out.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}"{st}>{html.escape(s)}</text>')


def box(x, y, w, h, kind, title, lines=(), tag=None):
    fill, stroke = STYLE[kind]
    width = 3 if kind == "person" else 1.6
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')
    if tag:
        text(x + w - 12, y + 24, tag, 12, 700, stroke, "end")
    text(x + 14, y + 27, title, 17, 700)
    for i, line in enumerate(lines):
        text(x + 14, y + 51 + i * 20, line, 14, 400, MUTED)


def arrow(points, color="#334e68", dashed=False, label=None, at=None, width=2):
    d = " ".join(f"{px},{py}" for px, py in points)
    dash = ' stroke-dasharray="8 6"' if dashed else ""
    marker = {"#334e68": "m", LOOP: "ml", "#c0392b": "mg", "#0f766e": "mt"}[color]
    out.append(f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="{width}"{dash} marker-end="url(#{marker})"/>')
    if label:
        lx, ly = at if at else points[len(points) // 2]
        pad = 6 + len(label) * 3.6
        out.append(f'<rect x="{lx - pad}" y="{ly - 13}" width="{pad * 2}" height="20" rx="6" fill="#ffffff" opacity="0.94"/>')
        text(lx, ly + 2, label, 13, 600, color, "middle")


def frame(x, y, w, h, title, sub, color):
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="none" stroke="{color}" stroke-width="2.5" stroke-dasharray="2 0"/>')
    out.append(f'<rect x="{x + 24}" y="{y - 16}" width="{len(title) * 11 + len(sub) * 7.2 + 50}" height="32" rx="16" fill="{color}"/>')
    text(x + 40, y + 6, title, 18, 800, "#ffffff")
    text(x + 52 + len(title) * 11, y + 6, sub, 14, 500, "#ffffff")


# ---- canvas, markers, header
out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Segoe UI, Inter, Arial, sans-serif">')
out.append("<defs>" + "".join(
    f'<marker id="{i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
    for i, c in [("m", "#334e68"), ("ml", LOOP), ("mg", "#c0392b"), ("mt", "#0f766e")]
) + "</defs>")
out.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
text(40, 52, "All In Capital Triage: Components Map", 32, 800)
text(40, 82, "The built system, 21 November 2026. Two loops joined at Kushal's sign off. People decide every outcome; the system shows its work.", 17, 400, MUTED)

lx = 1360
for i, (kind, label) in enumerate([("code", "Code"), ("ai", "AI call (Gemini)"), ("person", "A person decides"), ("service", "Data or outside service"), ("setup", "Set up before screening")]):
    fill, stroke = STYLE[kind]
    out.append(f'<rect x="{lx + i * 200}" y="34" width="22" height="18" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
    text(lx + 30 + i * 200, 49, label, 14, 500, MUTED)
out.append(f'<line x1="{lx}" y1="76" x2="{lx + 40}" y2="76" stroke="{LOOP}" stroke-width="2.5" stroke-dasharray="8 6"/>')
text(lx + 50, 81, "Learning loop: what people decide comes back in (Loops A to G)", 14, 500, LOOP)

# ---- left column: set up before any application
box(40, 150, 300, 150, "setup", "Thesis Card", ["11 criteria, rated 0 to 4", "Two lenses: public, revealed", "Rules that override the score", "v2: a PASS needs a failure"], "S1")
box(40, 320, 300, 110, "setup", "Portfolio list", ["25 companies with tags", "Used for the conflict check"], "S2")
box(40, 450, 300, 130, "setup", "Memo passages", ["12 memos, 48 tagged passages", "Build set gives context", "Test set held out"], "S3")
box(40, 600, 300, 150, "setup", "Back test (Loop A)", ["Memo companies at decision", "time, research off", "N1: no funded PASS unflagged", "Kushal approves a version"], "S4")
# Kushal approves a version only after its back test: the arrow runs outside the column.
arrow([(40, 690), (24, 690), (24, 225), (38, 225)], LOOP, True)

# ---- Loop 1: screening
frame(370, 128, 1360, 830, "LOOP 1  Screening", "once per application, about $0.10", "#334e68")

R1, R2, R3, R4 = 160, 330, 500, 700
cols = [400, 665, 930, 1195, 1460]
BW = 240

box(cols[0], R1, BW, 130, "person", "1 Intake", ["Riya drops forms and decks", "or adds a warm intro", "PDF only, 25 MB"], "Riya")
box(cols[1], R1, BW, 130, "service", "2 Store and queue", ["Private file storage", "Queue: none get lost (N5)", "4 at a time"], "Supabase")
box(cols[2], R1, BW, 130, "code", "3 Parse", ["Reads form fields by", "position on the page", "Deck kept page by page"])
box(cols[3], R1, BW, 130, "code", "4 Redact", ["Founders become F1, F2", "Emails, phones, links", "become tags (N6)"])
box(cols[4], R1, 250, 130, "ai", "5 Cheap checks", ["Later stage, sector, capital,", "excluded, duplicate: code", "Portfolio conflict: A0"], "A0")
for a, b in zip(cols, cols[1:]):
    arrow([(a + BW, R1 + 65), (b - 2, R1 + 65)])

box(cols[0], R2, BW, 130, "ai", "6 Track 1", ["Deck and form read as", "the founder's claims", "Every quote checked"], "A1")
box(cols[1], R2, BW, 130, "code", "7 Sufficiency", ["Code lists the open", "questions the deck and", "form leave unanswered"])
box(cols[2], R2, BW, 130, "ai", "8 Track 2 research", ["Our own checks: exists,", "founders, market, news,", "red flags. 12 fetches max"], "A2")
box(cols[3], R2, BW, 130, "ai", "9 Compare", ["Confirmed, founder says,", "conflict, found by us", "Deck vs form: 5% rule"], "A2")
box(cols[4], R2, 250, 130, "plain", "Stopped early", ["Short brief with the flag", "Research skipped to save", "cost. Riya can run it all"])
arrow([(cols[4] + 125, R1 + 130), (cols[4] + 125, R2 - 2)], label="a check hit", at=(cols[4] + 125, R1 + 155))
arrow([(cols[4] + 60, R1 + 130), (cols[4] + 60, R1 + 150), (cols[0] + 120, R1 + 150), (cols[0] + 120, R2 - 2)], label="clean: full screening", at=(cols[2] + 120, R1 + 150))
for a, b in zip(cols[:3], cols[1:4]):
    arrow([(a + BW, R2 + 65), (b - 2, R2 + 65)])

box(cols[0], R3, BW, 130, "code", "10 Context packs", ["Per criterion: its evidence,", "3 memo passages, up to", "3 of Riya's rule corrections"])
box(cols[1], R3, BW, 130, "ai", "11 Score 11 criteria", ["Rating 0 to 4 with reason", "Made-up citation fails (N2)", "Strong needs an outside source"], "A3")
box(cols[2], R3, BW, 130, "code", "12 Recommend", ["Code, never the model", "GO, PASS, needs a person,", "or HOLD, on both lenses"])
box(cols[3], R3, BW, 130, "ai", "13 Brief", ["Flags first, then evidence", "What we could not find", "Two-line summary"], "A4")
arrow([(cols[3] + 120, R2 + 130), (cols[3] + 120, R2 + 150), (cols[0] + 120, R2 + 150), (cols[0] + 120, R3 - 2)])
for a, b in zip(cols[:3], cols[1:4]):
    arrow([(a + BW, R3 + 65), (b - 2, R3 + 65)])
arrow([(340, 225), (356, 225), (356, R3 + 30), (cols[0] - 2, R3 + 30)])
arrow([(340, 515), (356, 515)])

box(cols[1], R4, 400, 170, "person", "Gate 1  Riya reviews", ["Evidence first, oldest first", "Agree in one click, or change with a reason", "Blind check on 1 in 10 PASS calls", "Correct a rating: fact or rule", "Time on page recorded"], "Riya")
box(cols[3], R4, 400, 170, "person", "Gate 2  Kushal signs off", ["Board in four columns", "Bulk sign off only where Riya agreed", "and nothing is flagged", "GO, PASS, hold, or send back", "Portfolio conflicts come here first"], "Kushal")
arrow([(cols[3] + 120, R3 + 130), (cols[3] + 120, R4 - 40), (cols[1] + 300, R4 - 40), (cols[1] + 300, R4 - 2)])
arrow([(cols[4] + 125, R2 + 130), (cols[4] + 125, R4 - 60), (cols[1] + 340, R4 - 60), (cols[1] + 340, R4 - 2)], label="short brief", at=(cols[4] + 125, R3 + 40))
arrow([(cols[1] + 400, R4 + 70), (cols[3] - 2, R4 + 70)], label="Riya's decision", at=(cols[2] + 200, R4 + 60))
arrow([(cols[3] - 2, R4 + 130), (cols[1] + 402, R4 + 130)], "#c0392b", label="send back", at=(cols[2] + 200, R4 + 140))
arrow([(cols[4] + 250, R1 + 95), (1715, R1 + 95), (1715, R4 + 20), (cols[3] + 402, R4 + 20)], "#c0392b", label="conflict: HOLD", at=(1715, R3 - 20))

# learning loops inside Loop 1
arrow([(cols[1] + 40, R4), (cols[1] + 40, R3 + 160), (cols[2] + 252, R3 + 160), (cols[2] + 252, R2 + 110), (cols[2] + BW + 2, R2 + 110)], LOOP, True, "Loop B: ask for research", (cols[1] + 200, R3 + 160))
arrow([(cols[1] + 10, R4 + 40), (cols[0] + 60, R4 + 40), (cols[0] + 60, R3 + 132)], LOOP, True, "Loop C: rule correction", (cols[0] + 90, R4 + 40))

# ---- join: Gate 2 to Loop 2
arrow([(cols[3] + 200, R4 + 170), (cols[3] + 200, 985), (cols[0] + 120, 985), (cols[0] + 120, 1058)], "#c0392b", label="GO or PASS starts outreach   (HOLD: no email)", at=(cols[2], 985), width=3)

# ---- Loop 2: outreach
L2 = 1040
frame(370, L2, 1360, 470, "LOOP 2  Outreach agent", "one step every 10 minutes, nothing sent without Riya", "#0f766e")
Q1, Q2 = 1075, 1300
box(cols[0], Q1, BW, 150, "ai", "14 Draft the email", ["GO: invite with 3 slots", "PASS: kind note, what would", "change our view. No scores", "First name added by code"], "A5")
box(cols[1], Q1, BW, 150, "person", "Gate 3  Riya sends", ["Reads and edits", "\"Send from your Gmail\"", "No send all (N4)", "Simulate mode until live"], "Riya")
box(cols[2], Q1, BW, 150, "service", "15 Watch the thread", ["Reads only the stored", "thread, never other mail", "Every 10 minutes"], "Gmail")
box(cols[3], Q1, BW, 150, "ai", "16 Read the reply", ["Picked a slot, new time,", "no time, not interested,", "out of office, or unclear", "Below 0.75 means unclear"], "A6")
box(cols[4], Q1, 250, 150, "service", "19 Book", ["Founder confirmed in writing", "Slot checked free again", "30 minutes, Meet link", "Aditya added for deeptech"], "Calendar")
for a, b in zip(cols, cols[1:]):
    arrow([(a + (BW if a != cols[4] else 250), Q1 + 75), (b - 2, Q1 + 75)])

box(cols[1], Q2, BW, 130, "person", "With Riya", ["Unclear reply, a bounce,", "a third new time, or no", "reply after two follow ups"], "Riya")
box(cols[2], Q2, BW, 130, "code", "17 Follow ups", ["No reply: day 3 and day 7", "Then no response", "Never more than two"])
box(cols[3], Q2, BW, 130, "code", "18 Scheduling", ["New slots, never a refused", "one. Tue or Thu, 2 to 6 pm", "Two rounds, then Riya"])
box(cols[4], Q2, 250, 130, "person", "20 After the call", ["One tap: worth 30 minutes?", "Plus call notes"], "Team")
arrow([(cols[4] + 125, Q1 + 150), (cols[4] + 125, Q2 - 2)])
arrow([(cols[3] + 120, Q1 + 150), (cols[3] + 120, Q2 - 2)], label="new time", at=(cols[3] + 120, Q1 + 168))
arrow([(cols[3] + 30, Q1 + 150), (cols[3] + 30, Q1 + 185), (cols[1] + 200, Q1 + 185), (cols[1] + 200, Q2 - 2)], label="unclear", at=(cols[2] + 50, Q1 + 185))
arrow([(cols[2] + 120, Q1 + 150), (cols[2] + 120, Q2 - 2)], label="no reply", at=(cols[2] + 150, Q1 + 168))
# both come back to a new draft for Riya
arrow([(cols[3] + BW, Q2 + 100), (cols[3] + 255, Q2 + 100), (cols[3] + 255, Q2 + 160), (cols[0] + 160, Q2 + 160), (cols[0] + 160, Q1 + 152)], label="new draft for Riya", at=(cols[1] + 120, Q2 + 160))
arrow([(cols[2] + 40, Q2 + 130), (cols[2] + 40, Q2 + 160)])
# Loop D: style notes
arrow([(cols[1] + 120, Q1 + 150), (cols[1] + 120, Q1 + 200), (cols[0] + 60, Q1 + 200), (cols[0] + 60, Q1 + 152)], LOOP, True, "Loop D: edits become style notes", (cols[0] + 180, Q1 + 200))

# ---- Loop G: the call outcome goes back to the start
arrow([(cols[4] + 250, Q2 + 65), (1745, Q2 + 65), (1745, 1560), (190, 1560), (190, 752)], LOOP, True, "Loop G: call outcomes join the back test set, so the Thesis Card learns from real calls", (960, 1560), 3)

# ---- right column: data, services, guards, screens
RX = 1780
box(RX, 150, 580, 200, "service", "Supabase (Postgres, storage, queues)", [
    "applications, documents, founders (names stay here)",
    "evidence by track, research fetches, scores, briefs",
    "reviews, corrections, outreach, emails, replies",
    "thesis cards, back test results, model calls, events",
    "Row Level Security on every table",
    "Queues: screening and outreach",
])
box(RX, 370, 580, 150, "service", "Cloudflare AI Gateway to Gemini", [
    "Flash Lite: A0, A2, A6 (cheap reads)",
    "Flash: A1 extract, A4 summary, A5 drafts",
    "Pro: A3 scoring, thinking kept low",
    "JSON schema on every call, retry once",
])
box(RX, 540, 580, 110, "service", "Tavily research", [
    "Replay mode for tests, live web when switched on",
    "Never LinkedIn, social or contact-data sites",
])
box(RX, 670, 580, 110, "service", "Google Gmail and Calendar", [
    "Send only from Riya's click. Read only stored threads",
    "Free and busy times, then the booked event",
])
box(RX, 800, 580, 110, "service", "Langfuse and our own logs", [
    "A trace per application, a span per model call",
    "Every model input logged, so N6 can be audited",
])
box(RX, 940, 580, 262, "code", "Guards that are always on", [
    "N1  No funded company marked PASS with no flag",
    "N2  Every citation exists",
    "N3  A founder-only claim is never shown as confirmed",
    "N4  Only Riya's click sends an email",
    "N5  No application vanishes, 20 at once tested",
    "N6  No founder name, email or phone reaches a model",
    "Text aimed at the AI is flagged and ignored",
    "Daily cost cap: pause at a saved step, then resume",
    "APP_PASSWORD before the app goes online",
    "Scores and recommendation decided in code",
])
box(RX, 1222, 580, 288, "plain", "Screens", [
    "Pipeline: live flow bar, feed and board",
    "Review: Riya's queue (J, K, A, C, R keys)",
    "Sign off: Kushal's four columns",
    "Outreach: to send, live, with Riya, done",
    "Thesis Card: criteria, rules, pending corrections",
    "Back test: per company, verdicts, approve",
    "Dashboard: metrics and the stop list",
    "Cost: spend against the cap",
    "Settings: each one owned by one person",
])

text(40, 1625, "Steps are numbered as in PRD Section 5. Loops as in PRD Section 11. Gates are the only places an outcome is decided, always by a person.", 15, 400, MUTED)
out.append("</svg>")

root = Path(__file__).resolve().parents[1]
(root / "Components_Map.svg").write_text("\n".join(out), encoding="utf-8")
print("wrote Components_Map.svg")
# PNG: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu --hide-scrollbars
#      --window-size=2400,1660 --screenshot=Components_Map.png file:///<path>/Components_Map.svg
