-- The team's daily email when answers wait for a team mark (#718). Additive: one table and one function.
--
-- scan_team_waiting_count(): how many real families' answers wait for our team. It is the same waiting rule as
-- admin_scan_team_queue_v2 (migration 20261110211135_admin_scan_team_queue_v2.sql), real_total only: test families (public.test_accounts
-- and admins' own families) are left out, so the email and the /admin/scans total cannot disagree. Service role only: the reminders
-- run has no admin session, and the function returns a count and nothing else (no family, child or answer).
--
-- scan_team_email_days: one row per team day (a Pacific calendar day). The run claims the day by inserting its row; the primary key
-- lets one run win. state 'claimed' means a run took the day and is sending, or the email may have gone (a 5xx, a timeout, no
-- answer): nothing sends it again. 'sent' stores the provider's id. A refused send deletes the row, so a later run tries again.
-- No policy and no grant for anon, authenticated or admins: only the server's secret key reads and writes it. Holds no family data.
create or replace function public.scan_team_waiting_count()
returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*)
  from public.scan_marking_items i
  join public.children c on c.id = i.child_id and c.parent_id = i.parent_id
  join public.parents f on f.id = i.parent_id and f.deletion_requested_at is null
  join public.workbooks w on w.id = i.workbook_id
  join public.workbook_pages p on p.id = i.page_id
  where i.observation->>'state' in ('pending', 'parent-pending')
    and i.observation->>'result' is null
    and i.expected->>'method' in ('code', 'parent')
    and (i.observation->>'state' = 'parent-pending' or i.model is not null or coalesce(i.observation->>'certainty', 'not-read') <> 'not-read')
    and not exists (select 1 from public.child_deletions d where d.child_id = i.child_id)
    and not exists (select 1 from public.family_deletions d where d.parent_id = i.parent_id)
    and not exists (select 1 from public.test_accounts t where t.parent_id = i.parent_id)
    and not exists (select 1 from public.admin_users u where u.user_id = i.parent_id);
$$;

revoke all on function public.scan_team_waiting_count() from public, anon, authenticated;
grant execute on function public.scan_team_waiting_count() to service_role;

create table public.scan_team_email_days (
  day date primary key,
  state text not null default 'claimed' check (state in ('claimed', 'sent')),
  waiting integer not null check (waiting > 0),
  email_id text,
  error text,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.scan_team_email_days enable row level security;
revoke all on table public.scan_team_email_days from anon, authenticated;
grant select, insert, update, delete on table public.scan_team_email_days to service_role;
