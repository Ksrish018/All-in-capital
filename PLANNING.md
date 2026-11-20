# All In Capital Triage System: Planning on Paper

This is the thinking we do before we write a single prompt. It follows the course method. First we ask if the system deserves to exist. Then we decide what success means. Then we draw the system, list the facts it must find, and design its loops.

Every claim here points to the case, the deal memos, or the partner meeting notes. Where we are guessing, we say so.

---

## 1. The problem in plain words

All In Capital is a pre-seed fund in Mumbai. It backs fintech, deeptech, consumer tech and consumer brands. Fund II is about to be announced.

Riya is the associate. She reads every application. Each one takes her about 30 minutes. She reads the deck, looks the company up, checks the founders, forms a view and writes two lines for the partners. This adds up to more than 19 working days every quarter.

Most of those applications were never going to pass. That is the real waste.

There is a second, quieter problem. The fund's sense of what it likes has moved over time. The public thesis has not moved with it. Riya has noticed this. Nobody has sat down to compare the two.

When Fund II is announced, the team expects about 100 applications in one day. Today that is a normal month. Done by hand, that one day would cost Riya around 50 hours.

**So the problem is not "we need AI to score decks."** The problem is this. Good partner time goes into applications that were never a fit. And the judgment behind the first screen lives in one person's head, where it cannot be checked.

---

## 2. What Kushal is really asking for

We read his words closely. They turn into ten plain requirements.

| # | What he said | What it means for the system |
|---|---|---|
| 1 | "a week of intake, the whole pile" | It handles a full batch. No application gets lost. |
| 2 | "criterion by criterion, with the source behind every claim" | Every score is tied to a named criterion and a source. A bare "7 out of 10" is not allowed. |
| 3 | "what it couldn't find out" | Gaps are named. They are never quietly filled in. |
| 4 | "go find that, not just the deck" | It researches the company and founders beyond the deck. |
| 5 | "I'm not asking it to decide" | It recommends. People decide. |
| 6 | "that correction should count next time" | Corrections are stored and reused on similar companies. |
| 7 | "the busywork around a yes should disappear" | Emails, follow ups and call booking are handled for us. |
| 8 | "I'll still see every applicant's outcome" | Kushal sees every result before anything is final. |
| 9 | "run it against our past deals" | It is tested on the fund's real decisions. Every disagreement is explained. |
| 10 | "agreed in advance, in numbers" | Trust levels and stop points are written down before launch. |

---

## 3. The Nine Checks

The checks come in three groups. A "no" means something different in each group.

* **Kill switches.** A "no" means we do not build it.
* **Sizing.** A "no" means we build something smaller.
* **Boundary.** A "no" or "partial" means a person must stand at that exact step.

### Kill switches

**01. Is the problem real?**
**Yes.** The fund measured it. Riya spends 30 minutes per application and over 19 days a quarter. The meeting notes add detail. In one week, 3 of 11 applications took Riya over 40 minutes because founder backgrounds were hard to find.

**02. Is the workflow repeated?**
**Yes.** Riya follows the same five steps on every application. The flow never stops. There is a public form and a steady stream of warm intros. Volume is about 100 a month, with a spike of about 100 in a single day at launch.

**03. Is the input available?**
**Partial.** We have a lot. We have 12 deal memos, 5 sets of partner notes and 10 live applications. What we do not have is the fund's written thesis, its criteria, its exclusions or its portfolio list. These must be rebuilt from public sources and from the memos. There is also a catch with the applicants. Their websites and LinkedIn links are placeholders. Web research on them will mostly come back empty. The system has to say "unknown" when that happens.

### Sizing

**04. Is the output valuable?**
**Yes.** The readers are named. Riya, Kushal and Aditya use it to decide one thing. Do we take the call or not?

**05. Is the impact measurable?**
**Yes.** We have a clear baseline of 30 minutes per application. We also have real past decisions to test against. Six were funded and six were passed.

**06. Is the ROI worth it?**
**Yes, even on a cautious guess.** Say the system only halves Riya's time. That still gives back about 9 to 10 working days a quarter. It also absorbs the launch day spike. The model cost per application should be small if we send clean, short inputs. We will prove this on the cost page.

