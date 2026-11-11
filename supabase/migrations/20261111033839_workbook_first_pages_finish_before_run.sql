-- First pages (docs/first-pages.md): a set becomes ready only while its child has no Workbook 1 run that is waiting,
-- working or done. Under the child row lock that start_workbook_run also takes, so a run either starts before the
-- finish (the set ends "unavailable" and is never shown) or after it (the run finds the ready set and keeps it).
-- Same signature: the code on main does not call it.
create or replace function public.finish_workbook_first_pages(p_id uuid, p_lease uuid, p_result jsonb, p_ai_calls jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_child uuid;
begin
  select child_id into v_child from public.workbook_first_pages where id = p_id and lease = p_lease and status = 'running';
  if not found then return false; end if;
  perform 1 from public.children where id = v_child for no key update;
  if exists (select 1 from public.workbook_runs r where r.child_id = v_child and r.status in ('queued', 'running', 'done')) then
    update public.workbook_first_pages set status = 'unavailable', lease = null, finished_at = now(), heartbeat_at = now(),
      error = 'Workbook 1 started before the first pages were ready.', ai_calls = ai_calls || coalesce(p_ai_calls, '[]')
      where id = p_id and lease = p_lease and status = 'running';
    return false;
  end if;
  update public.workbook_first_pages set status = 'ready', result = p_result, lease = null, ready_at = now(), finished_at = now(),
    heartbeat_at = now(), error = null, ai_calls = ai_calls || coalesce(p_ai_calls, '[]')
    where id = p_id and lease = p_lease and status = 'running';
  return found;
end $$;
revoke all on function public.finish_workbook_first_pages(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_workbook_first_pages(uuid, uuid, jsonb, jsonb) to service_role;
