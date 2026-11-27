-- UNI-141 (S6): a full-size v2 book is published into today's workbook tables (docs/workbook-v2-engine.md, "Publishing").
-- Additive only: v1 rows keep generator 'v1' and null v2 columns, and no v1 function changes.
--   * workbooks: the v2 identity of a book (generator, snapshot, engine, renderer, fonts, input hash and path, pages a day).
--   * workbook_item_answers: one row per printed v2 question, the one authority for its answer.
--   * workbook_sheets: one row per issued sheet; workbook_time_logs: one row per book day.
--   * workbook_v2_allocations: ids, QR tokens and dates saved under the input hash before the build, so a retry reuses them.
--   * allocate_v2_workbook and publish_v2_workbook: service-only, test families only (public.test_accounts) for now.
--   * workbook-pages: the build input is a private .json beside the PDF ("Workbook print files stay with the team").

alter table public.workbooks
  add column generator text not null default 'v1' check (generator in ('v1', 'v2')),
  add column bank_snapshot_id text check (char_length(bank_snapshot_id) between 1 and 120),
  add column bank_snapshot_hash text check (bank_snapshot_hash ~ '^[0-9a-f]{64}$'),
  add column engine_version text check (char_length(engine_version) between 1 and 40),
  add column renderer_version text check (char_length(renderer_version) between 1 and 80),
  add column font_hashes jsonb check (jsonb_typeof(font_hashes) = 'object'),
  add column input_hash text check (input_hash ~ '^[0-9a-f]{64}$'),
  add column input_path text check (char_length(input_path) <= 200 and split_part(input_path, '/', 1) = parent_id::text and split_part(input_path, '/', 2) = id::text),
  add column pages_per_day smallint check (pages_per_day between 1 and 20);

-- A v2 book carries its whole identity, so replay can name the part that differs; a v1 book carries none of it.
alter table public.workbooks add constraint workbooks_v2_identity check (
  (generator = 'v1' and bank_snapshot_id is null and bank_snapshot_hash is null and engine_version is null and renderer_version is null
    and font_hashes is null and input_hash is null and input_path is null and pages_per_day is null)
  or (generator = 'v2' and bank_snapshot_id is not null and bank_snapshot_hash is not null and engine_version is not null and renderer_version is not null
    and font_hashes is not null and input_hash is not null and input_path is not null and pages_per_day is not null)
);

create unique index workbooks_input_hash_key on public.workbooks (input_hash) where input_hash is not null;

-- The identity of a book never changes once it is written.
create function public.workbook_v2_identity_fixed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.generator, new.bank_snapshot_id, new.bank_snapshot_hash, new.engine_version, new.renderer_version, new.font_hashes, new.input_hash, new.input_path, new.pages_per_day)
    is distinct from (old.generator, old.bank_snapshot_id, old.bank_snapshot_hash, old.engine_version, old.renderer_version, old.font_hashes, old.input_hash, old.input_path, old.pages_per_day) then
    raise exception 'workbook %: its v2 identity cannot change', old.id using errcode = '55000';
  end if;
  return new;
end $$;
create trigger workbook_v2_identity_fixed before update on public.workbooks for each row execute function public.workbook_v2_identity_fixed();

create table public.workbook_item_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workbook_id uuid not null,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  printed_revision text not null check (printed_revision ~ '^[0-9a-f]{28}$'),
  page_id uuid not null,
  page_number integer not null check (page_number between 1 and 1000),
  item_id text not null check (char_length(item_id) between 1 and 200),
  question_number integer not null check (question_number between 1 and 1000),
  snapshot_id text not null check (char_length(snapshot_id) between 1 and 120),
  sheet_id text not null check (char_length(sheet_id) between 1 and 120),
  row_id text not null check (char_length(row_id) between 1 and 120),
  attempt integer not null check (attempt between 1 and 1000),
  question_id text check (char_length(question_id) between 1 and 120),
  phrasing_id text check (char_length(phrasing_id) between 1 and 120),
  scenario_id text check (char_length(scenario_id) between 1 and 120),
  engine_version text not null check (char_length(engine_version) between 1 and 40),
  shape text not null check (char_length(shape) between 1 and 80),
  shape_version integer not null check (shape_version >= 1),
  params jsonb not null check (pg_column_size(params) < 20000),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  answer_kind text not null check (answer_kind in ('whole-number', 'digit', 'quantity')),
  answer_value text not null check (char_length(answer_value) between 1 and 200),
  accepted_forms jsonb not null default '[]'::jsonb check (jsonb_typeof(accepted_forms) = 'array'),
  unit text check (char_length(unit) between 1 and 80),
  parts jsonb not null check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) >= 1),
  worked_steps jsonb not null check (jsonb_typeof(worked_steps) = 'array' and jsonb_array_length(worked_steps) >= 1),
  difficulty bigint not null check (difficulty >= 0),
  item_hash text not null check (item_hash ~ '^[0-9a-f]{64}$'),
  constraint workbook_item_answers_page_fkey foreign key (page_id, workbook_id, parent_id) references public.workbook_pages (id, workbook_id, parent_id) on delete cascade,
  constraint workbook_item_answers_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint workbook_item_answers_workbook_child_fkey foreign key (workbook_id, child_id) references public.workbooks (id, child_id) on delete cascade,
  constraint workbook_item_answers_item_key unique (workbook_id, printed_revision, page_id, item_id),
  constraint workbook_item_answers_number_key unique (page_id, question_number)
);
create index workbook_item_answers_child_idx on public.workbook_item_answers (child_id, parent_id);

