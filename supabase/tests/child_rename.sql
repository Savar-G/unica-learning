-- rename_child (migration child_rename, #555, PR #606 review). Run with a database owner after the migrations, through
-- the Supabase Management API (/v1/projects/cdjobwsyzndtltzfpyqa/database/query, Keychain token supabase-pagewise).
-- A pass is the error PROBE_OK: the final exception rolls back every change. Uses only an idle child of a marked test
-- family; no customer row is changed.
--
-- The lock between rename_child and start_workbook_run needs two connections: see child_rename_locks.sh beside this file.
do $$
declare
  v_child uuid; v_parent uuid; v_other uuid; v_name text; v_first text; v_run uuid; v_answer text; v_former text[];
begin
  select c.id, c.parent_id, c.first_name into v_child, v_parent, v_name
    from public.children c join public.test_accounts t on t.parent_id = c.parent_id
    where not exists (select 1 from public.workbook_runs r where r.child_id = c.id and r.status in ('queued', 'running'))
    order by c.created_at limit 1;
  if v_child is null then raise exception 'No idle test child'; end if;
  v_first := v_name;
  if (select cardinality(former_names) from public.children where id = v_child) <> 0 then raise exception 'test child already renamed'; end if;
  select id into v_other from public.parents where id <> v_parent limit 1;

  -- Only the service role may run it.
  if has_function_privilege('anon', 'public.rename_child(uuid, uuid, text, integer)', 'execute') then raise exception 'anon can rename'; end if;
  if has_function_privilege('authenticated', 'public.rename_child(uuid, uuid, text, integer)', 'execute') then raise exception 'authenticated can rename'; end if;
  if not has_function_privilege('service_role', 'public.rename_child(uuid, uuid, text, integer)', 'execute') then raise exception 'service role cannot rename'; end if;
  if has_column_privilege('authenticated', 'public.children', 'former_names', 'update') then raise exception 'parents can write former names'; end if;

  -- Another family's child is not found, and nothing changes.
  if public.rename_child(v_other, v_child, 'Probe A', 360) <> 'not_found' then raise exception 'other family renamed'; end if;
  if (select first_name from public.children where id = v_child) <> v_name then raise exception 'other family changed the name'; end if;

  -- A rename keeps the former name once; the same name again changes nothing; a name used before is not kept twice.
  if public.rename_child(v_parent, v_child, 'Probe A', 360) <> 'saved' then raise exception 'rename failed'; end if;
  if public.rename_child(v_parent, v_child, 'Probe A', 360) <> 'saved' then raise exception 'same name failed'; end if;
  if public.rename_child(v_parent, v_child, 'Probe B', 360) <> 'saved' then raise exception 'second rename failed'; end if;
  if public.rename_child(v_parent, v_child, v_name, 360) <> 'saved' then raise exception 'rename back failed'; end if;
  if public.rename_child(v_parent, v_child, 'Probe B', 360) <> 'saved' then raise exception 'third rename failed'; end if;
  select first_name, former_names into v_name, v_former from public.children where id = v_child;
  if v_name <> 'Probe B' then raise exception 'name is %', v_name; end if;
  -- first -> A -> A -> B -> first -> B: each name the child had, once, oldest first.
  if v_former <> array[v_first, 'Probe A', 'Probe B'] then raise exception 'former names %', v_former; end if;

  -- An active run blocks; a stopped run (status still queued or running) does not; a queued Mac run always blocks.
  insert into public.workbook_runs(parent_id, child_id, number, max_attempts, runner, status, heartbeat_at)
    values (v_parent, v_child, 999, 3, 'server', 'running', now() - interval '1 minute') returning id into v_run;
  if public.rename_child(v_parent, v_child, 'Probe C', 360) <> 'book_in_progress' then raise exception 'live run did not block'; end if;
  if (select first_name from public.children where id = v_child) <> 'Probe B' then raise exception 'blocked rename wrote'; end if;
  update public.workbook_runs set heartbeat_at = now() - interval '7 minutes' where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe C', 360) <> 'saved' then raise exception 'stopped running run blocked'; end if;
  update public.workbook_runs set runner = 'mac' where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe D', 360) <> 'saved' then raise exception 'stopped mac running run blocked'; end if;
  update public.workbook_runs set status = 'queued', runner = 'server', heartbeat_at = null, created_at = now() - interval '7 minutes' where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe E', 360) <> 'saved' then raise exception 'stopped queued run blocked'; end if;
  update public.workbook_runs set created_at = now() - interval '1 minute' where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe F', 360) <> 'book_in_progress' then raise exception 'fresh queued run did not block'; end if;
  update public.workbook_runs set runner = 'mac', created_at = now() - interval '3 days' where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe F', 360) <> 'book_in_progress' then raise exception 'queued mac run did not block'; end if;
  update public.workbook_runs set status = 'stale', finished_at = now() where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe F', 360) <> 'saved' then raise exception 'stale run blocked'; end if;

  -- start_workbook_run still behaves as before: it starts a run, and a second start finds it busy.
  v_answer := public.start_workbook_run(v_child, null, null, 3, 360)->>'status';
  if v_answer <> 'started' then raise exception 'start answered %', v_answer; end if;
  v_answer := public.start_workbook_run(v_child, null, null, 3, 360)->>'status';
  if v_answer <> 'busy' then raise exception 'second start answered %', v_answer; end if;
  if public.rename_child(v_parent, v_child, 'Probe G', 360) <> 'book_in_progress' then raise exception 'started run did not block'; end if;
  update public.workbook_runs set status = 'done', finished_at = now() where child_id = v_child and status in ('queued', 'running');

  -- At most 20 former names: a rename that would drop one is refused, and nothing changes.
  update public.children set former_names = (select array_agg('Old ' || i) from generate_series(1, 20) i) where id = v_child;
  if public.rename_child(v_parent, v_child, 'Probe H', 360) <> 'too_many' then raise exception 'cap not kept'; end if;
  if (select first_name from public.children where id = v_child) <> 'Probe F' then raise exception 'capped rename wrote'; end if;
  if public.rename_child(v_parent, v_child, 'Old 3', 360) <> 'too_many' then raise exception 'cap not kept for a known name'; end if;
  begin
    update public.children set former_names = former_names || 'Old 21'::text where id = v_child;
    raise exception 'constraint missing';
  exception when check_violation then null;
  end;

  -- The family write fence refuses a family being deleted, and nothing changes.
  update public.children set former_names = '{}' where id = v_child;
  update public.parents set deletion_requested_at = now() where id = v_parent;
  begin
    perform public.rename_child(v_parent, v_child, 'Probe I', 360);
    raise exception 'fence missing';
  exception when sqlstate '55000' then null;
  end;
  if (select first_name from public.children where id = v_child) <> 'Probe F' then raise exception 'fenced rename wrote'; end if;

  raise exception 'PROBE_OK';
end $$;
