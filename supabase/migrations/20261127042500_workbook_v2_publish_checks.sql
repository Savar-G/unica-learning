-- UNI-141 review follow-up: tighten publish_v2_workbook payload validation.
-- 1. Reject omitted or non-array required payload keys with null-safe IS DISTINCT FROM 'array'.
-- 2. Verify persisted page QR tokens match the saved allocation's qrTokens order.
-- 3. Require page numbers 1..v_pages and disjoint front/back sheet pairs covering every page once.
-- 4. Require every sheet day's first sheet (lowest front_page_number) to have starts_day = true and a matching time log.

create or replace function public.publish_v2_workbook(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  w jsonb := p_payload->'workbook';
  w_id uuid;
  w_child uuid;
  w_number integer;
  w_parent uuid;
  w_alloc public.workbook_v2_allocations;
  w_folder text;
  w_existing record;
  v_pages integer;
  v_questions integer;
  v_answers integer;
  v_sheets integer;
  v_time_logs integer;
  v_days integer;
  c text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(w) is distinct from 'object' then
    return jsonb_build_object('status', 'refused', 'reason', 'the book payload is incomplete');
  end if;
  begin
    w_id := (w->>'id')::uuid;
    w_child := (w->>'childId')::uuid;
    w_number := (w->>'number')::int;
  exception when invalid_text_representation then
    return jsonb_build_object('status', 'refused', 'reason', 'the book payload is incomplete');
  end;
  if w_id is null or w_child is null or w_number is null then
    return jsonb_build_object('status', 'refused', 'reason', 'the book payload is incomplete');
  end if;

  select parent_id into w_parent from public.children where id = w_child;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  perform 1 from public.parents where id = w_parent for share;
  select parent_id into w_parent from public.children where id = w_child for no key update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  if not exists (select 1 from public.test_accounts where parent_id = w_parent) then
    return jsonb_build_object('status', 'refused', 'reason', 'v2 books are only for test families');
  end if;

  select * into w_alloc from public.workbook_v2_allocations a
    where a.workbook_id = w_id and a.child_id = w_child and a.parent_id = w_parent
      and a.input_hash = w->>'inputHash' and a.input_path = w->>'inputPath' and a.workbook_number = w_number;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'the book does not match its allocation');
  end if;

  select id, child_id, number, input_path, printed_revision into w_existing
    from public.workbooks where input_hash = w->>'inputHash';
  if found then
    if w_existing.id <> w_id or w_existing.child_id <> w_child
      or w_existing.number <> w_number or w_existing.input_path <> w->>'inputPath' then
      return jsonb_build_object('status', 'refused', 'reason', 'the book does not match its allocation');
    end if;
    return jsonb_build_object('status', 'existing', 'workbookId', w_existing.id, 'printedRevision', w_existing.printed_revision);
  end if;

  if jsonb_typeof(p_payload->'pages') is distinct from 'array'
    or jsonb_typeof(p_payload->'questions') is distinct from 'array'
    or jsonb_typeof(p_payload->'itemAnswers') is distinct from 'array'
    or jsonb_typeof(p_payload->'sheets') is distinct from 'array'
    or jsonb_typeof(p_payload->'timeLogs') is distinct from 'array' then
    return jsonb_build_object('status', 'refused', 'reason', 'the book payload is incomplete');
  end if;
  v_pages := jsonb_array_length(p_payload->'pages');
  v_questions := jsonb_array_length(p_payload->'questions');
  v_answers := jsonb_array_length(p_payload->'itemAnswers');
  v_sheets := jsonb_array_length(p_payload->'sheets');
  v_time_logs := jsonb_array_length(p_payload->'timeLogs');
  if v_pages < 2 or mod(v_pages, 2) <> 0 or v_sheets <> v_pages / 2
    or v_questions < 1 or v_answers <> v_questions or v_time_logs < 1 then
    return jsonb_build_object('status', 'refused', 'reason', 'the book payload is incomplete');
  end if;
  if jsonb_typeof(w_alloc.allocation->'qrTokens') is distinct from 'array'
    or jsonb_array_length(w_alloc.allocation->'qrTokens') <> v_pages then
    return jsonb_build_object('status', 'refused', 'reason', 'the book does not match its allocation');
  end if;

  w_folder := w_parent::text || '/' || w_id::text || '/';
  if exists (
    select 1 from (
      select w->>'pdfPath' as path union all select w->>'inputPath'
      union all select page->'image'->>'path' from jsonb_array_elements(p_payload->'pages') page
    ) f where f.path is null or left(f.path, length(w_folder)) <> w_folder or position('/' in substr(f.path, length(w_folder) + 1)) > 0
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'a file is not in the workbook''s folder');
  end if;

  begin
    insert into public.workbooks (id, parent_id, child_id, number, levels, pdf_path, printed_revision, pdf_sha256, print_manifest, generator,
      bank_snapshot_id, bank_snapshot_hash, engine_version, renderer_version, font_hashes, input_hash, input_path, pages_per_day)
    values (w_id, w_parent, w_child, w_number, array(select jsonb_array_elements_text(w->'levels')::smallint), w->>'pdfPath',
      w->>'printedRevision', w->>'pdfSha256', w->'printManifest', 'v2', w->>'bankSnapshotId', w->>'bankSnapshotHash', w->>'engineVersion',
      w->>'rendererVersion', w->'fontHashes', w->>'inputHash', w->>'inputPath', (w->>'pagesPerDay')::smallint);

    insert into public.workbook_pages (workbook_id, parent_id, page_number, day_label, page_type, image_path, image_width, image_height, qr_token, print_contract)
    select w_id, w_parent, p.number, p."dayLabel", p.type, p.image->>'path', (p.image->>'width')::int, (p.image->>'height')::int, p."qrToken", p."printContract"
    from jsonb_to_recordset(p_payload->'pages') as p(number int, "dayLabel" text, type text, image jsonb, "qrToken" text, "printContract" jsonb);

    insert into public.workbook_questions (page_id, workbook_id, parent_id, question_number, question_key, schema_version, package, box_x, box_y, box_width, box_height, regions, teaching)
    select pg.id, w_id, w_parent, q.number, q.package->>'id', (p_payload->>'schemaVersion')::smallint, q.package,
      (q.box->>'x')::int, (q.box->>'y')::int, (q.box->>'width')::int, (q.box->>'height')::int, q.regions, null
    from jsonb_to_recordset(p_payload->'questions') as q("pageNumber" int, number int, package jsonb, box jsonb, regions jsonb)
    join public.workbook_pages pg on pg.workbook_id = w_id and pg.page_number = q."pageNumber";

    insert into public.workbook_item_answers (workbook_id, parent_id, child_id, printed_revision, page_id, page_number, item_id, question_number,
      snapshot_id, sheet_id, row_id, attempt, question_id, phrasing_id, scenario_id, engine_version, shape, shape_version, params, prompt,
      answer_kind, answer_value, accepted_forms, unit, parts, worked_steps, difficulty, item_hash)
    select w_id, w_parent, w_child, w->>'printedRevision', pg.id, a."pageNumber", a."itemId", a."questionNumber", a."snapshotId", a."sheetId",
      a."rowId", a.attempt, a."questionId", a."phrasingId", a."scenarioId", a."engineVersion", a.shape, a."shapeVersion", a.params, a.prompt,
      a."answerKind", a."answerValue", a."acceptedForms", a.unit, a.parts, a."workedSteps", a.difficulty, a."itemHash"
    from jsonb_to_recordset(p_payload->'itemAnswers') as a("pageNumber" int, "itemId" text, "questionNumber" int, "snapshotId" text, "sheetId" text,
      "rowId" text, attempt int, "questionId" text, "phrasingId" text, "scenarioId" text, "engineVersion" text, shape text, "shapeVersion" int,
      params jsonb, prompt text, "answerKind" text, "answerValue" text, "acceptedForms" jsonb, unit text, parts jsonb, "workedSteps" jsonb,
      difficulty bigint, "itemHash" text)
    join public.workbook_pages pg on pg.workbook_id = w_id and pg.page_number = a."pageNumber";

    insert into public.workbook_sheets (workbook_id, parent_id, child_id, sheet_id, attempt, day, front_page_number, back_page_number, snapshot_id, starts_day)
    select w_id, w_parent, w_child, s."sheetId", s.attempt, s.day, s."frontPageNumber", s."backPageNumber", s."snapshotId", s."startsDay"
    from jsonb_to_recordset(p_payload->'sheets') as s("sheetId" text, attempt int, day int, "frontPageNumber" int, "backPageNumber" int, "snapshotId" text, "startsDay" boolean);

    insert into public.workbook_time_logs (workbook_id, parent_id, child_id, day, first_sheet_id, page_id)
    select w_id, w_parent, w_child, t.day, t."firstSheetId", pg.id
    from jsonb_to_recordset(p_payload->'timeLogs') as t(day int, "firstSheetId" text, "pageNumber" int)
    join public.workbook_pages pg on pg.workbook_id = w_id and pg.page_number = t."pageNumber";

    -- Every row of the payload must land and match its counterpart across pages, questions, answers, sheets and time logs.
    if (select count(*) from public.workbook_pages where workbook_id = w_id) <> v_pages
      or (select count(*) from public.workbook_questions where workbook_id = w_id) <> v_questions
      or (select count(*) from public.workbook_item_answers where workbook_id = w_id) <> v_answers
      or (select count(*) from public.workbook_sheets where workbook_id = w_id) <> v_sheets
      or (select count(*) from public.workbook_time_logs where workbook_id = w_id) <> v_time_logs then
      raise exception 'a row names a page that the book does not have' using errcode = '23514';
    end if;

    -- Stored page numbers must form 1..v_pages and keep the exact QR token allocated to each page position.
    if (select min(page_number) from public.workbook_pages where workbook_id = w_id) <> 1
      or (select max(page_number) from public.workbook_pages where workbook_id = w_id) <> v_pages then
      raise exception 'the page numbers do not run from 1 through the page count' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.workbook_pages pg
      where pg.workbook_id = w_id
        and pg.qr_token is distinct from (w_alloc.allocation->'qrTokens'->>(pg.page_number - 1))
    ) then
      raise exception 'a page QR token does not match the allocation' using errcode = '23514';
    end if;

    if exists (
      select 1 from public.workbook_item_answers a
      where a.workbook_id = w_id
        and not exists (select 1 from public.workbook_questions q where q.page_id = a.page_id and q.question_number = a.question_number)
    ) then
      raise exception 'an item answer does not match a question' using errcode = '23514';
    end if;

    -- Every sheet must occupy one disjoint (odd, even) page pair across 1..v_pages, covering every page exactly once.
    if exists (
      select 1 from public.workbook_sheets s
      where s.workbook_id = w_id
        and (s.front_page_number < 1 or s.back_page_number > v_pages or mod(s.front_page_number, 2) <> 1)
    ) then
      raise exception 'the sheets do not partition pages 1 through the page count' using errcode = '23514';
    end if;

    -- Every sheet day's first sheet (lowest front_page_number) must be the only starts_day sheet of its day and match its time log.
    select count(distinct day) into v_days from public.workbook_sheets where workbook_id = w_id;
    if (select count(*) from public.workbook_sheets where workbook_id = w_id and starts_day) <> v_days
      or v_time_logs <> v_days
      or exists (
        select 1 from (
          select distinct on (s.day) s.day, s.sheet_id, s.front_page_number, s.starts_day
          from public.workbook_sheets s
          where s.workbook_id = w_id
          order by s.day, s.front_page_number
        ) first_of_day
        where not first_of_day.starts_day
          or not exists (
            select 1 from public.workbook_time_logs t
            join public.workbook_pages pg on pg.id = t.page_id
            where t.workbook_id = w_id and t.day = first_of_day.day
              and t.first_sheet_id = first_of_day.sheet_id and pg.page_number = first_of_day.front_page_number
          )
      ) then
      raise exception 'the time logs do not match the first sheet of each day' using errcode = '23514';
    end if;
  exception
    when unique_violation then
      get stacked diagnostics c = constraint_name;
      if c = 'workbooks_input_hash_key' then
        select id, child_id, number, input_path, printed_revision into w_existing
          from public.workbooks where input_hash = w->>'inputHash';
        if found and w_existing.id = w_id and w_existing.child_id = w_child
          and w_existing.number = w_number and w_existing.input_path = w->>'inputPath' then
          return jsonb_build_object('status', 'existing', 'workbookId', w_existing.id, 'printedRevision', w_existing.printed_revision);
        end if;
        return jsonb_build_object('status', 'refused', 'reason', 'the book does not match its allocation');
      end if;
      return jsonb_build_object('status', 'refused', 'reason', format('a value is already used (%s)', c));
    when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation then
      get stacked diagnostics c = constraint_name;
      return jsonb_build_object('status', 'refused', 'reason', format('the book does not pass the database check %s', coalesce(nullif(c, ''), sqlerrm)));
  end;
  return jsonb_build_object('status', 'published', 'workbookId', w_id, 'printedRevision', w->>'printedRevision');
end $$;

revoke all on function public.publish_v2_workbook(jsonb) from public, anon, authenticated;
grant execute on function public.publish_v2_workbook(jsonb) to service_role;
