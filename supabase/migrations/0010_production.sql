-- M9, safe at volume (PRD Section 24, gaps G1 to G8).

-- G4. A cached answer is logged as its own status, at no cost.
alter table public.llm_calls drop constraint if exists llm_calls_status_check;
alter table public.llm_calls add constraint llm_calls_status_check check (status in ('ok', 'bad_json', 'bad_citation', 'error', 'cached'));

-- G4. Same model, same prompt version, same input: reuse the stored answer.
create table if not exists public.model_cache (
  key text primary key,
  model text not null,
  prompt_version text not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.model_cache enable row level security;

-- G8. When the person uploading confirmed the founder was told an AI model reads the application.
alter table public.applications add column if not exists consent_at timestamptz;

-- G2. Uploads per visitor. The visitor is a keyed hash, never the raw address.
create table if not exists public.intake_hits (
  visitor text not null,
  at timestamptz not null default now()
);
create index if not exists intake_hits_visitor_at on public.intake_hits (visitor, at desc);
alter table public.intake_hits enable row level security;

insert into public.settings (key, value) values
  ('upload_limit_per_hour', '30'),
  ('answer_cache', '"on"'),
  ('input_retention_days', '30'),
  ('cap_alert_sent_on', 'null')
on conflict (key) do nothing;

-- G7. Full model inputs and outputs are a second copy of founder material. After the retention window,
-- keep only the counts, cost, model and prompt version.
create or replace function public.purge_model_inputs(days int)
returns int
language sql
security definer
set search_path = public
as $$
  with gone as (
    update public.llm_calls
       set input = jsonb_build_object('purged', true), output = null
     where created_at < now() - make_interval(days => days)
       and input is not null
       and coalesce(input ->> 'purged', 'false') <> 'true'
    returning 1
  ), cache as (
    delete from public.model_cache where created_at < now() - make_interval(days => days) returning 1
  ), hits as (
    delete from public.intake_hits where at < now() - interval '2 days' returning 1
  )
  select (select count(*) from gone)::int;
$$;
revoke all on function public.purge_model_inputs(int) from public, anon, authenticated;

-- G1 and G7. The database's own scheduler. The worker jobs are added by scripts/schedule.mjs,
-- because they need the app address and the worker secret, which never go in git.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every night at 02:45 India time (21:15 UTC).
select cron.schedule(
  'purge-model-inputs',
  '15 21 * * *',
  $$select public.purge_model_inputs(coalesce((select (value #>> '{}')::int from public.settings where key = 'input_retention_days'), 30))$$
);
