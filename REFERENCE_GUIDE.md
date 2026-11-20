# Reference Guide — Commissioning & Building AI Systems (MESA T2)

> Distilled from: L1 *Why AI Systems Fail*, L4 *Scraping & Agent Loops*, L6 *Agents with Tools*, L7 *Evals*, the BSL *Build Guide*, Case 03 *All In Capital* and Case 04 *Prototype to Production*.
> Use: read top-to-bottom before touching any new problem statement. Each section ends with **"Ask yourself"** prompts. The companion file [PRELIMINARY_CHECKS.md](PRELIMINARY_CHECKS.md) applies all of this to All In Capital.

---

## 0. The One Rule

**Write the outcome before you write the prompt.** An AI system is finished only when something measurable changes *in the world* — not when the code runs, the API returns, or the logs are green.

- *Works technically* = code runs, model responds. Evaluated by looking at the system.
- *Delivers the outcome* = a problem is solved, a decision improves, a cost falls. Evaluated by looking at the world.
- Deployment ≠ impact (72% deployed AI, 22% see real EBIT impact, <20% reach production with measurable outcomes).

**Ground rule for every answer: it must be defensible** — traceable to a number, a source, or a named person. A guess written down is still a guess.

---

## 1. Why AI systems fail (L1) — the failure taxonomy

| Case | What it measured | What mattered | Lesson |
|---|---|---|---|
| **Klarna** (2024–25) | Chats/hour, time-to-first-response, "700 agents replaced" | Problems resolved, customers retained, cost per resolved issue | Behavioural metrics ≠ outcome. Rehired humans; costs rose $42M→$50M |
| **McDonald's + IBM** (2021–24) | Order capture | Correct orders reaching kitchen | AI at ~80% dropped into a workflow designed for human accuracy; **the review step was removed** |
| **Air Canada** (Moffatt, 2024) | "Chatbot answers policy queries" | Customers get info they can rely on & airline will honour | **A wrong specification, faithfully executed, is still a failure.** You own what your system says |

**Five failure types → their controls**

| Failure | Looks like | Control |
|---|---|---|
| Wrong problem | Automating a symptom | Nine Checks 01–03 |
| Wrong target | Activity metrics; success judged in logs | Outcome Definition + Measurement Plan |
| Unchanged workflow | AI dropped into human-accuracy process | Workflow Change + Components Map |
| Thin evidence | Model reasons confidently over missing/junk input | Evidence Map |
| No exit | Nobody ever stops; cost & harm accumulate | Kill Criterion + loop caps |

**Automation bias / complacency** — humans approve what they're shown and monitor less when a system usually works. Training does not remove it. ⇒ "Human in the loop" is not a design; **design the review** (spot-checks, sampled audits of rejections, rewrite/override-rate tracking).

**Four system types — choosing wrong is a *commissioning* mistake**

| Type | Strength | Weakness | Choose when |
|---|---|---|---|
| Prompt / GenAI | Fast to build | High variance, hard to audit at scale | Human reviews every output |
| Workflow automation | Predictable | Brittle on edge cases, maintenance load | Steps known in advance, rules cover most cases |
| AI agent | Autonomous, high upside | **Largest failure surface** | Next step genuinely depends on what the last step returned |
| ML model | Accurate at scale | Needs labelled data + time | Large history of examples with known outcomes |

Preference order: **no AI → workflow automation → single model call → agent loop.** Justify every step up. *Most problems are pipelines. Build the simpler thing.*

---

## 2. The gated method (Build Guide)

Each stage is a gate that produces a written artifact. Fail → reframe, shrink, or stop.

| # | Stage | Settles | Artifact | If it fails |
|---|---|---|---|---|
| 0 | Frame | What's broken in the world? | Problem paragraph with numbers | Reframe until it isn't "use AI" |
| 1 | Nine Checks | Build at all? Where must a human stay? | 9 verdicts + evidence + **the Cut** | Kill / shrink / place human |
| 2 | Five Pre-Build Decisions | What changes, from what baseline, measured how, when do we stop? | Outcome, baseline, workflow change, measurement plan, kill criterion | Not ready to build |
| 3 | Components Map | All parts, owners, data flow | One-page swimlane (actors × stages) | Hidden dependency / missing owner |
| 4 | Evidence Map | What facts must be found per judgment, where, limits | One row per question + worst case | System will guess |
| 5 | Loop design | Act → learn → improve | Signal/store/retrieve/apply + caps | Repeats its mistakes |
| 6 | Build, measure, decide | Did the outcome arrive? | Result vs baseline | Apply the kill criterion |

