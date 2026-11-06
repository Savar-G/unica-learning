-- Rollback probe for the installed S4 schema. Uses synthetic local data only.
-- The parent may adapt the harness for a dedicated hosted QA family; this file makes no hosted claim.
begin;
do $$
declare p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); pg uuid:=gen_random_uuid(); ph uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid();
  i jsonb; o jsonb; answer jsonb; before_spend bigint;
begin
  insert into auth.users(id) values(p);
  insert into public.parents(id) values(p);
  insert into public.children(id,parent_id) values(c,p);
  insert into public.workbooks(id,parent_id,child_id,status,printed_revision) values(w,p,c,'shipped','rollback-print');
  insert into public.workbook_pages(id,parent_id,workbook_id,page_number,print_contract,image_width,image_height) values(pg,p,w,1,'{}',1000,1400);
  insert into public.workbook_questions(parent_id,workbook_id,page_id,question_number,package) values(p,w,pg,1,'{"id":"rollback-item"}');
  insert into public.scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at) values(ph,p,c,pg,w,'rollback-print','saved',0,1000,1400,now());
  insert into public.scan_calibrations(photo_id,parent_id,printed_revision,state,lease_token,lease_until,result) values(ph,p,'rollback-print','ready',tok,now(),'{"parts":["straight"],"sheetCheck":1}');
  i:=jsonb_build_object('identity',jsonb_build_object('workbookId',w,'printedRevision','rollback-print','pageId',pg,'itemId','rollback-item'),'number',1,'method','unscored','scoredRegions','[]'::jsonb,'mastery',jsonb_build_object('eligible',false,'reason','not-scorable'),'teaching',null);
  o:=jsonb_build_object('version',1,'identity',i->'identity','evidence',null,'readAnswerText',null,'regions','[]'::jsonb,'certainty','not-read','state','unscored','method','unscored','result',null,'teaching',null,'mastery',i->'mastery','help','unknown','actor','system','resultVersion',1);
  answer:=public.scan_marking_command('claim',p,ph,tok,jsonb_build_object('hash','rollback','items',jsonb_build_array(jsonb_build_object('expected',i,'observation',o))));
  if jsonb_array_length(answer->'items')<>1 then raise exception 'canonical_seed_failed'; end if;
  if public.scan_marking_command('extract',p,ph,tok,jsonb_build_object('observations',jsonb_build_array(o),'model','none','prompt','whole-page-numbers-v1'))<>'true' then raise exception 'extraction_failed'; end if;
  if public.scan_marking_command('apply',p,ph,tok,jsonb_build_object('events','[]'::jsonb,'at',now()))<>'true' then raise exception 'unscored_apply_failed'; end if;
  if exists(select 1 from public.scan_marking_items where child_id=c and original_event is not null) then raise exception 'unscored_event_invented'; end if;
  delete from public.children where id=c;
  if exists(select 1 from public.scan_marking_items where child_id=c) or exists(select 1 from public.scan_marking_jobs where child_id=c) then raise exception 'child_cascade_failed'; end if;
  if public.scan_marking_command('claim',p,ph,tok,'{}')<>'"terminal"' then raise exception 'late_job_restored'; end if;
  raise notice 'PROBE_OK: canonical unscored completion, no event, child cascade, late refusal';
end $$;
rollback;
