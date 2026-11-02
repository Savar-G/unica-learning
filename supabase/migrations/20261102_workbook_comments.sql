-- #313 review flow: saved comment drafts, one queue job and one revision per submitted batch.
create table public.workbook_comments (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.workbook_drafts(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  revision int not null,
  page_number int not null check(page_number>0),
  question_number int,
  x double precision not null check(x between 0 and 1),
  y double precision not null check(y between 0 and 1),
  note text not null check(char_length(note) between 1 and 2000),
  item jsonb,
  actor_id uuid not null,
  actor_email text not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','sent','done','failed','stale')),
  batch_id uuid references public.workbook_edits(id) on delete set null,
  error text,
  before_value jsonb,
  after_value jsonb,
  constraint workbook_comments_child_fkey foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade
);
alter table public.workbook_comments enable row level security;
revoke all on public.workbook_comments from anon,authenticated,service_role;
grant select on public.workbook_comments to authenticated,service_role;
create policy "Admins read workbook comments" on public.workbook_comments for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_comments for each row execute function public.fence_family_write();

create function public.save_workbook_comment(p_draft uuid,p_revision int,p_comment jsonb,p_by uuid,p_email text,p_delete boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d record; r record; c record; v_status text; v_id uuid; v_content jsonb;
begin
  select * into d from public.workbook_drafts where id=p_draft for no key update;
  if not found then return jsonb_build_object('status','refused','reason','This draft is unavailable.'); end if;
  select status into v_status from public.workbooks where id=p_draft for update;
  if v_status in ('printed','shipped') then return jsonb_build_object('status','refused','reason','This workbook is printed or shipped. It cannot change.'); end if;
  select * into r from public.workbook_draft_revisions where draft_id=p_draft order by revision desc limit 1;
  if r.revision is distinct from p_revision then return jsonb_build_object('status','refused','reason','This workbook changed. Reload the page.'); end if;
  if p_comment->>'id' is not null then
    select * into c from public.workbook_comments where id=(p_comment->>'id')::uuid and draft_id=p_draft for update;
    if not found or c.status not in ('pending','failed','stale') then return jsonb_build_object('status','refused','reason','This comment was sent. Reload the page.'); end if;
    if p_delete then delete from public.workbook_comments where id=c.id; return jsonb_build_object('status','saved'); end if;
  end if;
  v_content:=coalesce(r.content,d.draft);
  if not exists(select 1 from jsonb_array_elements(v_content->'pages') pg where (pg->>'number')::int=(p_comment->>'page')::int
    and (p_comment->>'question' is null or exists(select 1 from jsonb_array_elements(pg->'questions') q where q->>'number'=p_comment->>'question'))) then
    return jsonb_build_object('status','refused','reason','The comment location no longer exists. Select a page or question again.');
  end if;
  if c.id is not null then
    update public.workbook_comments set note=p_comment->>'note', item=nullif(p_comment->'item','null'),status='pending',error=null,
      revision=p_revision,page_number=(p_comment->>'page')::int,question_number=(p_comment->>'question')::int,
      x=(p_comment->>'x')::float8,y=(p_comment->>'y')::float8 where id=c.id returning id into v_id;
  else
    insert into public.workbook_comments(draft_id,parent_id,child_id,revision,page_number,question_number,x,y,note,item,actor_id,actor_email)
      values(p_draft,d.parent_id,d.child_id,p_revision,(p_comment->>'page')::int,(p_comment->>'question')::int,
        (p_comment->>'x')::float8,(p_comment->>'y')::float8,p_comment->>'note',nullif(p_comment->'item','null'),p_by,p_email) returning id into v_id;
  end if;
  return jsonb_build_object('status','saved','id',v_id);
end $$;

create function public.send_workbook_comments(p_draft uuid,p_revision int,p_by uuid,p_email text,p_runner text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_result jsonb; v_page int;
begin
  perform 1 from public.workbook_drafts where id=p_draft for no key update;
  select min(page_number) into v_page from public.workbook_comments where draft_id=p_draft and revision=p_revision and status in ('pending','failed');
  if v_page is null then return jsonb_build_object('status','refused','reason','Add a comment first.'); end if;
  v_result:=public.queue_workbook_edit(p_draft,p_revision,v_page,null,'redo-page','Review comments',null,p_by,p_email,p_runner);
  if v_result->>'status'<>'queued' then return v_result; end if;
  v_id:=(v_result->>'id')::uuid;
  update public.workbook_comments set batch_id=v_id,status='sent',error=null where draft_id=p_draft and revision=p_revision and status in ('pending','failed');
  return v_result;
end $$;

create or replace function public.finish_workbook_edit(p_id uuid, p_lease uuid, p_content jsonb, p_rendering jsonb, p_problems jsonb, p_error text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e record; d record; v_status text; r record; v_before jsonb; v_after jsonb; pg record; q jsonb; v_page_id uuid; v_targets int[]; v_question int; v_page_number int;
begin
  -- Same draft-before-workbook lock order as approve and mark. Recheck the lease only after those locks.
  select * into e from public.workbook_edits where id=p_id;
  if not found then return jsonb_build_object('status','refused','reason','This edit is unavailable.'); end if;
  select * into d from public.workbook_drafts where id=e.draft_id for no key update;
  select status into v_status from public.workbooks where id=e.draft_id for update;
  select * into e from public.workbook_edits where id=p_id for update;
  if e.status <> 'running' or e.lease is distinct from p_lease then return jsonb_build_object('status','refused','reason','This edit stopped. Reload the page.'); end if;
  select * into r from public.workbook_draft_revisions where draft_id=e.draft_id order by revision desc limit 1;
  if p_error is null and (r.revision <> e.base_revision or v_status in ('printed','shipped')) then p_error := 'This workbook changed. Reload the page.'; end if;
  if p_error is null then
    select array_agg(distinct page_number) into v_targets from public.workbook_comments where batch_id=p_id and status='sent'
      and not exists(select 1 from jsonb_array_elements(p_problems) x where (x->>'page')::int=page_number);
    if v_targets is null then p_error:='No comments could be applied. See each comment for the reason.'; end if;
  end if;
  if p_error is null then
    v_before := coalesce(r.content,d.draft);
    -- Only the selected page and its rendering may differ. Numbers, QR tokens, book identity stay fixed.
    if (v_before - 'pages' - 'counts') is distinct from (p_content - 'pages' - 'counts')
      or jsonb_array_length(v_before->'pages') <> jsonb_array_length(p_content->'pages') then raise exception 'The workbook identity changed'; end if;
    for pg in select b.value as b, a.value as a from jsonb_array_elements(v_before->'pages') with ordinality b(value,n)
      join jsonb_array_elements(p_content->'pages') with ordinality a(value,n) using(n) loop
      if not ((pg.b->>'number')::int = any(v_targets)) then
        if pg.b is distinct from pg.a then raise exception 'Another page changed'; end if;
      else
        v_before := pg.b; v_after := pg.a;
        if (pg.b - 'questions' - 'content' - 'fit') is distinct from (pg.a - 'questions' - 'content' - 'fit') then raise exception 'The page identity changed'; end if;
        select case when bool_or(question_number is null) then null else -1 end into v_question
          from public.workbook_comments where batch_id=p_id and page_number=(pg.b->>'number')::int;
        if v_question is not null and (
          (select jsonb_agg(x) from jsonb_array_elements(pg.b->'questions') x where not exists(select 1 from public.workbook_comments c where c.batch_id=p_id and c.page_number=(pg.b->>'number')::int and c.question_number=(x->>'number')::int))
            is distinct from (select jsonb_agg(x) from jsonb_array_elements(pg.a->'questions') x where not exists(select 1 from public.workbook_comments c where c.batch_id=p_id and c.page_number=(pg.b->>'number')::int and c.question_number=(x->>'number')::int))
        ) then raise exception 'Another question changed'; end if;
      end if;
    end loop;
    if (select jsonb_agg(x) from jsonb_array_elements(r.rendering->'pages') x where not ((x->>'number')::int=any(v_targets)))
      is distinct from (select jsonb_agg(x) from jsonb_array_elements(p_rendering->'pages') x where not ((x->>'number')::int=any(v_targets))) then raise exception 'Another page image changed'; end if;
    insert into public.workbook_draft_revisions(draft_id,revision,parent_id,child_id,kind,by_user,by_email,note,content,rendering,render_problems)
      values(e.draft_id,r.revision+1,e.parent_id,e.child_id,case when e.action='redo-page' then 'redo-page' else 'edit' end,e.actor_id,e.actor_email,e.note,p_content,p_rendering,p_problems);
    if v_status is not null then
      update public.workbooks set status='draft',approved_at=null,pdf_path=p_rendering->>'pdfPath' where id=e.draft_id;
      foreach v_page_number in array v_targets loop
      select value into v_after from jsonb_array_elements(p_content->'pages') where (value->>'number')::int=v_page_number;
      -- Keep stored pages and packages consistent with the new draft. No rows on other pages change.
      select id into v_page_id from public.workbook_pages where workbook_id=e.draft_id and page_number=v_page_number;
      update public.workbook_pages set image_path=x->'image'->>'path',image_width=(x->'image'->>'width')::int,image_height=(x->'image'->>'height')::int
        from jsonb_array_elements(p_rendering->'pages') x where id=v_page_id and (x->>'number')::int=v_page_number;
      for q in select value from jsonb_array_elements(v_after->'questions') loop
        update public.workbook_questions set package=q->'package' where page_id=v_page_id and question_number=(q->>'number')::int;
      end loop;
      update public.workbook_questions w set box_x=(q->'box'->>'x')::int,box_y=(q->'box'->>'y')::int,box_width=(q->'box'->>'width')::int,box_height=(q->'box'->>'height')::int
        from jsonb_array_elements(p_rendering->'pages') p, jsonb_array_elements(p->'questions') q
        where w.page_id=v_page_id and (p->>'number')::int=v_page_number and w.question_number=(q->>'number')::int;
      end loop;
    end if;
    update public.workbook_edits set status='done',finished_at=now(),before_page=v_before,after_page=v_after,revision=r.revision+1 where id=p_id;
    update public.workbook_comments c set status=case when c.page_number=any(v_targets) then 'done' else 'failed' end,
      error=(select x->>'reason' from jsonb_array_elements(p_problems) x where (x->>'page')::int=c.page_number limit 1),
      before_value=(select case when c.question_number is null then pg else (select q from jsonb_array_elements(pg->'questions') q where (q->>'number')::int=c.question_number) end
        from jsonb_array_elements(coalesce(r.content,d.draft)->'pages') pg where (pg->>'number')::int=c.page_number),
      after_value=(select case when c.question_number is null then pg else (select q from jsonb_array_elements(pg->'questions') q where (q->>'number')::int=c.question_number) end
        from jsonb_array_elements(p_content->'pages') pg where (pg->>'number')::int=c.page_number)
      where c.batch_id=p_id and c.status='sent';
    update public.workbook_comments c set revision=r.revision+1,
      status=case when exists(select 1 from jsonb_array_elements(p_content->'pages') pg where (pg->>'number')::int=c.page_number
        and (c.question_number is null or exists(select 1 from jsonb_array_elements(pg->'questions') q where (q->>'number')::int=c.question_number))) then c.status else 'stale' end
      where c.draft_id=e.draft_id and c.status in ('pending','failed','stale');
    insert into public.workbook_audit(parent_id,child_id,draft_id,actor_id,actor_email,action,detail)
      values(e.parent_id,e.child_id,e.draft_id,e.actor_id,e.actor_email,'workbook-comments-sent',jsonb_build_object('pages',to_jsonb(v_targets),'comments',(select count(*) from public.workbook_comments where batch_id=p_id),'revision',r.revision+1));
    return jsonb_build_object('status','done','revision',r.revision+1);
  end if;
  update public.workbook_comments c set status='failed',error=coalesce((select x->>'reason' from jsonb_array_elements(p_problems) x where (x->>'page')::int=c.page_number limit 1),p_error) where batch_id=p_id and status='sent';
  update public.workbook_edits set status='failed',finished_at=now(),error=p_error where id=p_id;
  return jsonb_build_object('status','refused','reason',p_error);
end $$;

revoke all on function public.save_workbook_comment(uuid,int,jsonb,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.send_workbook_comments(uuid,int,uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_workbook_comment(uuid,int,jsonb,uuid,text,boolean) to service_role;
grant execute on function public.send_workbook_comments(uuid,int,uuid,text,text) to service_role;
