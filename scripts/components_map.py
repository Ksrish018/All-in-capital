"""Draws Components_Map.svg: the whole built system on one grid.

Rows are the actors, columns are Trigger, Input, Context, Processing, AI and Output (the course framework).
Loop 1 screens an application up to Kushal's sign off. Loop 2 runs outreach up to the call.
The learning loops (A to G) carry what people decide back into the system.
Usage: python scripts/components_map.py   (then render the PNG, see the end of this file)
"""
import html
from pathlib import Path

W, H = 2500, 3150
out: list[str] = []

NAVY = "#1b2a4a"
INK = "#1f2933"
MUTED = "#4a5563"
KIND = {  # fill, stroke
    "person": ("#efeafd", "#6b5bd2"),
    "code": ("#eaf5ec", "#3d9a5b"),
    "decision": ("#fff7df", "#c9930c"),
    "ai": ("#fdebf1", "#d6487e"),
    "memory": ("#fff0de", "#e08a1e"),
    "service": ("#e7f0fb", "#3b6fc4"),
}
C_MAIN, C_RED, C_A, C_B, C_ORANGE, C_G, C_GREY = NAVY, "#c0392b", "#7c3aed", "#0f8a7a", "#e08a1e", "#2f6fdb", "#8a94a3"
MARK = {C_MAIN: "m0", C_RED: "m1", C_A: "m2", C_B: "m3", C_ORANGE: "m4", C_G: "m5", C_GREY: "m6"}


def text(x, y, s, size=15, weight=400, color=INK, anchor="start"):
    out.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{html.escape(s)}</text>')


def pill(x, y, s, bg, fg="#ffffff", size=12, anchor="start"):
    w = len(s) * size * 0.62 + 20
    x0 = x - w if anchor == "end" else (x - w / 2 if anchor == "middle" else x)
    out.append(f'<rect x="{x0:.1f}" y="{y - 11}" width="{w:.1f}" height="22" rx="11" fill="{bg}"/>')
    text(x0 + w / 2, y + 4.5, s, size, 700, fg, "middle")


# ---- grid
AX, AW = 20, 210
CX0, CW = 230, 356
COLS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"]
GRID_END = CX0 + CW * 6
TOP = 170

ROWS = [  # key, actor, sub, tint, height
    ("band1", "LOOP 1 · Screening", "once per application, about $0.10", None, 56),
    ("r1", "Riya", "(analyst: uploads, reviews)", "#f6f2fe", 200),
    ("s1", "System", "(code on Vercel)", "#fffaeb", 200),
    ("a1", "AI", "(Gemini)", "#eef7f0", 200),
    ("m1", "Memory", "(what the fund knows)", "#fff4e6", 200),
    ("k1", "Kushal", "(partner: signs off, owns the card)", "#f6f2fe", 200),
    ("band2", "LOOP 2 · Outreach agent", "one step per run, nothing sent without Riya", None, 72),
    ("s2", "System", "(outreach agent)", "#fffaeb", 200),
    ("a2", "AI", "(Gemini)", "#eef7f0", 200),
    ("m2", "Memory", "(learns Riya's style)", "#fff4e6", 170),
    ("r2", "Riya", "(sends every email)", "#f6f2fe", 200),
    ("f2", "Founder + Google", "(Gmail, Calendar)", "#eaf2fc", 200),
    ("t2", "Team", "(after the call, and the checks)", "#fdeef0", 170),
]
RY: dict[str, tuple[int, int]] = {}
y = TOP
for key, *_rest, h in ROWS:
    RY[key] = (y, h)
    y += h
GRID_BOTTOM = y


def col_x(i):
    return CX0 + i * CW


def lane(row):  # the gap under a row
    y0, h = RY[row]
    return y0 + h


B: dict[str, dict] = {}


