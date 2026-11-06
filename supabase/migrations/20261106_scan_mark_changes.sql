-- S5. Numeric parent judgments use canonical versions, independently of image lifetime.
-- Automatic marking still runs the unchanged S4 sheet/photo/lease checks.
create table public.scan_mark_changes (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.scan_marking_items(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  from_version int not null,
  to_version int not null check (to_version=from_version+1),
  actor text not null default 'parent' check (actor='parent'),
  changed_at timestamptz not null default clock_timestamp(),
  previous jsonb not null,
  current jsonb not null,
  unique(item_id,to_version),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade
);
alter table public.scan_mark_changes enable row level security;
revoke all on public.scan_mark_changes from public,anon,authenticated,service_role;
grant select on public.scan_mark_changes to service_role;
revoke all on sequence public.scan_mark_changes_id_seq from public,anon,authenticated,service_role;
create trigger fence_family_write before insert or update on public.scan_mark_changes
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.scan_mark_changes
  for each row execute function public.fence_child_delete_write();
create function public.refuse_scan_mark_change_update() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'mark_change_immutable'; end $$;
create trigger immutable_change before update on public.scan_mark_changes
  for each row execute function public.refuse_scan_mark_change_update();
create index scan_mark_changes_page_history on public.scan_mark_changes(parent_id,id);

-- Preserve the deployed automatic command, including its current whole-sheet checks.
alter function public.scan_marking_command(text,uuid,uuid,uuid,jsonb) rename to scan_marking_automatic_command;
revoke all on function public.scan_marking_automatic_command(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.scan_marking_command(p_action text,p_parent uuid,p_photo uuid,p_token uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  s public.scan_photos; m public.scan_marking_items; next_o jsonb; intent jsonb;
  answer jsonb; at_time timestamptz; q public.workbook_questions; page_number int;
begin
  if p_action not in ('change','changes') then
    return public.scan_marking_automatic_command(p_action,p_parent,p_photo,p_token,p_data);
  end if;
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  select * into s from public.scan_photos where id=p_photo and parent_id=p_parent;
  if not found or not exists(select 1 from public.children where id=s.child_id and parent_id=p_parent)
    or exists(select 1 from public.child_deletions where child_id=s.child_id) then return '"refused"'; end if;
  -- A terminal photo row remains an identity reference only. No storage or image admission occurs here.
  if p_action='changes' then
    if coalesce(p_data->>'after','0') !~ '^[0-9]{1,18}$' then return '"refused"'; end if;
    select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]') into answer from (
      select h.* from public.scan_mark_changes h join public.scan_marking_items i on i.id=h.item_id
      where h.parent_id=p_parent and h.child_id=s.child_id and i.workbook_id=s.workbook_id
        and i.page_id=s.page_id and i.printed_revision=s.printed_revision
        and h.id>coalesce((p_data->>'after')::bigint,0) order by h.id limit 100
    ) h;
    return answer;
  end if;
  if p_data->>'result' is null or p_data->>'result' not in ('right','wrong','blank')
    or jsonb_typeof(p_data->'version') is distinct from 'number'
    or (p_data->>'version') !~ '^[1-9][0-9]{0,8}$' then return '"refused"'; end if;
  select * into m from public.scan_marking_items where parent_id=p_parent and child_id=s.child_id
    and workbook_id=s.workbook_id and page_id=s.page_id and printed_revision=s.printed_revision
    and item_id=p_data->>'itemId' for update;
  if not found or m.expected->>'method' not in ('code','parent') then return '"refused"'; end if;
  if m.result_version<>(p_data->>'version')::int then
    return jsonb_build_object('status','conflict','mark',to_jsonb(m));
  end if;
  at_time:=clock_timestamp();
  -- Keep reading, typed values, photo reference, help and trusted eligibility. The parent changes only the judgment.
  next_o:=m.observation||jsonb_build_object('state','parent-checked','method','parent','actor','parent',
    'result',p_data->>'result','resultVersion',m.result_version+1);
  intent:=m.original_event;
  if intent is null and m.expected->'mastery'->>'eligible'='true' then
    select * into q from public.workbook_questions where page_id=m.page_id and parent_id=p_parent
      and question_number=(m.expected->>'number')::int;
    select p.page_number into page_number from public.workbook_pages p where p.id=m.page_id;
    if q.package->'skill' is null then raise exception 'mark_change_missing_skill'; end if;
    intent:=jsonb_build_object('key','marking:'||encode(sha256(convert_to(m.workbook_id::text||':'||m.printed_revision||':'||m.page_id::text||':'||m.item_id,'UTF8')),'hex'),
      'parentId',p_parent,'childId',m.child_id,'source','marking',
      'question',jsonb_build_object('source','workbook','workbookId',m.workbook_id,'page',page_number,'question',q.question_number),
      'skill',q.package->'skill','result',p_data->>'result','stuckStep',null,'mistake',null,'hints',0,'timeMs',null,
      'occurredAt',at_time,'evidence',jsonb_build_object('kind','scan','id',p_photo));
  end if;
  insert into public.scan_mark_changes(item_id,parent_id,child_id,from_version,to_version,changed_at,previous,current)
    values(m.id,p_parent,m.child_id,m.result_version,m.result_version+1,at_time,to_jsonb(m),next_o);
  update public.scan_marking_items set observation=next_o,result_version=result_version+1,owner_photo=null,
    original_event=intent,evidence_at=at_time where id=m.id returning * into m;
  insert into public.scan_marking_revisions(child_id,parent_id,revision) values(m.child_id,p_parent,1)
    on conflict(child_id) do update set revision=scan_marking_revisions.revision+1;
  return jsonb_build_object('status','saved','mark',to_jsonb(m));
end $$;
revoke all on function public.scan_marking_command(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.scan_marking_command(text,uuid,uuid,uuid,jsonb) to service_role;

-- A facts-only fallback must not acknowledge unfinished skill history. Old callers can still send an array.
-- The pending flag and the facts commit together, so a restart cannot lose the retry.
create or replace function public.save_marked_child_profile(p_child uuid,p_parent uuid,p_marking_revision bigint,p_assessment uuid,p_expected uuid,p_schema_version smallint,p_profile jsonb,p_changes jsonb,p_tests uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare answer jsonb; changes jsonb; pending boolean;
begin
  changes:=case when jsonb_typeof(p_changes)='object' then p_changes->'rows' else p_changes end;
  pending:=jsonb_typeof(p_changes)='object' and p_changes->'pending'='true'::jsonb;
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  if not exists(select 1 from public.children where id=p_child and parent_id=p_parent)
    or exists(select 1 from public.child_deletions where child_id=p_child) then raise exception 'child_unavailable' using errcode='55000'; end if;
  insert into public.scan_marking_revisions(child_id,parent_id) values(p_child,p_parent) on conflict(child_id) do nothing;
  perform 1 from public.scan_marking_revisions where child_id=p_child and parent_id=p_parent and revision=p_marking_revision for update;
  if not found then return null; end if;
  answer:=public.save_child_profile_and_skill_changes_from_tests(p_child,p_parent,p_assessment,p_expected,p_schema_version,p_profile,changes,p_tests);
  if answer is not null then
    update public.scan_marking_revisions set profile_revision=case when pending then p_marking_revision-1 else p_marking_revision end where child_id=p_child;
  end if;
  return answer;
exception when unique_violation then return null;
end $$;
