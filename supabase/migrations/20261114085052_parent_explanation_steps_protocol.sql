-- #971: the parent explanation now sends code-written solving steps for questions filled from a step template, so
-- an explanation made before them must not be read again. The context hash of parent_explanation_command names the
-- request protocol: it moves from parent-problem-v1 to parent-problem-v2. Only that line changes, from the live
-- definition. The price row keeps protocol parent-problem-v1: the model, the input bytes and the token limit are the
-- same, so the price check is unchanged. Additive: live code reads the context only as an opaque hash.
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
  payload:=jsonb_build_object('protocol','parent-problem-v2','mark',jsonb_build_array(m.id,m.expected,m.observation,m.result_version),
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
