-- Milestone M5: the back test (PRD S4, 13.10) and the eval runner.

alter table public.backtest_results add column if not exists card_version int;
alter table public.backtest_results add column if not exists ratings jsonb not null default '{}';
alter table public.backtest_results add column if not exists reasons jsonb not null default '{}';
alter table public.backtest_results add column if not exists score_public numeric(4, 2);
alter table public.backtest_results add column if not exists score_revealed numeric(4, 2);
alter table public.backtest_results add column if not exists verdict_reason text;
alter table public.backtest_results add column if not exists kushal_note text;
alter table public.backtest_results add column if not exists suggested_verdict text;

-- Model calls made by a back test run carry its id, so its cost can be shown by call type.
alter table public.llm_calls add column if not exists run_id uuid;

-- Eval runs are recorded so Kushal can see when the checks last passed.
create table if not exists public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  passed int not null,
  failed int not null,
  critical_failed int not null default 0,
  detail jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.eval_runs enable row level security;
do $$ begin
  create policy members_read on public.eval_runs for select using (public.is_member());
exception when duplicate_object then null; end $$;
