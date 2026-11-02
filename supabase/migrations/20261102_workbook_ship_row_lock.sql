-- Review P2-1 on #420: an edit that was open while the workbook was marked printed could commit after the mark. The
-- lock trigger now share-locks the workbook row before it reads the status, so the mark and an edit cannot overlap.
create or replace function public.lock_printed_workbook() returns trigger
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
  -- Share-lock the workbook row: marking it printed (an update of that row) waits for this edit to commit, and an edit
  -- that starts after the mark reads the new status (review P2-1 on #420).
  select status into v_status from public.workbooks where id = v_id for share;
  if v_status in ('printed', 'shipped') then
    raise exception 'workbook % is %: it cannot change', v_id, v_status using errcode = 'P0001';
  end if;
  return new;
end $$;