*30 minutes on paper saves 90 minutes of debugging.*

### 2.1 Nine Checks

| Group | Checks | A **NO** means |
|---|---|---|
| **Kill switches** | 01 Problem real? · 02 Workflow repeated? · 03 Input available? | Don't build it (build groundwork instead) |
| **Sizing** | 04 Output valuable? · 05 Impact measurable? · 06 ROI worth it? | Build something smaller |
| **Boundary** | 07 Failure risk OK? · 08 Judgment protected? · 09 Owner clear? | Build it, but **put a human exactly here** |

- Verdicts: **YES** (with a number/doc/named owner) · **PARTIAL** (true under a stated condition — in Boundary, that's where the human goes) · **NO**. **An unsourced estimate counts as NO.**
- ROI: compute with the *smallest plausible* improvement.
- Always close with: *which check kills/limits it, and what do you build instead?* Then write **the Cut**: *What gets automated* vs *What stays human*. Automate the workflow, not the consequential judgment.

### 2.2 Five Pre-Build Decisions

1. **Outcome Definition** — "After this system runs, [person/process/metric] will [measurably change in this specific way]." AI must not be the subject. Pair every efficiency outcome with a **quality floor** (time saved on worse work isn't a gain).
2. **Baseline** — same units as the outcome: today's metric, its cost, its variance/quality. No baseline → creating one is deliverable #1.
3. **Workflow Change** — new human role (judge → auditor/reviewer), *its failure mode* (rubber-stamping, automation bias), and *the design response*. Test: *if the AI were right only as often as it actually is, would this workflow still produce the outcome?*
4. **Measurement Plan** — primary metric (outcome), guardrail metric (must not get worse), instrument (the concrete question/record producing the number), cadence & horizon ("in 90 days?"), named reader. Keep ≥1 metric only the world can produce (Goodhart).
5. **Kill Criterion** — number + scope + date + owner, agreed in advance, early, tied to outcome not uptime. Find it via **pre-mortem**. Usually means *redesign*, not abandon. Leave a deliberate gap between target and kill line (iteration zone).

**Readiness test:** outcome names who/what/how much/how measured with no AI subject · every number has a baseline · new human role + failure mode + response written · ≥1 world metric and ≥1 quality guardrail · kill criterion numeric, dated, early, owned.

### 2.3 Components Map — 10 rules

Swimlane: rows = actors (User/owner, System, External data services, AI models, Delivery channel); columns = **Trigger → Input → Context → Processing → AI → Output**. Arrows: main flow, conditional (condition written on it), handoff to output.

1. One page, whole system (doesn't fit → split).
2. Every box in exactly one lane + one stage (one owner).
3. One job per tool.
4. **Keep the AI column narrow** — only language/judgment. Fetch, filter, field-check, route, send = Processing (cheap, fast, testable).
5. Every Boundary NO/PARTIAL = a **GATE** box in a human lane *before* the irreversible action.
6. Every conditional arrow carries condition **and cap** ("if stage empty, fetch /careers, max 2").
7. Every external lane states how it fails (down, blocked, rate-limited, junk → log, skip, queue for human).
8. Outputs carry their reasons.
9. The Output column must contain the outcome metric capture point.
10. Secrets never travel in data; `.env` in `.gitignore` before first push.

### 2.4 Evidence Map — "enough" is defined by the decision

Three steps: **name the judgment → list the facts it needs → name the specific source to fetch when one is missing.**

| Question | Data that answers it | Where it lives | Sufficient when (code-checkable) | Limit | If unanswered (drop / flag / human) | Short-circuit |
|---|---|---|---|---|---|---|
| … | a *fact*, not a topic | a named page/source ("the web" is not a location) | e.g. "any named certification string present" | small integer, set now | exactly one | answer that ends assessment, or "—" |
| **Worst case** | | | | total fetches/cost per item | | |

Design rules:
1. **Facts → named fields; code checks the fields.** Never ask the model "do you have enough?" (it can be confident about an empty page). *The model judges; code decides if it has enough to judge.*
2. **Three states, never two:** `yes / no / unknown`. Unknown silently stored as no is the most common way a pipeline lies.
3. **Keep evidence with the answer** — source URL + exact phrase per field.
4. **Short-circuits first** (cheap disqualifiers before expensive questions).
5. Pick the source rung that answers the most questions per fetch.
6. Limits set before build; sum = worst case; unaffordable → cut now.
7. **Unknown is a designed outcome, not an error.**

**"Two answered, one unknown"**: unknown *disqualifier* → human (or drop); unknown *ranking* question → qualify-and-flag at lower rank (only if a human gate is downstream); next step irreversible with no gate → drop or add a gate. Always record the unknown.

---

## 3. Data acquisition (L4)

**When reasoning is nearly free, the scarce resource is the input.** "A model can't reason its way to information it was never given."

**Source preference:** 1) Official API → 2) Data provider (Crunchbase, Tracxn, Apollo, Hunter…) → 3) Public scraping (last resort, only if lawful).
Don't scrape when: data is sold cleanly · ToS/robots.txt prohibit · behind login · one-off need.

