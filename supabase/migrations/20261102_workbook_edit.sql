-- #313: queued replacements and an atomic revision compare-and-set. No content changes before commit.
create table public.workbook_edits (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.workbook_drafts(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  base_revision int not null,
  page_number int not null check (page_number > 0),
  question_number int,
  action text not null check (action in ('edit', 'fix-question', 'redo-page')),
  note text not null check (char_length(note) <= 2000),
  item jsonb,
  actor_id uuid not null,
  actor_email text not null,
  runner text not null check (runner in ('mac', 'server')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  lease uuid,
  created_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  before_page jsonb,
  after_page jsonb,
  revision int,
  constraint workbook_edits_child_fkey foreign key(child_id, parent_id) references public.children(id, parent_id) on delete cascade,
  check ((action = 'redo-page') = (question_number is null))
);
create unique index workbook_edits_active on public.workbook_edits(draft_id) where status in ('queued', 'running');
alter table public.workbook_edits enable row level security;
revoke all on public.workbook_edits from anon, authenticated, service_role;
grant select on public.workbook_edits to authenticated, service_role;
grant update (heartbeat_at) on public.workbook_edits to service_role;
create policy "Admins read workbook edits" on public.workbook_edits for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_edits for each row execute function public.fence_family_write();

create function public.queue_workbook_edit(p_draft uuid, p_revision int, p_page int, p_question int,
  p_action text, p_note text, p_item jsonb, p_by uuid, p_email text, p_runner text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d record; v_status text; v_latest int; v_content jsonb; v_id uuid;
begin
  select * into d from public.workbook_drafts where id = p_draft for no key update;
  if not found then return jsonb_build_object('status','refused','reason','This draft is unavailable.'); end if;
  select status into v_status from public.workbooks where id = p_draft for update;
  if v_status in ('printed','shipped') then return jsonb_build_object('status','refused','reason','This workbook is printed or shipped. It cannot change.'); end if;
  select revision, coalesce(content,d.draft) into v_latest,v_content from public.workbook_draft_revisions where draft_id=p_draft order by revision desc limit 1;
  if v_latest is distinct from p_revision or exists(select 1 from public.workbook_edits where draft_id=p_draft and status in ('queued','running')) then
    return jsonb_build_object('status','refused','reason','This workbook changed or has an edit in progress. Reload the page.');
  end if;
  if not exists(select 1 from jsonb_array_elements(v_content->'pages') pg where (pg->>'number')::int=p_page
    and (p_question is null or exists(select 1 from jsonb_array_elements(pg->'questions') q where (q->>'number')::int=p_question))) then
    return jsonb_build_object('status','refused','reason','This question or page is unavailable. Reload the page.');
  end if;
  insert into public.workbook_edits(draft_id,parent_id,child_id,base_revision,page_number,question_number,action,note,item,actor_id,actor_email,runner)
    values(p_draft,d.parent_id,d.child_id,p_revision,p_page,p_question,p_action,p_note,p_item,p_by,p_email,p_runner) returning id into v_id;
  return jsonb_build_object('status','queued','id',v_id);
end $$;

create function public.claim_workbook_edit(p_id uuid, p_lease uuid, p_runner text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.workbook_edits set status='running', lease=p_lease, heartbeat_at=now()
    where id=p_id and runner=p_runner and (status='queued' or (status='running' and heartbeat_at < now()-interval '6 minutes'));
  return found;
end $$;

create function public.finish_workbook_edit(p_id uuid, p_lease uuid, p_content jsonb, p_rendering jsonb, p_problems jsonb, p_error text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e record; d record; v_status text; r record; v_before jsonb; v_after jsonb; pg record; q jsonb; v_page_id uuid;
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
    v_before := coalesce(r.content,d.draft);
    -- Only the selected page and its rendering may differ. Numbers, QR tokens, book identity stay fixed.
    if (v_before - 'pages' - 'counts') is distinct from (p_content - 'pages' - 'counts')
      or jsonb_array_length(v_before->'pages') <> jsonb_array_length(p_content->'pages') then raise exception 'The workbook identity changed'; end if;
    for pg in select b.value as b, a.value as a from jsonb_array_elements(v_before->'pages') with ordinality b(value,n)
      join jsonb_array_elements(p_content->'pages') with ordinality a(value,n) using(n) loop
      if (pg.b->>'number')::int <> e.page_number then
        if pg.b is distinct from pg.a then raise exception 'Another page changed'; end if;
      else
        v_before := pg.b; v_after := pg.a;
        if (pg.b - 'questions' - 'content' - 'fit') is distinct from (pg.a - 'questions' - 'content' - 'fit') then raise exception 'The page identity changed'; end if;
        if e.question_number is not null and (
          (select jsonb_agg(x) from jsonb_array_elements(pg.b->'questions') x where (x->>'number')::int<>e.question_number)
            is distinct from (select jsonb_agg(x) from jsonb_array_elements(pg.a->'questions') x where (x->>'number')::int<>e.question_number)
        ) then raise exception 'Another question changed'; end if;
      end if;
    end loop;
    if (select jsonb_agg(x) from jsonb_array_elements(r.rendering->'pages') x where (x->>'number')::int<>e.page_number)
      is distinct from (select jsonb_agg(x) from jsonb_array_elements(p_rendering->'pages') x where (x->>'number')::int<>e.page_number) then raise exception 'Another page image changed'; end if;
    insert into public.workbook_draft_revisions(draft_id,revision,parent_id,child_id,kind,by_user,by_email,note,content,rendering,render_problems)
      values(e.draft_id,r.revision+1,e.parent_id,e.child_id,case when e.action='redo-page' then 'redo-page' else 'edit' end,e.actor_id,e.actor_email,e.note,p_content,p_rendering,p_problems);
    if v_status is not null then
      update public.workbooks set status='draft',approved_at=null,pdf_path=p_rendering->>'pdfPath' where id=e.draft_id;
      -- Keep stored pages and packages consistent with the new draft. No rows on other pages change.
      select id into v_page_id from public.workbook_pages where workbook_id=e.draft_id and page_number=e.page_number;
      update public.workbook_pages set image_path=x->'image'->>'path',image_width=(x->'image'->>'width')::int,image_height=(x->'image'->>'height')::int
        from jsonb_array_elements(p_rendering->'pages') x where id=v_page_id and (x->>'number')::int=e.page_number;
      for q in select value from jsonb_array_elements(v_after->'questions') loop
        update public.workbook_questions set package=q->'package' where page_id=v_page_id and question_number=(q->>'number')::int;
      end loop;
      update public.workbook_questions w set box_x=(q->'box'->>'x')::int,box_y=(q->'box'->>'y')::int,box_width=(q->'box'->>'width')::int,box_height=(q->'box'->>'height')::int
        from jsonb_array_elements(p_rendering->'pages') p, jsonb_array_elements(p->'questions') q
        where w.page_id=v_page_id and (p->>'number')::int=e.page_number and w.question_number=(q->>'number')::int;
    end if;
    update public.workbook_edits set status='done',finished_at=now(),before_page=v_before,after_page=v_after,revision=r.revision+1 where id=p_id;
    insert into public.workbook_audit(parent_id,child_id,draft_id,actor_id,actor_email,action,detail)
      values(e.parent_id,e.child_id,e.draft_id,e.actor_id,e.actor_email,'workbook-edited',jsonb_build_object('page',e.page_number,'question',e.question_number,'note',e.note,'action',e.action,'revision',r.revision+1));
    return jsonb_build_object('status','done','revision',r.revision+1);
  end if;
  update public.workbook_edits set status='failed',finished_at=now(),error=p_error where id=p_id;
  return jsonb_build_object('status','refused','reason',p_error);
end $$;

do $$ declare f regprocedure; begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace
    and proname in ('queue_workbook_edit','claim_workbook_edit','finish_workbook_edit') loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;

-- A revised workbook already has its current pages. Permit its approval again.
create or replace function public.approve_workbook_draft(
  p_draft uuid, p_revision int, p_workbook jsonb, p_schema_version smallint, p_by uuid, p_by_email text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; v_latest int; v_write jsonb; v_run uuid;
begin
  -- FOR NO KEY UPDATE: two approvals and a mark of the same draft still wait for each other, but an edit revision's
  -- foreign key (FOR KEY SHARE on the draft) does not, so an edit and an approval cannot deadlock (P2-3).
  select id, parent_id, child_id, number into d from public.workbook_drafts where id = p_draft for no key update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the draft is not known'); end if;
  select max(revision) into v_latest from public.workbook_draft_revisions where draft_id = p_draft;
  if v_latest is null then return jsonb_build_object('status', 'refused', 'reason', 'the draft has no rendering yet'); end if;
  if v_latest <> p_revision then
    return jsonb_build_object('status', 'refused', 'reason', format('version %s is not the current version (%s): reload the page', p_revision, v_latest));
  end if;
  if p_workbook->>'id' is distinct from p_draft::text or p_workbook->>'childId' is distinct from d.child_id::text
    or p_workbook->>'number' is distinct from d.number::text then
    return jsonb_build_object('status', 'refused', 'reason', 'the workbook is not this draft');
  end if;
  if not exists(select 1 from public.workbooks where id=p_draft and status='draft') then
    v_write := public.write_workbook(p_workbook, p_schema_version);
    if v_write->>'status' <> 'written' then return v_write; end if;
  end if;
  update public.workbooks set status = 'approved', approved_at = now() where id = p_draft;
  select id into v_run from public.workbook_runs where draft_id = p_draft order by created_at desc limit 1;
  insert into public.workbook_audit (parent_id, child_id, run_id, draft_id, workbook_id, actor_id, actor_email, action, detail)
    values (d.parent_id, d.child_id, v_run, p_draft, p_draft, p_by, p_by_email, 'workbook-approved',
      jsonb_build_object('revision', p_revision, 'number', d.number));
  return jsonb_build_object('status', 'approved', 'workbookId', p_draft);
end $$;
