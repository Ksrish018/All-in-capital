# All In Capital Triage

A triage system for a pre-seed fund. It reads each application, researches what it can, and scores it against the fund's criteria, with a source behind every claim and every gap named. People make every decision. After a yes, it drafts the emails and books the call, and nothing is sent without a person's click.

Built for the MESA Term 2 case (All In Capital). The full specification is in [PRD.md](PRD.md).

## What is where

| Path | What it holds |
|---|---|
| `PRD.md` | The build document: workflow, data model, screens, tests, milestones |
| `PLANNING.md`, `PRELIMINARY_CHECKS.md`, `REFERENCE_GUIDE.md` | The thinking before the build |
| `Components_Map.png` | The whole system on one picture |
| `web/` | The Next.js app (screens, server routes, workers) |
| `supabase/migrations/` | Database schema, applied with `npm run db:migrate` |
| `seed/fund/` | The fund's public thesis register and portfolio draft |
| `evals/` | Gold labels, research fixtures and the eval guide |
| `scripts/` | Helper scripts, such as the research fixture recorder |
| `.github/workflows/` | CI: quick checks on every push, live checks when secrets are set |

Course PDFs and seed decks are kept out of this public repository on purpose.

The app has no login by design. Do not expose it to the internet without a hosting-level password.

## Run it locally

1. Copy `.env.example` to `.env` in the repository root and fill in the keys.
2. Install and prepare:

```
cd web
npm install
npm run db:migrate
npm run db:seed
npm run db:memos   # needs the local memo PDF in Decks/
```

3. Start the app at http://localhost:3000. There is no login. Pick who is working in the sidebar.

```
npm run dev
```

4. Add applications from the Pipeline page ("Add applications"), or send all ten case applications through the real upload route:

```
npm run case:load -- --clean            # needs the case PDFs in Decks/ and the app running
npm run case:load -- --clean --copies 2 # N5 volume test: 20 at once, none may vanish
```

The screening worker runs straight after each upload. A scheduler can also call `POST /api/worker/screening` with `Authorization: Bearer $WORKER_SECRET`.

## Checks

```
cd web
npm test            # quick checks, no keys needed
npm run typecheck
npm run lint
node scripts/verify-db.mjs --strict   # live database checks, needs .env
npm run audit:n6    # N6: no founder name, email, phone or link in any logged model input
```

Tests on the ten case files run when `Decks/` is present and skip in CI, because the PDFs stay out of this repository.
