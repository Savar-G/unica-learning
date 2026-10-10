-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_parents_children, 2026-10-10.
-- Parent accounts for the online assessment (#62, D-082). One parent row per Supabase Auth user, and one row per child.
-- The server writes both tables with the secret key (service_role skips row-level security).
-- A signed-in parent reads only their own rows. anon gets nothing. Admin reads come with the admin ticket.
-- province: the curriculum the child is measured against; "other" = another province or not sure (scored against BC).
create table public.parents (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  postal text not null check (postal ~ '^[ABCEGHJ-NPRSTVXY][0-9][A-Z] ?[0-9][A-Z][0-9]$'),
  source jsonb not null default '{}'::jsonb check (pg_column_size(source) < 4000)
);
create table public.children (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  grade smallint not null check (grade between 1 and 7),
  province text not null check (province in ('BC', 'AB', 'SK', 'MB', 'ON', 'other'))
);
create index children_parent_id_idx on public.children (parent_id, created_at);

alter table public.parents enable row level security;
alter table public.children enable row level security;
revoke all on table public.parents, public.children from anon, authenticated;
grant select on table public.parents, public.children to authenticated;
create policy "Parents read their own row" on public.parents
  for select to authenticated using ((select auth.uid()) = id);
create policy "Parents read their own children" on public.children
  for select to authenticated using ((select auth.uid()) = parent_id);
