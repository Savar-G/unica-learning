-- Run as a database owner after the migrations. All row changes roll back.
begin;
do $$
declare r record; v_before int; v_first timestamptz; v_next timestamptz; v_revision int;
begin
  select c.id, c.revision, c.parent_id, c.child_id into r
    from public.maya_calls c join public.test_accounts t on t.parent_id = c.parent_id
    where c.mode = 'voice' and c.status = 'ended' order by c.created_at desc limit 1 for update of c;
  if not found then raise exception 'No ended test voice call'; end if;
  select count(*) into v_before from public.maya_call_connections where call_id = r.id;
  v_first := public.append_maya_call_connection(r.id, r.revision, 'agent_joined');
  if v_first is null then raise exception 'Current connection was refused'; end if;
  -- Replacement claims the same row after the original writer's last revision.
  update public.maya_calls set revision = revision + 1 where id = r.id;
  if public.append_maya_call_connection(r.id, r.revision + 1, 'agent_left') is not null then
    raise exception 'Obsolete connection was accepted';
  end if;
  if (select count(*) from public.maya_call_connections where call_id = r.id) <> v_before + 1 then
    raise exception 'Obsolete connection added a row';
  end if;
  v_next := public.append_maya_call_connection(r.id, r.revision + 2, 'child_joined');
  if v_next is null or v_next < v_first then raise exception 'Replacement timestamp or append failed'; end if;
  select revision into v_revision from public.maya_calls where id = r.id;
  if v_revision <> r.revision + 3 then raise exception 'Incorrect revision count'; end if;
  if (select count(*) from public.maya_call_connections where call_id = r.id) <> v_before + 2 then
    raise exception 'Incorrect appended row count';
  end if;
  if not exists(select 1 from public.maya_call_connections where call_id = r.id and at = v_next
      and parent_id = r.parent_id and child_id = r.child_id and recorded_at <= at and at <= recorded_at + interval '1 minute') then
    raise exception 'Receipt clock or family was incorrect';
  end if;
  if has_function_privilege('anon', 'public.append_maya_call_connection(uuid,integer,text)', 'execute')
    or has_function_privilege('authenticated', 'public.append_maya_call_connection(uuid,integer,text)', 'execute')
    or not has_function_privilege('service_role', 'public.append_maya_call_connection(uuid,integer,text)', 'execute') then
    raise exception 'Incorrect function execution grants';
  end if;
end $$;
select 'current append, obsolete refusal, replacement append, receipt timestamps, revision count, family and grants passed' as probe;
rollback;
