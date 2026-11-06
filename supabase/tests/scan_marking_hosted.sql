-- Hosted schema behavior only. Every synthetic row rolls back in the caught subtransaction.
-- No image file, provider request, enabled price or real family is used.
do $$
declare
  p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); sibling uuid:=gen_random_uuid();
  w uuid:=gen_random_uuid(); pg uuid:=gen_random_uuid(); ph uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid();
  old_token uuid:=gen_random_uuid(); item text:=repeat('é',200); rev text:=repeat('a',28);
  expected jsonb; observation jsonb; answer jsonb; original jsonb; row_id uuid; event_id uuid;
  saved jsonb; n int; seen boolean:=false; before_spend bigint;
begin
  begin
    insert into auth.users(id,email) values(p,'s4-hosted-probe@example.invalid');
    insert into public.parents(id,name,email) values(p,'Synthetic S4 probe','s4-hosted-probe@example.invalid');
    insert into public.test_accounts(parent_id,marked_by) values(p,p);
    insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Probe',2,'BC'),(sibling,p,'Sibling',2,'BC');
    insert into public.workbooks(id,parent_id,child_id,number,levels,printed_revision) values(w,p,c,1,'{2}',rev);
    insert into public.workbook_pages(id,parent_id,workbook_id,page_number,page_type,qr_token,image_path,image_width,image_height,print_contract)
      values(pg,p,w,1,'practice',replace(gen_random_uuid()::text,'-',''),p::text||'/'||w::text||'/probe.png',1000,1400,'{}');
    insert into public.workbook_questions(parent_id,workbook_id,page_id,question_number,question_key,schema_version,package,box_x,box_y,box_width,box_height)
      values(p,w,pg,1,item,1,jsonb_build_object('id',item),1,1,20,20);
    update public.workbooks set status='shipped',shipped_at=now() where id=w;
    insert into public.scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at)
      values(ph,p,c,pg,w,rev,'saved',0,1000,1400,now());
    insert into public.scan_calibrations(photo_id,parent_id,printed_revision,state,lease_token,lease_until)
      values(ph,p,rev,'running',old_token,clock_timestamp()-interval '1 second');
    answer:=public.begin_scan_calibration(p,ph,tok);
    if answer->>'status'<>'started' or (answer->>'previous')::uuid<>old_token then raise exception 'calibration_previous_lost'; end if;
    -- Geometry is synthetic. This does not assert that a camera image passed calibration.
    update public.scan_calibrations set state='ready',result='{"parts":["straight"],"sheetCheck":1}',lease_until=now() where photo_id=ph;
    expected:=jsonb_build_object('identity',jsonb_build_object('workbookId',w,'printedRevision',rev,'pageId',pg,'itemId',item),
      'number',1,'method','code','scoredRegions',jsonb_build_array('a'),'mastery',jsonb_build_object('eligible',true,'reason',null),
      'teaching',jsonb_build_object('curriculum',jsonb_build_object('key','bc','version','probe'),'part','friday-5','slot','1','practiceType','now-you','itemStep',jsonb_build_object('unit','U1','skill','add','step',1)));
    observation:=jsonb_build_object('version',1,'identity',expected->'identity','evidence',jsonb_build_object('photoRevision',ph),
      'readAnswerText',null,'regions','[]'::jsonb,'certainty','not-read','state','pending','method','code','result',null,
      'teaching',expected->'teaching','mastery',expected->'mastery','help','none','actor','system','resultVersion',1);
    -- Both browser roles must fail at the actual RPC boundary.
    begin execute 'set local role anon'; perform public.scan_marking_command('claim',p,ph,tok,'{}'); raise exception 'anon_write_allowed';
    exception when insufficient_privilege then execute 'reset role'; end;
    begin execute 'set local role authenticated'; perform public.scan_marking_command('claim',p,ph,tok,'{}'); raise exception 'parent_write_allowed';
    exception when insufficient_privilege then execute 'reset role'; end;
    execute 'reset role';
    update public.scan_calibrations set result='{"parts":["straight"]}' where photo_id=ph;
    execute 'set local role service_role';
    if public.scan_marking_command('frame',p,ph,null,'{}')<>'"unavailable"'
      or public.scan_marking_command('claim',p,ph,tok,'{}')<>'"unavailable"' then raise exception 'legacy_sent_row_admitted'; end if;
    execute 'reset role';
    if exists(select 1 from public.scan_marking_jobs where photo_id=ph) then raise exception 'legacy_sent_job_created'; end if;
    update public.scan_calibrations set result='{"parts":["straight"],"sheetCheck":1}' where photo_id=ph;
    execute 'set local role service_role';
    answer:=public.scan_marking_command('claim',p,ph,tok,jsonb_build_object('hash','hosted-probe','items',jsonb_build_array(jsonb_build_object('expected',expected,'observation',observation))));
    if jsonb_array_length(answer->'items')<>1 then raise exception 'canonical_seed_failed'; end if;
    select count(*) into before_spend from public.scan_marking_spend;
    if public.scan_marking_command('admit',p,ph,tok,jsonb_build_object('model','anthropic/claude-sonnet-5.5'))<>'"price-unverified"' then raise exception 'unverified_price_dispatched'; end if;
    if (select count(*) from public.scan_marking_spend)<>before_spend then raise exception 'refusal_reserved_spend'; end if;
    observation:=observation||jsonb_build_object('state','scored','result','right','readAnswerText','0','certainty','certain');
    original:=jsonb_build_object('key','marking:'||encode(sha256(convert_to(w::text||':'||rev||':'||pg::text||':'||item,'UTF8')),'hex'),
      'parentId',p,'childId',c,'source','marking','question',jsonb_build_object('source','workbook','workbookId',w,'page',1,'question',1),
      'skill',jsonb_build_object('standard','2.4','skills','[]'::jsonb),'result','right','hints',0,'timeMs',null,'occurredAt',now(),'evidence',jsonb_build_object('kind','scan','id',ph));
    if public.scan_marking_command('extract',p,ph,tok,jsonb_build_object('observations',jsonb_build_array(observation),'model','none','prompt','hosted-probe'))<>'true' then raise exception 'extract_failed'; end if;
    if public.scan_marking_command('apply',p,ph,tok,jsonb_build_object('events',jsonb_build_array(original),'at',now()))<>'true' then raise exception 'apply_failed'; end if;
    saved:=public.save_marked_child_profile(c,p,1,null,null,2::smallint,'{"events":{"counted":0}}','[]','{}');
    if saved->>'build_token' is null then raise exception 'profile_save_failed'; end if;
    execute 'reset role';
    update public.scan_photos set expires_at=clock_timestamp()-interval '1 second' where id=ph;
    update public.scan_marking_cursor set after_id=null;
    for n in 1..100 loop
      answer:=public.recover_scan_marking(10);
      if exists(select 1 from jsonb_array_elements(answer) x where x->>'photo'=ph::text) then seen:=true; exit; end if;
      if jsonb_array_length(answer)=0 then exit; end if;
    end loop;
    if not seen then raise exception 'expired_outbox_not_recovered'; end if;
    select id into row_id from public.scan_marking_items where child_id=c;
    insert into public.learning_events(idempotency_key,parent_id,child_id,source,question_source,workbook_id,workbook_page,workbook_question,skill_standard,skills,result,hints,occurred_at,evidence_kind,evidence_id)
      values(original->>'key',p,c,'marking','workbook',w,1,1,'2.4','{}','right',0,now(),'scan',ph::text) returning id into event_id;
    if public.scan_marking_command('ack',p,null,null,jsonb_build_object('child',c,'item',row_id,'event',event_id))<>'true' then raise exception 'ack_failed'; end if;
    if jsonb_array_length(public.scan_marking_command('outbox',p,null,null,jsonb_build_object('child',c)))<>0 then raise exception 'outbox_not_empty'; end if;
    delete from public.children where id=c;
    if exists(select 1 from public.scan_marking_items where child_id=c) or exists(select 1 from public.scan_marking_jobs where child_id=c) or exists(select 1 from public.learning_events where child_id=c) then raise exception 'child_cascade_failed'; end if;
    if not exists(select 1 from public.children where id=sibling) then raise exception 'sibling_lost'; end if;
    if public.scan_marking_command('claim',p,ph,tok,'{}')<>'"terminal"' then raise exception 'late_job_restored'; end if;
    raise exception 'rollback_synthetic_s4_probe' using errcode='P5555';
  exception when sqlstate 'P5555' then null; end;
  if exists(select 1 from public.parents where id=p) or exists(select 1 from auth.users where id=p) then raise exception 'probe_did_not_roll_back'; end if;
end $$;
select 'SCAN_MARKING_HOSTED_PROBE_OK' as result,
  (select count(*) from public.parents where email='s4-hosted-probe@example.invalid') as probe_parents,
  (select count(*) from public.scan_marking_prices where enabled) as enabled_prices;
