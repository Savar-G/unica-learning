-- Hosted rollback probe for #530. No real family or saved record changes survive this transaction.
begin;
do $$
declare c public.maya_calls; p uuid; ch uuid; other uuid; refused boolean;
begin
  select t.parent_id,k.id into p,ch from public.test_accounts t join public.children k on k.parent_id=t.parent_id limit 1;
  if p is null then raise exception 'Needs a test family'; end if;
  select t.parent_id into other from public.test_accounts t where t.parent_id<>p limit 1;
  if other is null then raise exception 'Needs a second test family'; end if;
  select * into c from public.maya_calls limit 1;
  if c.id is null then raise exception 'Needs a sample call'; end if;
  c.id:=gen_random_uuid();
  insert into public.maya_calls(id,parent_id,child_id,kind,mode,question_source,workbook_id,workbook_page,workbook_question,package_id,package_hash,model,prompt_version,versions,live)
    values(c.id,p,ch,'chat','text','workbook',gen_random_uuid(),1,1,c.package_id,c.package_hash,c.model,c.prompt_version,c.versions,'{}');
  update public.maya_calls set status='ended',live=null,ended_at=now(),outcome_reason='child_stopped',trace=jsonb_build_object('callId',c.id::text) where id=c.id;

  -- A test family's note is refused while it is not the rehearsal family.
  refused:=false;
  begin
    insert into public.maya_call_notes(call_id,parent_id,child_id,call_ended_at,facts,sentences,writer,transcript)
      values(c.id,p,ch,now(),'{}','["{child} worked on a question."]','code','[]');
  exception when sqlstate '55000' then refused:=true;
  end;
  if not refused then raise exception 'Test family note was accepted'; end if;

  -- Listed but not the rehearsal: still refused.
  insert into public.maya_chat_families(parent_id,added_by) values(p,p);
  refused:=false;
  begin
    insert into public.maya_call_notes(call_id,parent_id,child_id,call_ended_at,facts,sentences,writer,transcript)
      values(c.id,p,ch,now(),'{}','["{child} worked on a question."]','code','[]');
  exception when sqlstate '55000' then refused:=true;
  end;
  if not refused then raise exception 'Listed test family note was accepted'; end if;

  -- The rehearsal family's note is accepted.
  update public.maya_chat_families set rehearsal=true where parent_id=p;
  insert into public.maya_call_notes(call_id,parent_id,child_id,call_ended_at,facts,sentences,writer,transcript)
    values(c.id,p,ch,now(),'{}','["{child} worked on a question."]','code','[]');

  -- Only one rehearsal family.
  refused:=false;
  begin
    insert into public.maya_chat_families(parent_id,added_by,rehearsal) values(other,p,true);
  exception when unique_violation then refused:=true;
  end;
  if not refused then raise exception 'Second rehearsal family was accepted'; end if;

  -- Parents read nothing; an admin session is needed to read or change the list.
  perform set_config('request.jwt.claim.sub',p::text,true);
  set local role authenticated;
  if (select count(*) from public.maya_chat_families) <> 0 then raise exception 'A parent can read the list'; end if;
  reset role;

  -- The family's deletion removes its row.
  delete from public.parents where id=p;
  if exists(select 1 from public.maya_chat_families where parent_id=p) then raise exception 'Cascade left the row'; end if;
end $$;
select 'PASS: test family note refused; listed test family refused; rehearsal note accepted; one rehearsal only; parent reads nothing; delete cascade' as probe;
rollback;
