-- rename_child (migrations child_rename and child_rename_stops_runs, #555, PR #606 review). Run with a database owner after the migrations, through
-- the Supabase Management API (/v1/projects/cdjobwsyzndtltzfpyqa/database/query, Keychain token supabase-pagewise).
-- A pass is the error PROBE_OK: the final exception rolls back every change. Uses only an idle child of a marked test
-- family; no customer row is changed.
--
-- The lock between rename_child and start_workbook_run needs two connections: see child_rename_locks.sh beside this file.
do $$
declare
  v_child uuid; v_parent uuid; v_other uuid; v_name text; v_first text; v_run uuid; v_answer text; v_former text[];
  v_lease uuid := gen_random_uuid(); v_lease2 uuid := gen_random_uuid(); v_status text; v_held uuid; v_error text;
  v_ended boolean; v_start jsonb;
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

  -- An active run blocks, and stays as it was; a queued Mac run always blocks (migration child_rename_stops_runs).
  insert into public.workbook_runs(parent_id, child_id, number, max_attempts, runner, status, lease, heartbeat_at)
    values (v_parent, v_child, 999, 3, 'server', 'running', v_lease, now() - interval '1 minute') returning id into v_run;
  if public.rename_child(v_parent, v_child, 'Probe C', 360) <> 'book_in_progress' then raise exception 'live run did not block'; end if;
  if (select first_name from public.children where id = v_child) <> 'Probe B' then raise exception 'blocked rename wrote'; end if;
  if (select status <> 'running' or lease is distinct from v_lease from public.workbook_runs where id = v_run) then raise exception 'blocked rename changed the run'; end if;
  update public.workbook_runs set status = 'queued', runner = 'mac', lease = null, heartbeat_at = null, created_at = now() - interval '3 days' where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe C', 360) <> 'book_in_progress' then raise exception 'queued mac run did not block'; end if;
  update public.workbook_runs set runner = 'server', created_at = now() - interval '1 minute' where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe C', 360) <> 'book_in_progress' then raise exception 'fresh queued run did not block'; end if;
  -- A run let go for a resume (no lease, fresh heartbeat) is still active.
  update public.workbook_runs set status = 'running', runner = 'mac', lease = null, heartbeat_at = now() - interval '1 minute' where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe C', 360) <> 'book_in_progress' then raise exception 'handed-over run did not block'; end if;

  -- The review's sequence: a Mac run has no heartbeat for 7 minutes. If the worker resumes it first, its fresh heartbeat
  -- blocks the rename; the run keeps its new lease and the old name.
  update public.workbook_runs set lease = v_lease, heartbeat_at = now() - interval '7 minutes' where id = v_run;
  if not public.resume_workbook_run(v_run, v_lease2, 360, 'mac') then raise exception 'resume refused'; end if;
  if public.rename_child(v_parent, v_child, 'Probe C', 360) <> 'book_in_progress' then raise exception 'resumed run did not block'; end if;
  if (select first_name from public.children where id = v_child) <> 'Probe B' then raise exception 'rename after a resume wrote'; end if;
  -- If the rename comes first, it stops the run in the same transaction: failed, with the reason, no lease, one audit row.
  update public.workbook_runs set lease = v_lease, heartbeat_at = now() - interval '7 minutes' where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe C', 360) <> 'saved' then raise exception 'stopped run blocked'; end if;
  if (select first_name from public.children where id = v_child) <> 'Probe C' then raise exception 'rename after a stop did not write'; end if;
  select status, lease, error, finished_at is not null, errors->-1->>'error' into v_status, v_held, v_error, v_ended, v_answer
    from public.workbook_runs where id = v_run;
  if v_status <> 'failed' or v_held is not null or not v_ended then raise exception 'run not stopped: % % %', v_status, v_held, v_ended; end if;
  if v_error <> 'The child''s name changed while this workbook was stopped. Prepare it again.' or v_answer <> v_error then raise exception 'reason %, %', v_error, v_answer; end if;
  if (select count(*) from public.workbook_audit where run_id = v_run and action = 'run-failed' and detail->>'error' = v_error) <> 1 then raise exception 'no audit row'; end if;
  -- The old lease writes nothing more, and the run cannot be taken up again.
  if public.renew_workbook_run(v_run, v_lease) then raise exception 'old lease renewed'; end if;
  if public.workbook_run_held(v_run, v_lease) then raise exception 'old lease held'; end if;
  if public.yield_workbook_run(v_run, v_lease) then raise exception 'old lease yielded'; end if;
  if public.fail_workbook_run(v_run, v_lease, 'late') then raise exception 'old lease failed the run'; end if;
  if public.resume_workbook_run(v_run, v_lease2, 360, 'mac') then raise exception 'stopped run resumed (mac)'; end if;
  if public.resume_workbook_run(v_run, v_lease2, 360) then raise exception 'stopped run resumed'; end if;
  if public.claim_workbook_run(v_run, v_lease2, 'mac') then raise exception 'stopped run claimed'; end if;
  if public.route_workbook_run(v_run, 'server', 360) is not null then raise exception 'stopped run routed'; end if;
  if (select status from public.workbook_runs where id = v_run) <> 'failed' then raise exception 'late call changed the run'; end if;
  -- The next "Prepare next workbook" starts a new run, which reads the new name.
  select public.start_workbook_run(v_child, null, null, 3, 360) into v_start;
  if v_start->>'status' <> 'started' or (v_start->>'run')::uuid = v_run then raise exception 'start after a stop answered %', v_start; end if;
  if (select status from public.workbook_runs where id = (v_start->>'run')::uuid) <> 'queued' then raise exception 'new run not queued'; end if;
  delete from public.workbook_runs where id = (v_start->>'run')::uuid;
  -- A queued server run that never started and has stopped is ended the same way.
  insert into public.workbook_runs(parent_id, child_id, number, max_attempts, runner, status, created_at)
    values (v_parent, v_child, 998, 3, 'server', 'queued', now() - interval '7 minutes') returning id into v_run;
  if public.rename_child(v_parent, v_child, 'Probe D', 360) <> 'saved' then raise exception 'stopped queued run blocked'; end if;
  if (select status <> 'failed' or lease is not null from public.workbook_runs where id = v_run) then raise exception 'queued run not stopped'; end if;
  -- An ended run changes nothing.
  update public.workbook_runs set status = 'stale', finished_at = now() where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe E', 360) <> 'saved' then raise exception 'stale run blocked'; end if;
  if (select status from public.workbook_runs where id = v_run) <> 'stale' then raise exception 'ended run changed'; end if;
  update public.workbook_runs set status = 'done', finished_at = now() where id = v_run;
  if public.rename_child(v_parent, v_child, 'Probe F', 360) <> 'saved' then raise exception 'done run blocked'; end if;
  if (select status from public.workbook_runs where id = v_run) <> 'done' then raise exception 'done run changed'; end if;

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