### Boundary

**07. Is the failure risk acceptable?**
**Partial.** The two kinds of mistake are not equal. A wasted call costs 30 minutes. Wrongly rejecting a future winner can cost the fund its best return. Emails to founders also cannot be unsent. So a person approves every rejection and every email.

**08. Is human judgment protected?**
**Partial.** Kushal keeps the decision. The risk is quieter. Riya might start approving whatever the system says. This is called automation bias. Training does not fix it. So we design against it. Riya sees the evidence behind each criterion, not just a score. A sample of rejections is checked blind. We track how often she overrides the system.

**09. Is the owner clear?**
**Partial, and we make it a yes.** Riya owns the first review and sends the emails. Kushal owns the rubric and signs off every outcome. Aditya takes the second call on deeptech. Any change to the rubric is approved by Kushal.

### What decides it

Check 03 shapes the whole build. The thesis is not handed to us. So the very first thing we build is a **Thesis Card**. It lists each criterion, what it means and where we found it. Checks 07, 08 and 09 tell us where people stand.

### The Cut

| The system does this | People do this |
|---|---|
| Takes in applications and queues them | Riya approves or rejects each one |
| Reads the deck and form | Kushal signs off every outcome |
| Researches the company and founders | Riya edits and sends every email |
| Scores each criterion with a source | Kushal approves every rubric change |
| Names every gap | Aditya joins deeptech calls |
| Drafts the email | Riya handles unclear replies |
| Reads replies and follows up | Partners judge "were we wrong or was it?" |
| Offers slots and books the call | |

The line is simple. We automate the work around the decision. We never automate the decision.

---

## 4. The Five Pre-Build Decisions

### Decision 1. The outcome

> After this system runs, Riya's first screen of an application drops from about 30 minutes to about 5 minutes of review. Every application reaches the partners with a scored brief within 24 hours, even on launch day. And the fund does not miss more good companies than it does today.

The last line matters most. Saving time on worse decisions is not a win. That is the lesson from Klarna.

The 5 minute and 24 hour figures are our proposal. We will agree them with Kushal before launch.

### Decision 2. The baseline

* About 30 minutes per application.
* About 100 applications a month, so over 19 working days a quarter.
* Around 40 minutes when founder background is hard to find.
* Scoring drift is real. Riya scored Petalry 6.5 and AeroDrop 7.5. Kushal said both were too high.
* The fund's own past decisions are the ground truth for testing.

Two numbers are missing. We do not know how long a decision takes today from start to finish. We do not know how much time call booking takes. We will measure both in the first week.

### Decision 3. How the workflow changes

Riya moves from researcher and judge to reviewer and sender.

The new role has a known weakness. People start to rubber stamp. So we build in three habits.

1. She sees the evidence for every criterion. Not just a total.
2. Each batch, at least 10 percent of the "pass" recommendations are checked blind.
3. Every correction needs one line of reason. This was already agreed in meeting 5.

A useful test is this. Suppose the system is only as accurate as it really is. Would this workflow still give the right outcome? With these three habits, yes.

### Decision 4. How we will measure it

| Type | Metric |
|---|---|
| Main metric | Riya's review minutes per application, taken from the dashboard |
| Guard rail | Agreement with the fund's past decisions in the back test |
| Guard rail | Funded companies wrongly marked "pass" in the back test. Target is zero. |
| Guard rail | Claims with a real source. Target is 100 percent. |
| Guard rail | Made-up citations. Target is zero. |
| Guard rail | How often Riya overrides the system |
| World signal | After each call, one tap: "Was this call worth 30 minutes?" |

Kushal reads these every week. The world signal matters most. It is the one number the system cannot produce for itself.

### Decision 5. When we stop

We stop and redesign if any one of these happens. Kushal owns this list.

1. In the back test, the system marks a funded company as "pass" and raises no flag.
2. A spot check finds a citation that does not exist.
3. Riya overrides more than 40 percent of recommendations for two weeks in a row.
4. After three weeks, review time is still above 15 minutes per application.

