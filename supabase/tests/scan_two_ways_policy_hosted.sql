-- Hosted service-role proof. All synthetic rows roll back. No image or provider call.
do $$
declare
  p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); sibling uuid:=gen_random_uuid(); other_parent uuid:=gen_random_uuid();
  w uuid:=gen_random_uuid(); pg uuid:=gen_random_uuid(); ph uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid();
  rev text:=repeat('a',28); expected jsonb; observation jsonb; answer jsonb; before_q jsonb; n int;
begin
  begin
    insert into auth.users(id,email) values(p,'s5-hosted-probe@example.invalid');
    insert into public.parents(id,name,email) values(p,'Synthetic S5 probe','s5-hosted-probe@example.invalid');
    insert into auth.users(id,email) values(other_parent,'s5-other-hosted-probe@example.invalid');
    insert into public.parents(id,name,email) values(other_parent,'Synthetic other probe','s5-other-hosted-probe@example.invalid');
    insert into public.test_accounts(parent_id,marked_by) values(p,p);
    insert into public.children(id,parent_id,first_name,grade,province)
      values(c,p,'Probe',2,'BC'),(sibling,p,'Sibling',2,'BC');
    insert into public.workbooks(id,parent_id,child_id,number,levels,printed_revision) values(w,p,c,1,'{2}',rev);
    insert into public.workbook_pages(id,parent_id,workbook_id,page_number,page_type,qr_token,image_path,image_width,image_height,print_contract)
      values(pg,p,w,1,'practice',replace(gen_random_uuid()::text,'-',''),p::text||'/'||w::text||'/probe.png',1000,1400,'{}');
    insert into public.workbook_questions(parent_id,workbook_id,page_id,question_number,question_key,schema_version,package,box_x,box_y,box_width,box_height)
      values(p,w,pg,1,'s5-item',1,'{"id":"s5-item","skill":{"standard":"2.4","skills":[]},"item":{"format":"two-ways","scorable":true,"parentChecked":false}}',1,1,20,20);
    update public.workbooks set status='shipped',shipped_at=now() where id=w;
    insert into public.scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at)
      values(ph,p,c,pg,w,rev,'saved',0,1000,1400,now());
    insert into public.scan_calibrations(photo_id,parent_id,printed_revision,state,lease_token,lease_until,result)
      values(ph,p,rev,'ready',gen_random_uuid(),now(),'{"parts":["straight"],"sheetCheck":1}');
    expected:=jsonb_build_object('identity',jsonb_build_object('workbookId',w,'printedRevision',rev,'pageId',pg,'itemId','s5-item'),
      'number',1,'method','code','scoredRegions',jsonb_build_array('a'),'mastery',jsonb_build_object('eligible',true,'reason',null),
      'teaching',jsonb_build_object('curriculum',jsonb_build_object('key','bc','version','probe'),'part','friday-5','slot','1','practiceType','now-you','itemStep',jsonb_build_object('unit','U1','skill','add','step',1)));
    observation:=jsonb_build_object('version',1,'identity',expected->'identity','evidence',jsonb_build_object('photoRevision',ph),
      'readAnswerText',null,'regions','[]'::jsonb,'certainty','not-read','state','pending','method','code','result',null,
      'teaching',expected->'teaching','mastery',expected->'mastery','help','none','actor','system','resultVersion',1);
    select package into before_q from public.workbook_questions where page_id=pg;
    if has_function_privilege('anon','public.scan_two_ways_review_policy()','EXECUTE')
      or has_function_privilege('authenticated','public.scan_two_ways_review_policy()','EXECUTE')
      or has_function_privilege('service_role','public.scan_two_ways_review_policy()','EXECUTE') then raise exception 'trigger_rpc_grant'; end if;
    execute 'set local role service_role';
    answer:=public.scan_marking_command('claim',p,ph,tok,jsonb_build_object('hash','two-ways-policy-probe','items',jsonb_build_array(jsonb_build_object('expected',expected,'observation',observation))));
    if answer->'items'->0->'expected'->>'method' is distinct from 'parent'
      or answer->'items'->0->'expected'->'mastery'->>'eligible' is distinct from 'false' then raise exception 'old_writer_not_corrected'; end if;
    execute 'reset role';
    update public.scan_photos set expires_at=clock_timestamp()-interval '1 second' where id=ph;
    for n in 1..3 loop
      execute 'set local role service_role';
      answer:=public.scan_marking_command('change',p,ph,null,jsonb_build_object('itemId','s5-item','version',n,'result',(array['right','wrong','blank'])[n]));
      execute 'reset role';
      if answer->>'status' is distinct from 'saved' or answer->'mark'->'original_event' is distinct from 'null'::jsonb
        or answer->'mark'->'expected'->'mastery'->>'eligible' is distinct from 'false' then raise exception 'parent_mastery_leak'; end if;
    end loop;
    if (select count(*) from public.scan_mark_changes where parent_id=p)<>3 then raise exception 'history_lost'; end if;
    if (select package from public.workbook_questions where page_id=pg) is distinct from before_q then raise exception 'print_changed'; end if;
    if exists(select 1 from public.learning_events where child_id=c) then raise exception 'event_leaked'; end if;
    insert into public.child_deletions(child_id,parent_id) values(c,p);
    execute 'set local role service_role';
    if public.scan_marking_command('change',p,ph,null,jsonb_build_object('itemId','s5-item','version',4,'result','right'))<>'"refused"'::jsonb then raise exception 'child_fence_allowed'; end if;
    execute 'reset role';
    raise exception 'rollback_method_probe' using errcode='P5555';
  exception when sqlstate 'P5555' then null; end;
  if exists(select 1 from public.parents where id in(p,other_parent)) or exists(select 1 from auth.users where id in(p,other_parent)) then raise exception 'probe_not_rolled_back'; end if;
end $$;
select 'SCAN_TWO_WAYS_POLICY_HOSTED_OK' as result,
  (select count(*) from public.scan_marking_items) as canonical_items,
  (select count(*) from public.scan_marking_prices where enabled) as enabled_prices;
