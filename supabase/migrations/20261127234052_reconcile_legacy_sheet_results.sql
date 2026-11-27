-- A legacy duplicate can already have a result tied to a later workbook. A current rebuild may move that result to
-- the first v2 issuance, while an older rebuild must leave it intact. The printed workbooks and sheets stay in place.
create or replace function public.child_sheet_results_monotonic()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.marks_version < old.marks_version then
    raise exception 'child sheet result %: marks version % is older than %', old.id, new.marks_version, old.marks_version using errcode = 'PT409';
  end if;
  if (new.parent_id, new.child_id, new.sheet_id, new.attempt) is distinct from (old.parent_id, old.child_id, old.sheet_id, old.attempt) then
    raise exception 'child sheet result %: its child and sheet attempt cannot change', old.id using errcode = '55000';
  end if;
  if new.workbook_id is distinct from old.workbook_id and (
    not exists (select 1 from public.workbooks w where w.id = old.workbook_id and w.generator = 'v2')
    or new.workbook_id is distinct from (
      select s.workbook_id from public.workbook_sheets s join public.workbooks w on w.id = s.workbook_id
      where s.child_id = old.child_id and s.sheet_id = old.sheet_id and s.attempt = old.attempt and w.generator = 'v2'
      order by w.number limit 1
    )
  ) then
    raise exception 'child sheet result %: a workbook change must restore the first v2 issuance', old.id using errcode = '55000';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.child_sheet_results_monotonic() from public, anon, authenticated;

create or replace function public.write_child_sheet_results(p_child uuid, p_marks_version bigint, p_results jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w_parent uuid;
  r jsonb;
  w_wb uuid;
  w_sheet text;
  w_attempt int;
  w_generator text;
  w_number int;
  w_existing_wb uuid;
  w_count integer;
  w_written integer := 0;
  w_stale integer := 0;
begin
  if p_marks_version is null or p_marks_version < 0 then
    return jsonb_build_object('status', 'refused', 'reason', 'the marks version must be a whole number, 0 or more');
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' then
    return jsonb_build_object('status', 'refused', 'reason', 'the results must be a list');
  end if;
  select parent_id into w_parent from public.children where id = p_child;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  perform pg_advisory_xact_lock(hashtextextended('child-sheet-results:' || p_child::text, 0));

  begin
    for r in select value from jsonb_array_elements(p_results) loop
      w_wb := (r->>'workbookId')::uuid;
      w_sheet := r->>'sheetId';
      w_attempt := (r->>'attempt')::int;
      select w.generator, w.number into w_generator, w_number
        from public.workbook_sheets s join public.workbooks w on w.id = s.workbook_id
        where s.workbook_id = w_wb and s.child_id = p_child and s.sheet_id = w_sheet and s.attempt = w_attempt;
      if not found then
        raise exception 'sheet % attempt % was not issued in workbook %', w_sheet, w_attempt, w_wb using errcode = '23514';
      end if;
      if w_generator = 'v2' and exists (
        select 1 from public.workbook_sheets s join public.workbooks w on w.id = s.workbook_id
        where s.child_id = p_child and s.sheet_id = w_sheet and s.attempt = w_attempt and w.generator = 'v2' and w.number < w_number
      ) then
        raise exception 'sheet % attempt % was first issued in another workbook', w_sheet, w_attempt using errcode = '23514';
      end if;
      select workbook_id into w_existing_wb from public.child_sheet_results
        where child_id = p_child and sheet_id = w_sheet and attempt = w_attempt for update;
      if found and w_existing_wb <> w_wb and (w_generator is distinct from 'v2' or not exists (
        select 1 from public.workbooks w where w.id = w_existing_wb and w.generator = 'v2'
      )) then
        raise exception 'sheet % attempt % already belongs to another workbook', w_sheet, w_attempt using errcode = '23514';
      end if;

      insert into public.child_sheet_results as c (parent_id, child_id, workbook_id, printed_revision, sheet_id, attempt, items_total, items_scored, mistakes, result, marks_version)
      values (w_parent, p_child, w_wb, r->>'printedRevision', w_sheet, w_attempt, (r->>'itemsTotal')::int,
        (r->>'itemsScored')::int, (r->>'mistakes')::int, r->>'result', p_marks_version)
      on conflict (child_id, sheet_id, attempt) do update set
        workbook_id = excluded.workbook_id, printed_revision = excluded.printed_revision, items_total = excluded.items_total,
        items_scored = excluded.items_scored, mistakes = excluded.mistakes, result = excluded.result, marks_version = excluded.marks_version
        where c.marks_version <= excluded.marks_version and (c.workbook_id = excluded.workbook_id or c.workbook_id = w_existing_wb);
      get diagnostics w_count = row_count;
      if w_count = 1 then w_written := w_written + 1; else w_stale := w_stale + 1; end if;
    end loop;
  exception
    when foreign_key_violation or check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      return jsonb_build_object('status', 'refused', 'reason', format('the results do not pass the database check (%s)', sqlerrm));
  end;
  return jsonb_build_object('status', 'written', 'written', w_written, 'stale', w_stale,
    'marksVersion', (select max(marks_version) from public.child_sheet_results where child_id = p_child));
end $$;
revoke all on function public.write_child_sheet_results(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.write_child_sheet_results(uuid, bigint, jsonb) to service_role;
