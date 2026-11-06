-- #557. Additive schema only. Function bodies act only when the server calls them.
-- The shared code/attempt tables and the family delete hold stay unchanged.
create table public.child_deletions (
  child_id uuid primary key,
  parent_id uuid not null references public.parents(id) on delete cascade,
  requested_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  foreign key (child_id, parent_id) references public.children(id, parent_id) on delete cascade
);
alter table public.child_deletions enable row level security;
revoke all on public.child_deletions from public, anon, authenticated;
grant select on public.child_deletions to service_role;

-- Resolve the child for every row in the child cascade, including tables without child_id.
create function public.child_delete_row_child(t text, r jsonb) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare c uuid;
begin
  if t = 'children' then return (r->>'id')::uuid; end if;
  if r->>'child_id' is not null then return (r->>'child_id')::uuid; end if;
  if r->>'assessment_id' is not null then select child_id into c from public.assessments where id=(r->>'assessment_id')::uuid;
  elsif r->>'workbook_id' is not null then select child_id into c from public.workbooks where id=(r->>'workbook_id')::uuid;
  elsif r->>'draft_id' is not null then select child_id into c from public.workbook_drafts where id=(r->>'draft_id')::uuid;
  elsif r->>'run_id' is not null then select child_id into c from public.workbook_runs where id=(r->>'run_id')::uuid;
  elsif r->>'photo_id' is not null then select child_id into c from public.scan_photos where id=(r->>'photo_id')::uuid;
  elsif r->>'call_id' is not null then select child_id into c from public.maya_calls where id=(r->>'call_id')::uuid;
  elsif r->>'card_setup_id' is not null then select child_id into c from public.card_setups where id=(r->>'card_setup_id')::uuid;
  elsif r->>'batch_id' is not null then select child_id into c from public.workbook_edits where id=(r->>'batch_id')::uuid;
  elsif r->>'email_log_id' is not null then select child_id into c from public.email_log where id=(r->>'email_log_id')::uuid;
  elsif r->>'report_id' is not null then select child_id into c from public.reports where id=(r->>'report_id')::uuid;
  elsif t='family_card_operations' then select child_id into c from public.card_setups where id=(r->>'id')::uuid;
  end if;
  return c;
end $$;

create function public.fence_child_delete_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb; c uuid; p uuid;
begin
  for r in select to_jsonb(new) union all select to_jsonb(old) where tg_op='UPDATE' loop
    c := public.child_delete_row_child(tg_table_name, r);
    if c is null then continue; end if;
    select parent_id into p from public.children where id=c;
    if p is null then raise exception 'child_unavailable' using errcode='55000'; end if;
    perform public.assert_family_writable(p);
    if exists(select 1 from public.child_deletions where child_id=c) then
      raise exception 'child_unavailable' using errcode='55000';
    end if;
  end loop;
  return new;
end $$;
-- Include all current descendants, also optional tables already applied for other PRs.
do $$ declare t regclass; begin
  for t in with recursive tree(oid) as (
    select 'public.children'::regclass::oid union
    select k.conrelid from pg_constraint k join tree on k.confrelid=tree.oid where k.contype='f' and k.confdeltype='c'
  ) select oid::regclass from tree where oid <> 'public.child_deletions'::regclass loop
    execute format('create trigger fence_child_delete_write before insert or update on %s for each row execute function public.fence_child_delete_write()',t);
  end loop;
end $$;
create trigger fence_child_delete_write before insert or update on public.family_card_operations
  for each row execute function public.fence_child_delete_write();

-- Known database-owned folders only. Never infer ownership from a client-supplied path.
create function public.child_delete_roots(p uuid, c uuid)
returns table(bucket text, prefix text) language sql stable security definer set search_path = '' as $$
  select 'shown-work', p::text || '/' || a.id::text from public.assessments a where a.parent_id=p and a.child_id=c
  union select 'workbook-pages', p::text || '/' || w.id::text from public.workbooks w where w.parent_id=p and w.child_id=c
  union select 'workbook-pages', p::text || '/' || d.id::text from public.workbook_drafts d where d.parent_id=p and d.child_id=c
  union select 'scan-photos', p::text || '/' || s.id::text from public.scan_photos s where s.parent_id=p and s.child_id=c;
