-- Hosted S5 schema proof. Synthetic rows roll back in a caught subtransaction.
-- No Storage object, provider request, price enablement or real family is used.
do $$
declare
  p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); sibling uuid:=gen_random_uuid(); other_parent uuid:=gen_random_uuid();
  w uuid:=gen_random_uuid(); pg uuid:=gen_random_uuid(); ph uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid();
  rev text:=repeat('a',28); expected jsonb; observation jsonb; original jsonb; answer jsonb;
  mark_id uuid; history_id bigint; saved jsonb; again jsonb; marking_rev bigint;
  before_row jsonb; history jsonb; recovered jsonb; found_recovery boolean:=false; n int; v int; initial_v int;
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
      values(p,w,pg,1,'s5-item',1,'{"id":"s5-item","skill":{"standard":"2.4","skills":[]}}',1,1,20,20);
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
    begin execute 'set local role anon'; perform public.scan_marking_command('change',p,ph,null,'{}'); raise exception 'anon_rpc_allowed';
      exception when insufficient_privilege then execute 'reset role'; end;
    begin execute 'set local role authenticated'; perform public.scan_marking_command('changes',p,ph,null,'{}'); raise exception 'parent_history_rpc_allowed';
      exception when insufficient_privilege then execute 'reset role'; end;
    begin execute 'set local role authenticated'; perform count(*) from public.scan_mark_changes; raise exception 'parent_history_read_allowed';
      exception when insufficient_privilege then execute 'reset role'; end;
    execute 'set local role service_role';
    begin perform public.scan_marking_automatic_command('claim',p,ph,tok,'{}'); raise exception 'direct_automatic_allowed';
      exception when insufficient_privilege then null; end;
    answer:=public.scan_marking_command('claim',p,ph,tok,jsonb_build_object('hash','s5-hosted-probe','items',jsonb_build_array(jsonb_build_object('expected',expected,'observation',observation))));
    if jsonb_array_length(answer->'items')<>1 then raise exception 'claim_failed'; end if;
    observation:=observation||jsonb_build_object('state','scored','result','wrong','readAnswerText','56','certainty','certain');
    original:=jsonb_build_object('key','marking:'||encode(sha256(convert_to(w::text||':'||rev||':'||pg::text||':s5-item','UTF8')),'hex'),
      'parentId',p,'childId',c,'source','marking','question',jsonb_build_object('source','workbook','workbookId',w,'page',1,'question',1),
      'skill',jsonb_build_object('standard','2.4','skills','[]'::jsonb),'result','wrong','hints',0,'timeMs',null,'occurredAt',now(),'evidence',jsonb_build_object('kind','scan','id',ph));
    if public.scan_marking_command('extract',p,ph,tok,jsonb_build_object('observations',jsonb_build_array(observation),'model','synthetic-reader','prompt','s5-hosted-probe'))<>'true' then raise exception 'extract_failed'; end if;
    if public.scan_marking_command('apply',p,ph,tok,jsonb_build_object('events',jsonb_build_array(original),'at',now()))<>'true' then raise exception 'apply_failed'; end if;
    execute 'reset role';
    select to_jsonb(i),id into before_row,mark_id from public.scan_marking_items i where child_id=c;
    initial_v:=(before_row->>'result_version')::int; v:=initial_v;
    execute 'set local role service_role';
    answer:=public.scan_marking_command('change',p,ph,null,jsonb_build_object('itemId','s5-item','version',v,'result','right'));
    if answer->>'status'<>'saved' or (answer->'mark'->>'result_version')::int<>v+1 then raise exception 'active_change_failed'; end if;
    v:=v+1;
    if public.scan_marking_command('change',other_parent,ph,null,jsonb_build_object('itemId','s5-item','version',v,'result','wrong'))<>'"refused"' then raise exception 'wrong_family_allowed'; end if;
    execute 'reset role';
    update public.scan_photos set expires_at=clock_timestamp()-interval '1 second' where id=ph;
    execute 'set local role service_role';
    answer:=public.scan_marking_command('change',p,ph,null,jsonb_build_object('itemId','s5-item','version',v,'result','blank'));
    if answer->>'status'<>'saved' then raise exception 'expired_change_failed'; end if;
    v:=v+1;
    perform public.change_scan_photo(p,ph,'delete');
    answer:=public.scan_marking_command('change',p,ph,null,jsonb_build_object('itemId','s5-item','version',v,'result','wrong'));
    if answer->>'status'<>'saved' then raise exception 'deleted_change_failed'; end if;
    v:=v+1;
    answer:=public.scan_marking_command('change',p,ph,null,'{"itemId":"s5-item","version":1,"result":"right"}');
    if answer->>'status'<>'conflict' or (answer->'mark'->>'result_version')::int<>v then raise exception 'stale_change_won'; end if;
    history:=public.scan_marking_command('changes',p,ph,null,'{}');
    if jsonb_array_length(history)<>3 or history->0->>'actor'<>'parent' or history->0->>'changed_at' is null
      or (history->0->>'from_version')::int<>initial_v or (history->2->>'to_version')::int<>v then raise exception 'history_invalid'; end if;
    execute 'reset role';
    select min(id) into history_id from public.scan_mark_changes where parent_id=p;
    if (select i.observation->>'readAnswerText' from public.scan_marking_items i where i.id=mark_id)<>'56'
      or (select i.original_event from public.scan_marking_items i where i.id=mark_id) is distinct from before_row->'original_event'
      or (select i.model from public.scan_marking_items i where i.id=mark_id)<>'synthetic-reader'
      or (select i.prompt from public.scan_marking_items i where i.id=mark_id)<>'s5-hosted-probe' then raise exception 'original_evidence_changed'; end if;
    begin update public.scan_mark_changes set actor='parent' where id=history_id; raise exception 'history_update_allowed';
      exception when raise_exception then if sqlerrm<>'mark_change_immutable' then raise; end if; end;
    execute 'set local role service_role';
    begin insert into public.scan_mark_changes(item_id,parent_id,child_id,from_version,to_version,previous,current) values(mark_id,p,c,v,v+1,'{}','{}'); raise exception 'direct_history_insert_allowed';
      exception when insufficient_privilege then null; end;
    marking_rev:=(public.scan_marking_command('revision',p,null,null,jsonb_build_object('child',c)))::bigint;
    saved:=public.save_marked_child_profile(c,p,marking_rev,null,null,2::smallint,'{"events":{"counted":0}}','{"rows":[],"pending":true}','{}');
    if saved->>'build_token' is null then raise exception 'pending_profile_failed'; end if;
    if (select profile_revision from public.scan_marking_revisions where child_id=c)<>marking_rev-1 then raise exception 'pending_history_acknowledged'; end if;
    again:=public.save_marked_child_profile(c,p,marking_rev,null,gen_random_uuid(),2::smallint,'{}','{"rows":[],"pending":false}','{}');
    if again is not null then raise exception 'stale_profile_token_won'; end if;
    execute 'reset role';
    update public.scan_marking_cursor set after_id=null;
    for n in 1..100 loop
      recovered:=public.recover_scan_marking(10);
      if exists(select 1 from jsonb_array_elements(recovered) x where x->>'photo'=ph::text) then found_recovery:=true; exit; end if;
      if jsonb_array_length(recovered)=0 then exit; end if;
    end loop;
    if not found_recovery then raise exception 'terminal_pending_recovery_lost'; end if;
    begin
      insert into public.family_deletions(parent_id,reason) values(p,'request');
      update public.parents set deletion_requested_at=clock_timestamp() where id=p;
      execute 'set local role service_role';
      perform public.scan_marking_command('change',p,ph,null,jsonb_build_object('itemId','s5-item','version',v,'result','right'));
      raise exception 'family_fence_allowed';
    exception when sqlstate '55000' then execute 'reset role'; end;
    if exists(select 1 from public.family_deletions where parent_id=p) then raise exception 'nested_probe_rollback_failed'; end if;
    insert into public.child_deletions(child_id,parent_id) values(c,p);
    execute 'set local role service_role';
    if public.scan_marking_command('change',p,ph,null,jsonb_build_object('itemId','s5-item','version',v,'result','right'))<>'"refused"' then raise exception 'child_fence_allowed'; end if;
    execute 'reset role';
    delete from public.children where id=c;
    if exists(select 1 from public.scan_mark_changes where parent_id=p) or exists(select 1 from public.scan_marking_items where child_id=c) then raise exception 'child_cascade_failed'; end if;
    if not exists(select 1 from public.children where id=sibling) then raise exception 'sibling_lost'; end if;
    raise exception 'rollback_synthetic_s5_probe' using errcode='P5555';
  exception when sqlstate 'P5555' then null; end;
  if exists(select 1 from public.parents where id in (p,other_parent)) or exists(select 1 from auth.users where id in (p,other_parent))
    or exists(select 1 from public.scan_mark_changes where parent_id=p) then raise exception 'probe_did_not_roll_back'; end if;
end $$;
select 'SCAN_MARK_CHANGES_HOSTED_PROBE_OK' as result,
  (select count(*) from public.parents where email='s5-hosted-probe@example.invalid') as probe_parents,
  (select count(*) from public.scan_marking_prices where enabled) as enabled_prices;
