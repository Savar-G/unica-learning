-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_admin_area, 2026-10-11.
-- The admin area (#77, D-085): Savar and Cedric each sign in with their own account (the same sign-in as parents) and
-- read every family's data. Additive: a new table and new functions and policies. The code on main reads none of them,
-- and no policy that parents use changes, so parents keep reading only their own rows.
--
-- admin_users: one row per admin, keyed to the auth user. Admin access never comes from an email alone: the parent
-- signup creates accounts with the email already confirmed (src/app/api/account/signup), so anyone could make an
-- account with an admin's email before the admin does. email and name only say who the row is for.
-- To add an admin: they sign in once (Google is best: Google proves the email), then run, with their email:
--   insert into public.admin_users (user_id, email, name)
--   select u.id, lower(u.email), '<name>' from auth.users u
--   where lower(u.email) = '<their email>' and coalesce(u.encrypted_password, '') = ''
--     and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google');
-- The two conditions accept only an account made with Google and with no password, so an account someone else made
-- earlier with that email (it has a password) is not made admin. 0 rows inserted: check the account by hand first.
-- To remove an admin: delete their row. Nobody but the secret key can read or write this table.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  email text not null unique check (char_length(email) <= 200 and email = lower(email)),
  name text not null check (char_length(name) between 1 and 60)
);
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

-- True when the signed-in user (auth.uid() from their verified token) has an admin_users row. Security definer, so it
-- can read admin_users. The admin pages call it first, and every admin policy and function below uses it.
create function public.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()))
$$;

-- Tables parents cannot read: an admin reads every row through row-level security. Parents still get no rows: they
-- have no policy on these tables. The grants are needed for any policy to apply.
grant select on table public.answers, public.work_reviews, public.email_log, public.assessment_facts, public.fact_answers
  to authenticated;
create policy "Admins read all answers" on public.answers
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read all work reviews" on public.work_reviews
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read the email log" on public.email_log
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read all quick facts" on public.assessment_facts
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read all quick fact answers" on public.fact_answers
  for select to authenticated using ((select public.is_admin()));

-- The children's whiteboard drawings: an admin signs short-lived URLs for any file with their own session.
create policy "Admins read all shown work" on storage.objects
  for select to authenticated using (bucket_id = 'shown-work' and (select public.is_admin()));

-- Tables parents can read (parents, children, assessments, reports, card_setups, waitlist_joins): an admin policy
-- there would also widen the parent pages, which read through row-level security with no filter of their own (for
-- example /account reads "the" parent row). An admin is often a parent too. So an admin reads these through the
-- functions below: every row and every column (the test, its seed and the help answer too), and nothing at all for a
-- user who is not an admin. The parent pages and their policies do not change.
create function public.admin_parents() returns setof public.parents
  language sql stable security definer set search_path = ''
as $$ select * from public.parents where (select public.is_admin()) $$;

create function public.admin_children() returns setof public.children
  language sql stable security definer set search_path = ''
as $$ select * from public.children where (select public.is_admin()) $$;

create function public.admin_assessments() returns setof public.assessments
  language sql stable security definer set search_path = ''
as $$ select * from public.assessments where (select public.is_admin()) $$;

create function public.admin_reports() returns setof public.reports
  language sql stable security definer set search_path = ''
as $$ select * from public.reports where (select public.is_admin()) $$;

create function public.admin_card_setups() returns setof public.card_setups
  language sql stable security definer set search_path = ''
as $$ select * from public.card_setups where (select public.is_admin()) $$;

create function public.admin_waitlist_joins() returns setof public.waitlist_joins
  language sql stable security definer set search_path = ''
as $$ select * from public.waitlist_joins where (select public.is_admin()) $$;

-- Only signed-in users may call them (a visitor with no session is never an admin).
revoke execute on function public.is_admin(), public.admin_parents(), public.admin_children(), public.admin_assessments(),
  public.admin_reports(), public.admin_card_setups(), public.admin_waitlist_joins() from public, anon;
grant execute on function public.is_admin(), public.admin_parents(), public.admin_children(), public.admin_assessments(),
  public.admin_reports(), public.admin_card_setups(), public.admin_waitlist_joins() to authenticated;

-- Savar (D-085): his account was made with Google, with no password. Cedric is added with the statement above after
-- he first signs in.
insert into public.admin_users (user_id, email, name)
select u.id, lower(u.email), 'Savar' from auth.users u
where lower(u.email) = 'savar.gupta1922@gmail.com' and coalesce(u.encrypted_password, '') = ''
  and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google');