**Scraping = 5-step pipeline before your pipeline:** Request → Parse → Extract → Clean → Store. Every step can fail *silently* (output looks like data but isn't).

| Decision | Options | Choose by |
|---|---|---|
| Fetch | Request-based (ms, ~free, blind to JS) vs headless browser (s, 10–50× cost) | Text in View Source → plain request. Only in Inspect → browser |
| Keep | Rule-based (precise, breaks on redesign) · Heuristic (largest text block, generic) · Model-based (LLM extracts fields, survives redesign, costs) | Fixed few pages → rules; first pass unknown sites → heuristic; specific fields from varied sites → model |
| Behaviour | Single-fetch · Crawler · Monitor · Session-based (logged-in — highest legal exposure, almost always prohibited) | Narrowest scope that answers the question |

**Cleaning must:** strip tags/nav/footer/cookie banners · dedupe · keep hero/product/About · **cap ~2,000 tokens**. Junk + signal together is worse than nothing.

**Cost is a decision:** 200 companies — raw into expensive model $6.00; cleaned $0.20; cleaned + cheap model $0.01 (same or better answer). Three dials: *how much text*, *which model*, *whether to send at all* (cache).

**Failure modes (6 of 8 are silent):** bot detection (Cloudflare ~20% of web), rate limiting, login walls, CAPTCHA, structure changed, non-text content (images/PDF), geo-blocking, lazy loading. Order to try: check if you need to scrape → real browser if JS → slow down & cache → pay an unblocker → **stop** at login/CAPTCHA/ToS → **degrade gracefully** (log reason, move on, queue for human).

**Legal/ethical floor:** public ≠ free to take. robots.txt is not authorisation. Personal data (names, emails, phones) → GDPR / **India DPDP Act 2023** (Rules notified 13 Nov 2025, phasing to May 2027). hiQ v LinkedIn: won on public data, lost on *breach of contract* (clicked ToS, fake profiles) → $500k + delete everything.

**Loops vs fixed pipelines:** a fixed pipeline decides in advance what's enough; when a source is thin it guesses. An **adaptive loop** adds a decision point ("do I know enough *for this judgment*?") — but: **a loop without a limit is a cost without a ceiling.** Set max iterations *before* the build; the exit at the cap is a **designed handoff to a human**, not a failure.

**Moat (Pocus lesson):** most features are "work, not difficulty". The real moats: customer-proprietary data and **accumulated outcome data** (which recommendations actually converted) — only a working outer loop builds it.

---

## 4. Agents with tools (L6)

- **Agent** = software that decides what to do next instead of being told. Needed only when the sequence depends on what the world sends back.
- **A tool is a function the model is allowed to call.** The model never sees your code — **only the description**. Four golden rules for every tool description: **what it does · when to use it · when NOT to use it · what it returns** (enumerate return states, e.g. `free / busy / no-calendar-access`). The description is a code field read every run.
- **State object > scratchpad.** Schema fixed *before* the conversation; every field exists from turn 1 (empty ≠ missing). Every tool reads state before and writes after. Example scheduling state: `reply_status, calendar_checked, times_proposed, reply_round, meeting_status, crm_logged`. On failure, state tells you what to skip; only the failed step reruns.
- **Framework choice:** complex tools + simple loop → hand-build. Complex loop (≥ several interdependent state values, branching that loops back, retries needing memory of attempts) → **LangGraph** (state machine, nodes/edges, checkpointing for pause/resume at human escalation). CrewAI = role-based handoffs (researcher/writer/editor). Frameworks don't write your descriptions, gates or error handling.
- **Retry table — written once per tool, before you need it.** Two questions: *Would retrying plausibly help?* (transient vs permanent) × *Does anything downstream depend on it?*

| | No downstream demand | Downstream, human can supply | Downstream, no substitute |
|---|---|---|---|
| **Transient** | Retry, then skip | Retry, then escalate | Retry until cap, then abort |
| **Permanent** | Skip | Escalate immediately | Abort immediately |

- **Five decisions, one prompt:** Tools+descriptions → State schema → Edges → Retry table → Framework choice (in that dependency order).
- **Irreversible line:** sending an email, booking, writing to someone else's calendar. Everything before it can be re-run; after it cannot. Gates go *before* it.
- **Someone else's tool (MCP, vendor APIs):** you inherit their description and their failure behaviour without seeing either decided. Low-risk reads = easy case; irreversible writes = verify.

---

## 5. Evals (L7)

"It seemed to work" is not a measurement. **If you can't name the automated assertion against a threshold, you haven't tested it — you've watched it work.**

- **Test case = 3 parts, all required:** fixed **Input** (exact string/data) · stated **Expected behaviour** · binary **Assertion** checklist. No "almost".
- **Hard assertions** (code checks: field values, regex, status) vs **Soft assertions** (judgment: tone, reasoning quality, staying within retrieved context → LLM-as-judge with a short list of things the judge's answer must get right).
- **Kill criteria for evals:** one sentence, not a percentage — if it fires once, it doesn't ship. **Write kill criteria before test cases**; they tell you what tests must catch.
- **Severity tags at write time:** **Critical** (auto kill criterion) · **High** (counts against pass-rate threshold) · **Low** (logged, never blocks).
- **Scale:** 5–8 docs × 4–10 conditions × ~5 cases ≈ **150–350 test cases** (most teams write 5–10). Use **equivalence partitioning** per condition (in / out / missing-unknown / boundary) + **interaction** cases. AI drafts; humans review. *Coverage of your checklist is measurable; coverage of reality is not.*
- **Find every place the system *judges* something** — test those, not every stage. **Test the boundary, not the obvious middle** (at cap vs cap+1; just inside vs just past the reply window).
- **Cost:** ~70% writing/review (50–100 h one-time), 20% judge calibration, 5% env setup, 5% compute (~$6–15/run). Writing it once is expensive; rerunning is nearly free.
- **Harness:** feed input → run agent (via public HTTP endpoint only, no internal imports) → check assertion (hard in code, soft via judge) → log pass/fail + severity → report by severity with one-line diagnosis per failure.
- **Validate the harness:** *Break it on purpose* (force a wrong output — must be caught) · *Run it twice* (same verdict) · *The test that should fail* (if it passes, harness checks nothing).
- **Judge bias:** same model family as agent = shared blind spots. Use a **different model family**, a **5–10% blind human audit**, and **log every judge-vs-human disagreement**.
- **Adversarial inputs = test cases with intent** — same runner/judge/log; expected behaviour is *resisting correctly* (prompt injection in a deck, fake traction claims, instructions hidden in web pages).

---

## 6. Loops that learn — Act · Signal · Capture · Store · Retrieve · Apply

| Stage | Design rule | Breaks when |
|---|---|---|
| **Act** | Log every action with inputs, evidence used, run ID | Output can't be traced to inputs |
| **Signal** | Choose signals from the world, not model self-grading; prefer what the human already produces | Only activity observed |
| **Capture** | Capture the **delta** between what system proposed and what human did (+ one-tap reason code) | Seen but not recorded, or recorded without context |
| **Store** | Provenance + time: item, input, output, signal, human change, date, version. Raw records separate from distilled learnings | Unstructured pile; stale lessons never retired |
| **Retrieve** | Only what's relevant, recent, and fits the context budget | Everything retrieved (swamp) or nothing (lessons never return) |
| **Apply** | Explicit, **versioned** changes (prompt, rule, threshold, weights) approved by owner, reversible | Silent, unreviewed, un-rollback-able changes |

**Evaluation layer** sits *underneath* all six: measures outcome (not loop activity), checks each stage, holds the kill criterion, watches for feedback loops that reinforce the system's own mistakes.

Loop rules: explicit decision point (test → threshold → action) · model judges, code checks sufficiency · max iterations set pre-build · exit = human handoff · degrade gracefully · ground every step in the environment · learn from human corrections first · version every Apply · **keep the human gate even as the loop improves** (lower rewrite rate ⇒ less editing, not no review of irreversible actions).

Inner loop (within one item, from the Evidence Map) vs outer loop (across runs, from the Measurement Plan).

---

## 7. Prototype → Production (Case 04): the five questions

| Question | Task | What "done" means |
|---|---|---|
| 1. Does it work? | Evals (L7 / B4) | Test suite with severities, kill criteria, back-test vs past decisions |
| 2. Is it safe? | **Audit prompts** | Every model call sends only what that step needs: **founder ID not email/phone**, **relevant memo passages not all memos**, **extracted claims not whole web pages** (data minimisation — also DPDP) |
| 3. Real-world use? | **Volume test** (20 at once) + **Portkey** | Every application ends *scored*, *queued*, or *needs attention + reason*. None disappear. Add a queue. All model calls via Portkey gateway with automatic retries |
| 4. Can you operate it? | **Langfuse** | Trace every model call and every step; each application's run openable; **prompt version recorded per run** |
| 5. Economics? | **Cost tracking** | Cost per model call, totals by application/day/week/month on a cost page; **daily limit that pauses the system and alerts** |

Context for sizing: Fund II launch ⇒ ~100 applications in one day (≈ a normal month). Riya = 30 min/app.

---

## 8. Master checklist (use on any new problem)

**Framing**
- [ ] Problem restated as a change in the world, with numbers and a named owner
- [ ] Outcome sentence, AI not the subject, paired with a quality floor
- [ ] Baseline in same units (or plan to create it)

**Commissioning**
- [ ] Nine Checks with evidence; unsourced = NO; deciding check named; the Cut written
- [ ] System type chosen by preference order and justified
- [ ] Kill criterion: number, date, owner; pre-mortem done

**Design**
- [ ] Components Map obeys all 10 rules; every human GATE before every irreversible action
- [ ] Evidence Map per judgment; 3-state fields with source + quote; short-circuits first; worst-case cost
- [ ] Data source ladder (API → provider → scrape) + legal check (ToS, robots.txt, DPDP/PII)
- [ ] Tools with 4-part descriptions; state schema; edges; retry table per tool; framework decision
- [ ] Loop caps + human exits; inner and outer loop specs; versioned learning

**Verification**
- [ ] Kill criteria → test cases (partitions, boundaries, interactions, adversarial), severity-tagged
- [ ] Harness via public endpoint; break-it / run-twice / should-fail checks
- [ ] Judge from different model family + 5–10% blind human audit + disagreement log
- [ ] Back-test against real historical decisions; explain each disagreement

**Production**
- [ ] Prompt audit / data minimisation · Volume test + queue + no silent drops · Gateway with retries · Tracing with prompt versions · Cost page + daily cap with pause & alert

**Anti-patterns to refuse:** "build me an AI that does X" with no outcome · success measured as volume · AI in unchanged workflow · "the model will know if it has enough" · loops without caps · raw scraped pages to the model · automating the consequential step · "human in the loop" as a slogan · a score with no criterion and no source.
