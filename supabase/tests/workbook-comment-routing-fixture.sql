create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.parents(id uuid primary key,deleting boolean not null default false);
create table public.children(id uuid primary key,parent_id uuid references public.parents on delete cascade,deleting boolean not null default false);
create table public.workbook_drafts(id uuid primary key,parent_id uuid references public.parents on delete cascade,child_id uuid references public.children on delete cascade,draft jsonb not null);
create table public.workbooks(id uuid primary key,parent_id uuid,child_id uuid,status text,approved_at timestamptz,pdf_path text);
create table public.workbook_draft_revisions(draft_id uuid references public.workbook_drafts on delete cascade,revision int,parent_id uuid,child_id uuid,kind text,by_user uuid,by_email text,note text,content jsonb,rendering jsonb,render_problems jsonb not null default '[]',primary key(draft_id,revision));
create table public.workbook_edits(id uuid primary key default gen_random_uuid(),draft_id uuid references public.workbook_drafts on delete cascade,parent_id uuid,child_id uuid,base_revision int,page_number int,question_number int,action text,note text,item jsonb,actor_id uuid,actor_email text,runner text,status text not null default 'queued',lease uuid,heartbeat_at timestamptz not null default now(),created_at timestamptz not null default now(),finished_at timestamptz,revision int,before_page jsonb,after_page jsonb,frame jsonb,checkpoints jsonb not null default '{}');
create unique index workbook_edits_active on public.workbook_edits(draft_id) where status in ('queued','running');
alter table public.workbook_edits add column error text;
create table public.workbook_comments(id uuid primary key default gen_random_uuid(),draft_id uuid references public.workbook_drafts on delete cascade,parent_id uuid,child_id uuid,revision int,page_number int,question_number int,x float8,y float8,note text,item jsonb,actor_id uuid,actor_email text,request_key uuid,client_request_key uuid,status text not null default 'pending',error text,batch_id uuid references public.workbook_edits on delete set null,before_value jsonb,after_value jsonb,created_at timestamptz not null default now());
create unique index workbook_comments_admin_request_key on public.workbook_comments(draft_id,actor_id,client_request_key) where client_request_key is not null;
create table public.workbook_audit(id bigint generated always as identity,parent_id uuid,child_id uuid,draft_id uuid,actor_id uuid,actor_email text,action text,detail jsonb);
create table public.workbook_pages(id uuid primary key default gen_random_uuid(),workbook_id uuid,page_number int,image_path text,image_width int,image_height int);
create table public.workbook_questions(page_id uuid,question_number int,package jsonb,box_x int,box_y int,box_width int,box_height int);

create function public.qa_fence() returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.parents where id=new.parent_id and deleting)
    or exists(select 1 from public.children where id=new.child_id and deleting) then raise exception 'family_or_child_unavailable'; end if;
  return new;
end $$;
create trigger qa_fence before insert or update on public.workbook_edits for each row execute function public.qa_fence();
create trigger qa_fence before insert or update on public.workbook_comments for each row execute function public.qa_fence();
create trigger qa_fence before insert or update on public.workbook_draft_revisions for each row execute function public.qa_fence();

create function public.qa_seed_book() returns uuid language plpgsql as $$
declare p uuid:=gen_random_uuid();c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();v jsonb;r jsonb;
begin
  insert into public.parents values(p,false);insert into public.children values(c,p,false);
  v:=jsonb_build_object('id',d,'childId',c,'counts',jsonb_build_object('pages',3,'questions',2),'pages',jsonb_build_array(
    jsonb_build_object('number',1,'qrToken','cover-qr','content',jsonb_build_object('kind','cover'),'questions','[]'::jsonb),
    jsonb_build_object('number',2,'qrToken','plan-qr','content',jsonb_build_object('kind','how-plan','rows',jsonb_build_array(jsonb_build_object('day',1,'pages','3'))),'questions','[]'::jsonb),
    jsonb_build_object('number',3,'qrToken','day-qr','content',jsonb_build_object('kind','day','level',16),'questions',jsonb_build_array(
      jsonb_build_object('number',1,'package',jsonb_build_object('text','Read the digit.','answer',1,'textSource','code')),
      jsonb_build_object('number',2,'package',jsonb_build_object('text','Read another digit.','answer',2,'textSource','code'))))));
  r:=jsonb_build_object('pdfPath',p::text||'/'||d::text||'/old.pdf','pdfSha256',repeat('a',64),'pages',(
    select jsonb_agg(jsonb_build_object('number',n,'image',jsonb_build_object('path',p::text||'/'||d::text||'/old-'||n::text||'.png','width',816,'height',1056),
      'questions',case when n=3 then '[{"number":1},{"number":2}]'::jsonb else '[]'::jsonb end,
      'printContract',jsonb_build_object('version',1,'workbookId',d,'page',n,'label','Test','coordinates','{}'::jsonb,'marks','{}'::jsonb,'fingerprints',jsonb_build_object('content',repeat('c',64),'image',repeat('a',64))))) from generate_series(1,3) n));
  insert into public.workbook_drafts values(d,p,c,v);
  insert into public.workbook_draft_revisions(draft_id,revision,parent_id,child_id,kind,content,rendering) values(d,1,p,c,'generated',v,r);
  return d;
end $$;
