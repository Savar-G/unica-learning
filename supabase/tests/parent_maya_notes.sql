-- #419. Only synthetic rows. The transaction rolls back all of them.
begin;
do $$
declare
  p uuid := gen_random_uuid(); other_p uuid := gen_random_uuid();
  ch uuid := gen_random_uuid(); other_ch uuid := gen_random_uuid();
  chat uuid := gen_random_uuid(); other_chat uuid := gen_random_uuid();
  no_note uuid := gen_random_uuid(); live_chat uuid := gen_random_uuid();
  c uuid; owner uuid; kid uuid; n integer;
begin
  insert into auth.users(id, email) values(p, p::text || '@example.invalid'), (other_p, other_p::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Notes test', p::text || '@example.invalid', 'V3S 1A1'),
    (other_p, 'Other notes test', other_p::text || '@example.invalid', 'M5V 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values
    (ch,p,'Sample',3,'BC'), (other_ch,other_p,'Other sample',3,'ON');
  foreach c in array array[chat,other_chat,no_note,live_chat] loop
    owner := case when c=other_chat then other_p else p end;
    kid := case when c=other_chat then other_ch else ch end;
    insert into public.maya_calls(id,parent_id,child_id,kind,mode,question_source,workbook_id,workbook_page,workbook_question,
      package_id,package_hash,model,prompt_version,versions,status,started_at,ended_at,outcome_reason,trace,live)
    values(c,owner,kid,'chat','text','workbook',gen_random_uuid(),23,4,'r419-fixture','sha256:'||repeat('a',64),
      'fixture','fixture','{}',case when c=live_chat then 'live' else 'ended' end,
      '2026-11-08T01:00:00Z',case when c=live_chat then null else '2026-11-08T01:06:00Z'::timestamptz end,
      case when c=live_chat then null else 'solved' end,jsonb_build_object('callId',c),case when c=live_chat then '{}'::jsonb else null end);
    if c in (chat,other_chat) then
      insert into public.maya_call_notes(call_id,parent_id,child_id,call_ended_at,facts,sentences,writer,transcript)
      values(c,owner,kid,'2026-11-08T01:06:00Z','{}','["Sample note"]','code','[{"speaker":"child","text":"Private transcript","second":0}]');
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub',p::text,true);
  set local role authenticated;
  if (select count(*) from public.maya_call_notes where call_id in (chat,other_chat)) <> 1 then raise exception 'Owner notes RLS failed'; end if;
  if (select transcript->0->>'text' from public.maya_call_notes where call_id=chat) <> 'Private transcript' then raise exception 'Owner transcript missing'; end if;
  if exists(select 1 from public.maya_call_notes where call_id=other_chat) then raise exception 'Other transcript exposed'; end if;
  if exists(select 1 from public.maya_calls where id in (chat,other_chat)) then raise exception 'Internal calls exposed'; end if;
  select count(*) into n from public.parent_maya_note_sessions(array[chat,other_chat,no_note,live_chat]);
  if n <> 1 then raise exception 'Metadata ownership or note-only filter failed: %',n; end if;
  if not exists(select 1 from public.parent_maya_note_sessions(array[chat]) where channel='chat' and started_at='2026-11-08T01:00:00Z') then raise exception 'Wrong metadata'; end if;
  if exists(select 1 from public.parent_maya_note_sessions(array_fill(chat,array[101]))) then raise exception 'Unbounded input allowed'; end if;
  begin
    update public.maya_call_notes set transcript='[]' where call_id=chat;
    raise exception 'Parent can change transcript';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',other_p::text,true);
  if exists(select 1 from public.maya_call_notes where call_id=chat) then raise exception 'Other family read note or transcript'; end if;
  if exists(select 1 from public.parent_maya_note_sessions(array[chat])) then raise exception 'Other family read metadata'; end if;
  if (select count(*) from public.parent_maya_note_sessions(array[other_chat])) <> 1 then raise exception 'Other family positive control failed'; end if;
  reset role;
  if has_function_privilege('anon','public.parent_maya_note_sessions(uuid[])','execute') then raise exception 'Anonymous metadata access'; end if;
  if has_table_privilege('anon','public.maya_call_notes','select') then raise exception 'Anonymous notes access'; end if;
  delete from auth.users where id in (p,other_p);
  if exists(select 1 from public.maya_call_notes where call_id in (chat,other_chat)) then raise exception 'Deletion left notes'; end if;
end $$;
select 'PASS: owner note and transcript; other family denied; internal calls denied; metadata owner positive controls; no-note and live excluded; input bound; client write denied; anonymous denied; deletion cascade' as probe;
rollback;
