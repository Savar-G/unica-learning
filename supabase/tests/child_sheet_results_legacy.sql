-- Run on local PostgreSQL as a superuser after the workbook and sheet-result migrations.
-- The fixture needs one pre-constraint duplicate. All changes roll back.
begin;
set local statement_timeout = '15s';
do $$
declare
  p uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  first_book uuid := gen_random_uuid(); later_book uuid := gen_random_uuid();
  first_rev text := repeat('a', 28); later_rev text := repeat('b', 28);
  result_id uuid; r jsonb;
  first_row jsonb := jsonb_build_object(
    'workbookId', first_book, 'printedRevision', first_rev, 'sheetId', 'probe-sheet', 'attempt', 1,
    'itemsTotal', 16, 'itemsScored', 16, 'mistakes', 0, 'result', 'mastered');
  later_row jsonb := jsonb_set(jsonb_set(first_row, '{workbookId}', to_jsonb(later_book)), '{printedRevision}', to_jsonb(later_rev));
  batch jsonb := jsonb_build_array(first_row, jsonb_set(first_row, '{sheetId}', '"other-sheet"'));
begin
  insert into auth.users(id, email) values (p, p || '@example.invalid');
  insert into public.parents(id, name, email) values (p, 'Sheet results probe', p || '@example.invalid');
  insert into public.children(id, parent_id, first_name, grade, province) values (c, p, 'Probe', 3, 'BC');
  insert into public.workbooks(id, parent_id, child_id, number, levels, printed_revision, generator, bank_snapshot_id,
      bank_snapshot_hash, engine_version, renderer_version, font_hashes, input_hash, input_path, pages_per_day)
    select b.id, p, c, b.number, '{3}', b.rev, 'v2', 'probe-snapshot', repeat('a', 64), 'probe', 'probe', '{}',
      repeat(replace(b.id::text, '-', ''), 2), p || '/' || b.id || '/input.json', 2
    from (values (first_book, 1, first_rev), (later_book, 2, later_rev)) b(id, number, rev);
  insert into public.workbook_sheets(workbook_id, parent_id, child_id, sheet_id, attempt, day, front_page_number,
      back_page_number, snapshot_id, starts_day, queue_reason)
    values (first_book, p, c, 'probe-sheet', 1, 1, 1, 2, 'probe-snapshot', true, 'new'),
           (first_book, p, c, 'other-sheet', 1, 1, 3, 4, 'probe-snapshot', false, 'new');
  perform set_config('session_replication_role', 'replica', true);
  insert into public.workbook_sheets(workbook_id, parent_id, child_id, sheet_id, attempt, day, front_page_number,
      back_page_number, snapshot_id, starts_day, queue_reason)
    values (later_book, p, c, 'probe-sheet', 1, 1, 1, 2, 'probe-snapshot', true, null);
  perform set_config('session_replication_role', 'origin', true);

  execute 'set local role service_role';
  -- This row is what the old writer could leave behind.
  insert into public.child_sheet_results(parent_id, child_id, workbook_id, printed_revision, sheet_id, attempt,
      items_total, items_scored, mistakes, result, marks_version)
    values (p, c, later_book, later_rev, 'probe-sheet', 1, 16, 16, 4, 'repeat', 6) returning id into result_id;
  r := public.write_child_sheet_results(c, 5, batch);
  if r is distinct from '{"status":"written","written":1,"stale":1,"marksVersion":6}'::jsonb
    or (select (workbook_id, printed_revision, result, marks_version) from public.child_sheet_results where id = result_id)
      is distinct from (later_book, later_rev, 'repeat'::text, 6::bigint) then raise exception 'legacy_stale_result_changed_or_blocked %', r; end if;
  r := public.write_child_sheet_results(c, 6, batch);
  if r is distinct from '{"status":"written","written":2,"stale":0,"marksVersion":6}'::jsonb
    or (select (workbook_id, printed_revision, result, marks_version) from public.child_sheet_results where id = result_id)
      is distinct from (first_book, first_rev, 'mastered'::text, 6::bigint) then raise exception 'legacy_result_not_reconciled %', r; end if;
  r := public.write_child_sheet_results(c, 7, jsonb_build_array(later_row));
  if r->>'status' is distinct from 'refused' then raise exception 'legacy_result_moved_back %', r; end if;
  begin
    update public.child_sheet_results set workbook_id = later_book, printed_revision = later_rev, marks_version = 7 where id = result_id;
    raise exception 'direct_legacy_result_moved_back';
  exception when sqlstate '55000' then null;
  end;
  r := public.write_child_sheet_results(c, 5, jsonb_build_array(jsonb_set(later_row, '{sheetId}', '"other-sheet"')));
  if r->>'status' is distinct from 'refused' then raise exception 'stale_unissued_result_admitted %', r; end if;
  if (select count(*) from public.workbook_sheets where child_id = c and sheet_id = 'probe-sheet') is distinct from 2::bigint then
    raise exception 'legacy_printed_sheets_lost';
  end if;
  execute 'reset role';
end $$;
select 'legacy duplicate reconciliation passed' as status;
rollback;
