-- First pages (docs/first-pages.md): the admin's choice is refused while a Workbook 1 run that is waiting, working or
-- done keeps the pages; hiding them then would hide pages the book prints. Same signature: the code on main does not call it.
create or replace function public.decide_workbook_first_pages(p_id uuid, p_decision text, p_by uuid, p_by_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  if p_decision not in ('keep-plan', 'drop') then raise exception 'bad decision' using errcode = '22023'; end if;
  select status, parent_id, child_id, kept_by into f from public.workbook_first_pages where id = p_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if f.status <> 'ready' then return jsonb_build_object('status', 'refused', 'reason', 'the first pages are not ready'); end if;
  if f.kept_by is not null and exists (select 1 from public.workbook_runs x where x.id = f.kept_by and x.status in ('queued', 'running', 'done')) then
    return jsonb_build_object('status', 'refused', 'reason', 'Workbook 1 already keeps these pages');
  end if;
  update public.workbook_first_pages set decision = p_decision, decided_by = p_by, decided_by_email = p_by_email, decided_at = now(),
    status = case when p_decision = 'drop' then 'hidden' else status end where id = p_id;
  insert into public.workbook_audit (parent_id, child_id, actor_id, actor_email, action, detail)
    values (f.parent_id, f.child_id, p_by, p_by_email, 'first-pages-' || p_decision, jsonb_build_object('first_pages', p_id));
  return jsonb_build_object('status', 'decided');
end $$;
revoke all on function public.decide_workbook_first_pages(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.decide_workbook_first_pages(uuid, text, uuid, text) to service_role;