There is room between the target and the stop line. That room is where we improve.

---

## 5. What kind of system this is

The course says to pick the simplest thing that works. The order is no AI, then automation, then a single model call, then an agent.

* **Intake, queueing and the cheap checks** are plain automation. No AI needed.
* **Reading and scoring** is a set of model calls inside a fixed pipeline. A short research loop is allowed, with a hard cap.
* **Replies and scheduling** need a real agent. The next step depends on what the founder writes back, and we cannot know that in advance. This part runs as a state machine.

---

## 6. The whole system on one page

| Who | Trigger | Input | Context | Processing | AI | Output |
|---|---|---|---|---|---|---|
| Riya and Kushal | Batch arrives | | | | | **Gate 1.** Riya approves or rejects. **Gate 2.** Kushal signs off. **Gate 3.** Riya edits and sends the email. |
| The app | New application | Deck and form | Thesis Card, matching memo passages, past corrections | Parse, swap names for a founder ID, cheap checks, queue, retries, cost meter | | A brief with every criterion, its source, the gaps and a reason |
| Web sources | | | Company site, search results, news, cleaned and short | Fetch only when a field is unknown, within the cap | | |
| AI models | | | | | Pull facts into fields, judge each criterion, draft emails, read replies | |
| Gmail and Calendar | | | | Offer slots and book after the founder confirms | | A call on both calendars |
| Tracking | Every step | | | Traces, prompt version and cost per call | | A daily cost cap that pauses the system |

Five rules hold this map together.

1. Each box has one owner.
2. Only steps that need language or judgment use AI.
3. Every person's gate sits before something that cannot be undone.
4. Every "fetch more" arrow has a limit.
5. Every outside service says what happens when it fails.

---

## 7. The Thesis Card: what we score against

We built the first draft of the criteria from the 12 memos and the meeting notes. Each one comes from a real decision. Public sources come next, in the build.

| # | Criterion | What it means | Where it comes from |
|---|---|---|---|
| 1 | Stage fit | Truly pre-seed. The raise suits a small first cheque. | Fund profile. HopBox pass. |
| 2 | Sector fit | One of the four sectors. The label matters less than the founder's behaviour. | Public line. Jai Kisan discussion. |
| 3 | Not a regulatory bet | The business must not depend on rules getting friendlier. | Coinlane pass. |
| 4 | No portfolio conflict | No overlap with a company the fund already backs. | Meeting 4, MeetRecord near-miss. |
| 5 | Founder owns the hard part | The founder treats the core risk as their own problem. | CampusCredit pass. Jai Kisan yes. |
| 6 | Founder did the groundwork | They went to the customer first and did unscalable things. | Wint Wealth, SuperK, Jai Kisan. |
| 7 | Knows the numbers | Repeat rate, cohorts, margin and acquisition cost, when they apply. | Giva yes. Petalry pass. |
| 8 | Path to market | A clear route to paying customers and through regulators. Scored apart from founder quality. | ePlane yes. AeroDrop pass. Meeting 3. |
| 9 | Capital fits the model | The business does not need far more money than a pre-seed fund gives. | HopBox pass. |
| 10 | Defensibility | It can survive a bigger player copying it. | Prepnest pass. |
| 11 | Team covers the gaps | Someone owns operations, commercial and tech. | Petalry, AeroDrop. |

Four scoring rules come straight from the partners.

* **A missing number pulls the score down.** It is never skipped. (Meeting 1)
* **Score the evidence, not the pedigree.** (Meeting 3)
* **Founder quality and path to market are separate scores.** (Meeting 3)
* **Say which thesis you used and why.** We show the public thesis and the fund's real behaviour side by side. (Meeting 5)

One honest limit. Kushal said a founder who gets defensive is a signal. A deck cannot show that. Only a call can. So the brief says so, and the call notes feed it back later.

One more nuance. Kushal does not want written rules to become a checklist that founders learn to game. So the Thesis Card stays internal. It guides the score. It is never shared with applicants.

---

## 8. The Evidence Map: what the system must find

For each question, we decide in advance what counts as an answer, where to look and when to give up.

