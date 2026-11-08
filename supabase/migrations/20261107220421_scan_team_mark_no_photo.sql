-- #715 review P3: one rule for "can be marked". An answer that counts toward progress, with no learning event yet and no
-- saved photo, cannot be marked by our team: its event must name the photo it came from. admin_set_scan_mark now answers
-- 'no_photo' for it and saves nothing (it used to raise), and /admin/scans shows no buttons for it. Every other waiting
-- answer can be marked as before. Replaces the function body only; signature, return type and grants stay the same.

create or replace function public.admin_set_scan_mark(p_item uuid, p_version int, p_result text)
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
    or (m.observation->>'state' = 'pending' and m.model is null and coalesce(m.observation->>'certainty', 'not-read') = 'not-read') then
    return jsonb_build_object('status', 'not_waiting', 'version', m.result_version);
  end if;
  v_photo := coalesce(m.observation->'evidence'->>'photoRevision', m.owner_photo::text);
  -- An answer that counts toward progress and has no event yet needs a photo for its event's evidence. Without one it
  -- cannot be marked here; the list shows why (teamMarkNeedsPhoto in src/lib/scan-team-marks.ts). Nothing is saved.
  if m.original_event is null and m.expected->'mastery'->>'eligible' = 'true' and v_photo is null then
    return jsonb_build_object('status', 'no_photo', 'version', m.result_version);
  end if;
  at_time := clock_timestamp();
  -- Keep the reading, typed values, photo reference, help and trusted eligibility. The team sets only the mark.
  next_o := m.observation||jsonb_build_object('state', 'parent-checked', 'method', 'parent', 'actor', 'admin',
    'result', p_result, 'resultVersion', m.result_version + 1);
  intent := m.original_event;
  if intent is null and m.expected->'mastery'->>'eligible' = 'true' then
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
