-- Milestone M6: the outreach agent (PRD Part 2, Sections 6.2 and 10).

alter table public.outreach add column if not exists founder_email text;
alter table public.outreach add column if not exists reason text;
alter table public.outreach add column if not exists last_message_at timestamptz;
alter table public.outreach add column if not exists first_sent_at timestamptz;
alter table public.outreach add column if not exists paused boolean not null default false;
alter table public.outreach add column if not exists aditya boolean not null default false;
alter table public.outreach add column if not exists created_at timestamptz not null default now();

alter table public.emails add column if not exists created_at timestamptz not null default now();
alter table public.emails add column if not exists to_address text;
alter table public.emails add column if not exists slots jsonb not null default '[]';
alter table public.emails add column if not exists simulated boolean not null default false;

-- Every message read on a thread, with how A6 labelled it.
create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references public.outreach (id) on delete cascade,
  gmail_message_id text,
  body text not null,
  received_at timestamptz not null default now(),
  label text,
  confidence numeric(4, 3),
  proposed_times jsonb not null default '[]',
  return_date date,
  handled boolean not null default false,
  simulated boolean not null default false
);
alter table public.replies enable row level security;
do $$ begin
  create policy members_read on public.replies for select using (public.is_member());
exception when duplicate_object then null; end $$;

-- Simulate until someone switches to live: nothing leaves the system, but every step runs.
insert into public.settings (key, value) values ('outreach_mode', '"simulate"') on conflict (key) do nothing;
-- Who joins a call. Emails are needed only in live mode.
insert into public.settings (key, value) values ('attendees', '{"riya": null, "kushal": null, "aditya": null}') on conflict (key) do nothing;

insert into public.style_notes (version, notes, active) values
  (1, array['Open with the founder''s first name.', 'Keep it short: three short paragraphs at most.', 'Sign off as Riya, All In Capital.'], true)
on conflict (version) do nothing;