| Question | Fact that settles it | Where it lives | Good enough when | Tries | If still unknown | Ends the review? |
|---|---|---|---|---|---|---|
| Is it pre-seed? | Stage, past rounds, raise size | Form, deck | Stage named and raise stated | 1 | Flag for Riya | Yes, if clearly later stage. Flag, never auto reject. |
| Does it clash with the portfolio? | Product overlap with a portfolio company | Portfolio list, product description | A named overlap, or a clear "none" | 1 | Flag for Kushal | Yes, hold until Kushal decides |
| Is it in an excluded category? | Business model needs a rule change | Form, deck | Named and matched to a sourced exclusion | 1 | Flag | Yes, flag for a likely pass |
| Is it in our sectors? | Who buys and what they pay for | Deck, form, website | Product mapped to a sector | 1 | Riya decides | No |
| Do the founders fit the market? | Past roles, domain years, prior ventures | Form, deck, public bios | At least one claim with a source | 2 | Lower confidence, flagged | No |
| Is traction real? | Users, revenue, repeat, cohorts | Deck, form, public signals | Each claim marked "deck only" or "confirmed" | 2 | Mark as deck only | No |
| Do deck and form agree? | The same numbers in both | Deck and form | Numbers match, or the gap is named | 0 | Flag the gap | No |
| **Worst case** | | | | **About 8 fetches per application** | | |

Five rules keep this honest.

1. **The model fills named fields. Code checks if they are filled.** A model can sound sure about an empty page. A field is either filled or it is not.
2. **Every field is yes, no or unknown.** Never just two. A hidden "unknown" is how a pipeline lies.
3. **Every answer keeps its source and the exact words.**
4. **Cheap deal breakers run first.** A Series A company does not need a founder search.
5. **Unknown is a planned outcome.** It is not an error.

What if two questions are answered and one is unknown? It depends on which one. If the unknown could rule the company out, a person decides. If it only changes the ranking, we keep going at a lower rank and flag it. That works because a person reviews everything downstream.

---

## 9. The loops

A system only improves if it closes a loop. Each loop has a limit and a way out to a person.

| Loop | What it does | Limit | Way out |
|---|---|---|---|
| **A. Back test** | Runs the rubric on past deals and explains every disagreement | Re-run on every new rubric or prompt version | Kushal approves the next version |
| **B. Research** | If a field is unknown, fetch the named source | 2 tries per question, about 8 per application | Mark unknown with the reason |
| **C. Score corrections** | Stores Riya's correction and reason, and recalls it for similar companies | Only the most relevant few are recalled | A lasting rule change needs Kushal |
| **D. Email edits** | Learns from the gap between the draft and what Riya sent | Style notes are reviewed and versioned | Riya can roll back a style change |
| **E. Follow ups** | No reply, so a gentle follow up | 2 follow ups, on day 3 and day 7 | Mark "no response" and tell Riya |
| **F. Scheduling** | Founder suggests another time, so check the calendar again | 2 rounds, never repeat a refused slot | Hand to Riya |
| **G. Call outcome** | "Was this worth 30 minutes?" feeds back into scoring | Read weekly | Kushal decides on rubric changes |

Two loops need extra care.

**Loop C can lock in drift.** Riya's sense of fit has moved. If her corrections flow straight into the rubric, the system learns her drift without anyone noticing. So we split corrections into two kinds. A fact correction fixes one company. A rule correction may apply to others. Only rule corrections can change the rubric, and only with Kushal's approval.

**Loop A can fool us.** The memo companies are real. A web search might find what happened to them later, like a big funding round. Then the system would be "predicting" with hindsight. So during the back test, research only uses what was known at decision time. We also hold some memos back. The rubric is built from some memos and tested on the rest.

---

## 10. The reply and scheduling agent

This part reacts to real people, so it carries a clear record of where things stand.

**What it tracks for each founder:** the application, the email status, the reply type, how many follow ups went out, the slots offered, the slots refused, the round number, the meeting status and the booked event.

