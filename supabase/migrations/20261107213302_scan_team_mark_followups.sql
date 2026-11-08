-- #715 review follow-ups. Replaces three function bodies; signatures, return types and grants stay the same. No DROP.
--
-- 1. parent_explanation_command: a code-marked item finished by a person counts as finished whether the person was the
--    parent or our team (actor 'admin'). Before this, a team mark left its item "unfinished" here, so no explanation on
--    that page could be admitted. The body is the live one with only that line changed.
-- 2. One waiting rule for our team, the same as waitsForTeam in src/lib/scan-marking.ts: an item with no result waits
--    for the team when it is an old format a person marks, or when the AI read it (a model on the row, or a reading
--    whose certainty is not 'not-read'). admin_scan_team_queue and admin_set_scan_mark both use it.

CREATE OR REPLACE FUNCTION public.parent_explanation_command(p_action text, p_parent uuid, p_photo uuid, p_token uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.scan_photos; m public.scan_marking_items; q public.workbook_questions;
  w public.workbooks; page public.workbook_pages; cached public.parent_explanations; price public.parent_explanation_prices;
  ctx text; payload jsonb; budget_period date; held bigint; dispatch uuid; cost bigint; at_time timestamptz;
  checked_item record; terminal boolean; expected_regions jsonb; observed_regions jsonb; page_items int:=0;
begin
  -- Reconciliation never needs private ownership and remains possible after cascade deletion.
  if p_action='settle' then
    if p_parent is not null or p_photo is not null or p_token is null then return 'false'; end if;
    if p_data->>'cost' is null then return 'true'; end if;
    if (p_data->>'cost') !~ '^[0-9]{1,15}$' then return 'false'; end if;
    cost:=(p_data->>'cost')::bigint;
    perform pg_advisory_xact_lock(hashtextextended('parent-explanation-budget',0));
    -- Record over-bound actual usage. Its presence blocks ALL future dispatches until investigated.
    -- A second report cannot reduce a known charge, and null never means zero.
    update public.parent_explanation_spend set charged_micros=greatest(coalesce(charged_micros,0),cost),settled_at=clock_timestamp() where id=p_token;
    return to_jsonb(found);
  end if;
  if p_action not in ('context','claim','admit','finish','read','release') then return 'null'; end if;
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  if jsonb_typeof(p_data->'version') is distinct from 'number' or (p_data->>'version') !~ '^[1-9][0-9]{0,8}$' then return 'null'; end if;
  select * into s from public.scan_photos where id=p_photo and parent_id=p_parent;
  if not found or not exists(select 1 from public.children where id=s.child_id and parent_id=p_parent)
    or exists(select 1 from public.child_deletions where child_id=s.child_id) then return 'null'; end if;
  select * into m from public.scan_marking_items where parent_id=p_parent and child_id=s.child_id
    and workbook_id=s.workbook_id and page_id=s.page_id and printed_revision=s.printed_revision
    and item_id=p_data->>'itemId' for update;
  if not found or m.result_version<>(p_data->>'version')::int or coalesce(m.expected->>'method','') not in ('code','parent')
    or coalesce(m.observation->>'state','') not in ('scored','parent-checked') or m.observation->>'result' is distinct from 'wrong'
    or coalesce(m.observation->>'certainty','')<>'certain'
    or jsonb_typeof(m.observation->'readAnswerText') is distinct from 'string'
    or length(btrim(m.observation->>'readAnswerText')) not between 1 and 200 then return 'null'; end if;
  if m.expected->'identity' is distinct from jsonb_build_object('workbookId',m.workbook_id,'printedRevision',m.printed_revision,'pageId',m.page_id,'itemId',m.item_id)
    or m.observation->'identity' is distinct from m.expected->'identity' then return 'null'; end if;
  select * into w from public.workbooks where id=m.workbook_id and parent_id=p_parent and child_id=s.child_id;
  if not found or w.status<>'shipped' or w.printed_revision is distinct from m.printed_revision then return 'null'; end if;
  select * into page from public.workbook_pages where id=m.page_id and workbook_id=m.workbook_id and parent_id=p_parent;
  if not found or page.print_contract is null then return 'null'; end if;
  select * into q from public.workbook_questions where page_id=m.page_id and workbook_id=m.workbook_id and parent_id=p_parent
    and question_number=(m.expected->>'number')::int and package->>'id'=m.item_id;
  if not found or q.package->'ref'->>'source' is distinct from 'workbook'
    or q.package->'ref'->>'workbookId' is distinct from m.workbook_id::text
    or q.package->'ref'->>'page' is distinct from page.page_number::text
    or q.package->'ref'->>'question' is distinct from q.question_number::text then return 'null'; end if;
  -- Match pageCompletion: no solution while a printed item is missing, pending or awaiting its parent check.
  -- The scan-family lock serializes this gate with corrections and marking application. Run it for every action,
  -- including admission, final publication and cached reads, rather than trusting an earlier browser snapshot.
  for checked_item in
    select pq.question_number,pm.id,pm.item_id,pm.expected,pm.observation,pm.result_version
    from public.workbook_questions pq left join public.scan_marking_items pm
      on pm.parent_id=p_parent and pm.child_id=s.child_id and pm.workbook_id=m.workbook_id
      and pm.page_id=m.page_id and pm.printed_revision=m.printed_revision
      and pm.item_id=coalesce(pq.package->>'id','question-'||pq.question_number::text)
    where pq.parent_id=p_parent and pq.workbook_id=m.workbook_id and pq.page_id=m.page_id
  loop
    page_items:=page_items+1;
    if checked_item.id is null
      or checked_item.expected->>'number' is distinct from checked_item.question_number::text
      or checked_item.expected->'identity' is distinct from jsonb_build_object('workbookId',m.workbook_id,'printedRevision',m.printed_revision,'pageId',m.page_id,'itemId',checked_item.item_id)
      or checked_item.observation->'identity' is distinct from checked_item.expected->'identity'
      or checked_item.observation->>'resultVersion' is distinct from checked_item.result_version::text then return 'null'; end if;
    terminal:=false;
    if checked_item.expected->>'method'='code' then
      if checked_item.observation->>'state'='parent-checked' then
        terminal:=checked_item.observation->>'actor' in ('parent','admin') and checked_item.observation->>'result' in ('right','wrong','blank');
      elsif checked_item.observation->>'state'='scored'
        and checked_item.observation->>'result' in ('right','wrong','blank')
        and jsonb_typeof(checked_item.expected->'scoredRegions')='array'
        and jsonb_typeof(checked_item.observation->'regions')='array' then
        select coalesce(jsonb_agg(region order by region),'[]') into expected_regions from jsonb_array_elements(checked_item.expected->'scoredRegions') region;
        select coalesce(jsonb_agg(region->'regionId' order by region->'regionId'),'[]') into observed_regions from jsonb_array_elements(checked_item.observation->'regions') region;
        terminal:=expected_regions=observed_regions;
      end if;
    elsif checked_item.expected->>'method'='parent' then
      terminal:=checked_item.observation->>'state'='parent-checked' and checked_item.observation->>'result' in ('right','wrong','blank');
    elsif checked_item.expected->>'method'='unscored' then
      terminal:=checked_item.observation->>'state'='unscored' and checked_item.observation->'result'='null'::jsonb;
    end if;
    if not coalesce(terminal,false) then return 'null'; end if;
  end loop;
  if page_items<>(select count(*) from public.scan_marking_items pm where pm.parent_id=p_parent and pm.child_id=s.child_id
    and pm.workbook_id=m.workbook_id and pm.page_id=m.page_id and pm.printed_revision=m.printed_revision) then return 'null'; end if;
  payload:=jsonb_build_object('protocol','parent-problem-v1','mark',jsonb_build_array(m.id,m.expected,m.observation,m.result_version),
    'question',jsonb_build_array(q.id,q.schema_version,q.package,q.teaching,q.regions),'print',jsonb_build_array(w.printed_revision,page.print_contract));
  ctx:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  if p_action='context' then return jsonb_build_object('parent',p_parent,'child',s.child_id,'workbook',w.id,'revision',w.printed_revision,
    'page',page.id,'pageNumber',page.page_number,'itemId',m.item_id,'number',q.question_number,'version',m.result_version,'context',ctx,
    'package',q.package,'schemaVersion',q.schema_version,'teaching',q.teaching,'regions',q.regions,'readAnswer',m.observation->>'readAnswerText'); end if;
  if p_data->>'context' is distinct from ctx then return '"refused"'; end if;
  select * into cached from public.parent_explanations where item_id=m.id and context=ctx for update;
  if p_action='claim' then
    if cached.explanation is not null then return jsonb_build_object('explanation',cached.explanation); end if;
    if cached.lease_until>clock_timestamp() then return '"busy"'; end if;
    if p_token is null then return '"refused"'; end if;
    insert into public.parent_explanations(item_id,context,parent_id,child_id,lease_token,lease_until)
      values(m.id,ctx,p_parent,s.child_id,p_token,clock_timestamp()+interval '20 seconds')
      on conflict(item_id,context) do update set lease_token=p_token,lease_until=clock_timestamp()+interval '20 seconds';
    return '"claimed"';
  end if;
  if p_action='read' then return cached.explanation; end if;
  if cached.item_id is null or cached.lease_token is distinct from p_token or cached.lease_until<=clock_timestamp()
    or cached.explanation is not null then return '"refused"'; end if;
  if p_action='release' then
    update public.parent_explanations set lease_until=clock_timestamp() where item_id=m.id and context=ctx; return 'true';
  end if;
  if p_action='finish' then
    payload:=p_data->'explanation';
    if jsonb_typeof(payload) is distinct from 'object' or (select count(*) from jsonb_object_keys(payload))<>2
      or jsonb_typeof(payload->'steps') is distinct from 'array' or jsonb_typeof(payload->'say') is distinct from 'string'
      or length(btrim(payload->>'say')) not between 1 and 300 or jsonb_array_length(payload->'steps') not between 1 and 4 then return 'false'; end if;
    if exists(select 1 from jsonb_array_elements(payload->'steps') step where jsonb_typeof(step)<>'string' or length(btrim(step#>>'{}')) not between 1 and 240)
      or payload::text ~* '</?[a-z][^>]*>|https?:|www\.|\]\(' then return 'false'; end if;
    update public.parent_explanations set explanation=payload where item_id=m.id and context=ctx;
    return 'true';
  end if;
  if p_action='admit' then
    perform pg_advisory_xact_lock(hashtextextended('parent-explanation-budget',0));
    -- Database clock AFTER lock wait owns both eligibility deadline and the UTC budget period.
    at_time:=clock_timestamp();
    if cached.lease_until<=at_time then return '"refused"'; end if;
    select * into price from public.parent_explanation_prices where model=p_data->>'model' and enabled;
    if not found or price.verified_at>at_time or price.verified_at<=at_time-interval '24 hours'
      or price.protocol<>'parent-problem-v1' or price.max_input_bytes<>16384 or price.max_tokens<>768 then return '"unavailable"'; end if;
    budget_period:=date_trunc('month',at_time at time zone 'UTC')::date;
    if exists(select 1 from public.parent_explanation_spend where charged_micros>reserved_micros) then return '"cap"'; end if;
    select coalesce(sum(coalesce(charged_micros,reserved_micros)),0) into held from public.parent_explanation_spend where period=budget_period;
    if held+price.maximum_micros>10000000 then return '"cap"'; end if;
    insert into public.parent_explanation_spend(period,model,reserved_micros) values(budget_period,price.model,price.maximum_micros) returning id into dispatch;
    insert into public.parent_explanation_dispatches(id,item_id,context,parent_id,child_id) values(dispatch,m.id,ctx,p_parent,s.child_id);
    return jsonb_build_object('dispatch',dispatch);
  end if;
  return 'null';
end $function$
;

create or replace function public.admin_scan_team_queue(p_limit int default 100)
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
    and (i.observation->>'state' = 'parent-pending' or i.model is not null or coalesce(i.observation->>'certainty', 'not-read') <> 'not-read')
    and not exists (select 1 from public.child_deletions d where d.child_id = i.child_id)
    and not exists (select 1 from public.family_deletions d where d.parent_id = i.parent_id)
  order by i.evidence_at, i.id
  limit p_limit;
end $$;

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
