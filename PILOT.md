# Pilot runbook (milestone M8)

One real week of applications with Riya. Kushal reads the numbers against the stop list at the end of each week.
This file says what must be true before the pilot starts, what Riya does each day, and what Kushal reads.

## Before day one

Each item has an owner. The pilot does not start until every box is ticked.

| # | What | Owner | How |
|---|---|---|---|
| 1 | Approve a Thesis Card version | Kushal | Back test page. Read the v2 report, set the verdicts, then Approve. v1 cannot be approved: it marks funded companies PASS with no flag. |
| 2 | Put a password in front of the app | Team | Set `APP_PASSWORD` where the app is hosted. Every page then asks for it. Without it, the app must stay on the team's own machines. (Q13) |
| 3 | Rotate the keys used during the build | Team | New Gemini key, new Cloudflare gateway token, new Supabase secret key. Update `.env` and the host. |
| 4 | Turn on the schedulers | Team | Run `npm run db:schedule` from `web/`, with `HOSTED_URL` and `WORKER_SECRET` in `.env`. The database's own scheduler (pg_cron) then calls the screening worker every minute and the outreach agent every 10 minutes. The daily crons in `web/vercel.json` stay as a backstop. Set `CRON_SECRET` to the same value as `WORKER_SECRET`. |
| 5 | Add the call attendees' emails | Riya | Settings, Outreach. Needed before outreach goes live. |
| 6 | One live outreach test | Riya, Kushal | Switch Outreach to live in Settings. Send one invite to a team member's own address, reply to it, and check the calendar invite arrives. Then decide whether to stay live. |
| 7 | Check the model prices | Team | The cost table uses high estimates (Q14). Compare with Google's pricing page and update `model_prices`. |
| 8 | Decide on live research | Kushal | Research runs on recorded results by default. For real applications, switch it to Live web in Settings. Each application uses about 10 Tavily searches. |
| 9 | Add the CI secrets | Team | GitHub repository secrets, so the live database check and the N6 audit run on every pull request. |
| 10 | Separate test and live databases | Team | Create a new Supabase project for the pilot, run `npm run db:migrate` and `npm run db:seed` against it, and set `DB_ROLE=live` in its `.env`. The current project stays as the test and demo database (`DB_ROLE=test`). Eval scripts refuse to run on live. |
| 11 | Put the consent line on the public form | Kushal | The same words as the upload page's consent box: an AI model reads the form and deck for a first review, the provider does not train on it, and a person makes every decision (Q17). |
| 12 | Raise the upload limit for announcement day | Kushal | Settings, "Uploads per visitor per hour". Behind the password the limit is already ten times the setting. |

## Riya's day

1. Open **Pipeline**. New applications arrive through **Add applications**, or as a warm intro.
2. Open **Review**. Work the queue oldest first. J and K move. A agrees. C changes, with a one-line reason. R asks for more research.
   - Read the flags first, then the evidence. Correct a criterion when it is wrong: a fact correction fixes this company, a rule correction is kept as context for similar ones.
   - For a blind check, choose before the system's view is shown.
3. Open **Outreach** after Kushal signs off. Read each draft, edit it if needed, and click send. Nothing goes out without that click.
4. Anything in **With Riya** needs her: an unclear reply, a third request for a new time, or no response after two follow ups.
5. The day after a call, answer the one tap: was it worth 30 minutes?

## Kushal's week

1. **Sign off** board, as Riya decides. Bulk sign off only works where Riya agreed with the system and nothing is flagged.
2. **Thesis Card**: review Riya's pending rule corrections together. They never change the card. A real change needs a new version and a back test.
3. **Dashboard**, at the end of each week:

| Metric | Target or stop line |
|---|---|
| Review minutes per application | About 5. Stop if still above 15 after three weeks. |
| Brief ready within 24 hours | 100 percent |
| Heard back within 3 days | 100 percent, the fund's public promise |
| Override rate | Watched. Stop if above 40 percent two weeks in a row. |
| Blind check agreement | Read with the override rate. A high override rate with a low blind agreement points at the rubric, not at Riya. |
| Calls worth 30 minutes | Read weekly. It feeds the next back test. |

4. **Cost**: spend against the daily cap. The cap resets at midnight India time. Applications paused by the cap carry on by themselves the next day, or as soon as the cap is raised.

## The stop list

Any red light on the Dashboard stops the rollout. Kushal owns this list.

1. In the back test, a funded company is marked PASS and no flag is raised.
2. A spot check finds a citation that does not exist.
3. Riya overrides more than 40 percent of recommendations for two weeks in a row.
4. After three weeks, review time is still above 15 minutes per application.

## Checks to run

From `web/`, with the app running:

```
npm run eval            # quick tests, tricky inputs, N6, N1
npm run eval -- --full  # also re-screens the ten case applications and grades them (about $0.70)
npm run eval:outreach   # the outreach agent end to end, simulate mode only
npm run eval:cap        # the cost cap pauses and resumes cleanly
npm run backtest        # the back test on the latest card (about $0.90)
npm run eval:burst      # 50 uploads at once: none lost, the upload limit and the consent box hold
```

## What was checked before handing over

| Check | Result |
|---|---|
| Quick tests | 127 of 127 |
| Seed application evals (PRD 19.2, 19.2a) with N2 and N3 | 45 of 45 |
| Tricky inputs (19.3) | 10 of 10 |
| Gate permissions | 12 of 12 |
| Outreach end to end, simulate mode, with N4 | 20 of 20 |
| Cost cap pause and resume | 5 of 5 |
| 20 applications at once (N5) | 20 of 20 accounted for |
| N6 audit of every logged model input | Pass |
| Back test on Thesis Card v2 (N1) | Pass: no funded company marked PASS with no flag |
