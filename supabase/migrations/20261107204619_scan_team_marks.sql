-- #715 (D-266): the AI marks every answer and no screen asks a parent to judge one. When the AI is unsure, our team
-- sets the mark. A team mark is one more row in the same journal as a parent's correction (scan_mark_changes), with
-- actor 'admin' and the admin who set it, so results, page history, the profile rebuild and progress read it the
-- same way. A parent can still change it afterwards.
--
-- Additive only. The journal's actor check still allows only 'parent'; the separate migration
-- 20261107204700_scan_mark_changes_team_actor.sql widens it to 'parent' or 'admin'. Until that is applied,
-- admin_set_scan_mark fails on its insert and saves nothing.

-- Who on the team set the mark. Only team rows have one. No foreign key: the journal is append only (an update is
-- refused), so removing an admin user must not try to change old rows.
alter table public.scan_mark_changes add column admin_id uuid;
alter table public.scan_mark_changes add constraint scan_mark_changes_admin_actor check ((actor = 'admin') = (admin_id is not null));

-- Items with no mark yet, for the team list.
create index scan_marking_items_waiting on public.scan_marking_items (evidence_at, id)
  where observation->>'state' in ('pending', 'parent-pending');

-- The items waiting for our team, oldest first: an item the AI read (or tried to read) without a sure result, or an
-- old format a person marks. Same rule as waitsForTeam in src/lib/scan-marking.ts. An item not read yet is not the
-- team's. Families being deleted are left out. Admins only.
create function public.admin_scan_team_queue(p_limit int default 100)
returns table (item_id uuid, parent_id uuid, child_id uuid, child_name text, workbook_id uuid, book int, page_number int,
  question_number int, photo_id uuid, issue text, read_text text, waiting_since timestamptz, test_family boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'queue_limit'; end if;
  return query
  select i.id, i.parent_id, i.child_id, c.first_name, i.workbook_id, w.number, p.page_number,
    (i.expected->>'number')::int,
    coalesce(i.owner_photo, case when i.observation->'evidence'->>'photoRevision' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (i.observation->'evidence'->>'photoRevision')::uuid end),
    i.observation->>'issue', i.observation->>'readAnswerText', i.evidence_at,
    exists (select 1 from public.test_accounts t where t.parent_id = i.parent_id),
    count(*) over ()
  from public.scan_marking_items i
  join public.children c on c.id = i.child_id and c.parent_id = i.parent_id
  join public.parents f on f.id = i.parent_id and f.deletion_requested_at is null
  join public.workbooks w on w.id = i.workbook_id
  join public.workbook_pages p on p.id = i.page_id
  where i.observation->>'state' in ('pending', 'parent-pending')
    and i.observation->>'result' is null
    and i.expected->>'method' in ('code', 'parent')
    and (i.observation->>'state' = 'parent-pending' or i.model is not null)
    and not exists (select 1 from public.child_deletions d where d.child_id = i.child_id)
    and not exists (select 1 from public.family_deletions d where d.parent_id = i.parent_id)
  order by i.evidence_at, i.id
  limit p_limit;
end $$;
revoke all on function public.admin_scan_team_queue(int) from public, anon;
grant execute on function public.admin_scan_team_queue(int) to authenticated;

-- Our team sets the mark of one item that waits for the team, at the version the admin saw. Same observation and
-- event intent as a parent's correction (scan_marking_saved_command 'change'), with actor 'admin'. A finished item
-- is not the team's to mark here: the answer is 'not_waiting'. Admins only; the caller's own session is the check.
create function public.admin_set_scan_mark(p_item uuid, p_version int, p_result text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid; m public.scan_marking_items; next_o jsonb; intent jsonb; at_time timestamptz;
  q public.workbook_questions; v_page int; v_photo text;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_result is null or p_result not in ('right', 'wrong', 'blank') or p_version is null or p_version < 1 then return '"refused"'; end if;
  select i.parent_id into v_parent from public.scan_marking_items i where i.id = p_item;
  if not found then return '"refused"'; end if;
  perform public.assert_family_writable(v_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:'||v_parent::text, 0));
  select * into m from public.scan_marking_items where id = p_item and parent_id = v_parent for update;
  if not found or m.expected->>'method' not in ('code', 'parent')
    or not exists (select 1 from public.children where id = m.child_id and parent_id = v_parent)
    or exists (select 1 from public.child_deletions where child_id = m.child_id) then return '"refused"'; end if;
  if m.result_version <> p_version then return jsonb_build_object('status', 'conflict', 'version', m.result_version); end if;
  if m.observation->>'result' is not null or m.observation->>'state' not in ('pending', 'parent-pending')
    or (m.observation->>'state' = 'pending' and m.model is null) then
    return jsonb_build_object('status', 'not_waiting', 'version', m.result_version);
  end if;
  v_photo := coalesce(m.observation->'evidence'->>'photoRevision', m.owner_photo::text);
  at_time := clock_timestamp();
  -- Keep the reading, typed values, photo reference, help and trusted eligibility. The team sets only the mark.
  next_o := m.observation||jsonb_build_object('state', 'parent-checked', 'method', 'parent', 'actor', 'admin',
    'result', p_result, 'resultVersion', m.result_version + 1);
  intent := m.original_event;
  if intent is null and m.expected->'mastery'->>'eligible' = 'true' then
    if v_photo is null then raise exception 'team_mark_missing_photo'; end if;
    select * into q from public.workbook_questions where page_id = m.page_id and parent_id = v_parent
      and question_number = (m.expected->>'number')::int;
    select p.page_number into v_page from public.workbook_pages p where p.id = m.page_id;
    if q.package->'skill' is null then raise exception 'team_mark_missing_skill'; end if;
    intent := jsonb_build_object('key', 'marking:'||encode(sha256(convert_to(m.workbook_id::text||':'||m.printed_revision||':'||m.page_id::text||':'||m.item_id, 'UTF8')), 'hex'),
      'parentId', v_parent, 'childId', m.child_id, 'source', 'marking',
      'question', jsonb_build_object('source', 'workbook', 'workbookId', m.workbook_id, 'page', v_page, 'question', q.question_number),
      'skill', q.package->'skill', 'result', p_result, 'stuckStep', null, 'mistake', null, 'hints', 0, 'timeMs', null,
      'occurredAt', at_time, 'evidence', jsonb_build_object('kind', 'scan', 'id', v_photo));
  end if;
  insert into public.scan_mark_changes(item_id, parent_id, child_id, from_version, to_version, actor, admin_id, changed_at, previous, current)
    values (m.id, v_parent, m.child_id, m.result_version, m.result_version + 1, 'admin', (select auth.uid()), at_time, to_jsonb(m), next_o);
  update public.scan_marking_items set observation = next_o, result_version = result_version + 1, owner_photo = null,
    original_event = intent, evidence_at = at_time where id = m.id returning * into m;
  insert into public.scan_marking_revisions(child_id, parent_id, revision) values (m.child_id, v_parent, 1)
    on conflict (child_id) do update set revision = public.scan_marking_revisions.revision + 1;
  return jsonb_build_object('status', 'saved', 'version', m.result_version, 'parent', v_parent, 'child', m.child_id);
end $$;
revoke all on function public.admin_set_scan_mark(uuid, int, text) from public, anon;
grant execute on function public.admin_set_scan_mark(uuid, int, text) to authenticated;
