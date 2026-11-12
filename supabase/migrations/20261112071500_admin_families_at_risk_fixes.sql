-- "Families at risk" (D-332), fixes after review. Same signature as admin_families_at_risk_v1, so create or replace.
--
-- 1. plan_since no longer falls back to child_plan_states.updated_at: the daily re-read rewrites that every day, so a plan
--    with no start row always looked new. It is now the child's newest started plan (plan_starts through the child's card
--    setup, not the parent's, so a sibling's start does not move it); for a free month with no start row, the first charge
--    minus the 30-day trial; else null (unknown), and the page then counts no quiet days.
-- 2. A held book follows the repo's rule (src/lib/admin-scan-progress.ts): a backstop hold, no trigger claim for that
--    delivery, and no accepted scan receipt for the printed revision. A photo that was sent but not accepted no longer
--    clears the hold.

create or replace function public.admin_families_at_risk_v1(p_with_tests boolean default false)
returns table (
  parent_id uuid, parent_name text, child_id uuid, child_name text,
  plan_kind text, ending_free boolean, next_charge_at timestamptz, ends_at timestamptz, plan_since timestamptz,
  last_activity_at timestamptz, last_activity_kind text, last_sign_in_at timestamptz,
  held_workbook_id uuid, held_book int, held_at timestamptz, test_family boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_with_tests is null then raise exception 'risk_tests'; end if;
  return query
  select
    s.parent_id, p.name, s.child_id, c.first_name,
    s.kind, s.ending_free, s.next_charge_at, s.ends_at,
    coalesce(
      (select max(ps.started_at) from public.plan_starts ps join public.card_setups cs on cs.id = ps.card_setup_id
        where cs.child_id = s.child_id and ps.state = 'started'),
      case when s.kind = 'free_month' and s.next_charge_at is not null then s.next_charge_at - interval '30 days' end),
    act.at, act.kind, u.last_sign_in_at,
    hold.workbook_id, hold.number, hold.held_at,
    (exists (select 1 from public.test_accounts t where t.parent_id = s.parent_id)
      or exists (select 1 from public.admin_users a where a.user_id = s.parent_id))
  from public.child_plan_states s
  join public.parents p on p.id = s.parent_id and p.deletion_requested_at is null
  join public.children c on c.id = s.child_id and c.parent_id = s.parent_id
  left join auth.users u on u.id = s.parent_id
  left join lateral (
    select e.at, e.kind from (
      select max(sp.sent_at) as at, 'scan'::text as kind from public.scan_photos sp
        where sp.child_id = s.child_id and sp.sent_at is not null
      union all
      select max(m.created_at), 'maya' from public.maya_calls m where m.child_id = s.child_id and m.kind <> 'admin_test'
      union all
      select max(l.created_at), 'marks' from public.learning_events l where l.child_id = s.child_id and l.source = 'marking'
    ) e where e.at is not null order by e.at desc limit 1
  ) act on true
  left join lateral (
    select h.workbook_id, w.number, h.held_at from public.workbook_scan_backstop_holds h
    join public.workbooks w on w.id = h.workbook_id
    where h.child_id = s.child_id
      and not exists (select 1 from public.workbook_scan_trigger_claims c
        where c.workbook_id = h.workbook_id and c.delivery_audit_id = h.delivery_audit_id)
      and not exists (select 1 from public.workbook_scan_receipts r
        where r.workbook_id = h.workbook_id and r.printed_revision = h.printed_revision and r.status = 'accepted')
    order by w.number desc limit 1
  ) hold on true
  where s.kind in ('free_month', 'paying', 'ending', 'payment_failed', 'paused')
    and not exists (select 1 from public.child_deletions d where d.child_id = s.child_id)
    and not exists (select 1 from public.family_deletions d where d.parent_id = s.parent_id)
    and (p_with_tests or not (exists (select 1 from public.test_accounts t where t.parent_id = s.parent_id)
      or exists (select 1 from public.admin_users a where a.user_id = s.parent_id)))
  order by s.parent_id, c.created_at, s.child_id;
end $$;

revoke all on function public.admin_families_at_risk_v1(boolean) from public, anon;
grant execute on function public.admin_families_at_risk_v1(boolean) to authenticated;
