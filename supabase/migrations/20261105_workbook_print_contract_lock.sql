-- Review of #587, P1: the printed-book lock did not cover the print contract's workbook columns, and
-- apply_workbook_print_contract ran on any status. A service-role call with no pages changed the revision, the PDF
-- fingerprint and the manifest of a shipped book while its PDF stayed the same.
--
-- The lock now covers printed_revision, pdf_sha256 and print_manifest. The page and question columns are already covered:
-- the lock refuses every update of a printed or shipped workbook's page or question rows. The function now works only on a
-- draft, and only with exactly the workbook's pages and questions, so it cannot leave part of a contract.
-- Additive: no column or signature changes, and the only caller (approve_workbook_draft) calls it on a draft with the whole
-- workbook.

create or replace function public.lock_printed_workbook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status text;
begin
  if tg_table_name = 'workbooks' then
    if old.status in ('printed', 'shipped') and (
      new.status not in ('printed', 'shipped') or (old.status = 'shipped' and new.status <> 'shipped')
      or (new.id, new.parent_id, new.child_id, new.number, new.levels, new.pdf_path, new.profile_build, new.approved_at, new.printed_at, new.printed_revision, new.pdf_sha256, new.print_manifest)
        is distinct from (old.id, old.parent_id, old.child_id, old.number, old.levels, old.pdf_path, old.profile_build, old.approved_at, old.printed_at, old.printed_revision, old.pdf_sha256, old.print_manifest)
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

-- Approval of a stored draft: the workbook takes the whole contract of the revision approved, or none.
create or replace function public.apply_workbook_print_contract(p_workbook jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare w_id uuid := (p_workbook->>'id')::uuid; v_status text; pg jsonb; q jsonb; v_page uuid;
begin
  select status into v_status from public.workbooks where id = w_id for update;
  if v_status is distinct from 'draft' then
    raise exception 'workbook % is %: its print contract cannot change', w_id, coalesce(v_status, 'not known') using errcode = 'P0001';
  end if;
  if (select coalesce(array_agg((e->>'number')::int order by (e->>'number')::int), '{}') from jsonb_array_elements(p_workbook->'pages') e)
     is distinct from (select coalesce(array_agg(page_number order by page_number), '{}') from public.workbook_pages where workbook_id = w_id) then
    raise exception 'workbook %: the print contract does not name the workbook''s pages', w_id using errcode = 'P0001';
  end if;
  for pg in select value from jsonb_array_elements(p_workbook->'pages') loop
    if (select coalesce(array_agg((e->>'number')::int order by (e->>'number')::int), '{}') from jsonb_array_elements(pg->'questions') e)
       is distinct from (
         select coalesce(array_agg(wq.question_number order by wq.question_number), '{}')
         from public.workbook_questions wq join public.workbook_pages wp on wp.id = wq.page_id
         where wp.workbook_id = w_id and wp.page_number = (pg->>'number')::int
       ) then
      raise exception 'workbook %, page %: the print contract does not name the page''s questions', w_id, pg->>'number' using errcode = 'P0001';
    end if;
  end loop;
  update public.workbooks set printed_revision = p_workbook->>'printedRevision', pdf_sha256 = p_workbook->>'pdfSha256',
    print_manifest = nullif(p_workbook->'printManifest', 'null'::jsonb) where id = w_id;
  for pg in select value from jsonb_array_elements(p_workbook->'pages') loop
    update public.workbook_pages set print_contract = nullif(pg->'printContract', 'null'::jsonb)
      where workbook_id = w_id and page_number = (pg->>'number')::int returning id into v_page;
    for q in select value from jsonb_array_elements(pg->'questions') loop
      update public.workbook_questions set regions = nullif(q->'regions', 'null'::jsonb), teaching = nullif(q->'teaching', 'null'::jsonb)
        where page_id = v_page and question_number = (q->>'number')::int;
    end loop;
  end loop;
end $$;
