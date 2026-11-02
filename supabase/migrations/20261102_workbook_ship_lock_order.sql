-- Review P2-3 on #420: a repeated approval of a draft and a mark of its workbook locked the draft and the workbook in
-- opposite orders and could deadlock. Both functions now lock the draft before the workbook, with FOR NO KEY UPDATE,
-- which an edit revision's foreign key (FOR KEY SHARE) does not wait for.
create or replace function public.approve_workbook_draft(
  p_draft uuid, p_revision int, p_workbook jsonb, p_schema_version smallint, p_by uuid, p_by_email text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; v_latest int; v_write jsonb; v_run uuid;
begin
  -- FOR NO KEY UPDATE: two approvals and a mark of the same draft still wait for each other, but an edit revision's
  -- foreign key (FOR KEY SHARE on the draft) does not, so an edit and an approval cannot deadlock (P2-3).
  select id, parent_id, child_id, number into d from public.workbook_drafts where id = p_draft for no key update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the draft is not known'); end if;
  select max(revision) into v_latest from public.workbook_draft_revisions where draft_id = p_draft;
  if v_latest is null then return jsonb_build_object('status', 'refused', 'reason', 'the draft has no rendering yet'); end if;
  if v_latest <> p_revision then
    return jsonb_build_object('status', 'refused', 'reason', format('version %s is not the current version (%s): reload the page', p_revision, v_latest));
  end if;
  if p_workbook->>'id' is distinct from p_draft::text or p_workbook->>'childId' is distinct from d.child_id::text
    or p_workbook->>'number' is distinct from d.number::text then
    return jsonb_build_object('status', 'refused', 'reason', 'the workbook is not this draft');
  end if;
  v_write := public.write_workbook(p_workbook, p_schema_version);
  if v_write->>'status' <> 'written' then return v_write; end if;
  update public.workbooks set status = 'approved', approved_at = now() where id = p_draft;
  select id into v_run from public.workbook_runs where draft_id = p_draft order by created_at desc limit 1;
  insert into public.workbook_audit (parent_id, child_id, run_id, draft_id, workbook_id, actor_id, actor_email, action, detail)
    values (d.parent_id, d.child_id, v_run, p_draft, p_draft, p_by, p_by_email, 'workbook-approved',
      jsonb_build_object('revision', p_revision, 'number', d.number));
  return jsonb_build_object('status', 'approved', 'workbookId', p_draft);
end $$;

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
  -- Then the draft, then the workbook: the same order as approve_workbook_draft (draft, then workbook), so a mark and a
  -- repeated approval of the same draft cannot deadlock (review P2-3). No key update: an edit's foreign key still passes.
  perform 1 from public.workbook_drafts where id = p_workbook for no key update;
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
