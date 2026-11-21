-- Milestone M4: Gate 1 (Riya reviews) and Gate 2 (Kushal signs off).

-- What the system said when the person decided, so agreement can be measured later.
alter table public.reviews add column if not exists system_recommendation text;
alter table public.reviews add column if not exists note_to_riya text;

-- The blind sample (PRD Gate 1): chosen when the brief is ready, revealed after Riya records her own view.
alter table public.applications add column if not exists blind boolean not null default false;
alter table public.applications add column if not exists blind_first_view text check (blind_first_view in ('go', 'pass', 'unsure'));

-- A correction keeps the tags it was made under, so Loop C can recall it for similar companies.
-- (tags already exists on corrections; rule_status starts as pending for rule corrections.)
alter table public.corrections add column if not exists decided_by uuid references public.users (id);
alter table public.corrections add column if not exists decided_at timestamptz;

-- Riya can ask for more research on a named question.
alter table public.applications add column if not exists research_question text;

-- Kushal's note when he sends an application back to Riya.
alter table public.applications add column if not exists sent_back_note text;
