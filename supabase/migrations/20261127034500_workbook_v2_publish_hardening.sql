-- UNI-141 hardening: close child-deletion, test-family storage fence, payload completeness, retry identity, and v1/v2
-- workbook-number reservation gaps found in review. Additive only (replaces functions, no table drops).

-- 1. Child deletion removes files from unpublished v2 allocations too, and fences late uploads into those folders.
create or replace function public.child_delete_roots(p uuid, c uuid)
returns table(bucket text, prefix text) language sql stable security definer set search_path = '' as $$
  select 'shown-work', p::text || '/' || a.id::text from public.assessments a where a.parent_id = p and a.child_id = c
  union select 'workbook-pages', p::text || '/' || w.id::text from public.workbooks w where w.parent_id = p and w.child_id = c
  union select 'workbook-pages', p::text || '/' || d.id::text from public.workbook_drafts d where d.parent_id = p and d.child_id = c
  union select 'workbook-pages', p::text || '/' || f.workbook_id::text from public.workbook_first_pages f where f.parent_id = p and f.child_id = c
  union select 'workbook-pages', p::text || '/' || v.workbook_id::text from public.workbook_v2_allocations v where v.parent_id = p and v.child_id = c
  union select 'scan-photos', p::text || '/' || s.id::text from public.scan_photos s where s.parent_id = p and s.child_id = c
  union select f->>'bucket', f->>'prefix' from public.child_deletions d, lateral jsonb_array_elements(d.folders) f where d.parent_id = p and d.child_id = c;
$$;

-- 2. Storage uploads for v2 books (input JSON or any file in a v2 allocation/workbook folder) require test_accounts
-- after assert_family_writable locks parents FOR SHARE, serializing with admin_set_test_account's FOR UPDATE on parents.
create or replace function public.fence_work_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid;
  v_folder text;
  v_book uuid;
begin
  if tg_op = 'UPDATE' and old.bucket_id in ('shown-work', 'workbook-pages', 'scan-photos') then
    perform public.assert_family_writable(split_part(old.name, '/', 1)::uuid);
  end if;
  if new.bucket_id in ('shown-work', 'workbook-pages', 'scan-photos') then
    v_parent := split_part(new.name, '/', 1)::uuid;
    perform public.assert_family_writable(v_parent);
    if new.bucket_id = 'workbook-pages' then
      v_folder := split_part(new.name, '/', 2);
      if v_folder ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        v_book := v_folder::uuid;
      end if;
      if right(new.name, 5) = '.json'
        or (v_book is not null and (
          exists (select 1 from public.workbook_v2_allocations a where a.workbook_id = v_book and a.parent_id = v_parent)
          or exists (select 1 from public.workbooks w where w.id = v_book and w.parent_id = v_parent and w.generator = 'v2')
        )) then
        if not exists (select 1 from public.test_accounts where parent_id = v_parent) then
          raise exception 'v2_test_family_required' using errcode = '55000';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

