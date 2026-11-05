-- Hosted rollback probe for the review of PR #584. No real family or saved record changes survive this transaction.
-- 1. A rehearsal row needs the family's test mark, and removing the test mark ends the rehearsal.
-- 2. The weekly claim refuses a test family that is not the rehearsal family, and a real family's claim is unchanged.
begin;
do $$
declare c public.maya_calls; p uuid; ch uuid; real_p uuid; real_ch uuid; refused boolean; v_week date := date_trunc('week',now()+interval '10 years')::date;
  v_claim uuid; real_call uuid;
begin
  select t.parent_id,k.id into p,ch from public.test_accounts t join public.children k on k.parent_id=t.parent_id limit 1;
  if p is null then raise exception 'Needs a test family'; end if;
  select k.parent_id,k.id into real_p,real_ch from public.children k
    where not exists(select 1 from public.test_accounts t where t.parent_id=k.parent_id) limit 1;
  if real_p is null then raise exception 'Needs a real family'; end if;
  select * into c from public.maya_calls limit 1;
  if c.id is null then raise exception 'Needs a sample call'; end if;

  -- An ended chat for the test family and one for the real family.
  c.id:=gen_random_uuid(); real_call:=gen_random_uuid();
  insert into public.maya_calls(id,parent_id,child_id,kind,mode,question_source,workbook_id,workbook_page,workbook_question,package_id,package_hash,model,prompt_version,versions,live)
    values(c.id,p,ch,'chat','text','workbook',gen_random_uuid(),1,1,c.package_id,c.package_hash,c.model,c.prompt_version,c.versions,'{}'),
          (real_call,real_p,real_ch,'chat','text','workbook',gen_random_uuid(),1,1,c.package_id,c.package_hash,c.model,c.prompt_version,c.versions,'{}');
  update public.maya_calls set status='ended',live=null,ended_at=now(),outcome_reason='child_stopped',trace=jsonb_build_object('callId',id::text) where id in (c.id,real_call);

  -- A real family on the list cannot be the rehearsal family, on insert or on update.
  refused:=false;
  begin insert into public.maya_chat_families(parent_id,added_by,rehearsal) values(real_p,p,true);
  exception when sqlstate '55000' then refused:=true; end;
  if not refused then raise exception 'Rehearsal row for a real family was inserted'; end if;
  insert into public.maya_chat_families(parent_id,added_by) values(real_p,p);
  refused:=false;
  begin update public.maya_chat_families set rehearsal=true where parent_id=real_p;
  exception when sqlstate '55000' then refused:=true; end;
  if not refused then raise exception 'Real family was made the rehearsal'; end if;

  -- A test family that is not the rehearsal gets no weekly claim.
  if public.claim_maya_weekly(p,v_week,array[c.id],repeat(md5(gen_random_uuid()::text),2),null,0) is not null then raise exception 'Plain test family was claimed'; end if;
  -- A real family is claimed as before.
  if public.claim_maya_weekly(real_p,v_week,array[real_call],repeat(md5(gen_random_uuid()::text),2),null,0) is null then raise exception 'Real family claim refused'; end if;

  -- The rehearsal family is claimed; after the rehearsal stops, a new claim is refused.
  insert into public.maya_chat_families(parent_id,added_by,rehearsal) values(p,p,true);
  v_claim:=public.claim_maya_weekly(p,v_week,array[c.id],repeat(md5(gen_random_uuid()::text),2),null,0);
  if v_claim is null then raise exception 'Rehearsal family claim refused'; end if;
  delete from public.email_log where id=v_claim;
  update public.maya_chat_families set rehearsal=false where parent_id=p;
  if public.claim_maya_weekly(p,v_week,array[c.id],repeat(md5(gen_random_uuid()::text),2),null,0) is not null then raise exception 'Stopped rehearsal was claimed'; end if;

  -- Removing the test mark ends the rehearsal; the family is then real and is claimed.
  update public.maya_chat_families set rehearsal=true where parent_id=p;
  delete from public.test_accounts where parent_id=p;
  if exists(select 1 from public.maya_chat_families where parent_id=p and rehearsal) then raise exception 'Rehearsal outlived the test mark'; end if;
  if not exists(select 1 from public.maya_chat_families where parent_id=p) then raise exception 'List row was removed with the test mark'; end if;
  if public.claim_maya_weekly(p,v_week,array[c.id],repeat(md5(gen_random_uuid()::text),2),null,0) is null then raise exception 'Unmarked family claim refused'; end if;

  -- Family deletion still works with a rehearsal row and a test mark.
  insert into public.test_accounts(parent_id,marked_by) values(p,p);
  update public.maya_chat_families set rehearsal=true where parent_id=p;
  delete from public.parents where id=p;
  if exists(select 1 from public.maya_chat_families where parent_id=p) then raise exception 'Cascade left the row'; end if;
end $$;
select 'PASS: no rehearsal for a real family (insert, update); plain test family claim refused; real family claimed; rehearsal claimed; stopped rehearsal refused; test mark removal ends rehearsal; family deletion' as probe;
rollback;
