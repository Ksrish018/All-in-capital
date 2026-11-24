-- M9: every upload starts a worker, and the scheduler starts one every minute. Without a shared limit,
-- 50 uploads meant about 17 applications screened at once, which floods the model provider (Lecture 8).
-- A worker must hold a slot for each application it screens. Slots above the concurrency setting are never used.
-- A slot is leased for 10 minutes, the same as the queue's visibility timeout, so a crashed worker frees it.
create table if not exists public.worker_slots (
  slot int primary key,
  holder text,
  until timestamptz not null default 'epoch'
);
alter table public.worker_slots enable row level security;
insert into public.worker_slots (slot) select generate_series(1, 16) on conflict (slot) do nothing;