-- 3. Lock parents FOR SHARE before children FOR NO KEY UPDATE (serializing with admin_set_test_account), and reserve
-- numbers across workbooks, v2 allocations, and active v1 runs.
create or replace function public.allocate_v2_workbook(p_allocation jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w_child uuid := (p_allocation->>'childId')::uuid;
  w_parent uuid;
  w_row public.workbook_v2_allocations;
  w_number integer;
begin
  select parent_id into w_parent from public.children where id = w_child;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  perform 1 from public.parents where id = w_parent for share;
  select parent_id into w_parent from public.children where id = w_child for no key update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  if not exists (select 1 from public.test_accounts where parent_id = w_parent) then
    return jsonb_build_object('status', 'refused', 'reason', 'v2 books are only for test families');
  end if;
  select * into w_row from public.workbook_v2_allocations
    where request_key = p_allocation->>'requestKey' or input_hash = p_allocation->>'inputHash' order by created_at limit 1;
  if found then
    if w_row.child_id <> w_child then return jsonb_build_object('status', 'refused', 'reason', 'the request key belongs to another child'); end if;
  else
    if split_part(p_allocation->>'inputPath', '/', 1) <> w_parent::text or split_part(p_allocation->>'inputPath', '/', 2) <> p_allocation->>'workbookId' then
      return jsonb_build_object('status', 'refused', 'reason', 'the input file is not in the workbook''s folder');
    end if;
    select greatest(
      coalesce((select max(number) from public.workbooks where child_id = w_child), 0),
      coalesce((select max(workbook_number) from public.workbook_v2_allocations where child_id = w_child), 0),
      coalesce((select max(number) from public.workbook_runs where child_id = w_child and status in ('queued', 'running')), 0)
    ) + 1 into w_number;
    insert into public.workbook_v2_allocations (parent_id, child_id, workbook_id, workbook_number, request_key, input_hash, input_path, allocated_at, allocation)
    values (w_parent, w_child, (p_allocation->>'workbookId')::uuid, w_number, p_allocation->>'requestKey', p_allocation->>'inputHash',
      p_allocation->>'inputPath', (p_allocation->>'allocatedAt')::timestamptz, p_allocation->'allocation')
    returning * into w_row;
  end if;
  return jsonb_build_object(
    'status', case when w_row.workbook_id = (p_allocation->>'workbookId')::uuid and w_row.request_key = p_allocation->>'requestKey' then 'allocated' else 'existing' end,
    'parentId', w_row.parent_id, 'childId', w_row.child_id, 'workbookId', w_row.workbook_id, 'workbookNumber', w_row.workbook_number,
    'requestKey', w_row.request_key, 'inputHash', w_row.input_hash, 'inputPath', w_row.input_path,
    'allocatedAt', to_char(w_row.allocated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'allocation', w_row.allocation);
exception
  when unique_violation or check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format then
    return jsonb_build_object('status', 'refused', 'reason', format('the allocation does not pass the database check (%s)', sqlerrm));
end $$;

-- 4. Publish verifies parent lock + test_accounts + allocation identity BEFORE returning 'existing', and enforces complete,
-- non-empty, relationally matched payload arrays (pages, questions, itemAnswers, sheets, timeLogs).
create or replace function public.publish_v2_workbook(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w jsonb := p_payload->'workbook';
  w_id uuid := (w->>'id')::uuid;
  w_child uuid := (w->>'childId')::uuid;
  w_number integer := (w->>'number')::int;
  w_parent uuid;
  w_folder text;
  w_existing record;
  v_pages integer;
  v_questions integer;
  v_answers integer;
  v_sheets integer;
  v_time_logs integer;
  c text;
begin
  select parent_id into w_parent from public.children where id = w_child;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  perform 1 from public.parents where id = w_parent for share;
  select parent_id into w_parent from public.children where id = w_child for no key update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  if not exists (select 1 from public.test_accounts where parent_id = w_parent) then
    return jsonb_build_object('status', 'refused', 'reason', 'v2 books are only for test families');
  end if;
  if not exists (
    select 1 from public.workbook_v2_allocations a
    where a.workbook_id = w_id and a.child_id = w_child and a.parent_id = w_parent
      and a.input_hash = w->>'inputHash' and a.input_path = w->>'inputPath' and a.workbook_number = w_number
  ) then
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

  if jsonb_typeof(p_payload->'pages') <> 'array'
    or jsonb_typeof(p_payload->'questions') <> 'array'
    or jsonb_typeof(p_payload->'itemAnswers') <> 'array'
    or jsonb_typeof(p_payload->'sheets') <> 'array'
    or jsonb_typeof(p_payload->'timeLogs') <> 'array' then
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
    if exists (
      select 1 from public.workbook_item_answers a
      where a.workbook_id = w_id
        and not exists (select 1 from public.workbook_questions q where q.page_id = a.page_id and q.question_number = a.question_number)
    ) then
      raise exception 'an item answer does not match a question' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.workbook_sheets s
      where s.workbook_id = w_id and (
        not exists (select 1 from public.workbook_pages pg where pg.workbook_id = w_id and pg.page_number = s.front_page_number)
        or not exists (select 1 from public.workbook_pages pg where pg.workbook_id = w_id and pg.page_number = s.back_page_number)
      )
    ) then
      raise exception 'a sheet names a page that the book does not have' using errcode = '23514';
    end if;
    if (select count(*) from public.workbook_sheets where workbook_id = w_id and starts_day) <> v_time_logs
      or exists (
        select 1 from public.workbook_time_logs t
        join public.workbook_pages pg on pg.id = t.page_id
        where t.workbook_id = w_id
          and not exists (
            select 1 from public.workbook_sheets s
            where s.workbook_id = w_id and s.starts_day and s.day = t.day
              and s.sheet_id = t.first_sheet_id and s.front_page_number = pg.page_number
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

-- 5. v1 start_workbook_run and write_workbook respect numbers and ids reserved in workbook_v2_allocations.
create or replace function public.start_workbook_run(p_child uuid, p_by uuid, p_by_email text, p_max_attempts int, p_stale_seconds int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_parent uuid; v_number int; v_run uuid; a record;
begin
  select parent_id into v_parent from public.children where id = p_child for no key update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  select id, status, lease, heartbeat_at, created_at, resumes into a from public.workbook_runs where child_id = p_child and status in ('queued', 'running');
  if found then
    -- Stopped mid-way: no holder for 2 minutes (a hand-over that did not arrive, or a queued run never taken), or no
    -- progress for p_stale_seconds.
    if (a.lease is null and coalesce(a.heartbeat_at, a.created_at) < now() - interval '2 minutes')
      or coalesce(a.heartbeat_at, a.created_at) < now() - make_interval(secs => p_stale_seconds) then
      if a.status = 'queued' then
        update public.workbook_runs set status = 'running', attempts = 1, step = 'plan', started_at = now() where id = a.id;
      end if;
      if a.resumes < 30 then return jsonb_build_object('status', 'stalled', 'run', a.id); end if;
      update public.workbook_runs set status = 'stale', finished_at = now(), lease = null,
        error = coalesce(error, 'The run stopped too many times without finishing.') where id = a.id;
      insert into public.workbook_audit (parent_id, child_id, run_id, actor_id, actor_email, action) values (v_parent, p_child, a.id, p_by, p_by_email, 'run-stopped');
    else
      return jsonb_build_object('status', 'busy', 'run', a.id);
    end if;
  end if;
  select greatest(
    coalesce((select max(number) from public.workbooks where child_id = p_child), 0),
    coalesce((select max(workbook_number) from public.workbook_v2_allocations where child_id = p_child), 0)
  ) + 1 into v_number;
  insert into public.workbook_runs (parent_id, child_id, number, max_attempts, started_by, started_by_email)
    values (v_parent, p_child, v_number, p_max_attempts, p_by, p_by_email) returning id into v_run;
  insert into public.workbook_audit (parent_id, child_id, run_id, actor_id, actor_email, action, detail)
    values (v_parent, p_child, v_run, p_by, p_by_email, 'run-started', jsonb_build_object('number', v_number));
  return jsonb_build_object('status', 'started', 'run', v_run);
end $$;

create or replace function public.write_workbook(p_workbook jsonb, p_schema_version smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w_id uuid := (p_workbook->>'id')::uuid;
  w_child uuid := (p_workbook->>'childId')::uuid;
  w_number integer := (p_workbook->>'number')::int;
  w_parent uuid;
  pg jsonb;
  q jsonb;
  v_page uuid;
  c text;
begin
  select parent_id into w_parent from public.children where id = w_child for no key update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  if exists (select 1 from public.workbook_v2_allocations a where a.workbook_id = w_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'the workbook id is already used');
  end if;
  if exists (select 1 from public.workbook_v2_allocations a where a.child_id = w_child and a.workbook_number = w_number) then
    return jsonb_build_object('status', 'refused', 'reason', format('the child already has workbook %s', w_number));
  end if;
  if exists (
    select 1 from (
      select p_workbook->>'pdfPath' as path
      union all select page->'image'->>'path' from jsonb_array_elements(p_workbook->'pages') page
    ) f where f.path is not null and split_part(f.path, '/', 1) <> w_parent::text
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'a file is not in the family''s folder');
  end if;

  begin
    insert into public.workbooks (id, parent_id, child_id, number, levels, pdf_path, profile_build, printed_revision, pdf_sha256, print_manifest)
    values (
      w_id, w_parent, w_child, w_number,
      array(select jsonb_array_elements_text(p_workbook->'levels')::smallint), p_workbook->>'pdfPath', p_workbook->>'profileBuild',
      p_workbook->>'printedRevision', p_workbook->>'pdfSha256', nullif(p_workbook->'printManifest', 'null'::jsonb)
    );
    for pg in select value from jsonb_array_elements(p_workbook->'pages') loop
      insert into public.workbook_pages (workbook_id, parent_id, page_number, day_label, page_type, image_path, image_width, image_height, qr_token, print_contract)
      values (
        w_id, w_parent, (pg->>'number')::int, pg->>'dayLabel', pg->>'type',
        pg->'image'->>'path', (pg->'image'->>'width')::int, (pg->'image'->>'height')::int, pg->>'qrToken',
        nullif(pg->'printContract', 'null'::jsonb)
      )
      returning id into v_page;
      for q in select value from jsonb_array_elements(pg->'questions') loop
        insert into public.workbook_questions (
          page_id, workbook_id, parent_id, question_number, question_key, schema_version, package, box_x, box_y, box_width, box_height, regions, teaching
        ) values (
          v_page, w_id, w_parent, (q->>'number')::int, q->'package'->>'id', p_schema_version, q->'package',
          (q->'box'->>'x')::int, (q->'box'->>'y')::int, (q->'box'->>'width')::int, (q->'box'->>'height')::int,
          nullif(q->'regions', 'null'::jsonb), nullif(q->'teaching', 'null'::jsonb)
        );
      end loop;
    end loop;
  exception
    when unique_violation then
      get stacked diagnostics c = constraint_name;
      return jsonb_build_object('status', 'refused', 'reason', case c
        when 'workbooks_pkey' then 'the workbook id is already used'
        when 'workbooks_child_number_key' then format('the child already has workbook %s', p_workbook->>'number')
        when 'workbook_pages_qr_token_key' then 'a QR token is already used'
        when 'workbook_pages_number_key' then 'a page number is used twice'
        when 'workbook_questions_number_key' then 'a question number is used twice on a page'
        when 'workbook_questions_key_key' then 'a question id is used twice'
        else format('a value is already used (%s)', c) end);
    when check_violation or not_null_violation then
      get stacked diagnostics c = constraint_name;
      return jsonb_build_object('status', 'refused', 'reason', format('the workbook does not pass the database check %s', coalesce(c, 'not null')));
  end;
  return jsonb_build_object('status', 'written', 'workbookId', w_id);
end $$;

revoke all on function public.child_delete_roots(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fence_work_upload() from public, anon, authenticated;
revoke all on function public.allocate_v2_workbook(jsonb) from public, anon, authenticated;
revoke all on function public.publish_v2_workbook(jsonb) from public, anon, authenticated;
revoke all on function public.start_workbook_run(uuid, uuid, text, int, int) from public, anon, authenticated;
revoke all on function public.write_workbook(jsonb, smallint) from public, anon, authenticated;
grant execute on function public.allocate_v2_workbook(jsonb) to service_role;
grant execute on function public.publish_v2_workbook(jsonb) to service_role;
grant execute on function public.start_workbook_run(uuid, uuid, text, int, int) to service_role;
grant execute on function public.write_workbook(jsonb, smallint) to service_role;