**How it reads replies:**
* "Sounds great" means interested. Move to scheduling.
* "Not a fit, thanks" means not interested. Close politely and log it.
* "Maybe next quarter" is unclear. Riya decides. The system never forces a label.
* Silence means a follow up, within the limit.

**How it books:** It checks Tuesday and Thursday afternoons for a 30 minute slot. It adds Aditya for deeptech. It offers two or three slots. It books only after the founder confirms.

**When a tool fails:**

| Tool | If it fails | What we do |
|---|---|---|
| Check calendar | Timeout | Try again, then hand to Riya |
| Send email | Timeout | Try again, then hand to Riya |
| Send email | Address bounces | Hand to Riya right away |
| Book meeting | Timeout | Try again up to 3 times, then hand to Riya |
| Book meeting | Permission refused | Stop and alert Riya |
| Read inbox | Timeout | Try again on the next cycle |

---

## 11. How we will test it

"It seemed to work" is not a test. Each test has a fixed input, a clear expected result and a yes or no check.

**Tests that must never fail.** If any one fails even once, we do not ship.
* A funded company is marked "pass" with no flag.
* A citation points to something that does not exist.
* A claim from the deck is shown as confirmed when it was not.
* An email goes out without Riya's click.
* An application vanishes from the queue.
* A founder's email or phone number is sent to a model when it was not needed.

**The ten applications are our first test set.** Each one checks something specific.

| Applicant | What it tests |
|---|---|
| Settlr | A Series A company. It should stop at the cheap stage check. |
| Talkbook | It overlaps with MeetRecord in the portfolio. The deck and form give different revenue. It is labelled consumer when it is really B2B software. |
| CAPilot | There is a form but no deck. |
| CareCorner | Healthcare clinics. Outside the sectors and heavy on capital. |
| EarnWise | A lending business with a thin founder record. |
| RentRoute | Money moved is mistaken for revenue. |
| GrainKind | A consumer brand that does share cohort data. |
| StockSathi | Commerce infrastructure with repeat buyers. It shows the thesis drift. |
| Pumpwise | Deeptech with paid pilots. Aditya should be flagged in. |
| Yatrika | A travel business earning commission. |

**Tricky inputs we will add.** A deck with hidden text telling the model to give a perfect score. Two companies with the same name. Numbers that are too good to be true.

**The judge.** Some checks need judgment, like tone. For those, we use a model from a different family as the judge. A person also checks 5 to 10 percent of results blind. We log every time the judge and the person disagree.

**Checking the tester.** We break the system on purpose and confirm the test catches it. We run every test twice and expect the same answer.

---

## 12. Making it ready for real use

These come from Case 4. Each one answers a question Kushal will ask.

| Question | What we do |
|---|---|
| Is it safe? | Each model call gets only what it needs. A founder ID instead of email and phone. Only the relevant memo passages. Short extracted facts, never whole web pages. |
| Can it handle launch day? | We send 20 applications at once. Each must end up scored, queued or marked "needs attention" with a reason. None may vanish. A queue makes the extras wait their turn. |
| Does it recover from errors? | Every model call goes through Cloudflare AI Gateway with automatic retries. |
| Can we see inside it? | Langfuse records every step for every application, along with the prompt version used. |
| Is it affordable? | We record the cost of every call. A cost page shows totals by application, day, week and month. A daily limit pauses the system and sends an alert. |

---

## 13. Choices we made for you

You said the workflow is good, so we took the recommended option on four open points. Tell us if you want any of them changed.

1. **Approvals.** Riya decides first. Kushal signs off before any email goes out.
2. **Pass emails.** Rejected founders get a kind note that says what would change the fund's view. Riya sends it.
3. **Thesis.** We score against the public thesis and the fund's real behaviour, side by side.
4. **Email and calendar.** We use real Gmail and Google Calendar on a test account.

---

## 14. Before we build: the stop list

We do not move to code while any of these is true.

* A criterion has no source and no flag.
* The outcome is written with "the AI" as the subject.
* Anything that cannot be undone has no person in front of it.
* A loop has no limit.
* Founder data is taken from behind a login or without a fair reason.
* A score cannot name its criterion and its source.

**Next step:** the API keys.
