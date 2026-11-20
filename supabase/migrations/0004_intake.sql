-- Milestone M2: intake to cheap checks.

-- Every model call keeps what it was sent and what came back, so we can prove what left the system (N6, PRD 16.1).
alter table public.llm_calls add column if not exists input jsonb;
alter table public.llm_calls add column if not exists output jsonb;
alter table public.llm_calls add column if not exists error text;

-- Riya can ask for the full review even when a cheap check hit.
alter table public.applications add column if not exists full_review boolean not null default false;
-- Warm intros record who introduced the company and Riya's notes.
alter table public.applications add column if not exists introduced_by text;
alter table public.applications add column if not exists intro_notes text;

-- Founder role and short background stay with the name, in the database only.
alter table public.founders add column if not exists role text;
alter table public.founders add column if not exists bio text;

-- One form and one deck per application.
do $$ begin
  alter table public.documents add constraint documents_one_per_kind unique (application_id, kind);
exception when duplicate_object then null; end $$;

-- Rupees per US dollar, for the stage check. Kushal can change it in settings.
insert into public.settings (key, value) values ('inr_per_usd', '85') on conflict (key) do nothing;

-- Model prices in USD per million tokens. ESTIMATES until checked against Google's pricing page.
-- They are set on the high side so the daily cost cap trips early rather than late.
insert into public.model_prices (model, input_per_million_usd, output_per_million_usd) values
  ('gemini-3.1-flash-lite', 0.25, 1.50),
  ('gemini-3-flash-preview', 0.50, 3.00),
  ('gemini-3.1-pro-preview', 2.00, 12.00)
on conflict (model) do nothing;
