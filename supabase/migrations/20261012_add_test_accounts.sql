-- The admin dashboard (D-099) leaves team and test families out of its numbers. Two sources:
-- 1. admin accounts: an admin who signs up as a parent to try the test (admin_team_ids below);
-- 2. test_accounts: families an admin marked as a test on the family's admin page.
-- Additive: no existing table or function changes.

-- Families marked as tests. Only admins read or change it; a family's deletion removes its mark.
create table public.test_accounts (
  parent_id uuid primary key references public.parents (id) on delete cascade,
  marked_at timestamptz not null default now(),
  marked_by uuid not null default auth.uid()
);
alter table public.test_accounts enable row level security;
revoke all on table public.test_accounts from anon, authenticated;
grant select, insert, delete on table public.test_accounts to authenticated;
create policy "Admins read test accounts" on public.test_accounts
  for select to authenticated using ((select public.is_admin()));
create policy "Admins mark test accounts" on public.test_accounts
  for insert to authenticated with check ((select public.is_admin()) and marked_by = (select auth.uid()));
create policy "Admins unmark test accounts" on public.test_accounts
  for delete to authenticated using ((select public.is_admin()));

-- The user ids of the admins, for an admin only (admin_users itself stays closed to every client role).
create function public.admin_team_ids() returns setof uuid
  language sql stable security definer set search_path = ''
as $$ select user_id from public.admin_users where (select public.is_admin()) $$;

revoke execute on function public.admin_team_ids() from public, anon;
grant execute on function public.admin_team_ids() to authenticated;
