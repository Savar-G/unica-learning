-- Keeps the existing family and child deletion fences, live Admin authorization, ownership, delivered-book and
-- printed-revision checks, request identity and hash checks, cutoff and retry checks, marking revision fence,
-- frozen book and delivery checks, and Book 1 baseline and correction ledger checks.
-- Draft only: version 3 saves are refused until the multi-skill implementation is reviewed.
-- Versions 1 and 2 retain their existing validation.
alter table public.workbook_plan_previews drop constraint workbook_plan_previews_engine_check;
alter table public.workbook_plan_previews add constraint workbook_plan_previews_engine_check check (engine in (
  'workbook-preview-sources/1;progress/1;history/1;plan-preview/1',
  'workbook-preview-sources/2;progress/1;history/1;plan-preview/1;book1-baseline/1',
  'workbook-preview-sources/3;progress/1;history/1;plan-preview/1;book1-baseline/1'));

create or replace function public.workbook_preview_command(p_action text,p_actor uuid,p_parent uuid,p_child uuid,p_book uuid,
  p_revision text,p_request uuid,p_payload text default null,p_hash text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.workbooks; existing public.workbook_plan_previews; doc jsonb; req jsonb; source_book jsonb;
  current_revision bigint; delivery_audit bigint; delivered timestamptz; selected_cutoff timestamptz; v2 boolean; v3 boolean; book1 jsonb;
  bound public.workbook_book1_baselines; tries integer;
begin
  if p_action not in ('read','save') or p_request is null then return jsonb_build_object('status','unavailable'); end if;
  -- Parent SHARE precedes the scan lock, matching marking, correction and child-deletion lock order.
  perform public.assert_family_writable(p_parent);
  perform 1 from public.admin_users where user_id=p_actor for share;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  if not exists(select 1 from public.children where id=p_child and parent_id=p_parent)
    or exists(select 1 from public.family_deletions where parent_id=p_parent)
    or exists(select 1 from public.child_deletions where child_id=p_child)
    or not exists(select 1 from public.workbooks wb join public.workbook_delivery_receipts r on r.workbook_id=wb.id
      where wb.id=p_book and wb.parent_id=p_parent and wb.child_id=p_child and wb.status='shipped' and wb.printed_revision=p_revision
        and r.parent_id=p_parent and r.child_id=p_child and r.number=wb.number)
    then return jsonb_build_object('status','unavailable'); end if;
  select * into w from public.workbooks where id=p_book and parent_id=p_parent and child_id=p_child for share;
  select * into existing from public.workbook_plan_previews where id=p_request;
  if found and (existing.parent_id,existing.child_id,existing.workbook_id,existing.printed_revision,existing.actor_id)
    is distinct from (p_parent,p_child,p_book,p_revision,p_actor) then return jsonb_build_object('status','conflict'); end if;
  if p_action='read' then
    if existing.id is null then return jsonb_build_object('status','missing'); end if;
    return jsonb_build_object('status','found','payload',existing.payload,'hash',existing.payload_hash);
  end if;
  if p_payload is null or octet_length(p_payload) not between 2 and 4000000 or p_hash is null
    or p_hash<>encode(sha256(convert_to(p_payload,'UTF8')),'hex') then return jsonb_build_object('status','conflict'); end if;
  doc:=p_payload::jsonb; req:=doc->'request';
  v3:=doc->>'version'='3';
  v2:=doc->>'version'='2' or v3;
  if v3 then return jsonb_build_object('status','unavailable'); end if;
  if coalesce((case when v2 then doc->>'engine' is distinct from (case when v3 then 'workbook-preview-sources/3;progress/1;history/1;plan-preview/1;book1-baseline/1' else 'workbook-preview-sources/2;progress/1;history/1;plan-preview/1;book1-baseline/1' end)
        or (v3 and (jsonb_typeof(doc->'outcome'->'decisions') is distinct from 'array' or jsonb_typeof(doc->'outcome'->'consumedVersions') is distinct from 'array'))
        or doc->'frozen'->>'version' is distinct from '2' or coalesce(jsonb_typeof(doc->'frozen'->'book1'),'missing') not in ('object','null')
        or doc->'outcome'->>'availability' not in ('unavailable','held','complete')
        or (doc->'outcome'->>'availability'='complete') <> (jsonb_typeof(doc->'outcome'->'plan')='object' and jsonb_typeof(doc->'outcome'->'decision')='object')
        or (doc->'outcome'->>'availability'<>'complete' and (doc->'outcome'->'decision' is distinct from 'null'::jsonb or doc->'outcome'->'plan' is distinct from 'null'::jsonb))
        -- A real plan needs its Book 1 sources (review on #472b): complete with book1 null is refused here too.
        or (doc->'outcome'->>'availability'='complete' and jsonb_typeof(doc->'frozen'->'book1') is distinct from 'object')
      else doc->>'version' is distinct from '1' or doc->>'engine' is distinct from 'workbook-preview-sources/1;progress/1;history/1;plan-preview/1'
        or doc->'frozen'->>'version' is distinct from '1'
        or doc->'outcome'->>'availability' is distinct from 'unavailable' or doc->'outcome'->'decision' is distinct from 'null'::jsonb
        or doc->'outcome'->'plan' is distinct from 'null'::jsonb or doc->'outcome'->'consumedVersions' is distinct from '[]'::jsonb end)
    or doc->>'actorId' is distinct from p_actor::text or req->>'version' is distinct from '1' or req->>'requestId' is distinct from p_request::text
    or req->>'parentId' is distinct from p_parent::text or req->>'childId' is distinct from p_child::text
    or req->>'workbookId' is distinct from p_book::text or req->>'printedRevision' is distinct from p_revision
    or req->>'scope' not in ('day7','later-book','backstop') or jsonb_typeof(req->'selection') is distinct from 'object'
    or doc->'frozen'->>'parentId' is distinct from p_parent::text
    or doc->'frozen'->>'childId' is distinct from p_child::text or jsonb_typeof(doc->'frozen'->'books') is distinct from 'array'
    or (req->>'cutoff') !~ '^[0-9]{1,16}$', true) then return jsonb_build_object('status','conflict'); end if;
  if jsonb_array_length(doc->'frozen'->'books') not between 1 and 20
    or (select count(*) from jsonb_array_elements(doc->'frozen'->'books') b where b->'book'->>'id'=p_book::text)<>1
    then return jsonb_build_object('status','conflict'); end if;
  selected_cutoff:=to_timestamp((req->>'cutoff')::numeric/1000);
  if selected_cutoff>clock_timestamp() then return jsonb_build_object('status','unavailable'); end if;
  -- Lost-response retries keep the first exact input/result, even if later evidence changes.
  if existing.id is not null then
    if existing.payload<>p_payload or existing.payload_hash<>p_hash then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','duplicate');
  end if;
  select revision into current_revision from public.scan_marking_revisions where parent_id=p_parent and child_id=p_child;
  if to_jsonb(current_revision) is distinct from nullif(doc->'frozen'->'markingRevision','null'::jsonb) then return jsonb_build_object('status','unavailable'); end if;
  for source_book in select value from jsonb_array_elements(doc->'frozen'->'books') loop
    select * into w from public.workbooks where id=(source_book->'book'->>'id')::uuid and parent_id=p_parent and child_id=p_child for share;
    if not found or w.status<>'shipped' or w.printed_revision is distinct from source_book->'book'->>'printed_revision'
      or w.print_manifest is distinct from source_book->'book'->'print_manifest' then return jsonb_build_object('status','unavailable'); end if;
    select coalesce((select max(audit_id) from public.workbook_delivery_corrections where workbook_id=w.id),r.audit_id),
      coalesce((select c.delivered_at from public.workbook_delivery_corrections c where c.workbook_id=w.id order by audit_id desc limit 1),r.delivered_at)
      into delivery_audit,delivered from public.workbook_delivery_receipts r where r.workbook_id=w.id and r.parent_id=p_parent and r.child_id=p_child;
    if delivery_audit is distinct from (source_book->'delivery'->>'auditId')::bigint
      or delivered is distinct from (source_book->'delivery'->>'deliveredAt')::timestamptz or delivered>selected_cutoff then return jsonb_build_object('status','unavailable'); end if;
  end loop;
  -- Version 2: the frozen Book 1 baseline is still the stored one, with the same boundary and ledger size.
  book1:=doc->'frozen'->'book1';
  if v2 and jsonb_typeof(book1)='object' then
    select * into bound from public.workbook_book1_baselines where id=(book1->'baseline'->>'id')::uuid and parent_id=p_parent and child_id=p_child and draft_id=p_book;
    select count(*) into tries from public.workbook_second_tries where baseline_id=bound.id;
    if bound.id is null or bound.payload_hash is distinct from book1->'baseline'->>'hash' or bound.boundary_at is distinct from (book1->'corrections'->>'boundaryAt')::timestamptz
      or tries is distinct from (book1->'corrections'->>'count')::integer then return jsonb_build_object('status','unavailable'); end if;
  end if;
  select * into w from public.workbooks where id=p_book;
  insert into public.workbook_plan_previews(id,parent_id,child_id,workbook_id,number,printed_revision,actor_id,engine,cutoff,payload,payload_hash)
    values(p_request,p_parent,p_child,p_book,w.number,p_revision,p_actor,doc->>'engine',selected_cutoff,p_payload,p_hash)
    on conflict(id) do nothing;
  if not found then
    select * into existing from public.workbook_plan_previews where id=p_request;
    if existing.payload<>p_payload or existing.payload_hash<>p_hash then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','duplicate');
  end if;
  return jsonb_build_object('status','saved');
end $$;