def box(key, row, col, kind, title, lines, tag=None, stage=None, stage_color=None, planned=False):
    y0, h = RY[row]
    x, yy, w, hh = col_x(col) + 13, y0 + 18, CW - 26, h - 36
    B[key] = dict(x=x, y=yy, w=w, h=hh)
    fill, stroke = KIND[kind]
    width = 2.6 if kind == "person" else 1.8
    dash = ' stroke-dasharray="8 5"' if planned else ""
    out.append(f'<rect x="{x}" y="{yy}" width="{w}" height="{hh}" rx="10" fill="{fill}" stroke="{stroke}" stroke-width="{width}"{dash}/>')
    if tag:
        pill(x + w - 10, yy, tag, NAVY, anchor="end")
    if stage:
        pill(x + 10, yy, stage, stage_color or stroke)
    cx = x + w / 2
    top = yy + (40 if hh > 140 else 36)
    text(cx, top, title, 17, 700, INK, "middle")
    for i, line in enumerate(lines):
        text(cx, top + 24 + i * 21, line, 14, 400, MUTED, "middle")


def L(k, dy=0):
    b = B[k]
    return (b["x"], b["y"] + b["h"] / 2 + dy)


def R(k, dy=0):
    b = B[k]
    return (b["x"] + b["w"], b["y"] + b["h"] / 2 + dy)


def T(k, dx=0):
    b = B[k]
    return (b["x"] + b["w"] / 2 + dx, b["y"])


def Bo(k, dx=0):
    b = B[k]
    return (b["x"] + b["w"] / 2 + dx, b["y"] + b["h"])


def cx(k, dx=0):
    return B[k]["x"] + B[k]["w"] / 2 + dx


def cy(k, dy=0):
    return B[k]["y"] + B[k]["h"] / 2 + dy


labels: list[str] = []


