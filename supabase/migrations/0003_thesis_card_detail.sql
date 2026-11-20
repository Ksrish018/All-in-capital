-- Thesis Card detail for the Thesis Card page (PRD 7.6 and 13.9):
-- the public thesis register, the partner rules and the rating scale travel with each version.
alter table public.thesis_cards add column if not exists public_register jsonb not null default '{}';
alter table public.thesis_cards add column if not exists partner_rules jsonb not null default '[]';
alter table public.thesis_cards add column if not exists rating_scale jsonb not null default '[]';
alter table public.thesis_cards add column if not exists note text;

-- Memo passages keep their section and memo number for display.
alter table public.memo_passages add column if not exists memo_n int;
alter table public.memo_passages add column if not exists section text
  check (section in ('what', 'founder', 'risks', 'why'));
