-- #612. Keep starts for one child serial while allowing worker foreign-key checks.
-- A resume holds the run row before it writes an audit row. FOR UPDATE on the child
-- blocks that audit row's KEY SHARE lock while start waits for the run, causing a deadlock.
-- FOR NO KEY UPDATE still excludes another start, a rename, and plan admission.
-- Keep the function body and its service-only boundary otherwise unchanged.

create or replace function public.start_workbook_run(p_child uuid, p_by uuid, p_by_email text, p_max_attempts int, p_stale_seconds int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_parent uuid; v_number int; v_run uuid; a record;
begin
  select parent_id into v_parent from public.children where id = p_child for no key update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  select id, status, lease, heartbeat_at, created_at, resumes into a from public.workbook_runs where child_id = p_child and status in ('queued', 'running');
  if found then
    -- Stopped mid-way: no holder for 2 minutes (a hand-over that did not arrive, or a queued run never taken), or no
    -- progress for p_stale_seconds.
    if (a.lease is null and coalesce(a.heartbeat_at, a.created_at) < now() - interval '2 minutes')
      or coalesce(a.heartbeat_at, a.created_at) < now() - make_interval(secs => p_stale_seconds) then
      if a.status = 'queued' then
        update public.workbook_runs set status = 'running', attempts = 1, step = 'plan', started_at = now() where id = a.id;
      end if;
      if a.resumes < 30 then return jsonb_build_object('status', 'stalled', 'run', a.id); end if;
      update public.workbook_runs set status = 'stale', finished_at = now(), lease = null,
        error = coalesce(error, 'The run stopped too many times without finishing.') where id = a.id;
      insert into public.workbook_audit (parent_id, child_id, run_id, actor_id, actor_email, action) values (v_parent, p_child, a.id, p_by, p_by_email, 'run-stopped');
    else
      return jsonb_build_object('status', 'busy', 'run', a.id);
    end if;
  end if;
  select coalesce(max(number), 0) + 1 into v_number from public.workbooks where child_id = p_child;
  insert into public.workbook_runs (parent_id, child_id, number, max_attempts, started_by, started_by_email)
    values (v_parent, p_child, v_number, p_max_attempts, p_by, p_by_email) returning id into v_run;
  insert into public.workbook_audit (parent_id, child_id, run_id, actor_id, actor_email, action, detail)
    values (v_parent, p_child, v_run, p_by, p_by_email, 'run-started', jsonb_build_object('number', v_number));
  return jsonb_build_object('status', 'started', 'run', v_run);
end $$;

revoke all on function public.start_workbook_run(uuid, uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.start_workbook_run(uuid, uuid, text, int, int) to service_role;
