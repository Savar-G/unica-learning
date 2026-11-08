-- Hosted rollback probe. No real family or saved record changes survive this transaction.
begin;
do $$
declare c public.maya_calls; p uuid; ch uuid; r jsonb; msg uuid; n integer; v_claim uuid; v_week date := date_trunc('week',now()+interval '10 years')::date;
begin
  select t.parent_id,k.id into p,ch from public.test_accounts t join public.children k on k.parent_id=t.parent_id limit 1;
  if p is null then raise exception 'Needs a test family'; end if;
  select * into c from public.maya_calls limit 1;
  if c.id is null then raise exception 'Needs a sample call'; end if;
  c.id:=gen_random_uuid(); c.parent_id:=p; c.child_id:=ch; c.kind:='chat'; c.mode:='text';
  c.question_source:='workbook'; c.workbook_id:=gen_random_uuid(); c.workbook_page:=1; c.workbook_question:=1;
  c.assessment_id:=null; c.assessment_question_id:=null; c.status:='live'; c.live:='{}'; c.revision:=0; c.counts_minutes:=false;
  insert into public.maya_calls(id,parent_id,child_id,kind,mode,question_source,workbook_id,workbook_page,workbook_question,package_id,package_hash,model,prompt_version,versions,live)
    values(c.id,p,ch,'chat','text','workbook',c.workbook_id,1,1,c.package_id,c.package_hash,c.model,c.prompt_version,c.versions,'{}');
  for i in 1..60 loop
    msg:=gen_random_uuid();
    r:=public.claim_maya_chat_message(msg,p,ch,c.id,c.revision,repeat('a',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day');
    if r->>'status' <> 'accepted' then raise exception 'Message % refused: %',i,r; end if;
    if public.claim_maya_chat_message(msg,p,ch,c.id,c.revision,repeat('a',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day')->>'status' <> 'busy' then raise exception 'Pending retry was accepted'; end if;
    update public.maya_calls set revision=revision+1 where id=c.id returning revision into n;
    if public.claim_maya_chat_message(msg,p,ch,c.id,c.revision,repeat('a',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day')->>'status' <> 'done' then raise exception 'Committed retry was not recognized'; end if;
    c.revision:=n;
  end loop;
  r:=public.claim_maya_chat_message(gen_random_uuid(),p,ch,c.id,c.revision,repeat('a',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day');
  if r->>'status' <> 'cap' then raise exception 'Message 61 accepted: %',r; end if;
  if (select count(*) from public.maya_chat_messages where call_id=c.id) <> 60 then raise exception 'Incorrect message count'; end if;
  perform set_config('request.jwt.claim.sub',p::text,true);
  set local role authenticated;
  if (select count(*) from public.maya_chat_messages where call_id=c.id) <> 60 then raise exception 'Owner cannot read usage'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from public.maya_chat_messages where call_id=c.id) then raise exception 'Another family can read usage'; end if;
  begin
    delete from public.maya_chat_messages where call_id=c.id;
    raise exception 'Family can delete usage';
  exception when insufficient_privilege then null; end;
  reset role;
  if has_function_privilege('authenticated','public.claim_maya_chat_message(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz)','execute') then raise exception 'Family can claim directly'; end if;
  update public.maya_chat_messages set received_at=date_trunc('day',now())-interval '1 second' where call_id=c.id;
  r:=public.claim_maya_chat_message(gen_random_uuid(),p,ch,c.id,c.revision,repeat('a',64),date_trunc('day',now()),date_trunc('day',now())+interval '1 day');
  if r->>'status' <> 'accepted' then raise exception 'Prior day messages consumed today'; end if;
  if (select count(*) from public.maya_chat_messages where call_id=c.id and received_at>=date_trunc('day',now())) <> 1 then raise exception 'Day distribution incorrect'; end if;
  update public.maya_calls set status='ended',live=null,ended_at=now(),outcome_reason='child_stopped',trace=jsonb_build_object('callId',c.id::text) where id=c.id;
  -- Test families get a recap only as the rehearsal family (#530).
  insert into public.maya_chat_families(parent_id,added_by,rehearsal) values(p,p,true) on conflict (parent_id) do update set rehearsal=true;
  v_claim:=public.claim_maya_weekly(p,v_week,array[c.id],repeat('a',64),null,0);
  if v_claim is null then raise exception 'Weekly claim refused chat'; end if;
  if public.claim_maya_weekly(p,v_week,array[c.id],repeat('a',64),null,0) is not null then raise exception 'Weekly duplicate claim accepted'; end if;
  delete from public.maya_calls where id=c.id;
  if exists(select 1 from public.maya_chat_messages where call_id=c.id) then raise exception 'Cascade left messages'; end if;
end $$;
select 'PASS: 60 accepted; 61 refused; busy and committed retry; owner read; other family denied; client write and RPC denied; prior day excluded; weekly chat claim and coverage; delete cascade' as probe;
rollback;
