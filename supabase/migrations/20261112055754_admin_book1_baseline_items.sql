-- #870 review round 4: the /admin/next-steps list of Book 1 starting records must show only a revision that can still be
-- saved: the draft's newest approval, with no baseline. Filtering in the page's code let rows of old revisions use up the
-- read's limit. Additive: one admin-only function (the admin's own session; the same guard as admin_scan_team_queue_v2).
-- Pending rows and tries rows are immutable, so an old revision stays in them forever; this function leaves it out.
create function public.admin_book1_baseline_items(p_limit int default 51, p_hide uuid[] default '{}')
returns table (draft_id uuid, revision int, parent_id uuid, child_id uuid, child_name text, run_id uuid, kind text, reason text, tries int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'items_limit'; end if;
  return query
  with latest as (
    select distinct on (a.workbook_id) a.workbook_id as draft, (a.detail->>'revision')::int as revision
    from public.workbook_audit a
    where a.action = 'workbook-approved' and a.workbook_id is not null and jsonb_typeof(a.detail->'revision') = 'number'
    order by a.workbook_id, a.id desc
  ), open as (
    select q.draft_id as draft, q.revision, q.parent_id as parent, q.child_id as child, q.run_id as run, 'pending'::text as kind,
      q.reason as reason, null::int as tries, q.created_at as at
    from public.workbook_book1_baseline_pending q
    join latest l on l.draft = q.draft_id and l.revision = q.revision
    union all
    select t.draft_id, t.revision, t.parent_id, t.child_id,
      (select r.id from public.workbook_runs r where r.draft_id = t.draft_id and r.number = 1 order by r.created_at desc limit 1),
      'failing', null, t.tries, t.last_tried_at
    from public.workbook_book1_baseline_tries t
    join latest l on l.draft = t.draft_id and l.revision = t.revision
    where t.tries >= 3
      and not exists (select 1 from public.workbook_book1_baseline_pending q where q.draft_id = t.draft_id and q.revision = t.revision)
  )
  select o.draft, o.revision, o.parent, o.child, c.first_name, o.run, o.kind, o.reason, o.tries
  from open o
  join public.children c on c.id = o.child and c.parent_id = o.parent
  where not exists (select 1 from public.workbook_book1_baselines b where b.draft_id = o.draft and b.draft_revision = o.revision)
    and not (o.parent = any(coalesce(p_hide, '{}')))
  order by o.at desc, o.draft
  limit p_limit;
end $$;
revoke all on function public.admin_book1_baseline_items(int, uuid[]) from public, anon;
grant execute on function public.admin_book1_baseline_items(int, uuid[]) to authenticated;