create table public.workbook_sheets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workbook_id uuid not null,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  sheet_id text not null check (char_length(sheet_id) between 1 and 120),
  attempt integer not null check (attempt between 1 and 1000),
  day integer not null check (day between 1 and 100),
  front_page_number integer not null check (front_page_number between 1 and 999),
  back_page_number integer not null,
  snapshot_id text not null check (char_length(snapshot_id) between 1 and 120),
  starts_day boolean not null,
  constraint workbook_sheets_back_page check (back_page_number = front_page_number + 1),
  constraint workbook_sheets_workbook_fkey foreign key (workbook_id, parent_id) references public.workbooks (id, parent_id) on delete cascade,
  constraint workbook_sheets_workbook_child_fkey foreign key (workbook_id, child_id) references public.workbooks (id, child_id) on delete cascade,
  constraint workbook_sheets_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint workbook_sheets_attempt_key unique (workbook_id, sheet_id, attempt),
  constraint workbook_sheets_page_key unique (workbook_id, front_page_number)
);
create index workbook_sheets_child_idx on public.workbook_sheets (child_id, parent_id);

create table public.workbook_time_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workbook_id uuid not null,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  day integer not null check (day between 1 and 100),
  first_sheet_id text not null check (char_length(first_sheet_id) between 1 and 120),
  page_id uuid not null,
  start_time text check (char_length(start_time) between 1 and 20),
  end_time text check (char_length(end_time) between 1 and 20),
  minutes smallint check (minutes between 0 and 1440),
  reading_state text not null default 'pending' check (reading_state in ('pending', 'read', 'blank', 'unclear')),
  constraint workbook_time_logs_page_fkey foreign key (page_id, workbook_id, parent_id) references public.workbook_pages (id, workbook_id, parent_id) on delete cascade,
  constraint workbook_time_logs_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint workbook_time_logs_workbook_child_fkey foreign key (workbook_id, child_id) references public.workbooks (id, child_id) on delete cascade,
  constraint workbook_time_logs_day_key unique (workbook_id, day)
);
create index workbook_time_logs_child_idx on public.workbook_time_logs (child_id, parent_id);

create table public.workbook_v2_allocations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  workbook_number integer not null check (workbook_number between 1 and 1000),
  request_key text not null check (request_key ~ '^[A-Za-z0-9:_-]{8,120}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  input_path text not null check (char_length(input_path) <= 200 and split_part(input_path, '/', 1) = parent_id::text and split_part(input_path, '/', 2) = workbook_id::text),
  allocated_at timestamptz not null,
  allocation jsonb not null check (jsonb_typeof(allocation) = 'object' and pg_column_size(allocation) < 500000),
  constraint workbook_v2_allocations_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint workbook_v2_allocations_workbook_key unique (workbook_id),
  constraint workbook_v2_allocations_request_key unique (request_key),
  constraint workbook_v2_allocations_input_hash_key unique (input_hash),
  constraint workbook_v2_allocations_number_key unique (child_id, workbook_number)
);

