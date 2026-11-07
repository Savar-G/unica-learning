-- #472. Immutable Admin source previews only. No issue/admission, trigger, queue or generated-book write.
create table public.workbook_plan_previews (
  id uuid primary key,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  number integer not null,
  printed_revision text not null check(printed_revision ~ '^[0-9a-f]{28}$'),
  actor_id uuid not null,
  engine text not null check(engine='workbook-preview-sources/1;progress/1;history/1;plan-preview/1'),
  cutoff timestamptz not null,
  -- Store exact canonical UTF-8 bytes, not a jsonb reserialization with different number/key formatting.
  payload text not null check(octet_length(payload) between 2 and 4000000),
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'
    and payload_hash=encode(sha256(convert_to(payload,'UTF8')),'hex')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  foreign key(workbook_id,parent_id,child_id,number) references public.workbooks(id,parent_id,child_id,number) on delete cascade
);
create index workbook_plan_previews_family on public.workbook_plan_previews(parent_id,child_id,workbook_id);
alter table public.workbook_plan_previews enable row level security;
revoke all on public.workbook_plan_previews from public,anon,authenticated,service_role;
grant select on public.workbook_plan_previews to authenticated,service_role;
create policy workbook_plan_previews_service_read on public.workbook_plan_previews for select to service_role using(true);
-- The protected deletion tables have no authenticated grants. Read their fence through a narrowly scoped helper.
-- No private payload is returned by this predicate.
create function public.workbook_preview_access(p_parent uuid,p_child uuid,p_book uuid,p_revision text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admin_users where user_id=auth.uid())
    and exists(select 1 from public.parents where id=p_parent and deletion_requested_at is null)
    and exists(select 1 from public.children where id=p_child and parent_id=p_parent)
    and not exists(select 1 from public.family_deletions where parent_id=p_parent)
    and not exists(select 1 from public.child_deletions where child_id=p_child)
    and exists(select 1 from public.workbooks w join public.workbook_delivery_receipts r on r.workbook_id=w.id
      where w.id=p_book and w.parent_id=p_parent and w.child_id=p_child and w.status='shipped' and w.printed_revision=p_revision
        and r.parent_id=p_parent and r.child_id=p_child and r.number=w.number);
$$;
revoke all on function public.workbook_preview_access(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
-- RLS uses only the real session actor. No user-supplied actor can confer browser access.
create policy workbook_plan_previews_admin_read on public.workbook_plan_previews for select to authenticated using(
  actor_id=auth.uid() and public.workbook_preview_access(parent_id,child_id,workbook_id,printed_revision)
);
grant execute on function public.workbook_preview_access(uuid,uuid,uuid,text) to authenticated;
create trigger fence_family_write before insert or update on public.workbook_plan_previews
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.workbook_plan_previews
  for each row execute function public.fence_child_delete_write();
create function public.immutable_workbook_preview() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'immutable_preview' using errcode='55000'; end $$;
revoke all on function public.immutable_workbook_preview() from public,anon,authenticated,service_role;
create trigger immutable_workbook_preview before update on public.workbook_plan_previews
  for each row execute function public.immutable_workbook_preview();

create function public.workbook_preview_command(p_action text,p_actor uuid,p_parent uuid,p_child uuid,p_book uuid,
  p_revision text,p_request uuid,p_payload text default null,p_hash text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.workbooks; existing public.workbook_plan_previews; doc jsonb; req jsonb; source_book jsonb;
  current_revision bigint; delivery_audit bigint; delivered timestamptz; selected_cutoff timestamptz;
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
  if doc->>'version' is distinct from '1' or doc->>'engine' is distinct from 'workbook-preview-sources/1;progress/1;history/1;plan-preview/1'
    or doc->>'actorId' is distinct from p_actor::text or req->>'version' is distinct from '1' or req->>'requestId' is distinct from p_request::text
    or req->>'parentId' is distinct from p_parent::text or req->>'childId' is distinct from p_child::text
    or req->>'workbookId' is distinct from p_book::text or req->>'printedRevision' is distinct from p_revision
    or req->>'scope' not in ('day7','later-book','backstop') or jsonb_typeof(req->'selection') is distinct from 'object'
    or doc->'frozen'->>'version' is distinct from '1' or doc->'frozen'->>'parentId' is distinct from p_parent::text
    or doc->'frozen'->>'childId' is distinct from p_child::text or jsonb_typeof(doc->'frozen'->'books') is distinct from 'array'
    or doc->'outcome'->>'availability' is distinct from 'unavailable' or doc->'outcome'->'decision' is distinct from 'null'::jsonb
    or doc->'outcome'->'plan' is distinct from 'null'::jsonb or doc->'outcome'->'consumedVersions' is distinct from '[]'::jsonb
    or (req->>'cutoff') !~ '^[0-9]{1,16}$' then return jsonb_build_object('status','conflict'); end if;
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
revoke all on function public.workbook_preview_command(text,uuid,uuid,uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.workbook_preview_command(text,uuid,uuid,uuid,uuid,text,uuid,text,text) to service_role;
