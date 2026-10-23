-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration create_signups, 2026-10-06.
-- Kept here as a record; change the database through new migrations, not by editing this file.
create table public.signups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  status text not null check (status in ('reserved', 'waitlist')),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  postal text not null check (postal ~ '^[ABCEGHJ-NPRSTVXY][0-9][A-Z] ?[0-9][A-Z][0-9]$'),
  plan text not null check (plan in ('one', 'both')),
  subject text not null check (subject in ('Math', 'Reading', 'Math + Reading')),
  age smallint not null check (age between 6 and 12),
  price numeric(6,2) not null check (price between 1 and 500),
  source jsonb not null default '{}'::jsonb check (pg_column_size(source) < 4000)
);
create index signups_created_at_idx on public.signups (created_at desc);
alter table public.signups enable row level security;
revoke all on table public.signups from anon, authenticated;
grant insert on table public.signups to anon;
create policy "Site can add signups" on public.signups
  for insert to anon with check (created_at > now() - interval '1 minute');
create function public.ping() returns integer
  language sql stable security invoker set search_path = '' as $$ select 1 $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon;
