-- M10, G12 (PRD 24.3): Riya's email edits used to become style notes at once, for every founder.
-- A one-off edit ("I heard about you from Rahul") could then turn into a rule. Now each edit proposes a note,
-- tagged with the company's sector, and Riya approves it before any draft uses it.
create table if not exists public.style_note_candidates (
  id uuid primary key default gen_random_uuid(),
  note text not null,
  tag text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  email_id uuid references public.emails (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.style_note_candidates enable row level security;
create index if not exists style_note_candidates_status on public.style_note_candidates (status, created_at desc);
