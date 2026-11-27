-- UNI-141: keep full-size v2 book publish (120 pages, ~2,000 questions) well under statement_timeout.
-- 1. Give publish_v2_workbook a 30s statement_timeout instead of inheriting authenticator's 8s web-request default.
-- 2. Avoid re-serializing multi-KB JSONB columns via to_jsonb(new) inside fence_family_write and fence_child_delete_write
--    for the 5 high-row-count workbook child tables; every family and child deletion fence check stays identical.

alter function public.publish_v2_workbook(jsonb) set statement_timeout = '30s';

create or replace function public.fence_family_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb; p uuid; a uuid; assessment_parent uuid;
begin
  if tg_table_name in ('workbook_pages', 'workbook_questions', 'workbook_item_answers', 'workbook_sheets', 'workbook_time_logs') then
    if tg_op = 'UPDATE' and old.parent_id is not null then
      perform public.assert_family_writable(old.parent_id);
    end if;
    if new.parent_id is not null then
      perform public.assert_family_writable(new.parent_id);
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and to_jsonb(old)->>'parent_id' is not null then
    perform public.assert_family_writable((to_jsonb(old)->>'parent_id')::uuid);
  end if;
  r := to_jsonb(new);
  p := (r->>'parent_id')::uuid;
  a := (r->>'assessment_id')::uuid;
  if p is not null then perform public.assert_family_writable(p); end if;
  if a is not null then
    select parent_id into assessment_parent from public.assessments where id = a;
    if p is not null and p is distinct from assessment_parent then raise exception 'family_scope' using errcode = '55000'; end if;
    perform public.assert_family_writable(assessment_parent);
  end if;
  return new;
end $$;

create or replace function public.fence_child_delete_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb; c uuid; p uuid;
begin
  -- The copy link is written by the lease-checked shared copy function while the child is frozen.
  if tg_table_name = 'anonymous_test_links' then return new; end if;
  if tg_op = 'INSERT' and tg_table_name in ('workbook_item_answers', 'workbook_sheets', 'workbook_time_logs') then
    c := new.child_id;
    if c is null then return new; end if;
    select parent_id into p from public.children where id = c;
    if p is null then raise exception 'child_unavailable' using errcode = '55000'; end if;
    perform public.assert_family_writable(p);
    if exists(select 1 from public.child_deletions where child_id = c) then
      raise exception 'child_unavailable' using errcode = '55000';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' and tg_table_name in ('workbook_pages', 'workbook_questions') then
    select child_id into c from public.workbooks where id = new.workbook_id;
    if c is null then return new; end if;
    select parent_id into p from public.children where id = c;
    if p is null then raise exception 'child_unavailable' using errcode = '55000'; end if;
    perform public.assert_family_writable(p);
    if exists(select 1 from public.child_deletions where child_id = c) then
      raise exception 'child_unavailable' using errcode = '55000';
    end if;
    return new;
  end if;
  for r in select to_jsonb(new) union all select to_jsonb(old) where tg_op = 'UPDATE' loop
    c := public.child_delete_row_child(tg_table_name, r);
    if c is null then continue; end if;
    if tg_table_name = 'children' then p := (r->>'parent_id')::uuid;
    else select parent_id into p from public.children where id = c; end if;
    if p is null then raise exception 'child_unavailable' using errcode = '55000'; end if;
    if tg_table_name = 'plan_starts' then
      -- Billing's fence_plan_start_write owns the narrow queued-family recovery exception.
      -- Share the parent lock here only to serialize the child guard with a child deletion request.
      perform 1 from public.parents where id = p for share;
      if not found then raise exception 'family_unavailable' using errcode = '55000'; end if;
    else
      perform public.assert_family_writable(p);
    end if;
    if exists(select 1 from public.child_deletions where child_id = c) then
      raise exception 'child_unavailable' using errcode = '55000';
    end if;
  end loop;
  return new;
end $$;

revoke all on function public.fence_family_write() from public, anon, authenticated;
revoke all on function public.fence_child_delete_write() from public, anon, authenticated;
