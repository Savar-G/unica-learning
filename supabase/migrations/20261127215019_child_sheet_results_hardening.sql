-- UNI-243 hardening (after Codex review):
--   1. Track v2 sheet-result rebuild completion independently in scan_marking_revisions.sheet_results_revision
--      and re-queue pending v2 children in recover_scan_marking_oldest.
--   2. Persist workbook_sheets.queue_reason ('new', 'repeat', 'unscanned') at publication and enforce
--      per-child (child_id, sheet_id, attempt) uniqueness for new issuances.
--   3. Bind child_sheet_results immutably to its workbook_id and require printed_revision to match workbooks.printed_revision.
-- Additive only: preserves existing rows and function signatures.

alter table public.scan_marking_revisions
  add column if not exists sheet_results_revision bigint not null default -1 check (sheet_results_revision >= -1);

create or replace function public.recover_scan_marking_oldest(p_limit int default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cursor_sent timestamptz; cursor_id uuid; answer jsonb; last_sent timestamptz; last_id uuid;
begin
  if p_limit not between 1 and 10 then raise exception 'marking_limit'; end if;
  select after_sent_at, after_id into cursor_sent, cursor_id from public.scan_marking_queue_cursor where singleton for update;
  select coalesce(jsonb_agg(jsonb_build_object('photo', b.photo, 'parent', b.parent, 'child', b.child) order by b.sent_at, b.photo), '[]'),
    (array_agg(b.sent_at order by b.sent_at desc, b.photo desc))[1], (array_agg(b.photo order by b.sent_at desc, b.photo desc))[1]
    into answer, last_sent, last_id
  from (
    select p.id as photo, p.parent_id as parent, p.child_id as child, p.sent_at from public.scan_photos p
      join public.parents f on f.id=p.parent_id and f.deletion_requested_at is null
      left join public.scan_marking_jobs j on j.photo_id=p.id
      left join public.scan_marking_revisions r on r.child_id=p.child_id
    where p.sent_at is not null and (cursor_id is null or (p.sent_at, p.id) > (cursor_sent, cursor_id))
      and not exists(select 1 from public.child_deletions d where d.child_id=p.child_id)
      and ((public.scan_photo_is_active(p.state,p.created_at,p.expires_at) and p.state='saved' and coalesce(j.state,'queued')<>'finished'
          and exists(select 1 from public.scan_calibrations c where c.photo_id=p.id and c.parent_id=p.parent_id
            and c.printed_revision=p.printed_revision and c.state='ready' and public.scan_marking_sheet_current(c.result)))
        or r.profile_revision<r.revision
        or (r.sheet_results_revision<r.revision and exists(select 1 from public.workbooks w where w.child_id=p.child_id and w.generator='v2'))
        or exists(select 1 from public.scan_marking_items m where m.parent_id=p.parent_id and m.child_id=p.child_id
          and m.original_event is not null and m.event_id is null))
      order by p.sent_at, p.id limit p_limit
  ) b;
  update public.scan_marking_queue_cursor set after_sent_at=last_sent, after_id=last_id where singleton;
  return answer;
end $$;
revoke all on function public.recover_scan_marking_oldest(int) from public, anon, authenticated;
grant execute on function public.recover_scan_marking_oldest(int) to service_role;

create function public.mark_sheet_results_revision(p_child uuid, p_marks_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w_parent uuid;
  w_recorded bigint;
begin
  if p_marks_version is null or p_marks_version < 0 then
    return jsonb_build_object('status', 'refused', 'reason', 'the marks version must be a whole number, 0 or more');
  end if;
  select parent_id into w_parent from public.children where id = p_child;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  perform pg_advisory_xact_lock(hashtextextended('child-sheet-results:' || p_child::text, 0));
  insert into public.scan_marking_revisions (child_id, parent_id, revision, sheet_results_revision)
  values (p_child, w_parent, p_marks_version, p_marks_version)
  on conflict (child_id) do update set
    sheet_results_revision = greatest(public.scan_marking_revisions.sheet_results_revision, excluded.sheet_results_revision)
  returning sheet_results_revision into w_recorded;
  return jsonb_build_object('status', 'recorded', 'sheetResultsRevision', w_recorded);
end $$;
revoke all on function public.mark_sheet_results_revision(uuid, bigint) from public, anon, authenticated;
grant execute on function public.mark_sheet_results_revision(uuid, bigint) to service_role;

alter table public.workbook_sheets
  add column if not exists queue_reason text check (queue_reason in ('new', 'repeat', 'unscanned'));
alter table public.workbook_sheets
  drop constraint if exists workbook_sheets_queue_reason_attempt,
  add constraint workbook_sheets_queue_reason_attempt check (
    queue_reason is null
    or (attempt = 1 and queue_reason = 'new')
    or (attempt >= 2 and queue_reason in ('repeat', 'unscanned'))
  );

-- Enforce per-child (child_id, sheet_id, attempt) uniqueness on all new workbook_sheets inserts without touching
-- pre-existing QA smoke-test rows.
create function public.workbook_sheets_unique_child_attempt()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('workbook-sheets:' || new.child_id::text, 0));
  if exists (
    select 1 from public.workbook_sheets s
    where s.child_id = new.child_id and s.sheet_id = new.sheet_id and s.attempt = new.attempt
      and s.workbook_id <> new.workbook_id
  ) then
    raise exception 'workbook sheet % attempt % is already issued to child %', new.sheet_id, new.attempt, new.child_id
      using errcode = '23505', constraint = 'workbook_sheets_child_attempt_key';
  end if;
  return new;
end $$;
create trigger workbook_sheets_unique_child_attempt
  before insert on public.workbook_sheets for each row execute function public.workbook_sheets_unique_child_attempt();
revoke all on function public.workbook_sheets_unique_child_attempt() from public, anon, authenticated;

-- Update publish_v2_workbook to persist optional queue_reason on workbook_sheets.
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

    insert into public.workbook_sheets (workbook_id, parent_id, child_id, sheet_id, attempt, day, front_page_number, back_page_number, snapshot_id, starts_day, queue_reason)
    select w_id, w_parent, w_child, s."sheetId", s.attempt, s.day, s."frontPageNumber", s."backPageNumber", s."snapshotId", s."startsDay",
      coalesce(s.reason, case when s.attempt = 1 then 'new' else null end)
    from jsonb_to_recordset(p_payload->'sheets') as s("sheetId" text, attempt int, day int, "frontPageNumber" int, "backPageNumber" int, "snapshotId" text, "startsDay" boolean, reason text);

    insert into public.workbook_time_logs (workbook_id, parent_id, child_id, day, first_sheet_id, page_id)
    select w_id, w_parent, w_child, t.day, t."firstSheetId", pg.id
    from jsonb_to_recordset(p_payload->'timeLogs') as t(day int, "firstSheetId" text, "pageNumber" int)
    join public.workbook_pages pg on pg.workbook_id = w_id and pg.page_number = t."pageNumber";

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
revoke all on function public.publish_v2_workbook(jsonb) from public, anon, authenticated;
grant execute on function public.publish_v2_workbook(jsonb) to service_role;

-- Bind child_sheet_results immutably to its workbook_id and require printed_revision to match workbooks.printed_revision.
create or replace function public.child_sheet_results_monotonic()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.marks_version < old.marks_version then
    raise exception 'child sheet result %: marks version % is older than %', old.id, new.marks_version, old.marks_version using errcode = 'PT409';
  end if;
  if (new.parent_id, new.child_id, new.workbook_id, new.sheet_id, new.attempt) is distinct from (old.parent_id, old.child_id, old.workbook_id, old.sheet_id, old.attempt) then
    raise exception 'child sheet result %: its child, workbook and sheet attempt cannot change', old.id using errcode = '55000';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.child_sheet_results_monotonic() from public, anon, authenticated;

create function public.child_sheet_results_match_workbook()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.workbooks w
    where w.id = new.workbook_id and w.child_id = new.child_id and w.parent_id = new.parent_id
      and w.printed_revision is not null and w.printed_revision = new.printed_revision
  ) then
    raise exception 'child sheet result: printed_revision % does not match workbook %', new.printed_revision, new.workbook_id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger child_sheet_results_match_workbook
  before insert or update on public.child_sheet_results for each row execute function public.child_sheet_results_match_workbook();
