-- Reduced stored-workbook schema for the real finish and approval functions.
alter table public.workbook_drafts add column number int not null default 1;
alter table public.workbooks add column printed_revision text, add column pdf_sha256 text, add column print_manifest jsonb;
alter table public.workbook_pages add column print_contract jsonb, add column qr_token text;
alter table public.workbook_questions add column regions jsonb, add column teaching jsonb;
alter table public.workbook_audit add column run_id uuid, add column workbook_id uuid;
create table public.workbook_runs(id uuid,draft_id uuid,created_at timestamptz);

create function public.qa_layout_case(p_page int,p_status text) returns jsonb language plpgsql as $$
declare d uuid;c uuid;e uuid;l uuid:=gen_random_uuid();a uuid:=gen_random_uuid();r jsonb;plan jsonb;
begin
  d:=public.qa_seed_book();
  c:=(public.save_workbook_comment(d,1,jsonb_build_object('page',p_page,'x',.5,'y',.5,'note','Correct the page layout'),a,'test@example.com',false)->>'id')::uuid;
  plan:=jsonb_build_object('reviewed',true,'build',repeat('a',40),'pages',jsonb_build_array(p_page),'results',jsonb_build_array(jsonb_build_object('id',c,'page',p_page,'status',p_status,'note','Reviewed correction; any remaining request stays open.')));
  e:=(public.queue_workbook_layout_edit(d,1,plan,a,'test@example.com')->>'id')::uuid;
  if not public.claim_workbook_layout_edit(e,l) then raise exception 'QA layout claim failed'; end if;
  update public.workbook_edits set frame=jsonb_build_object('calls',1,'build',repeat('a',40),'model',null,'solveModel','layout-no-model','layoutPages',jsonb_build_array(p_page)) where id=e;
  select rendering into r from public.workbook_draft_revisions where draft_id=d and revision=1;
  r:=jsonb_set(r,array['pages',(p_page-1)::text,'printContract','fingerprints','image'],to_jsonb(repeat('b',64)));
  return jsonb_build_object('draft',d,'edit',e,'lease',l,'comment',c,'rendering',r,'results',plan->'results');
end $$;

create function public.qa_check_stored_layout() returns void language plpgsql as $$
declare v_case jsonb;r jsonb;old_r jsonb;v jsonb;d uuid;pg uuid;q jsonb;b jsonb;before_other jsonb;
begin
  v_case:=public.qa_layout_case(3,'applied');d:=(v_case->>'draft')::uuid;r:=v_case->'rendering';
  select rendering into old_r from public.workbook_draft_revisions where draft_id=d and revision=1;
  insert into public.workbooks(id,parent_id,child_id,status,pdf_path,approved_at)
    select id,parent_id,child_id,'approved',old_r->>'pdfPath',now() from public.workbook_drafts where id=d;
  for b in select value from jsonb_array_elements(old_r->'pages') loop
    insert into public.workbook_pages(workbook_id,page_number,image_path,image_width,image_height,qr_token,print_contract)
      values(d,(b->>'number')::int,b->'image'->>'path',816,1056,'test-only-qr-'||(b->>'number'),b->'printContract') returning id into pg;
    for q in select value from jsonb_array_elements(b->'questions') loop
      insert into public.workbook_questions(page_id,question_number,package,box_x,box_y,box_width,box_height)
        values(pg,(q->>'number')::int,jsonb_build_object('unchanged',q->'number'),10,20,30,40);
    end loop;
  end loop;
  select jsonb_agg(to_jsonb(wp) order by page_number) into before_other from public.workbook_pages wp where workbook_id=d and page_number<>3;
  r:=jsonb_set(r,'{pages,2,image}',jsonb_build_object('path',split_part(r->'pages'->2->'image'->>'path','/old-',1)||'/corrected-day.png','width',900,'height',1200));
  r:=jsonb_set(r,'{pages,2,questions}',jsonb_build_array(
    jsonb_build_object('number',1,'box',jsonb_build_object('x',100,'y',200,'width',300,'height',400)),
    jsonb_build_object('number',2,'box',jsonb_build_object('x',110,'y',210,'width',310,'height',410))));
  v:=public.finish_workbook_layout_edit((v_case->>'edit')::uuid,(v_case->>'lease')::uuid,r,v_case->'results',null);
  if v->>'status'<>'done' then raise exception 'F1: finish refused %',v; end if;
  v:=public.approve_workbook_draft(d,2,jsonb_build_object('id',d,'childId',(select child_id from public.workbook_drafts where id=d),'number',1,
    'printedRevision','qa-revision-2','pdfSha256',repeat('b',64),'pages',r->'pages'),1::smallint,gen_random_uuid(),'test@example.com');
  if v->>'status'<>'approved' then raise exception 'F1: approval refused %',v; end if;
  if not exists(select 1 from public.workbook_pages where workbook_id=d and page_number=3 and image_path=r->'pages'->2->'image'->>'path' and image_width=900 and image_height=1200)
    or not exists(select 1 from public.workbook_questions w join public.workbook_pages p on p.id=w.page_id where p.workbook_id=d and p.page_number=3 and w.question_number=1 and (w.box_x,w.box_y,w.box_width,w.box_height)=(100,200,300,400)) then
    raise exception 'F1: approved stored images or question boxes stayed old';
  end if;
  if before_other is distinct from (select jsonb_agg(to_jsonb(wp) order by page_number) from public.workbook_pages wp where workbook_id=d and page_number<>3)
    or exists(select 1 from public.workbook_questions w join public.workbook_pages p on p.id=w.page_id where p.workbook_id=d and w.package is distinct from jsonb_build_object('unchanged',w.question_number))
    or exists(select 1 from public.workbook_pages where workbook_id=d and qr_token<>'test-only-qr-'||page_number::text) then
    raise exception 'F1: an unselected page, package or QR identity changed';
  end if;
end $$;

create function public.qa_check_outcome_promotion() returns void language plpgsql as $$
declare v_case jsonb;v jsonb;
begin
  v_case:=public.qa_layout_case(1,'partial');
  v:=public.finish_workbook_layout_edit((v_case->>'edit')::uuid,(v_case->>'lease')::uuid,v_case->'rendering',jsonb_set(v_case->'results','{0,status}','"applied"'),null);
  if v->>'status'<>'refused' or (select status from public.workbook_comments where id=(v_case->>'comment')::uuid)='done'
    or (select max(revision) from public.workbook_draft_revisions where draft_id=(v_case->>'draft')::uuid)<>1 then
    raise exception 'F2: a reviewed partial result was promoted to applied';
  end if;
end $$;
