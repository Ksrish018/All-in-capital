-- All In Capital triage system: initial schema (PRD Section 12).
-- Row Level Security is on for every table. Signed-in fund members may read.
-- All writes go through server routes using the secret key, after role checks in code.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  name text not null,
  role text not null check (role in ('riya', 'kushal', 'aditya', 'admin'))
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('riya', 'kushal', 'aditya', 'admin')),
  created_at timestamptz not null default now()
);

-- True when the caller is a signed-in fund member.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Thesis, portfolio and memos
-- ---------------------------------------------------------------------------
create table public.thesis_cards (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  public_thesis_text text,
  public_thesis_sources jsonb not null default '[]',
  criteria jsonb not null default '[]',
  weights_public jsonb not null default '{}',
  weights_revealed jsonb not null default '{}',
  thresholds jsonb not null default '{}',
  hard_flags jsonb not null default '[]',
  approved_by uuid references public.users (id),
  approved_at timestamptz,
  backtest_run_id uuid,
  created_at timestamptz not null default now()
);

create table public.portfolio_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  sector text,
  buyer text,
  tags text[] not null default '{}',
  source text[] not null default '{}',
  confirmed boolean not null default false
);

create table public.memo_passages (
  id text primary key,
  company text not null,
  decision text not null check (decision in ('invested', 'passed')),
  sector text,
  criteria text[] not null default '{}',
  text text not null,
  split text not null check (split in ('build', 'test'))
);

-- ---------------------------------------------------------------------------
-- Applications and documents
-- ---------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website text,
  source text not null check (source in ('public_form', 'warm_intro')),
  status text not null default 'received' check (status in (
    'received', 'queued', 'parsing', 'screening', 'short_circuited', 'extracting',
    'researching', 'scoring', 'brief_ready', 'riya_decided', 'hold_conflict',
    'signed_off_go', 'signed_off_pass', 'hold', 'needs_attention', 'paused_cost_cap'
  )),
  status_reason text,
  last_step text,
  short_circuit_flags text[] not null default '{}',
  thesis_card_id uuid references public.thesis_cards (id),
  received_at timestamptz not null default now(),
  brief_ready_at timestamptz,
  cost_usd numeric(12, 6) not null default 0,
  -- An application in needs_attention must always say why.
  constraint needs_attention_has_reason check (status <> 'needs_attention' or status_reason is not null)
);

