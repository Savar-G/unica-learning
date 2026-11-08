-- An admin stops a workbook run (Stop button, PR site/workbook-run-progress).
--
-- stop_workbook_run ends a queued or running run: status 'stale' (the existing "ended without finishing" state, which
-- every other function already treats as ended), no lease, finished now, and stopped_by_email names the admin. So every
-- later write that names the old lease (renew, progress, page, call, solve check, plan, draft, retry, fail, finish, yield)
-- finds no running run with that lease and changes nothing. claim and resume find no queued or running run, so the worker
-- passes over it, and start_workbook_run sees no active run, so the next "Prepare next workbook" starts a new one at once.
--
-- It holds the run row (for update), as finish_workbook_run does, so a stop and a finish cannot both win. The answer:
-- 'stopped'; 'already' (an admin stopped it before: harmless, the first stop's name stays); the status of a run that ended
-- otherwise ('done', 'failed', 'stale'); or 'not_found'. Only 'stopped' writes anything.
--
-- The worker's AI cost log (save_workbook_run_ai_calls*, exclude_workbook_run_ai) has no lease guard by design: a paid
-- call stays recorded. It does not change the run's state.
--
-- Additive: one nullable column and one service-only function.

alter table public.workbook_runs add column stopped_by_email text
  constraint workbook_runs_stopped_by_email_check check (char_length(stopped_by_email) <= 320);

create function public.stop_workbook_run(p_run uuid, p_by uuid, p_by_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  if p_by_email is null or btrim(p_by_email) = '' then raise exception 'stop_workbook_run: who stops it is required'; end if;
  select parent_id, child_id, status, stopped_by_email, done_pages into r from public.workbook_runs where id = p_run for update;
  if not found then return 'not_found'; end if;
  if r.stopped_by_email is not null then return 'already'; end if;
  if r.status not in ('queued', 'running') then return r.status; end if;
  update public.workbook_runs
    set status = 'stale', finished_at = now(), heartbeat_at = now(), lease = null, stopped_by_email = p_by_email
    where id = p_run;
  insert into public.workbook_audit (parent_id, child_id, run_id, actor_id, actor_email, action, detail)
    values (r.parent_id, r.child_id, p_run, p_by, p_by_email, 'run-stopped-by-admin', jsonb_build_object('pages', coalesce(r.done_pages, 0)));
  return 'stopped';
end $$;

revoke all on function public.stop_workbook_run(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.stop_workbook_run(uuid, uuid, text) to service_role;
