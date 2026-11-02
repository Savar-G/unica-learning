-- #435: scope client request keys to the authenticated admin supplied by the server.
-- Keep the legacy column and index for compatibility. Copy existing keys so their retries still resolve.
alter table public.workbook_comments add column client_request_key uuid;
update public.workbook_comments set client_request_key=request_key where request_key is not null;
create unique index workbook_comments_admin_request_key
  on public.workbook_comments(draft_id,actor_id,client_request_key) where client_request_key is not null;

create or replace function public.save_workbook_comment(p_draft uuid,p_revision int,p_comment jsonb,p_by uuid,p_email text,p_delete boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d record; r record; c public.workbook_comments%rowtype; v_status text; v_id uuid; v_content jsonb;
begin
  select * into d from public.workbook_drafts where id=p_draft for no key update;
  if not found then return jsonb_build_object('status','refused','reason','This draft is unavailable.'); end if;
  select status into v_status from public.workbooks where id=p_draft for update;
  if v_status in ('printed','shipped') then return jsonb_build_object('status','refused','reason','This workbook is printed or shipped. It cannot change.'); end if;
  -- A repeated creation returns its first row, even if the batch has since consumed it.
  if p_comment->>'id' is null and p_comment->>'requestKey' is not null then
    select * into c from public.workbook_comments where draft_id=p_draft and actor_id=p_by and client_request_key=(p_comment->>'requestKey')::uuid;
    if found then return jsonb_build_object('status','saved','id',c.id); end if;
  end if;
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
    insert into public.workbook_comments(draft_id,parent_id,child_id,revision,page_number,question_number,x,y,note,item,actor_id,actor_email,client_request_key)
      values(p_draft,d.parent_id,d.child_id,p_revision,(p_comment->>'page')::int,(p_comment->>'question')::int,
        (p_comment->>'x')::float8,(p_comment->>'y')::float8,p_comment->>'note',nullif(p_comment->'item','null'),p_by,p_email,(p_comment->>'requestKey')::uuid) returning id into v_id;
  end if;
  return jsonb_build_object('status','saved','id',v_id);
end $$;
