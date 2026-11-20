-- The app has no sign-in. People are a fixed list (Riya, Kushal, Aditya) picked in the sidebar.
-- Every gate action still records which person acted. Row Level Security stays on everywhere,
-- so the browser cannot read the database directly. Only the server, with the secret key, can.

drop table if exists public.allowed_emails;

delete from public.users;
alter table public.users drop constraint if exists users_id_fkey;
alter table public.users alter column id set default gen_random_uuid();
alter table public.users alter column email drop not null;
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('riya', 'kushal', 'aditya'));
alter table public.users add constraint users_role_unique unique (role);

insert into public.users (name, role) values
  ('Riya', 'riya'),
  ('Kushal', 'kushal'),
  ('Aditya', 'aditya');
