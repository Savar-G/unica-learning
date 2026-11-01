-- R404-2: changing a stalled run's runner also revokes its previous lease.
-- The row lock orders routing against renewal and checkpoints. If the old worker
-- renews first, routing refuses the live run. If routing wins, the old token fails.
-- The signature and return values stay compatible with the current site.
create or replace function public.route_workbook_run(p_run uuid, p_runner text, p_stale_seconds int)
returns text language plpgsql security definer set search_path = '' as $$
declare r record; v_answer text;
begin
  if p_runner not in ('server', 'mac') then raise exception 'unknown runner %', p_runner; end if;
  select parent_id, child_id, status, lease, heartbeat_at, runner into r from public.workbook_runs where id = p_run for update;
  if not found then return null; end if;
  if r.status = 'queued' then v_answer := 'queued';
  elsif r.status = 'running' and (r.lease is null or r.heartbeat_at is null or r.heartbeat_at < now() - make_interval(secs => p_stale_seconds)) then v_answer := 'stalled';
  else return null;
  end if;
  if r.runner <> p_runner then
    update public.workbook_runs set runner = p_runner, lease = null, heartbeat_at = null where id = p_run;
    insert into public.workbook_audit (parent_id, child_id, run_id, action, detail)
      values (r.parent_id, r.child_id, p_run, 'run-routed', jsonb_build_object('runner', p_runner, 'from', r.runner));
  end if;
  return v_answer;
end $$;
revoke all on function public.route_workbook_run(uuid, text, int) from public, anon, authenticated;
grant execute on function public.route_workbook_run(uuid, text, int) to service_role;
