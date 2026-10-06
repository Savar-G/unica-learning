-- Pagewise signups. Run once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- RLS is on with no policies, so only the server (secret key) can read or write.
create table if not exists public.signups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  status text not null check (status in ('reserved', 'waitlist')),
  name text not null,
  email text not null,
  postal text not null,
  plan text not null check (plan in ('one', 'both')),
  subject text not null,
  age smallint not null check (age between 6 and 12),
  price smallint not null,
  source jsonb not null default '{}'::jsonb
);

alter table public.signups enable row level security;

create index if not exists signups_created_at_idx on public.signups (created_at desc);
