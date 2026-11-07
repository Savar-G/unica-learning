-- Synthetic transaction only. No file, worker, provider or customer action occurs.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $$
declare p uuid:=gen_random_uuid();c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();v jsonb;r jsonb;
begin
  insert into auth.users(id,email) values(p,'workbook-routing-qa+'||p::text||'@example.invalid');
  insert into public.parents(id,email,name) values(p,'workbook-routing-qa+'||p::text||'@example.invalid','Synthetic QA');
  insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Synthetic',1,'BC');
  v:=jsonb_build_object('id',d,'childId',c,'number',1,'levels',jsonb_build_array(16),'profileBuild',null,'model','synthetic-no-model',
    'counts',jsonb_build_object('pages',2,'questions',0,'checked',0,'failed',0,'notChecked',0,'failedPages',0),'pages',jsonb_build_array(
      jsonb_build_object('number',1,'qrToken','synthetic-cover-qr','content',jsonb_build_object('kind','cover'),'questions','[]'::jsonb),
      jsonb_build_object('number',2,'qrToken','synthetic-plan-qr','content',jsonb_build_object('kind','how-plan','rows',jsonb_build_array(jsonb_build_object('day',1,'pages','3-10'))),'questions','[]'::jsonb)));
  r:=jsonb_build_object('pdfPath',p::text||'/'||d::text||'/old.pdf','pdfSha256',repeat('a',64),'pages',(
    select jsonb_agg(jsonb_build_object('number',n,'image',jsonb_build_object('path',p::text||'/'||d::text||'/old-'||n::text||'.png','width',816,'height',1056),
      'questions','[]'::jsonb,'printContract',jsonb_build_object('version',1,'workbookId',d,'page',n,'label','Synthetic',
      'fingerprints',jsonb_build_object('content',repeat('c',64),'image',repeat('a',64))))) from generate_series(1,2) n));
  insert into public.workbook_drafts(id,parent_id,child_id,number,levels,pages,questions,failed,not_checked,failed_pages,model,draft,schema_version)
    values(d,p,c,1,array[16],2,0,0,0,0,'synthetic-no-model',v,1);
  insert into public.workbook_draft_revisions(draft_id,revision,parent_id,child_id,kind,content,rendering)
    values(d,1,p,c,'generated',null,r);
  perform set_config('unica.routing_probe',jsonb_build_object('parent',p,'child',c,'draft',d,'rendering',r)::text,true);
end $$;
set local role service_role;
do $$
declare ctx jsonb:=current_setting('unica.routing_probe')::jsonb;d uuid:=(ctx->>'draft')::uuid;c uuid;e uuid;l uuid:=gen_random_uuid();v jsonb;r jsonb;plan jsonb;
begin
  c:=(public.save_workbook_comment(d,1,jsonb_build_object('page',1,'x',.5,'y',.5,'note','Make this easier to read.','route','layout'),gen_random_uuid(),'synthetic@example.invalid',false)->>'id')::uuid;
  if (select route from public.workbook_comments where id=c)<>'layout' then raise exception 'Explicit route lost'; end if;
  if public.send_workbook_comments(d,1,gen_random_uuid(),'synthetic@example.invalid','mac')->>'status'<>'layout-review' then raise exception 'Cover entered the writer queue'; end if;
  plan:=jsonb_build_object('reviewed',true,'build',repeat('a',40),'pages',jsonb_build_array(1),'results',jsonb_build_array(jsonb_build_object('id',c,'page',1,'status','partial','note','The remaining request stays open.')));
  v:=public.queue_workbook_layout_edit(d,1,plan,gen_random_uuid(),'synthetic@example.invalid');e:=(v->>'id')::uuid;
  if v->>'status'<>'queued' or public.claim_workbook_edit(e,l,'mac') or not public.claim_workbook_layout_edit(e,l) then raise exception 'Layout claim isolation failed'; end if;
  if public.frame_workbook_edit(e,l,jsonb_build_object('calls',1,'build',repeat('a',40),'model',null,'solveModel','layout-no-model','layoutPages',jsonb_build_array(1))) is null then raise exception 'Layout frame failed'; end if;
  r:=jsonb_set(ctx->'rendering','{pages,0,printContract,fingerprints,image}',to_jsonb(repeat('b',64)));
  v:=public.finish_workbook_layout_edit(e,l,r,plan->'results',null);
  if v->>'status'<>'done' then raise exception 'Hosted finish refused %',v; end if;
  if (select content from public.workbook_draft_revisions where draft_id=d and revision=2) is distinct from (select draft from public.workbook_drafts where id=d)
    or (select rendering->'pages'->1 from public.workbook_draft_revisions where draft_id=d and revision=2) is distinct from ctx->'rendering'->'pages'->1
    or (select status from public.workbook_comments where id=c)<>'failed'
    or (select revision from public.workbook_comments where id=c)<>2 then raise exception 'Content, schedule or partial result changed'; end if;
  if public.finish_workbook_layout_edit(e,l,r,plan->'results',null)->>'status'<>'refused' then raise exception 'Duplicate finish accepted'; end if;
  e:=(public.queue_workbook_layout_edit(d,2,plan,gen_random_uuid(),'synthetic@example.invalid')->>'id')::uuid;l:=gen_random_uuid();
  perform public.claim_workbook_layout_edit(e,l);
  perform public.frame_workbook_edit(e,l,jsonb_build_object('calls',1,'build',repeat('a',40),'model',null,'solveModel','layout-no-model','layoutPages',jsonb_build_array(1)));
  r:=jsonb_set(r,'{pages,0,printContract,fingerprints,image}',to_jsonb(repeat('d',64)));
  if public.finish_workbook_layout_edit(e,l,r,jsonb_set(plan->'results','{0,status}','"applied"'),null)->>'status'<>'refused'
    or (select max(revision) from public.workbook_draft_revisions where draft_id=d)<>2 then raise exception 'Partial outcome promotion accepted'; end if;
  if public.queue_workbook_layout_edit(d,2,jsonb_set(plan,'{results,0,status}','"unsupported"'),gen_random_uuid(),'synthetic@example.invalid')->>'status'<>'layout-review'
    or exists(select 1 from public.workbook_edits where draft_id=d and status in ('queued','running')) then raise exception 'Unsupported-only review queued work'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('unica.routing_probe')::jsonb->>'parent','role','authenticated')::text,true);
set local role authenticated;
do $$
declare ctx jsonb:=current_setting('unica.routing_probe')::jsonb;
begin
  if exists(select 1 from public.workbook_comments where draft_id=(ctx->>'draft')::uuid)
    or exists(select 1 from public.workbook_edits where draft_id=(ctx->>'draft')::uuid) then raise exception 'Parent can read private edit data'; end if;
  begin
    perform public.claim_workbook_layout_edit(gen_random_uuid(),gen_random_uuid());
    raise exception 'Parent can claim layout work';
  exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.finish_workbook_layout_edit(gen_random_uuid(),gen_random_uuid(),null,null,null);
    raise exception 'Anonymous finish access';
  exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'HOSTED_ROUTING_ROLLBACK_PASS' as result,
  (select count(*) from public.parents where email like 'workbook-routing-qa+%@example.invalid') as remaining_probe_parents,
  (select count(*) from auth.users where email like 'workbook-routing-qa+%@example.invalid') as remaining_probe_auth;
