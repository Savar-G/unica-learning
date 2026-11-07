-- Hosted behavioral proof. All owned records, prices and synthetic money holds roll back.
-- No provider call, Storage object, customer record or release switch is used.
do $$
declare
  p uuid:=gen_random_uuid(); foreign_p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  w uuid:=gen_random_uuid(); pg uuid:=gen_random_uuid(); ph uuid:=gen_random_uuid();
  first_item uuid; second_item uuid; token uuid:=gen_random_uuid(); other_token uuid:=gen_random_uuid();
  rev text:=repeat('e',28); identity jsonb; expected jsonb; observation jsonb;
  context jsonb; args jsonb; answer jsonb; dispatch uuid; original jsonb;
  words jsonb:='{"steps":["8 > 3, so use the greater-than sign."],"say":"Compare the two numbers."}';
  rolled_back boolean:=false;
begin
  begin
    insert into auth.users(id,email) values(p,'pd675-hosted-probe@example.invalid'),(foreign_p,'pd675-foreign-probe@example.invalid');
    insert into public.parents(id,name,email) values(p,'Synthetic explanation probe','pd675-hosted-probe@example.invalid'),(foreign_p,'Synthetic foreign probe','pd675-foreign-probe@example.invalid');
    insert into public.test_accounts(parent_id,marked_by) values(p,p),(foreign_p,foreign_p);
    insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Probe',3,'BC');
    insert into public.workbooks(id,parent_id,child_id,number,levels,printed_revision) values(w,p,c,1,'{10}',rev);
    insert into public.workbook_pages(id,parent_id,workbook_id,page_number,page_type,qr_token,image_path,image_width,image_height,print_contract)
      values(pg,p,w,1,'practice',replace(gen_random_uuid()::text,'-',''),p::text||'/'||w::text||'/synthetic.png',1000,1400,'{}');
    insert into public.workbook_questions(parent_id,workbook_id,page_id,question_number,question_key,schema_version,package,box_x,box_y,box_width,box_height)
      values(p,w,pg,1,'pd675-item',2,jsonb_build_object('id','pd675-item','ref',jsonb_build_object('source','workbook','workbookId',w,'page',1,'question',1)),1,1,20,20),
            (p,w,pg,2,'pd675-sibling',2,jsonb_build_object('id','pd675-sibling','ref',jsonb_build_object('source','workbook','workbookId',w,'page',1,'question',2)),1,30,20,20);
    update public.workbooks set status='shipped',shipped_at=now() where id=w;
    insert into public.scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at)
      values(ph,p,c,pg,w,rev,'saved',0,1000,1400,now());
    identity:=jsonb_build_object('workbookId',w,'printedRevision',rev,'pageId',pg,'itemId','pd675-item');
    expected:=jsonb_build_object('identity',identity,'number',1,'method','code','scoredRegions',jsonb_build_array('answer'),'mastery',jsonb_build_object('eligible',false,'reason','synthetic'),'teaching',null);
    observation:=jsonb_build_object('version',1,'identity',identity,'evidence',jsonb_build_object('photoRevision',ph),'readAnswerText','=',
      'regions',jsonb_build_array(jsonb_build_object('regionId','answer','text','=','certainty','certain','result','wrong')),'certainty','certain','state','scored','method','code','result','wrong',
      'teaching',null,'mastery',expected->'mastery','help','unknown','actor','system','resultVersion',1);
    insert into public.scan_marking_items(parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation)
      values(p,c,w,rev,pg,'pd675-item',expected,observation) returning id into first_item;
    expected:=jsonb_set(jsonb_set(expected,'{identity,itemId}','"pd675-sibling"'),'{number}','2');
    observation:=jsonb_set(observation,'{identity,itemId}','"pd675-sibling"');
    insert into public.scan_marking_items(parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation)
      values(p,c,w,rev,pg,'pd675-sibling',expected,observation) returning id into second_item;
    args:='{"itemId":"pd675-item","version":1}';

    begin execute 'set local role anon'; perform public.parent_explanation_command('context',p,ph,null,args); raise exception 'anon_rpc_allowed';
      exception when insufficient_privilege then execute 'reset role'; end;
    begin execute 'set local role authenticated'; perform public.parent_explanation_command('context',p,ph,null,args); raise exception 'parent_rpc_allowed';
      exception when insufficient_privilege then execute 'reset role'; end;
    execute 'set local role service_role';
    if public.parent_explanation_command('context',foreign_p,ph,null,args) is distinct from 'null'::jsonb then raise exception 'foreign_allowed'; end if;
    context:=public.parent_explanation_command('context',p,ph,null,args);
    if context->>'context' is null then raise exception 'complete_context_missing'; end if;
    args:=args||jsonb_build_object('context',context->>'context');
    if public.parent_explanation_command('claim',p,ph,token,args)<>'"claimed"' then raise exception 'claim_failed'; end if;
    if public.parent_explanation_command('admit',p,ph,token,args||'{"model":"anthropic/claude-haiku-5.5"}')<>'"unavailable"' then raise exception 'disabled_price_allowed'; end if;
    execute 'reset role';
    -- This temporary synthetic bound is not provider-price evidence and cannot persist.
    update public.parent_explanation_prices set enabled=true,maximum_micros=6000000,verified_at=clock_timestamp(),evidence='Rollback synthetic bound only';
    execute 'set local role service_role';
    answer:=public.parent_explanation_command('admit',p,ph,token,args||'{"model":"anthropic/claude-haiku-5.5"}');
    dispatch:=(answer->>'dispatch')::uuid;
    if dispatch is null then raise exception 'synthetic_admission_failed'; end if;
    if public.parent_explanation_command('admit',p,ph,token,args||'{"model":"anthropic/claude-haiku-5.5"}')<>'"cap"' then raise exception 'cap_bypassed'; end if;
    if public.parent_explanation_command('settle',null,null,dispatch,'{"cost":null}')<>'true' then raise exception 'unknown_settlement_failed'; end if;
    if public.parent_explanation_command('admit',p,ph,token,args||'{"model":"anthropic/claude-haiku-5.5"}')<>'"cap"' then raise exception 'unknown_hold_released'; end if;
    if public.parent_explanation_command('finish',p,ph,token,args||jsonb_build_object('explanation',words))<>'true' then raise exception 'comparison_save_failed'; end if;
    if public.parent_explanation_command('read',p,ph,null,args) is distinct from words then raise exception 'cache_read_failed'; end if;
    if public.parent_explanation_command('claim',p,ph,other_token,args) is distinct from jsonb_build_object('explanation',words) then raise exception 'cache_claim_failed'; end if;
    execute 'reset role';
    select i.observation into original from public.scan_marking_items i where i.id=second_item;
    update public.scan_marking_items i set observation=i.observation||'{"state":"parent-pending","method":"parent","result":null}' where i.id=second_item;
    execute 'set local role service_role';
    if public.parent_explanation_command('context',p,ph,null,args) is distinct from 'null'::jsonb
      or public.parent_explanation_command('read',p,ph,null,args) is distinct from 'null'::jsonb
      or public.parent_explanation_command('admit',p,ph,token,args||'{"model":"anthropic/claude-haiku-5.5"}') is distinct from 'null'::jsonb
      or public.parent_explanation_command('finish',p,ph,token,args||jsonb_build_object('explanation',words)) is distinct from 'null'::jsonb then raise exception 'pending_sibling_disclosed'; end if;
    execute 'reset role';
    update public.scan_marking_items set observation=original where id=second_item;
    update public.parents set deletion_requested_at=clock_timestamp() where id=p;
    begin execute 'set local role service_role'; perform public.parent_explanation_command('read',p,ph,null,args); raise exception 'family_fence_bypassed';
      exception when sqlstate '55000' then
        execute 'reset role';
        if sqlerrm<>'family_unavailable' then raise; end if;
    end;
    if (select charged_micros from public.parent_explanation_spend where id=dispatch) is not null then raise exception 'unknown_hold_changed'; end if;
    if (select count(*) from public.parent_explanation_dispatches where item_id=first_item)<>1 then raise exception 'cache_added_dispatch'; end if;
    raise exception using errcode='PZ675',message='ROLLBACK_SYNTHETIC_PD675';
  exception when sqlstate 'PZ675' then
    execute 'reset role'; rolled_back:=true;
  end;
  if not rolled_back then raise exception 'probe_did_not_rollback'; end if;
  if exists(select 1 from auth.users where id in(p,foreign_p)) or exists(select 1 from public.parent_explanation_spend where id=dispatch)
    or exists(select 1 from public.parent_explanations where item_id=first_item)
    or exists(select 1 from public.parent_explanation_prices where enabled) then raise exception 'probe_state_survived'; end if;
end $$;
select jsonb_build_object('marker','PROBE_OK_PD675','remaining_probe_parents',(select count(*) from public.parents where email in ('pd675-hosted-probe@example.invalid','pd675-foreign-probe@example.invalid')),
  'enabled_prices',(select count(*) from public.parent_explanation_prices where enabled),'spend',(select count(*) from public.parent_explanation_spend),'cache',(select count(*) from public.parent_explanations)) as proof;