$$;
create function public.fence_child_delete_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  for r in select to_jsonb(new) union all select to_jsonb(old) where tg_op='UPDATE' loop
    if exists(select 1 from public.child_deletions d, lateral public.child_delete_roots(d.parent_id,d.child_id) root
      where root.bucket=r->>'bucket_id' and starts_with(lower(r->>'name'), root.prefix || '/')) then
      raise exception 'child_unavailable' using errcode='55000';
    end if;
  end loop;
  return new;
end $$;
create trigger fence_child_delete_upload before insert or update on storage.objects
  for each row execute function public.fence_child_delete_upload();

-- The parent's lock is the same lock used by family deletes and plan starts.
-- plan_starts is not yet on main (#593). Optional SQL covers it as soon as that table is installed.
create function public.check_child_deletion(p uuid, c uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare pending boolean;
begin
  perform 1 from public.parents where id=p and deletion_requested_at is null for update;
  if not found then return 'busy'; end if;
  if not exists(select 1 from public.children where id=c and parent_id=p) then return 'missing'; end if;
  if exists(select 1 from public.family_card_operations where parent_id=p)
    or exists(select 1 from public.family_delete_holds where parent_id=p and lease_until>clock_timestamp()) then return 'busy'; end if;
  if to_regclass('public.plan_starts') is not null then
    execute 'select exists(select 1 from public.plan_starts s join public.card_setups k on k.id=s.card_setup_id where k.child_id=$1 and k.parent_id=$2 and s.state not in (''started'',''other'',''refused'',''team_ended''))' into pending using c,p;
    if pending then return 'busy'; end if;
  end if;
  if to_regclass('public.child_card_updates') is not null then
    execute 'select exists(select 1 from public.child_card_updates where child_id=$1 and parent_id=$2 and pending_plan_key is not null)' into pending using c,p;
    if pending then return 'busy'; end if;
  end if;
  return 'ready';
end $$;

create function public.request_child_deletion_held(p uuid, c uuid, hold uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.parents where id=p and deletion_requested_at is null for update;
  if not found then return 'busy'; end if;
  if not exists(select 1 from public.children where id=c and parent_id=p) then return 'missing'; end if;
  if not exists(select 1 from public.family_delete_holds where parent_id=p and lease_token=hold and lease_until>clock_timestamp())
    or exists(select 1 from public.family_card_operations where parent_id=p) then return 'busy'; end if;
  -- The same checks as the initial check, without treating this flow's own hold as another flow.
  update public.family_delete_holds set lease_until='-infinity' where parent_id=p and lease_token=hold;
  if public.check_child_deletion(p,c) <> 'ready' then return 'busy'; end if;
  insert into public.child_deletions(child_id,parent_id) values(c,p) on conflict(child_id) do nothing;
  return 'requested';
end $$;

create function public.claim_child_deletion(p uuid, c uuid, token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.parents where id=p and deletion_requested_at is null for update;
  if not found then return false; end if;
  update public.child_deletions set lease_token=token,lease_until=clock_timestamp()+interval '2 minutes'
    where parent_id=p and child_id=c and (lease_token=token or lease_until is null or lease_until<=clock_timestamp());
  return found;
end $$;
create function public.assert_child_deletion_lease(p uuid,c uuid,token uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.parents where id=p and deletion_requested_at is null for update;
  if not found then raise exception 'family_unavailable' using errcode='55000'; end if;
  perform 1 from public.child_deletions d where d.parent_id=p and d.child_id=c and d.lease_token=token and d.lease_until>clock_timestamp() for update;
  if not found then raise exception 'child_delete_lease' using errcode='55000'; end if;
end $$;
create function public.release_child_deletion(p uuid,c uuid,token uuid) returns void
language sql security definer set search_path = '' as $$
  update public.child_deletions set lease_until='-infinity' where parent_id=p and child_id=c and lease_token=token;
$$;

create function public.child_copy_sources(p uuid,c uuid,token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_child_deletion_lease(p,c,token);
  return (select coalesce(jsonb_agg(s),'[]'::jsonb) from jsonb_array_elements(public.family_copy_sources(p)) s
    join public.assessments a on a.id=(s->>'id')::uuid where a.parent_id=p and a.child_id=c);
end $$;
create function public.confirm_child_copies(p uuid,c uuid,token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_child_deletion_lease(p,c,token);
  return not exists(select 1 from public.assessments a where a.parent_id=p and a.child_id=c
    and not exists(select 1 from public.anonymous_test_links l where l.assessment_id=a.id));
end $$;

create function public.complete_child_deletion(p uuid,c uuid,token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_child_deletion_lease(p,c,token);
  if not public.confirm_child_copies(p,c,token) then return false; end if;
  if exists(select 1 from public.child_delete_roots(p,c) root join storage.objects o on o.bucket_id=root.bucket
    and starts_with(lower(o.name),root.prefix || '/')) then return false; end if;
  delete from public.children where parent_id=p and id=c;
  return found;
end $$;

-- No new copy format or second allowlist. Extend only the existing function's lease authorization below.
create or replace function public.save_family_test_copy(p uuid, token uuid, test_id uuid, test_copy jsonb)
returns boolean language plpgsql security definer set search_path = '' set "TimeZone" to 'UTC' as $$
declare q public.family_deletions; a public.assessments; marked boolean; extra text; made uuid;
begin
  if exists(select 1 from public.child_deletions d join public.assessments x on x.child_id=d.child_id and x.parent_id=d.parent_id
    where d.parent_id=p and x.id=test_id and d.lease_token=token) then
    perform public.assert_child_deletion_lease(p,(select child_id from public.assessments where id=test_id),token);
  end if;
  select * into q from public.family_deletions where parent_id = p for update;
  if (q.parent_id is null or q.phase <> 'deleting' or q.lease_token is distinct from token or q.lease_until <= now())
    and not exists(select 1 from public.child_deletions d join public.assessments x on x.child_id=d.child_id and x.parent_id=d.parent_id
      where d.parent_id=p and x.id=test_id and d.lease_token=token and d.lease_until>clock_timestamp()) then
    raise exception 'copy_lease_unavailable' using errcode = '55000';
  end if;
  select * into a from public.assessments where id = test_id and parent_id = p;
  if not found then raise exception 'copy_scope' using errcode = '55000'; end if;
  if exists(select 1 from public.anonymous_test_links where assessment_id = test_id) then return false; end if;
  if jsonb_typeof(test_copy) is distinct from 'object' or jsonb_typeof(test_copy->'questions') is distinct from 'array' then
    raise exception 'copy_fields' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(test_copy->'questions') shown(v) where jsonb_typeof(shown.v) <> 'object') then
    raise exception 'copy_fields' using errcode = '22023';
  end if;
  select k into extra from (
    select k from jsonb_object_keys(test_copy) k where k <> all(array['copyVersion', 'grade', 'province', 'testMonth', 'testFamily', 'status', 'route', 'help', 'durationMs', 'break', 'device', 'placement', 'questions', 'facts', 'profile', 'questionnaire'])
    union all
    select k from jsonb_array_elements(test_copy->'questions') shown(v), jsonb_object_keys(shown.v) k where k <> all(array['position', 'questionId', 'templateId', 'standard', 'wording', 'level', 'strand', 'format', 'prompt', 'choices', 'figure', 'values', 'answer', 'showWork', 'shownAtMs', 'answeredAtMs', 'response', 'correct', 'misconception', 'timeMs', 'changes', 'readAloud', 'away', 'work'])
  ) listed limit 1;
  if extra is not null then raise exception 'copy_fields' using errcode = '22023'; end if;
  marked := exists(select 1 from public.test_accounts where parent_id = p);
  if test_copy->'grade' is distinct from to_jsonb(a.grade) or test_copy->'province' is distinct from to_jsonb(a.province)
    or test_copy->'testMonth' is distinct from to_jsonb(to_char(a.started_at, 'YYYY-MM'))
    or test_copy->'testFamily' is distinct from to_jsonb(marked) then
    raise exception 'copy_mismatch' using errcode = '22023';
  end if;
  insert into public.anonymous_tests(copy_version, grade, province, test_month, test_family, copy)
    values ((test_copy->>'copyVersion')::smallint, a.grade, a.province, date_trunc('month', a.started_at)::date, marked, test_copy)
    returning id into made;
  insert into public.anonymous_test_links(assessment_id, copy_id) values (test_id, made);
  return true;
end $$;


-- Internal functions have no client access. RPCs are service-only, except the existing family-copy RPC.
do $$ declare f regprocedure; begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in (
    'child_delete_row_child','fence_child_delete_write','child_delete_roots','fence_child_delete_upload',
    'check_child_deletion','request_child_deletion_held','claim_child_deletion','assert_child_deletion_lease',
    'release_child_deletion','child_copy_sources','confirm_child_copies','complete_child_deletion') loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;