create table public.founders (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  founder_key text not null,
  name text,
  email text,
  phone text,
  linkedin_url text,
  unique (application_id, founder_key)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  kind text not null check (kind in ('form', 'deck')),
  storage_path text not null,
  parsed jsonb,
  redacted jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Evidence (Track 1 founder's story, Track 2 our research, or Riya)
-- ---------------------------------------------------------------------------
create table public.evidence (
  id text primary key,
  application_id uuid not null references public.applications (id) on delete cascade,
  field text not null,
  status text not null check (status in ('yes', 'no', 'unknown', 'number', 'text')),
  value jsonb,
  quote text,
  source_type text check (source_type in ('form', 'deck', 'web', 'riya')),
  source_ref text,
  fetched_at timestamptz,
  track text not null check (track in ('1', '2', 'riya')),
  check_id text,
  strength text not null default 'none' check (strength in ('confirmed', 'founder_says', 'conflict', 'found_by_us', 'none')),
  vague boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.research_fetches (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  check_id text not null,
  attempt int not null check (attempt between 1 and 2),
  query_or_url text not null,
  outcome text not null check (outcome in ('filled', 'empty', 'failed', 'wrong_match', 'blocked')),
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Scores, briefs, reviews and corrections
-- ---------------------------------------------------------------------------
create table public.criterion_scores (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  criterion_id text not null,
  rating int not null check (rating between 0 and 4),
  strength text not null,
  reason text not null,
  evidence_refs text[] not null default '{}',
  memo_refs text[] not null default '{}',
  missing text[] not null default '{}',
  prompt_version text,
  created_at timestamptz not null default now()
);

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  rec_public text check (rec_public in ('go', 'pass', 'needs_human', 'hold')),
  rec_revealed text check (rec_revealed in ('go', 'pass', 'needs_human', 'hold')),
  headline_lens text check (headline_lens in ('public', 'revealed')),
  lens_note text,
  summary text,
  flags jsonb not null default '[]',
  gaps jsonb not null default '[]',
  inconsistencies jsonb not null default '[]',
  call_only_signals jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  gate int not null check (gate in (1, 2)),
  reviewer_id uuid not null references public.users (id),
  decision text not null check (decision in ('go', 'pass', 'hold', 'send_back')),
  agreed_with_system boolean not null,
  reason text,
  notes text,
  blind boolean not null default false,
  blind_first_view text,
  seconds_spent int,
  created_at timestamptz not null default now(),
  constraint reason_when_disagreeing check (agreed_with_system or (reason is not null and length(reason) > 0))
);

create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  criterion_id text not null,
  old_rating int,
  new_rating int,
  reason text not null check (length(reason) between 1 and 140),
  kind text not null check (kind in ('fact', 'rule')),
  tags text[] not null default '{}',
  rule_status text check (rule_status in ('pending', 'accepted', 'declined')),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Outreach
-- ---------------------------------------------------------------------------
create table public.outreach (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  outcome text not null check (outcome in ('go', 'pass')),
  status text not null default 'draft_ready' check (status in (
    'draft_ready', 'sent', 'followup_1_ready', 'followup_1_sent', 'followup_2_ready',
    'followup_2_sent', 'no_response', 'scheduling', 'booked', 'declined', 'with_riya',
    'closed', 'call_done'
  )),
  gmail_thread_id text,
  followups_sent int not null default 0 check (followups_sent between 0 and 2),
  scheduling_round int not null default 0 check (scheduling_round between 0 and 2),
  slots_offered jsonb not null default '[]',
  slots_refused jsonb not null default '[]',
  attendees jsonb not null default '[]',
  calendar_event_id text,
  next_step_at timestamptz,
  paused_until timestamptz,
  handoff_reason text
);

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references public.outreach (id) on delete cascade,
  kind text not null check (kind in ('invite', 'pass_note', 'followup', 'scheduling', 'close')),
  draft_subject text,
  draft_body text,
  sent_subject text,
  sent_body text,
  sent_by uuid references public.users (id),
  sent_at timestamptz,
  gmail_message_id text,
  -- An email can only be marked sent by a person.
  constraint sent_needs_person check (sent_at is null or sent_by is not null)
);

create table public.style_notes (
  version int primary key,
  notes text[] not null default '{}',
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.call_outcomes (
  application_id uuid primary key references public.applications (id) on delete cascade,
  worth_it boolean not null,
  note text,
  recorded_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Back test, model calls, prices, events, settings
-- ---------------------------------------------------------------------------
create table public.backtest_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  thesis_card_id uuid references public.thesis_cards (id),
  company text not null,
  split text not null check (split in ('build', 'test')),
  real_decision text not null check (real_decision in ('invested', 'passed')),
  rec_public text,
  rec_revealed text,
  agrees boolean,
  explanation text,
  verdict text check (verdict in ('fund_likely_wrong', 'system_likely_wrong', 'too_early')),
  hindsight_note text,
  verdict_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

create table public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications (id) on delete set null,
  call_type text not null check (call_type in ('A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6')),
  model text not null,
  prompt_name text,
  prompt_version text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(12, 6) not null default 0,
  langfuse_trace_id text,
  status text not null check (status in ('ok', 'bad_json', 'bad_citation', 'error')),
  created_at timestamptz not null default now()
);
create index llm_calls_created_at on public.llm_calls (created_at);

create table public.model_prices (
  model text primary key,
  input_per_million_usd numeric(10, 4) not null,
  output_per_million_usd numeric(10, 4) not null,
  updated_at timestamptz not null default now()
);

create table public.events (
  id bigserial primary key,
  application_id uuid references public.applications (id) on delete cascade,
  actor text not null,
  from_status text,
  to_status text,
  note text,
  at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null
);

insert into public.settings (key, value) values
  ('daily_cost_cap_usd', '5'),
  ('default_headline_lens', '"revealed"'),
  ('blind_sample_rate', '0.10'),
  ('worker_concurrency', '4'),
  ('sector_flag_strength', '"soft"'),
  ('slot_window', '{"days": ["tue", "thu"], "start": "14:00", "end": "18:00", "minutes": 30, "tz": "Asia/Kolkata"}');

-- ---------------------------------------------------------------------------
-- Every status change is recorded
-- ---------------------------------------------------------------------------
create or replace function public.log_status_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.events (application_id, actor, from_status, to_status, note)
    values (new.id, coalesce(current_setting('app.actor', true), 'system'),
            case when tg_op = 'INSERT' then null else old.status end, new.status, new.status_reason);
  end if;
  return new;
end;
$$;

create trigger applications_status_log
after insert or update of status on public.applications
for each row execute function public.log_status_change();

-- ---------------------------------------------------------------------------
-- Row Level Security: members can read everything. No direct writes from the browser.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'allowed_emails', 'users', 'thesis_cards', 'portfolio_companies', 'memo_passages',
    'applications', 'founders', 'documents', 'evidence', 'research_fetches',
    'criterion_scores', 'briefs', 'reviews', 'corrections', 'outreach', 'emails',
    'style_notes', 'call_outcomes', 'backtest_results', 'llm_calls', 'model_prices',
    'events', 'settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy members_read on public.%I for select to authenticated using (public.is_member())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Private storage bucket for forms and decks
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('applications', 'applications', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Queues (Supabase Queues, built on pgmq)
-- ---------------------------------------------------------------------------
create extension if not exists pgmq;
select pgmq.create('screening');
select pgmq.create('outreach_tick');