-- An allocation, an item answer and an issued sheet are written once: a retry reads them, and only a deletion removes
-- them. (A row trigger on update only, so a book's 2,000 inserts pay nothing for it.)
create function public.workbook_v2_row_fixed()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a row of % cannot change', tg_table_name using errcode = '55000';
end $$;
create trigger workbook_v2_row_fixed before update on public.workbook_v2_allocations for each row execute function public.workbook_v2_row_fixed();
create trigger workbook_v2_row_fixed before update on public.workbook_item_answers for each row execute function public.workbook_v2_row_fixed();
create trigger workbook_v2_row_fixed before update on public.workbook_sheets for each row execute function public.workbook_v2_row_fixed();

-- The family and child write fences.
create trigger fence_family_write before insert or update on public.workbook_item_answers for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.workbook_item_answers for each row execute function public.fence_child_delete_write();
create trigger fence_family_write before insert or update on public.workbook_sheets for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.workbook_sheets for each row execute function public.fence_child_delete_write();
create trigger fence_family_write before insert or update on public.workbook_time_logs for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.workbook_time_logs for each row execute function public.fence_child_delete_write();
create trigger fence_family_write before insert or update on public.workbook_v2_allocations for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.workbook_v2_allocations for each row execute function public.fence_child_delete_write();

-- Parents read the rows of their own shipped books; admins read all; only the service role writes.
alter table public.workbook_item_answers enable row level security;
alter table public.workbook_sheets enable row level security;
alter table public.workbook_time_logs enable row level security;
alter table public.workbook_v2_allocations enable row level security;
revoke all on public.workbook_item_answers, public.workbook_sheets, public.workbook_time_logs, public.workbook_v2_allocations from anon, authenticated;
grant select on public.workbook_item_answers, public.workbook_sheets, public.workbook_time_logs, public.workbook_v2_allocations to authenticated;

create policy "Admins read all workbooks" on public.workbook_item_answers for select to authenticated using ((select public.is_admin()));
create policy "Parents read answers of their own shipped workbooks" on public.workbook_item_answers for select to authenticated
  using (parent_id = (select auth.uid()) and public.parent_reads_workbook(workbook_id));
create policy "Admins read all workbooks" on public.workbook_sheets for select to authenticated using ((select public.is_admin()));
create policy "Parents read sheets of their own shipped workbooks" on public.workbook_sheets for select to authenticated
  using (parent_id = (select auth.uid()) and public.parent_reads_workbook(workbook_id));
create policy "Admins read all workbooks" on public.workbook_time_logs for select to authenticated using ((select public.is_admin()));
create policy "Parents read time logs of their own shipped workbooks" on public.workbook_time_logs for select to authenticated
  using (parent_id = (select auth.uid()) and public.parent_reads_workbook(workbook_id));
create policy "Admins read v2 allocations" on public.workbook_v2_allocations for select to authenticated using ((select public.is_admin()));

update storage.buckets set allowed_mime_types = array['image/png', 'application/pdf', 'application/json'] where id = 'workbook-pages';

-- Saves what a book is made from before its build, or gives back the allocation that a request key or an input hash
-- already has. The caller makes the ids, tokens and input; the number is the next one of the child.
create function public.allocate_v2_workbook(p_allocation jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w_child uuid := (p_allocation->>'childId')::uuid;
  w_parent uuid;
  w_row public.workbook_v2_allocations;
  w_number integer;
begin
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
    select greatest(coalesce((select max(number) from public.workbooks where child_id = w_child), 0),
      coalesce((select max(workbook_number) from public.workbook_v2_allocations where child_id = w_child), 0)) + 1 into w_number;
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

-- Writes a whole v2 book in one transaction, or nothing: the workbook, its pages, questions, answers, sheets and time
-- logs. The same input hash again writes nothing and gives back the book that has it.
create function public.publish_v2_workbook(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w jsonb := p_payload->'workbook';
  w_id uuid := (w->>'id')::uuid;
  w_child uuid := (w->>'childId')::uuid;
  w_parent uuid;
  w_folder text;
  w_existing record;
  c text;
begin
  select parent_id into w_parent from public.children where id = w_child for no key update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  if not exists (select 1 from public.test_accounts where parent_id = w_parent) then
    return jsonb_build_object('status', 'refused', 'reason', 'v2 books are only for test families');
  end if;
  select id, printed_revision into w_existing from public.workbooks where input_hash = w->>'inputHash';
  if found then return jsonb_build_object('status', 'existing', 'workbookId', w_existing.id, 'printedRevision', w_existing.printed_revision); end if;
  if not exists (
    select 1 from public.workbook_v2_allocations a where a.workbook_id = w_id and a.child_id = w_child and a.input_hash = w->>'inputHash'
      and a.input_path = w->>'inputPath' and a.workbook_number = (w->>'number')::int
  ) then
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
    values (w_id, w_parent, w_child, (w->>'number')::int, array(select jsonb_array_elements_text(w->'levels')::smallint), w->>'pdfPath',
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

    -- Every row of the payload must land: a row whose page is missing would be left out by the joins above.
    if (select count(*) from public.workbook_questions where workbook_id = w_id) <> jsonb_array_length(p_payload->'questions')
      or (select count(*) from public.workbook_item_answers where workbook_id = w_id) <> jsonb_array_length(p_payload->'itemAnswers')
      or (select count(*) from public.workbook_time_logs where workbook_id = w_id) <> jsonb_array_length(p_payload->'timeLogs') then
      raise exception 'a row names a page that the book does not have' using errcode = '23514';
    end if;
  exception
    when unique_violation then
      get stacked diagnostics c = constraint_name;
      if c = 'workbooks_input_hash_key' then
        select id, printed_revision into w_existing from public.workbooks where input_hash = w->>'inputHash';
        return jsonb_build_object('status', 'existing', 'workbookId', w_existing.id, 'printedRevision', w_existing.printed_revision);
      end if;
      return jsonb_build_object('status', 'refused', 'reason', format('a value is already used (%s)', c));
    when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation then
      get stacked diagnostics c = constraint_name;
      return jsonb_build_object('status', 'refused', 'reason', format('the book does not pass the database check %s', coalesce(nullif(c, ''), sqlerrm)));
  end;
  return jsonb_build_object('status', 'published', 'workbookId', w_id, 'printedRevision', w->>'printedRevision');
end $$;

revoke all on function public.allocate_v2_workbook(jsonb) from public, anon, authenticated;
revoke all on function public.publish_v2_workbook(jsonb) from public, anon, authenticated;
revoke all on function public.workbook_v2_identity_fixed() from public, anon, authenticated;
revoke all on function public.workbook_v2_row_fixed() from public, anon, authenticated;
grant execute on function public.allocate_v2_workbook(jsonb) to service_role;
grant execute on function public.publish_v2_workbook(jsonb) to service_role;
