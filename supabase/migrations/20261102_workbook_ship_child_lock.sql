-- Review P2-2 on #420: marking a workbook printed while an edit revision was inserted could deadlock. mark_workbook
-- now takes FOR NO KEY UPDATE on the child, which does not conflict with the FOR KEY SHARE that foreign keys take.
create or replace function public.mark_workbook(p_workbook uuid, p_to text, p_by uuid, p_by_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w record; v_first boolean := false; v_at timestamptz := now();
begin
  if p_to is null or p_to not in ('printed', 'shipped') then
    return jsonb_build_object('status', 'refused', 'reason', 'the new status is not printed or shipped');
  end if;
  select id, parent_id, child_id, number, status into w from public.workbooks where id = p_workbook;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the workbook is not known'); end if;
  -- The child first, then the workbook: two workbooks of one child shipped at once cannot both be the first.
  -- FOR NO KEY UPDATE, not FOR UPDATE: a revision or page insert holds FOR KEY SHARE on the child through its foreign
  -- key while it share-locks the workbook; FOR UPDATE here waited on it in the opposite order and deadlocked (P2-2).
  perform 1 from public.children where id = w.child_id for no key update;
  select id, parent_id, child_id, number, status into w from public.workbooks where id = p_workbook for update;
  if p_to = 'printed' and w.status <> 'approved' then
    return jsonb_build_object('status', 'refused', 'reason', format('the workbook is %s, not approved', w.status));
  end if;
  if p_to = 'shipped' and w.status <> 'printed' then
    return jsonb_build_object('status', 'refused', 'reason', format('the workbook is %s, not printed', w.status));
  end if;
  if p_to = 'printed' then
    update public.workbooks set status = 'printed', printed_at = v_at where id = p_workbook;
  else
    v_first := not exists (select 1 from public.workbooks where child_id = w.child_id and status = 'shipped' and id <> p_workbook);
    update public.workbooks set status = 'shipped', shipped_at = v_at where id = p_workbook;
  end if;
  insert into public.workbook_audit (parent_id, child_id, draft_id, workbook_id, actor_id, actor_email, action, detail)
    values (w.parent_id, w.child_id,
      (select id from public.workbook_drafts where id = p_workbook), p_workbook, p_by, p_by_email, 'workbook-' || p_to,
      jsonb_build_object('number', w.number) || case when p_to = 'shipped' then jsonb_build_object('firstShipped', v_first) else '{}'::jsonb end);
  return jsonb_build_object('status', 'marked', 'to', p_to, 'at', v_at, 'firstShipped', v_first);
end $$;