revoke all on function public.child_sheet_results_match_workbook() from public, anon, authenticated;

create or replace function public.write_child_sheet_results(p_child uuid, p_marks_version bigint, p_results jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w_parent uuid;
  r jsonb;
  w_wb uuid;
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
      select workbook_id into w_existing_wb from public.child_sheet_results
        where child_id = p_child and sheet_id = r->>'sheetId' and attempt = (r->>'attempt')::int;
      if found and w_existing_wb <> w_wb then
        raise exception 'sheet % attempt % already belongs to another workbook', r->>'sheetId', r->>'attempt' using errcode = '23514';
      end if;

      insert into public.child_sheet_results as c (parent_id, child_id, workbook_id, printed_revision, sheet_id, attempt, items_total, items_scored, mistakes, result, marks_version)
      values (w_parent, p_child, w_wb, r->>'printedRevision', r->>'sheetId', (r->>'attempt')::int, (r->>'itemsTotal')::int,
        (r->>'itemsScored')::int, (r->>'mistakes')::int, r->>'result', p_marks_version)
      on conflict (child_id, sheet_id, attempt) do update set
        printed_revision = excluded.printed_revision, items_total = excluded.items_total,
        items_scored = excluded.items_scored, mistakes = excluded.mistakes, result = excluded.result, marks_version = excluded.marks_version
        where c.marks_version <= excluded.marks_version and c.workbook_id = excluded.workbook_id;
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
