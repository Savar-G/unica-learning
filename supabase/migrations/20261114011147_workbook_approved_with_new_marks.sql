-- D-308 (#476): "Approve anyway". When an admin approves a next-book draft for print although marks arrived that its
-- plan did not use, the approval (approve_workbook_draft, audit action 'workbook-approved') is followed by one more audit
-- entry, 'approved-with-new-marks', with the new marks' counts. Service only, admins only, and only for a draft that has
-- an approval entry. Additive: the site works without it (the approval stands; the note is logged as not written).
create function public.note_workbook_approved_with_new_marks(p_draft uuid, p_by uuid, p_by_email text, p_detail jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  if p_draft is null or p_by is null or p_detail is null or jsonb_typeof(p_detail) <> 'object' then
    return jsonb_build_object('status','refused','reason','invalid-request');
  end if;
  if not exists(select 1 from public.admin_users where user_id = p_by) then
    return jsonb_build_object('status','refused','reason','admin-required');
  end if;
  select parent_id, child_id, run_id into a from public.workbook_audit
    where draft_id = p_draft and workbook_id = p_draft and action = 'workbook-approved' order by id desc limit 1;
  if not found then return jsonb_build_object('status','refused','reason','not-approved'); end if;
  insert into public.workbook_audit(parent_id, child_id, run_id, draft_id, workbook_id, actor_id, actor_email, action, detail)
    values (a.parent_id, a.child_id, a.run_id, p_draft, p_draft, p_by, p_by_email, 'approved-with-new-marks', p_detail);
  return jsonb_build_object('status','noted');
end $$;

revoke all on function public.note_workbook_approved_with_new_marks(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.note_workbook_approved_with_new_marks(uuid, uuid, text, jsonb) to service_role;
