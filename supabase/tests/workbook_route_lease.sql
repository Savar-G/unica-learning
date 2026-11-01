-- Run with a database owner after the migrations. The transaction rolls back.
-- Uses only an idle child in a marked test family; no customer row is changed.
begin;
do $$
declare
  v_child uuid; v_parent uuid; v_run uuid;
  v_old uuid := gen_random_uuid(); v_next uuid := gen_random_uuid();
  v_runner text; v_other text; v_routes int;
begin
  select c.id, c.parent_id into v_child, v_parent
    from public.children c join public.test_accounts t on t.parent_id = c.parent_id
    where not exists (select 1 from public.workbook_runs r where r.child_id = c.id and r.status in ('queued', 'running'))
    limit 1;
  if v_child is null then raise exception 'No idle test child'; end if;
  insert into public.workbook_runs(parent_id, child_id, number, max_attempts, runner)
    values (v_parent, v_child, 999, 3, 'mac') returning id into v_run;
  if public.route_workbook_run(v_run, 'server', 360) is distinct from 'queued' then raise exception 'Queued routing failed'; end if;
  if public.claim_workbook_run(v_run, v_old, 'mac') then raise exception 'Mac claimed server run'; end if;
  if not public.claim_workbook_run(v_run, v_old, 'server') then raise exception 'Server claim failed'; end if;

  -- Test both directions. A renewal that happens before routing protects the live run.
  foreach v_runner in array array['mac', 'server'] loop
    v_other := case when v_runner = 'mac' then 'server' else 'mac' end;
    if not public.renew_workbook_run(v_run, v_old) then raise exception 'Current renewal failed'; end if;
    if public.route_workbook_run(v_run, v_runner, 360) is not null then raise exception 'Live run was rerouted'; end if;
    if not public.workbook_run_held(v_run, v_old) then raise exception 'Refused routing changed ownership'; end if;

    update public.workbook_runs set heartbeat_at = now() - interval '7 minutes' where id = v_run;
    if public.route_workbook_run(v_run, v_runner, 360) is distinct from 'stalled' then raise exception 'Stale routing failed'; end if;
    if public.workbook_run_held(v_run, v_old) then raise exception 'Old token still held routed run'; end if;
    if public.renew_workbook_run(v_run, v_old) then raise exception 'Old token renewed routed run'; end if;
    if public.save_workbook_run_frame(v_run, v_old, '{}'::jsonb) then raise exception 'Old token saved a frame'; end if;
    if public.save_workbook_run_page(v_run, v_old, 1, '{}'::jsonb) then raise exception 'Old token saved a page'; end if;
    if public.fail_workbook_run(v_run, v_old, 'test') then raise exception 'Old token failed routed run'; end if;
    if public.resume_workbook_run(v_run, v_next, 360, v_other) then raise exception 'Wrong runner resumed'; end if;
    if not public.resume_workbook_run(v_run, v_next, 360, v_runner) then raise exception 'New runner could not resume'; end if;
    if not public.renew_workbook_run(v_run, v_next) then raise exception 'New token could not renew'; end if;
    v_old := v_next;
    v_next := gen_random_uuid();
  end loop;
  select count(*) into v_routes from public.workbook_audit where run_id = v_run and action = 'run-routed';
  if v_routes <> 3 then raise exception 'Expected 3 route audit rows, got %', v_routes; end if;
  if has_function_privilege('anon', 'public.route_workbook_run(uuid,text,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.route_workbook_run(uuid,text,integer)', 'execute')
    or not has_function_privilege('service_role', 'public.route_workbook_run(uuid,text,integer)', 'execute')
    then raise exception 'Incorrect routing execute privileges'; end if;
end $$;
select 'queued, live and stale routing; both runners; old writes refused; new claims accepted; audit and grants passed' as probe;
rollback;

