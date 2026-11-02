-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_ship, 2026-11-01.
-- Approve, print and ship (#314, spec #296). Two service-only functions and one lock trigger:
--
-- approve_workbook_draft: stores the current revision of a draft as a workbook for print, approved, in one step. The
--   caller (src/lib/workbook-ship.ts) checks the draft first (every question check and fit check passed, every page
--   rendered with the real templates); this function checks what only the database knows: the revision is still the
--   draft's current one, and the workbook is this draft. The workbook keeps the draft's id, so its files are the
--   draft's files (<parent id>/<draft id>/...), and parents read them only once it is shipped
--   (migration workbooks_parent_shipped_only). Audit entry 'workbook-approved' with the actor and the revision.
-- mark_workbook: approved -> printed, then printed -> shipped, with the time and an audit entry ('workbook-printed',
--   'workbook-shipped') with the actor. A shipped answer says whether it is the child's first shipped workbook, so
--   the admin is led to the existing "Workbook shipped: start plan" step (D-140). No Stripe call here.
-- lock_printed_workbook: a printed or shipped workbook cannot change: its pages, questions and files (a new rendering
--   too), its draft's revisions (#313 edits and "Redo page"), and its status cannot go back. Deletes stay allowed, so
--   a family deletion still removes everything (on delete cascade, unchanged).
--
-- Only the server calls the functions, with the secret key. Admins and parents cannot. No new table, no new file.
-- Additive: the code on main does not call the functions, and no workbook is printed or shipped yet.

create function public.approve_workbook_draft(
  p_draft uuid, p_revision int, p_workbook jsonb, p_schema_version smallint, p_by uuid, p_by_email text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; v_latest int; v_write jsonb; v_run uuid;
begin
  select id, parent_id, child_id, number into d from public.workbook_drafts where id = p_draft for update;
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

create function public.mark_workbook(p_workbook uuid, p_to text, p_by uuid, p_by_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w record; v_first boolean := false; v_at timestamptz := now();
begin
  if p_to is null or p_to not in ('printed', 'shipped') then
    return jsonb_build_object('status', 'refused', 'reason', 'the new status is not printed or shipped');
  end if;
  select id, parent_id, child_id, number, status into w from public.workbooks where id = p_workbook;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the workbook is not known'); end if;
  -- The child first, then the workbook: two workbooks of one child shipped at once cannot both be the first.
  perform 1 from public.children where id = w.child_id for update;
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

do $$
declare f text;
begin
  foreach f in array array['approve_workbook_draft(uuid, int, jsonb, smallint, uuid, text)', 'mark_workbook(uuid, text, uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- The lock. On workbooks: a printed or shipped workbook keeps its content columns and dates, and its status only goes
-- forward (printed -> shipped). On its pages, questions and draft revisions: no new or changed row.
create function public.lock_printed_workbook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status text;
begin
  if tg_table_name = 'workbooks' then
    if old.status in ('printed', 'shipped') and (
      new.status not in ('printed', 'shipped') or (old.status = 'shipped' and new.status <> 'shipped')
      or (new.id, new.parent_id, new.child_id, new.number, new.levels, new.pdf_path, new.profile_build, new.approved_at, new.printed_at)
        is distinct from (old.id, old.parent_id, old.child_id, old.number, old.levels, old.pdf_path, old.profile_build, old.approved_at, old.printed_at)
      or (old.status = 'shipped' and new.shipped_at is distinct from old.shipped_at)
    ) then
      raise exception 'workbook % is %: it cannot change', old.id, old.status using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_table_name = 'workbook_draft_revisions' then
    v_id := new.draft_id;
  else
    v_id := new.workbook_id;
  end if;
  select status into v_status from public.workbooks where id = v_id;
  if v_status in ('printed', 'shipped') then
    raise exception 'workbook % is %: it cannot change', v_id, v_status using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.lock_printed_workbook() from public, anon, authenticated;

create trigger lock_printed_workbook before update on public.workbooks
  for each row execute function public.lock_printed_workbook();
create trigger lock_printed_workbook before insert or update on public.workbook_pages
  for each row execute function public.lock_printed_workbook();
create trigger lock_printed_workbook before insert or update on public.workbook_questions
  for each row execute function public.lock_printed_workbook();
create trigger lock_printed_workbook before insert or update on public.workbook_draft_revisions
  for each row execute function public.lock_printed_workbook();
