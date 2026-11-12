-- First pages (docs/first-pages.md): a plan whose whole-book capacity check fails depends on the reserved Workbook 1 id
-- (it seeds the code's choices). Before anything is stored for the set (no plan, page, call, solve check or attempt),
-- the lease holder may give it a new id and queue it again, within its attempts; past the last it is unavailable.
-- Additive: a new function the code on main does not call.
create function public.reseed_workbook_first_pages(p_id uuid, p_lease uuid, p_error text, p_ai_calls jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.workbook_first_pages set
    workbook_id = gen_random_uuid(),
    status = case when attempts < max_attempts then 'queued' else 'unavailable' end,
    lease = null, heartbeat_at = now(), error = left(p_error, 2000),
    finished_at = case when attempts < max_attempts then null else now() end,
    errors = errors || jsonb_build_array(jsonb_build_object('attempt', attempts, 'at', now(), 'error', left(p_error, 2000))),
    ai_calls = ai_calls || coalesce(p_ai_calls, '[]')
    where id = p_id and lease = p_lease and status = 'running' and frame is null
      and pages = '{}' and calls = '{}' and slot_attempts = '{}' and solves = '{}';
  return found;
end $$;
revoke all on function public.reseed_workbook_first_pages(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.reseed_workbook_first_pages(uuid, uuid, text, jsonb) to service_role;
