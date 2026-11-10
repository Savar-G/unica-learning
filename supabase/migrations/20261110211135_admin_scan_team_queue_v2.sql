-- Marking's team queue with the "Show test families" switch (D-313), additive beside admin_scan_team_queue.
--
-- The first version marks test families but leaves them in the list, so the admin page removed them after the limit:
-- 100 waiting test answers hid every real one, and the sidebar badge was gone. Here a test family is a family in
-- public.test_accounts or an admin's own family (public.admin_users), the same set as testAccountIds in the site.
-- p_with_tests false leaves them out before the limit. total counts the rows the list can hold (before the limit);
-- real_total counts only the real families' rows, whatever p_with_tests says, for every number on the page and badge.
-- The first version stays for the site version that still calls it.

create or replace function public.admin_scan_team_queue_v2(p_limit int default 100, p_with_tests boolean default false)
returns table (item_id uuid, parent_id uuid, child_id uuid, child_name text, workbook_id uuid, book int, page_number int,
  question_number int, photo_id uuid, issue text, read_text text, waiting_since timestamptz, test_family boolean, total bigint,
  real_total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'queue_limit'; end if;
  if p_with_tests is null then raise exception 'queue_tests'; end if;
  return query
  with waiting as (
    select i.id, i.parent_id, i.child_id, c.first_name, i.workbook_id, w.number, p.page_number,
      (i.expected->>'number')::int as question_number,
      coalesce(i.owner_photo, case when i.observation->'evidence'->>'photoRevision' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (i.observation->'evidence'->>'photoRevision')::uuid end) as photo_id,
      i.observation->>'issue' as issue, i.observation->>'readAnswerText' as read_text, i.evidence_at,
      (exists (select 1 from public.test_accounts t where t.parent_id = i.parent_id)
        or exists (select 1 from public.admin_users u where u.user_id = i.parent_id)) as test_family
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
  ), real_count as (
    select count(*) as n from waiting where not waiting.test_family
  )
  select q.id, q.parent_id, q.child_id, q.first_name, q.workbook_id, q.number, q.page_number, q.question_number, q.photo_id,
    q.issue, q.read_text, q.evidence_at, q.test_family, count(*) over (), (select n from real_count)
  from waiting q
  where p_with_tests or not q.test_family
  order by q.evidence_at, q.id
  limit p_limit;
end $$;

revoke all on function public.admin_scan_team_queue_v2(int, boolean) from public, anon;
grant execute on function public.admin_scan_team_queue_v2(int, boolean) to authenticated;
