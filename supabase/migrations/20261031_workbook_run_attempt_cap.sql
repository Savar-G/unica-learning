-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_run_attempt_cap, 2026-10-31.
-- Review R379-3-1: the database is the guard of the two AI attempts a question slot has, whatever the client read.
-- count_workbook_run_attempts locks the run row, compares the lease, refuses every slot that already used p_max
-- attempts, and adds one attempt to each other slot, in one transaction. It answers {"refused": [slots]}, or null
-- (nothing counted) when the caller no longer holds the run. The job makes no AI call for a refused slot and stores it
-- as failed with 2 attempts. Additive: one new function (use_workbook_run_attempts stays, unused by the code).

create function public.count_workbook_run_attempts(p_run uuid, p_lease uuid, p_page int, p_slots text[], p_max int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_refused text[];
begin
  select parent_id, child_id into r from public.workbook_runs where id = p_run and lease = p_lease and status = 'running' for update;
  if not found then return null; end if;
  select coalesce(array_agg(a.slot order by a.slot), '{}') into v_refused from public.workbook_run_attempts a
    where a.run_id = p_run and a.page = p_page and a.slot = any (p_slots) and a.attempts >= p_max;
  insert into public.workbook_run_attempts (run_id, page, slot, attempts, parent_id, child_id)
    select p_run, p_page, s, 1, r.parent_id, r.child_id from unnest(p_slots) as s where not (s = any (v_refused))
    on conflict (run_id, page, slot) do update set attempts = public.workbook_run_attempts.attempts + 1, updated_at = now()
      where public.workbook_run_attempts.attempts < p_max;
  update public.workbook_runs set heartbeat_at = now() where id = p_run;
  return jsonb_build_object('refused', to_jsonb(v_refused));
end $$;
revoke all on function public.count_workbook_run_attempts(uuid, uuid, int, text[], int) from public, anon, authenticated;
grant execute on function public.count_workbook_run_attempts(uuid, uuid, int, text[], int) to service_role;
