-- M10, G11 for emails (PRD 24.3): a plain warning on a draft when no style note was written for this kind of
-- company yet, so Riya knows the draft leans on general habits only (the "defence drone" case).
alter table public.emails add column if not exists draft_note text;
