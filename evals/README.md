# Evals

Evals are the tests that tell us whether the triage system can be trusted. Each one has a fixed input, an expected behaviour, a yes or no check, and a severity. See PRD Section 19.

## What is in this folder

| Path | What it is | Real or made up |
|---|---|---|
| `gold/applicants.json` | What the system must do for each of the 10 seed applicants: values to extract, flags to raise, deck and form gaps to show, allowed recommendations | Expectations written from the real seed files |
| `fixtures/research/companies_memo.json` | The 12 deal memo companies, used to test research | 6 real companies, 6 made up for the case |
| `fixtures/research/memo_companies/` | Recorded Track 2 research on the 12 memo companies (short snippets and links only) | Real search results, recorded 20 Nov 2026 |
| `fixtures/research/applicants_synthetic.json` | A small fake web for the 10 applicants, so the compare step can be tested | Synthetic. Every page uses a `.example` domain. |

## Why we need both real and synthetic research

* The 10 applicants are fictional. Their websites are placeholders. Live research on them finds nothing, which tests that the system says "unknown" and does not invent facts. It cannot test whether research works.
* The 6 invested memo companies are real. Research on them tests that Track 2 finds the right company, the right founders and real news.
* The 6 passed memo companies are made up, but search still returns real lookalikes. For example, a real person with the same name as the Coinlane founder co-founded a crypto exchange. These test that the company matcher drops the wrong match.
* The synthetic pages test the compare step on all four outcomes: confirmed, founder says, conflict, and found by us.

## Two rules

1. **Recorded memo research is never used in the back test.** It contains what happened after the fund's decision. The back test runs with research switched off.
2. **No personal pages.** The recorder blocks LinkedIn, Instagram, Facebook and contact-data sites. Only short snippets and links are stored.

## How the evals run

* **Replay mode (default).** Research comes from these fixtures. Model calls are real. Repeatable and cheap.
* **Live mode.** Research calls Tavily. Used weekly to catch changes on the web.
* **On every push.** A quick set: all Critical tests plus the seed applicants that need no model call.
* **Nightly and before any release.** The full set, including the back test.

A Critical failure blocks the change. See PRD Section 19 and Section 20.

## Re-recording real research

```
python -I scripts/record_research.py evals/fixtures/research/companies_memo.json evals/fixtures/research/memo_companies
```

This needs `TAVILY_API_KEY` in `.env`. It uses about 60 search credits.
