-- Milestone M3: full screening.

-- Evidence keeps its unit, a link to the claim it confirms or contradicts, and how it was matched.
alter table public.evidence add column if not exists unit text;
alter table public.evidence add column if not exists url text;
alter table public.evidence add column if not exists linked_to text;
alter table public.evidence add column if not exists note text;
alter table public.evidence drop constraint if exists evidence_track_check;
alter table public.evidence add constraint evidence_track_check check (track in ('1', '2', 'riya', 'code'));
alter table public.evidence drop constraint if exists evidence_source_type_check;
alter table public.evidence add constraint evidence_source_type_check check (source_type in ('form', 'deck', 'web', 'riya', 'portfolio', 'system'));

-- Research fetches may be replayed from recorded fixtures (PRD 19.2a).
alter table public.research_fetches add column if not exists mode text not null default 'live' check (mode in ('live', 'replay', 'off'));
alter table public.research_fetches add column if not exists attempt_note text;
alter table public.research_fetches drop constraint if exists research_fetches_outcome_check;
alter table public.research_fetches add constraint research_fetches_outcome_check
  check (outcome in ('filled', 'empty', 'failed', 'wrong_match', 'blocked', 'injection'));

-- One score per criterion per application. A re-run replaces it.
do $$ begin
  alter table public.criterion_scores add constraint criterion_scores_one unique (application_id, criterion_id);
exception when duplicate_object then null; end $$;
alter table public.criterion_scores add column if not exists capped_note text;

-- The brief keeps both lens scores, the research mode and whether Aditya joins the call.
alter table public.briefs add column if not exists scores jsonb not null default '{}';
alter table public.briefs add column if not exists research_mode text;
alter table public.briefs add column if not exists aditya_on_call boolean not null default false;
alter table public.briefs add column if not exists history jsonb not null default '[]';

-- Research runs from recorded fixtures until someone switches it to live in Settings.
insert into public.settings (key, value) values ('research_mode', '"replay"') on conflict (key) do nothing;
