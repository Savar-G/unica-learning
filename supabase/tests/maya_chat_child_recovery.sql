-- R451-1. Hosted rollback probe on an isolated child in a marked test family.
begin;
do $$
declare p uuid; ch uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  original uuid := gen_random_uuid(); next_id uuid := gen_random_uuid(); sample public.maya_calls;
  result jsonb; recovered jsonb; stale integer;
begin
  select t.parent_id into p from public.test_accounts t join public.parents x on x.id=t.parent_id where x.deletion_requested_at is null limit 1;
  if p is null then raise exception 'Needs a test family'; end if;
  select * into sample from public.maya_calls limit 1;
  if sample.id is null then raise exception 'Needs a sample call'; end if;
  insert into public.children(id,parent_id,first_name,grade,province) values(ch,p,'Recovery check',3,'BC');
  insert into public.maya_calls(id,parent_id,child_id,kind,mode,question_source,workbook_id,workbook_page,workbook_question,package_id,package_hash,model,prompt_version,versions,live)
    select x,p,ch,'chat','text','workbook',gen_random_uuid(),1,1,sample.package_id,sample.package_hash,sample.model,sample.prompt_version,sample.versions,'{}'::jsonb from unnest(array[a,b]) x;
  result:=public.take_maya_chat_message(original,p,ch,a,0,repeat('a',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day','Original child words');
  if result->>'status'<>'accepted' then raise exception 'First claim refused'; end if;
  update public.maya_chat_messages set lease_until=now()-interval '1 day',received_at=now()-interval '1 day' where id=original;
  result:=public.take_maya_chat_message(next_id,p,ch,b,0,repeat('b',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day','Next question');
  if result->>'status'<>'recover' or (result->>'admitted')::boolean then raise exception 'Other session did not request recovery: %',result; end if;
  recovered:=public.recover_maya_chat_message(p,ch);
  if recovered->>'status'<>'accepted' or recovered->>'id'<>original::text or recovered->>'callId'<>a::text
    or recovered->>'text'<>'Original child words' or (recovered->>'inputRevision')::integer<>0 or (recovered->>'revision')::integer<>2 then
    raise exception 'Recovery changed request identity: %',recovered;
  end if;
  if (select count(*) from public.maya_chat_messages where child_id=ch)<>1 then raise exception 'Recovery charged a message'; end if;
  update public.maya_calls set revision=revision+1 where id=a and revision=1;
  get diagnostics stale=row_count;
  if stale<>0 then raise exception 'Old worker committed'; end if;
  if public.recover_maya_chat_message(p,ch)->>'status'<>'busy' then raise exception 'Concurrent recovery took the same lease'; end if;
  if public.recover_maya_chat_message(gen_random_uuid(),ch)->>'status'<>'not_found' then raise exception 'Recovery accepted another family'; end if;
  result:=public.take_maya_chat_message(original,p,ch,a,0,repeat('a',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day','Original child words');
  if result->>'status'<>'busy' or not (result->>'admitted')::boolean then raise exception 'Admitted busy request lost its identity'; end if;
  -- The recovered worker commits, then another question can admit its first message in the new day.
  update public.maya_calls set revision=revision+1 where id=a;
  if public.recover_maya_chat_message(p,ch)->>'status'<>'none' then raise exception 'Committed recovery still blocks child'; end if;
  result:=public.take_maya_chat_message(next_id,p,ch,b,0,repeat('b',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day','Next question');
  if result->>'status'<>'accepted' then raise exception 'New question stayed blocked: %',result; end if;
  result:=public.take_maya_chat_message(gen_random_uuid(),p,ch,b,0,repeat('c',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day','Stale tab');
  if result->>'status'<>'conflict' or (result->>'admitted')::boolean then raise exception 'Stale revision was admitted'; end if;
  if (select count(*) from public.maya_chat_messages where child_id=ch and received_at>=date_trunc('day',now()))<>1 then raise exception 'Wrong new-day usage'; end if;
  if has_function_privilege('authenticated','public.recover_maya_chat_message(uuid,uuid)','execute') or has_function_privilege('anon','public.recover_maya_chat_message(uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.recover_maya_chat_message(uuid,uuid)','execute') then raise exception 'Wrong recovery grants'; end if;
end $$;
select 'PASS: cross-call previous-day recovery, original ID/text/revision, one receipt, stale-writer refusal, exclusive lease, family check, admission metadata, new question admitted, server-only grants' as probe;
rollback;
