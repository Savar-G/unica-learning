-- rename_child stops a stopped workbook run instead of stepping around it (#555, PR #606 review).
--
-- Before: rename_child read the child's runs without locking them, and resume_workbook_run locks only the run. So a Mac
-- run with no heartbeat for 7 minutes counted as stopped, the worker could resume it and read the old name, the rename
-- then saved the new name, and a later continuation failed the saved-page name check (workbook-generator.ts). The old
-- lease also stayed valid.
--
-- Now rename_child locks the child's queued and running runs (for update) while it decides, so it waits for a resume
-- being made and sees its fresh heartbeat. A run that is active by the same rule as before refuses the rename. A run that
-- has stopped by that rule is ended in the same transaction, as fail_workbook_run ends a run: status failed, the reason
-- in error and errors, no lease, and a run-failed audit row the admin run page shows. Every later renew, hold check,
-- yield, fail, resume, claim or route of it then finds no running run with that lease and changes nothing. The next
-- "Prepare next workbook" finds no queued or running run and starts a new one, which reads the new name.
--
-- The child row lock is now for no key update: it still waits for start_workbook_run's for update (and the other way),
-- and two renames still wait for each other, but it no longer blocks the foreign key checks of a worker's inserts
-- (pages, attempts, audit rows) that hold the run row, which would deadlock with the run lock taken here.
--
-- Additive: the same signature and answers; only a stopped run is now ended.

create or replace function public.rename_child(p_parent uuid, p_child uuid, p_first_name text, p_stale_seconds integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text; v_former text[]; r record; v_stopped uuid[] := '{}';
  v_error constant text := 'The child''s name changed while this workbook was stopped. Prepare it again.';
begin
  if p_first_name is null or btrim(p_first_name) = '' then raise exception 'rename_child: empty name'; end if;
  if p_stale_seconds is null or p_stale_seconds <= 0 then raise exception 'rename_child: bad stale seconds'; end if;
  -- Waits for start_workbook_run, which locks the child first (for update).
  select first_name, former_names into v_name, v_former from public.children
    where id = p_child and parent_id = p_parent for no key update;
  if not found then return 'not_found'; end if;
  -- The run rows as locked: a resume made meanwhile is seen with its new heartbeat. The app's rule for a stopped run
  -- (runState in src/lib/workbook-job.ts): a queued run for the Mac waits however long it takes; any other queued or
  -- running run is active until it has had no heartbeat (or, with none, no start) for p_stale_seconds.
  for r in
    select id, status, runner, heartbeat_at, created_at from public.workbook_runs
      where child_id = p_child and status in ('queued', 'running') order by id for update
  loop
    if (r.status = 'queued' and r.runner = 'mac')
      or coalesce(r.heartbeat_at, r.created_at) >= now() - make_interval(secs => p_stale_seconds) then
      return 'book_in_progress';
    end if;
    v_stopped := v_stopped || r.id;
  end loop;
  if v_name = p_first_name then return 'saved'; end if;
  if not (v_name = any(v_former)) then
    if cardinality(v_former) >= 20 then return 'too_many'; end if;
    v_former := v_former || v_name;
  end if;
  -- The family write fence (fence_family_write) refuses a family being deleted with 55000, and nothing below is kept.
  update public.children set first_name = p_first_name, former_names = v_former where id = p_child;
  -- Ended as fail_workbook_run ends a run, so no late write with the old lease counts.
  update public.workbook_runs
    set status = 'failed', finished_at = now(), heartbeat_at = now(), lease = null, error = v_error,
      errors = errors || jsonb_build_array(jsonb_build_object('attempt', attempts, 'at', now(), 'error', v_error))
    where id = any(v_stopped);
  insert into public.workbook_audit (parent_id, child_id, run_id, action, detail)
    select p_parent, p_child, s, 'run-failed', jsonb_build_object('error', v_error) from unnest(v_stopped) s;
  return 'saved';
end $$;

revoke all on function public.rename_child(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.rename_child(uuid, uuid, text, integer) to service_role;