def arrow(points, color=C_MAIN, dashed=False, label=None, at=None, width=2.2):
    d = " ".join(f"{px:.1f},{py:.1f}" for px, py in points)
    dash = ' stroke-dasharray="9 6"' if dashed else ""
    out.append(f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="{width}"{dash} stroke-linejoin="round" marker-end="url(#{MARK[color]})"/>')
    if label:
        lx, ly = at if at else points[len(points) // 2]
        w = len(label) * 7.1 + 16
        labels.append(f'<rect x="{lx - w / 2:.1f}" y="{ly - 12}" width="{w:.1f}" height="21" rx="5" fill="#ffffff" stroke="{color}" stroke-width="0.8" opacity="0.97"/>')
        labels.append(f'<text x="{lx:.1f}" y="{ly + 3.5:.1f}" font-size="13" font-weight="600" fill="{color}" text-anchor="middle">{html.escape(label)}</text>')


# ---- canvas
out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Segoe UI, Inter, Arial, sans-serif">')
out.append("<defs>" + "".join(
    f'<marker id="{m}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
    for c, m in MARK.items()
) + "</defs>")
out.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
text(W / 2, 52, "All In Capital · Application Triage, With AI (built system)", 34, 800, NAVY, "middle")
text(W / 2, 88, "Loop 1 screens each application up to Kushal's sign off. Loop 2 runs outreach up to the call. People decide every outcome. Dashed boxes and lines marked v2 are planned (PRD Section 24).", 17, 400, MUTED, "middle")

# header
out.append(f'<rect x="{AX}" y="110" width="{GRID_END + 110 - AX}" height="60" fill="{NAVY}"/>')
text(AX + AW / 2, 148, "Actor", 21, 500, "#ffffff", "middle")
for i, c in enumerate(COLS):
    text(col_x(i) + CW / 2, 148, c, 21, 500, "#ffffff", "middle")

# rows
for key, actor, sub, tint, h in ROWS:
    y0 = RY[key][0]
    if tint is None:  # loop band
        out.append(f'<rect x="{AX}" y="{y0}" width="{GRID_END + 110 - AX}" height="{h}" fill="#e9edf3"/>')
        color = C_MAIN if key == "band1" else "#0f766e"
        pill(AX + 20, y0 + (24 if key == "band1" else 22), actor, color, size=15)
        text(AX + 20 + len(actor) * 9.3 + 36, y0 + (29 if key == "band1" else 27), sub, 15, 500, MUTED)
        continue
    out.append(f'<rect x="{CX0}" y="{y0}" width="{GRID_END + 110 - CX0}" height="{h}" fill="{tint}"/>')
    out.append(f'<rect x="{AX}" y="{y0}" width="{AW}" height="{h}" fill="{NAVY}"/>')
    out.append(f'<line x1="{AX}" y1="{y0}" x2="{GRID_END + 110}" y2="{y0}" stroke="#ffffff" stroke-width="2"/>')
    is_memory = actor == "Memory"
    text(AX + AW / 2, y0 + h / 2 - 2, actor, 20, 700, "#f2b45a" if is_memory else "#ffffff", "middle")
    text(AX + AW / 2, y0 + h / 2 + 22, sub, 12.5, 400, "#c8d1de", "middle")
for i in range(1, 7):
    out.append(f'<line x1="{col_x(i)}" y1="{TOP}" x2="{col_x(i)}" y2="{GRID_BOTTOM}" stroke="#ffffff" stroke-width="2"/>')

# ================= LOOP 1: screening
box("intake", "r1", 0, "person", "① New application", ["Riya drops forms and decks,", "or adds a warm intro · PDF, 25 MB", "v2: upload limit per visitor", "v2: consent line for the deck"], "Upload page")
box("gate1", "r1", 5, "person", "Gate 1 · Riya reviews", ["Agree in one click, or change", "with a one-line reason", "Blind check on 1 in 10 PASS calls", "R asks for research · C corrects"], "Review page", "GATE 1")

box("worker", "s1", 0, "code", "Screening worker", ["Starts on each upload", "4 applications at a time", "v2: Supabase cron every minute"], "Vercel")
box("store", "s1", 1, "code", "② Store · ③ Parse · ④ Redact", ["Private storage and a queue (N5)", "Form fields read by position", "Founders become F1, F2 (N6)"], "Supabase")
box("cheap", "s1", 2, "decision", "⑤ Cheap checks", ["Stage, sector, capital,", "excluded list, duplicate", "A hit stops early, saves cost"], "Code")
box("suff", "s1", 3, "code", "⑦ Sufficiency", ["Lists what the deck and", "form leave unanswered", "These steer the research"], "Code")
box("recommend", "s1", 4, "decision", "⑫ Recommend", ["Decided in code, never the model", "GO · PASS · needs a person · HOLD", "Read on both lenses"], "Code")

box("a0", "a1", 1, "ai", "Portfolio conflict", ["Three yes or no questions", "Code decides the overlap", "Conflict: HOLD, Kushal sees it"], "Gemini A0")
box("a1x", "a1", 2, "ai", "⑥ Track 1: the founder's claims", ["Deck and form read as", "what the founder says", "Every quote checked on its page"], "Gemini A1")
box("a2x", "a1", 3, "ai", "⑧ Research · ⑨ Compare", ["Our own web checks, 12 fetches max", "Never LinkedIn or login sites", "Confirmed · founder says · conflict"], "Tavily + A2")
box("a3", "a1", 4, "ai", "⑪ Score 11 criteria", ["Rating 0 to 4 with a reason", "Made-up citation fails (N2)", "Strong needs an outside source"], "Gemini A3")
box("a4", "a1", 5, "ai", "⑬ Brief", ["Flags first, then evidence", "What we could not find", "A two-line summary"], "Gemini A4")

box("memo", "m1", 1, "memory", "Memo passages", ["12 past memos, 48 passages", "Build set gives context", "Test set held out for Loop A"], "Supabase")
box("card", "m1", 2, "memory", "Thesis Card + portfolio", ["11 criteria, two lenses", "Rules that override the score", "25 portfolio companies"], "Supabase")
box("corr", "m1", 3, "memory", "Riya's corrections", ["Fact: fixes this company", "Rule: kept as context for", "similar ones, never the card"], "Supabase", "LOOP C", C_ORANGE)
box("packs", "m1", 4, "memory", "⑩ Context packs", ["Per criterion: its evidence,", "3 memo passages and up to", "3 matching rule corrections", "v2: says when no close match"], "Code")
box("dash", "m1", 5, "service", "Dashboard · stop list", ["Review minutes, override rate", "Blind check agreement", "v2: disagreement score, both", "loops, by week (target < 10%)"], "Code")

box("approve", "k1", 2, "person", "Approve a card version", ["Only after its back test", "v1 refused: funded PASS", "v2 waits for Kushal"], "Thesis page")
box("backtest", "k1", 3, "code", "Back test", ["Memo companies at decision time", "Research off · N1 check", "Kushal sets a verdict per company"], "Code + A3", "LOOP A", C_A)
box("gate2", "k1", 5, "person", "Gate 2 · Kushal signs off", ["Board in four columns", "Bulk only where Riya agreed", "and nothing is flagged", "GO · PASS · hold · send back"], "Sign off page", "GATE 2")

lSA, lAM, lMK = lane("s1"), lane("a1"), lane("m1")
b34 = col_x(4)  # boundary between Processing and AI
b45 = col_x(5)

arrow([R("intake"), (cx("store"), cy("intake")), T("store")])
arrow([R("worker"), L("store")])
arrow([R("store"), L("cheap")])
arrow([Bo("cheap", -60), (cx("cheap", -60), lSA), (cx("a0"), lSA), T("a0")], label="portfolio overlap?", at=(cx("a0", 120), lSA))
arrow([R("a0"), L("a1x")], label="clean", at=(col_x(2), cy("a0") - 22))
arrow([T("a1x", 70), (cx("a1x", 70), lSA), (cx("suff", -70), lSA), Bo("suff", -70)])
arrow([Bo("suff", 40), T("a2x", 40)], label="open questions", at=(cx("suff", 40), lSA + 2))
arrow([R("a2x"), L("a3")])
arrow([T("packs"), Bo("a3")], label="context", at=(cx("a3"), lAM))
arrow([R("corr"), L("packs")])
arrow([Bo("memo"), (cx("memo"), lMK), (cx("packs", 60), lMK), Bo("packs", 60)], label="criteria + memo passages", at=(col_x(3) + 20, lMK))
arrow([Bo("card", 60), (cx("card", 60), lMK)])
arrow([T("card", -90), (cx("card", -90), lAM), (cx("a0", 40), lAM), Bo("a0", 40)], label="portfolio list", at=(col_x(2) - 10, lAM))
arrow([T("a3"), Bo("recommend")], label="ratings", at=(cx("a3"), lSA))
arrow([R("recommend"), (b45, cy("recommend")), (b45, B["a4"]["y"] + 40), (B["a4"]["x"], B["a4"]["y"] + 40)])
arrow([T("a4"), Bo("gate1")], label="brief", at=(cx("a4"), RY["s1"][0] + 100))
# short path: a cheap check hit
r1y = RY["r1"][0]
arrow([T("cheap"), (cx("cheap"), r1y + 52), (B["gate1"]["x"], r1y + 52)], C_GREY, True, "a check hit: short brief, research skipped", (col_x(3) + 40, r1y + 52))
# Gate 1 to Gate 2, and send back
MX1, MX2 = GRID_END + 30, GRID_END + 55
arrow([R("gate1", -20), (MX1, cy("gate1", -20)), (MX1, cy("gate2", -20)), R("gate2", -20)], label="Riya's decision", at=(MX1, cy("dash")))
arrow([R("gate2", 30), (MX2, cy("gate2", 30)), (MX2, cy("gate1", 30)), R("gate1", 30)], C_RED, label="send back", at=(MX2, cy("a4")))
# Loop B and Loop C
arrow([L("gate1", 0), (b34 - 7, cy("gate1")), (b34 - 7, B["a2x"]["y"] + 28), (B["a2x"]["x"] + B["a2x"]["w"], B["a2x"]["y"] + 28)], C_B, True, "Loop B: ask for research", (col_x(4) + 120, cy("gate1")))
arrow([L("gate1", 45), (b34 + 7, cy("gate1", 45)), (b34 + 7, lAM), (cx("corr", 80), lAM), T("corr", 80)], C_ORANGE, True, "Loop C: rule correction", (col_x(4) + 120, cy("gate1", 45)))
# Loop A
arrow([L("backtest"), R("approve")], C_A, True)
arrow([T("approve", -40), Bo("card", -40)], C_A, True, "approved version is live", (cx("approve", -40), lMK + 2))

# ================= join
b2y = RY["band2"][0]
# ================= LOOP 2: outreach
box("tick", "s2", 0, "code", "Agent tick", ["Starts on GO or PASS", "Then one step per run", "v2: Supabase cron every 10 min"], "Vercel")
box("watch", "s2", 1, "code", "⑮ Read state + thread", ["Where this company is", "Reads only the stored thread,", "never other mail"], "Gmail API")
box("rules", "s2", 2, "decision", "⑰ Follow ups · ⑱ Slots", ["No reply: day 3, then day 7", "Tue or Thu, 2 to 6 pm IST", "Never a slot already refused"], "Code", "LOOPS E · F", NAVY)
box("next", "s2", 5, "decision", "Next step, in code", ["Book · offer new slots", "Follow up · hand to Riya", "One step per run, saved"], "Code")

box("a6", "a2", 3, "ai", "⑯ Read the reply", ["Picked a slot · new time", "No time · not interested", "Below 0.75 means unclear"], "Gemini A6")
box("a5", "a2", 5, "ai", "⑭ Draft the email", ["v2: model writes the fact line", "and one sharp question only", "Code adds greeting, two slots,", "Aditya line, sign-off · checked"], "Gemini A5")

box("log", "m2", 2, "service", "Outreach record", ["Every draft and sent version", "Replies, slots offered, status"], "Supabase")
box("notes", "m2", 4, "memory", "Style notes", ["Edits propose notes", "Riya approves each one,", "for its sector or for all"], "Supabase", "LOOP D", C_ORANGE)

box("withriya", "r2", 3, "person", "With Riya", ["Unclear reply or a bounce", "A third request for a new time", "No reply after two follow ups"], "Outreach page")
box("gate3", "r2", 5, "person", "Gate 3 · Riya sends", ["Reads and edits the draft", "Send from her Gmail", "No send all (N4)"], "Outreach page", "GATE 3")

box("founder", "f2", 0, "service", "Founder replies", ["Email arrives from Riya", "Founder picks a slot,", "asks for a new time, or not"], "Gmail")
box("cal", "f2", 5, "service", "⑲ Book the call", ["Founder confirmed in writing", "Slot checked free again", "30 minutes, Meet link"], "Calendar API")

box("call", "t2", 5, "person", "⑳ After the call", ["One tap: worth 30 minutes?", "Plus call notes"], "Outreach page")
box("evals", "t2", 2, "code", "Measure, then fix the prompt", ["Sealed tests: 20 emails, 12 calls", "Emails 0% to 90% on three checks", "npm run eval:loops"], "Seed data 2", "M10 · M11", "#0f766e")
box("ft", "t2", 3, "ai", "Fine-tune: stopped", ["The prompt met the 90% pass mark", "Brief and dataset handed in", "Reopen if the weekly score rises"], "Colab + Unsloth", "M12", "#5b6b7f", planned=True)

lS2, lA2, lM2, lR2 = lane("s2"), lane("a2"), lane("m2"), lane("r2")
# join from Gate 2
arrow([Bo("gate2"), (cx("gate2"), b2y + 52), (cx("tick"), b2y + 52), T("tick")], C_RED, label="GO or PASS starts outreach   (HOLD: no email)", at=(col_x(2) + 60, b2y + 52), width=3)
arrow([R("tick"), L("watch")])
arrow([R("watch"), L("rules")])
arrow([R("rules"), L("next")], label="what is due today", at=(col_x(4), cy("rules")))
arrow([Bo("watch", 50), (cx("watch", 50), cy("a6")), L("a6")], label="new reply", at=(col_x(2) + 60, cy("a6")))
arrow([T("a6"), (cx("a6"), cy("next", 40)), L("next", 40)], label="the founder's intent", at=(col_x(4) + 20, cy("next", 40)))
arrow([Bo("a6"), T("withriya")], label="unclear", at=(cx("a6"), lM2))
arrow([Bo("next"), T("a5")], label="draft needed", at=(cx("next"), lS2))
arrow([T("notes"), (cx("notes"), lA2), (cx("a5", -70), lA2), Bo("a5", -70)], C_ORANGE, True)
arrow([Bo("a5", 50), T("gate3", 50)])
arrow([L("gate3"), (cx("notes"), cy("gate3")), Bo("notes")], C_ORANGE, True, "Loop D: her edits", (col_x(4) + 80, cy("gate3")))
arrow([Bo("gate3"), (cx("gate3"), lR2), (col_x(1), lR2), (col_x(1), cy("founder", -30)), R("founder", -30)], label="sent from Riya's Gmail (N4)", at=(col_x(3), lR2))
arrow([T("founder"), (cx("founder"), cy("a6", 40)), (cx("watch", -60), cy("a6", 40)), Bo("watch", -60)], label="reply", at=(cx("founder"), lM2 - 60))
arrow([R("next"), (MX1, cy("next")), (MX1, cy("cal")), R("cal")], label="slot picked: book", at=(MX1, cy("notes")))
arrow([Bo("cal"), T("call")])
# v2: the record feeds the evals, the evals feed the pilot
arrow([Bo("log"), T("evals")], C_GREY, True, "draft vs sent pairs", (cx("log"), lane("f2") - 40))
arrow([R("evals"), L("ft")], C_GREY, True, "misses target", (col_x(3), cy("evals") + 44))
# Loop G
MX3 = GRID_END + 85
arrow([R("call"), (MX3, cy("call")), (MX3, b2y + 22), (cx("backtest"), b2y + 22), Bo("backtest")], C_G, True, "Loop G: call outcomes join the back test set", (col_x(4) + 40, b2y + 22), 2.6)

out.extend(labels)

# ================= below the grid
y = GRID_BOTTOM + 24
out.append(f'<rect x="{AX}" y="{y}" width="{GRID_END + 110 - AX}" height="104" rx="8" fill="#f3f5f8" stroke="#9aa5b1" stroke-width="1.5"/>')
text(AX + 20, y + 28, "ALWAYS ON · the never-fail checks, under both loops", 16, 800, "#3e4c5e")
text(AX + 20, y + 54, "N1 no funded company marked PASS with no flag · N2 every citation exists · N3 a founder-only claim is never shown as confirmed · N4 only Riya's click sends an email · N5 no application vanishes · N6 no founder name, email or phone reaches a model · text aimed at the AI is ignored · daily cost cap pauses at a saved step, then resumes", 14.5, 400, MUTED)
text(AX + 20, y + 84, "v2 adds: Portkey with 1, 2, 4 second retries · answer cache · a separate test database · cap alert by email · model inputs cleared after 30 days · consent line on the form", 14.5, 600, "#5b6b7f")

y += 142
lx = AX + 100
for kind, label in [("person", "A person decides"), ("code", "Code step"), ("decision", "Decision in code"), ("ai", "AI call"), ("memory", "Memory"), ("service", "Data or outside service")]:
    fill, stroke = KIND[kind]
    out.append(f'<rect x="{lx}" y="{y - 14}" width="28" height="20" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
    text(lx + 38, y + 2, label, 15, 400, INK)
    lx += 60 + len(label) * 8.2
out.append(f'<line x1="{lx}" y1="{y - 4}" x2="{lx + 48}" y2="{y - 4}" stroke="{NAVY}" stroke-width="2.4" marker-end="url(#m0)"/>')
text(lx + 58, y + 2, "Main flow", 15, 400, INK)
lx += 160
pill(lx, y - 4, "Tool", NAVY)
text(lx + 62, y + 2, "where it runs", 15, 400, INK)
lx += 190
pill(lx, y - 4, "GATE", "#6b5bd2")
text(lx + 70, y + 2, "only people decide an outcome here", 15, 400, INK)
lx += 400
out.append(f'<rect x="{lx}" y="{y - 14}" width="28" height="20" rx="4" fill="#ffffff" stroke="#5b6b7f" stroke-width="2" stroke-dasharray="5 3"/>')
text(lx + 38, y + 2, "Planned in version 2", 15, 400, INK)

# the loops
y += 40
out.append(f'<rect x="{AX}" y="{y}" width="{GRID_END + 110 - AX}" height="290" rx="10" fill="#fbfcfd" stroke="#d5dbe3" stroke-width="1.5"/>')
text(AX + 20, y + 34, "The loops", 21, 700, NAVY)
LOOPS = [
    (C_MAIN, False, "LOOP 1 · Screening", "Upload, cheap checks, two tracks of evidence, scores, brief. Ends at Gate 2."),
    ("#0f766e", False, "LOOP 2 · Outreach", "Draft, Riya sends, read the reply, book or offer new slots. Ends at the call."),
    (C_A, True, "LOOP A · Back test", "A new card version is scored on past memo companies before Kushal can approve it."),
    (C_B, True, "LOOP B · Research more", "Riya asks for more research on one application; it goes back to Track 2."),
    (C_ORANGE, True, "LOOP C · Rule correction", "Riya's rule corrections come back as context for similar companies."),
    (C_ORANGE, True, "LOOP D · Style notes", "What Riya changes in a draft shapes the next draft."),
    (NAVY, False, "LOOPS E · F · Follow up, slots", "No reply: follow up on day 3 and 7. New time: new slots, two rounds, then Riya."),
    (C_G, True, "LOOP G · Real calls", "Was the call worth 30 minutes? Outcomes join the next back test."),
    (C_RED, False, "Send back · HOLD", "Kushal sends an application back to Riya. A portfolio conflict holds it: no email."),
    (C_GREY, True, "Short path", "A cheap check hits: a short brief, research skipped, Riya can still run it all."),
    ("#5b6b7f", True, "v2 · Disagreement score", "Riya's overrides and email edits, by week. Spikes are read with the evals."),
    ("#5b6b7f", True, "v2 · Prompt first", "Measure on a sealed test set, fix the prompt in Riya's voice, fine-tune only if it misses."),
]
for i, (color, dashed, name, desc) in enumerate(LOOPS):
    colx = AX + 20 + (i % 2) * 1230
    yy = y + 74 + (i // 2) * 38
    dash = ' stroke-dasharray="9 6"' if dashed else ""
    out.append(f'<line x1="{colx}" y1="{yy}" x2="{colx + 40}" y2="{yy}" stroke="{color}" stroke-width="3"{dash}/>')
    pill(colx + 52, yy, name, color, size=13)
    text(colx + 52 + len(name) * 13 * 0.62 + 34, yy + 5, desc, 15, 400, INK)

# the stack
y += 314
out.append(f'<rect x="{AX}" y="{y}" width="{GRID_END + 110 - AX}" height="120" rx="10" fill="#fbfcfd" stroke="#d5dbe3" stroke-width="1.5"/>')
text(AX + 20, y + 34, "The stack", 21, 700, NAVY)
STACK = [
    ("Vercel", "Next.js app, worker crons"), ("Supabase", "Postgres, private files, queues, RLS"),
    ("Gemini via Cloudflare", "Portkey in v2 · Flash Lite, Flash, Pro"), ("Tavily", "web research, replay mode for tests"),
    ("Gmail API", "send on Riya's click, read the thread"), ("Calendar API", "free and busy, the booking"),
    ("Langfuse + llm_calls", "a trace per application, N6 audit"), ("Supabase cron (v2)", "workers every minute"),
]
for i, (name, desc) in enumerate(STACK):
    sx = AX + 20 + (i % 4) * 615
    sy = y + 68 + (i // 4) * 32
    pill(sx, sy, name, NAVY, size=13)
    text(sx + len(name) * 13 * 0.62 + 32, sy + 5, desc, 15, 400, INK)

text(AX, H - 18, "Steps are numbered as in PRD Section 5. Loops as in PRD Section 11. Gates are the only places an outcome is decided, always by a person.", 14, 400, MUTED)
out.append("</svg>")

root = Path(__file__).resolve().parents[1]
(root / "Components_Map.svg").write_text("\n".join(out), encoding="utf-8")
print("wrote Components_Map.svg")
# PNG: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars
#      --window-size=2500,3150 --screenshot=Components_Map.png file:///<path>/Components_Map.svg
