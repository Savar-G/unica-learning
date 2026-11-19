-- U19 Book 1 fallback (Cedric's go, 2026-11-19): a run's draft_key is its sample seed, so a seed a fake sweep proved
-- (all pages fit, all checks pass) prints the same plan live. The authorized live runner (scripts/workbook-anthropic-live.ts
-- --seed) gives a queued server Book 1 run a proven key before any work is stored. Refused once the run has a plan, a
-- page, an attempt, a call or a solve check, when the key is another run's or a stored draft's, or the run is not a
-- queued server Book 1. Audited as draft-key-pinned. Additive; service_role only.
create function public.pin_workbook_run_draft_key(p_run uuid, p_key uuid, p_by uuid, p_by_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select id, parent_id, child_id, number, status, runner, draft_key into r from public.workbook_runs where id = p_run for update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'no such run'); end if;
  if r.status <> 'queued' or r.runner <> 'server' or r.number <> 1 then
    return jsonb_build_object('status', 'refused', 'reason', 'only a queued server Book 1 run takes a pinned key');
  end if;
  if exists (select 1 from public.workbook_run_frames where run_id = p_run) or exists (select 1 from public.workbook_run_pages where run_id = p_run)
    or exists (select 1 from public.workbook_run_attempts where run_id = p_run) or exists (select 1 from public.workbook_run_calls where run_id = p_run)
    or exists (select 1 from public.workbook_run_solves where run_id = p_run) then
    return jsonb_build_object('status', 'refused', 'reason', 'the run already has stored work');
  end if;
  if exists (select 1 from public.workbook_runs x where x.draft_key = p_key and x.id <> p_run) then
    return jsonb_build_object('status', 'refused', 'reason', 'another run has this key');
  end if;
  if exists (select 1 from public.workbook_drafts d where d.id = p_key) then
    return jsonb_build_object('status', 'refused', 'reason', 'a draft with this id exists');
  end if;
  update public.workbook_runs set draft_key = p_key where id = p_run;
  insert into public.workbook_audit (parent_id, child_id, run_id, actor_id, actor_email, action, detail)
    values (r.parent_id, r.child_id, p_run, p_by, p_by_email, 'draft-key-pinned', jsonb_build_object('from', r.draft_key, 'to', p_key));
  return jsonb_build_object('status', 'pinned');
end $$;
revoke all on function public.pin_workbook_run_draft_key(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pin_workbook_run_draft_key(uuid, uuid, uuid, text) to service_role;
