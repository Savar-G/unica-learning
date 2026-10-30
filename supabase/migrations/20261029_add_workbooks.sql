-- Workbook content (#299, spec #295): every workbook, page and question as data. A workbook belongs to one child; a page
-- has a number that runs through the whole workbook (unique in it), a type, an optional day label, a rendered image and
-- a QR token (unique everywhere) that names the workbook and page; a question has a number that restarts on each page
-- (unique on it), its question package (#298, src/lib/question-package.ts) as jsonb with the package's schema version
-- beside it, and its box on the page image. The store is src/lib/workbook-store.ts.
--
-- Writes: only write_workbook (service role only) writes these tables, a whole workbook in one transaction; a conflict
-- (a number, id or QR token already used) or a failed check stores nothing and answers with the reason.
-- Reads: a signed-in parent reads only their own family's rows (parent_id, kept equal to the child's parent by the
-- foreign keys); admins read every row. Every read in the store names a workbook or a child, so the admin policy does
-- not widen a parent page.
-- Files: page images and PDFs live in the private bucket "workbook-pages" as <parent id>/<workbook id>/<name>. Parents
-- read only their own folder; admins read all; only the secret key writes. The family write fence covers the bucket, and
-- complete_family_deletion now also requires the family's folder in it to be empty, so the deletion worker removes
-- these files (src/lib/family-deletion-store.ts) before it deletes Auth. The tables go with the child and the parent
-- (on delete cascade), and the family write fence covers new rows.
-- Additive: new tables, a new function, a new bucket and a unique constraint on children(id, parent_id) that the id
-- already implies. The two replaced functions keep their signatures; they only add the new bucket.

-- A workbook's child and parent must agree: the foreign key below needs this key. Migration add_learning_events (#302)
-- adds the same key, so it is added only when it is not there yet.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'children_id_parent_key' and conrelid = 'public.children'::regclass) then
    alter table public.children add constraint children_id_parent_key unique (id, parent_id);
  end if;
end $$;

create table public.workbooks (
  id uuid primary key,
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  number int not null check (number between 1 and 1000),
  levels smallint[] not null check (
    cardinality(levels) between 1 and 30 and array_position(levels, null) is null and 1 <= all(levels) and 30 >= all(levels)
  ),
  status text not null default 'draft' check (status in ('draft', 'approved', 'printed', 'shipped')),
  pdf_path text check (
    char_length(pdf_path) <= 200 and split_part(pdf_path, '/', 1) = parent_id::text and split_part(pdf_path, '/', 2) = id::text
  ),
  profile_build text check (char_length(profile_build) between 1 and 100),
  approved_at timestamptz,
  printed_at timestamptz,
  shipped_at timestamptz,
  constraint workbooks_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint workbooks_child_number_key unique (child_id, number),
  constraint workbooks_id_parent_key unique (id, parent_id)
);
create index workbooks_parent_idx on public.workbooks (parent_id);

create table public.workbook_pages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workbook_id uuid not null,
  parent_id uuid not null,
  page_number int not null check (page_number between 1 and 1000),
  day_label text check (char_length(day_label) between 1 and 40),
  page_type text not null check (char_length(page_type) between 1 and 40),
  image_path text check (
    char_length(image_path) <= 200 and split_part(image_path, '/', 1) = parent_id::text and split_part(image_path, '/', 2) = workbook_id::text
  ),
  image_width int check (image_width between 1 and 10000),
  image_height int check (image_height between 1 and 10000),
  qr_token text not null check (qr_token ~ '^[A-Za-z0-9_-]{16,64}$'),
  constraint workbook_pages_image_size check ((image_path is null) = (image_width is null) and (image_path is null) = (image_height is null)),
  constraint workbook_pages_workbook_fkey foreign key (workbook_id, parent_id) references public.workbooks (id, parent_id) on delete cascade,
  constraint workbook_pages_number_key unique (workbook_id, page_number),
  constraint workbook_pages_qr_token_key unique (qr_token),
  constraint workbook_pages_id_workbook_parent_key unique (id, workbook_id, parent_id)
);
create index workbook_pages_parent_idx on public.workbook_pages (parent_id);

create table public.workbook_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  page_id uuid not null,
  workbook_id uuid not null,
  parent_id uuid not null,
  question_number int not null check (question_number between 1 and 1000),
  -- The package's own stable id (QuestionPackage.id).
  question_key text not null check (char_length(question_key) between 1 and 200),
  schema_version smallint not null check (schema_version >= 1),
  package jsonb not null check (
    jsonb_typeof(package) = 'object' and package->>'id' = question_key and pg_column_size(package) < 100000
  ),
  box_x int not null check (box_x >= 0),
  box_y int not null check (box_y >= 0),
  box_width int not null check (box_width >= 1),
  box_height int not null check (box_height >= 1),
  constraint workbook_questions_page_fkey foreign key (page_id, workbook_id, parent_id)
    references public.workbook_pages (id, workbook_id, parent_id) on delete cascade,
  constraint workbook_questions_number_key unique (page_id, question_number),
  constraint workbook_questions_key_key unique (workbook_id, question_key)
);
create index workbook_questions_parent_idx on public.workbook_questions (parent_id);

do $$
declare t text;
begin
  foreach t in array array['workbooks', 'workbook_pages', 'workbook_questions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('create policy "Parents read their own workbooks" on public.%I for select to authenticated using (parent_id = (select auth.uid()))', t);
    execute format('create policy "Admins read all workbooks" on public.%I for select to authenticated using ((select public.is_admin()))', t);
    execute format('create trigger fence_family_write before insert or update on public.%I for each row execute function public.fence_family_write()', t);
  end loop;
end $$;

-- Writes a whole workbook (the WorkbookInput shape of src/lib/workbook-content.ts) in one transaction. The caller checks
-- the shape first (workbookProblem); this function checks what only the database knows. A refusal stores nothing.
-- A family being deleted is refused by the fence (55000), which is raised, not answered.
create function public.write_workbook(p_workbook jsonb, p_schema_version smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w_id uuid := (p_workbook->>'id')::uuid;
  w_parent uuid;
  pg jsonb;
  q jsonb;
  v_page uuid;
  c text;
begin
  select parent_id into w_parent from public.children where id = (p_workbook->>'childId')::uuid;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  if exists (
    select 1 from (
      select p_workbook->>'pdfPath' as path
      union all select page->'image'->>'path' from jsonb_array_elements(p_workbook->'pages') page
    ) f where f.path is not null and split_part(f.path, '/', 1) <> w_parent::text
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'a file is not in the family''s folder');
  end if;

  begin
    insert into public.workbooks (id, parent_id, child_id, number, levels, pdf_path, profile_build)
    values (
      w_id, w_parent, (p_workbook->>'childId')::uuid, (p_workbook->>'number')::int,
      array(select jsonb_array_elements_text(p_workbook->'levels')::smallint), p_workbook->>'pdfPath', p_workbook->>'profileBuild'
    );
    for pg in select value from jsonb_array_elements(p_workbook->'pages') loop
      insert into public.workbook_pages (workbook_id, parent_id, page_number, day_label, page_type, image_path, image_width, image_height, qr_token)
      values (
        w_id, w_parent, (pg->>'number')::int, pg->>'dayLabel', pg->>'type',
        pg->'image'->>'path', (pg->'image'->>'width')::int, (pg->'image'->>'height')::int, pg->>'qrToken'
      )
      returning id into v_page;
      for q in select value from jsonb_array_elements(pg->'questions') loop
        insert into public.workbook_questions (
          page_id, workbook_id, parent_id, question_number, question_key, schema_version, package, box_x, box_y, box_width, box_height
        ) values (
          v_page, w_id, w_parent, (q->>'number')::int, q->'package'->>'id', p_schema_version, q->'package',
          (q->'box'->>'x')::int, (q->'box'->>'y')::int, (q->'box'->>'width')::int, (q->'box'->>'height')::int
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
revoke all on function public.write_workbook(jsonb, smallint) from public, anon, authenticated;
grant execute on function public.write_workbook(jsonb, smallint) to service_role;

-- The bucket is private: no public URLs. 50 MB, the free plan's upload limit, for a whole workbook PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workbook-pages', 'workbook-pages', false, 50000000, array['image/png', 'application/pdf']);

create policy "Parents read their own workbook files" on storage.objects
  for select to authenticated
  using (bucket_id = 'workbook-pages' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Admins read all workbook files" on storage.objects
  for select to authenticated using (bucket_id = 'workbook-pages' and (select public.is_admin()));

-- The family write fence for Storage (migration add_family_deletion), now for both family buckets.
create or replace function public.fence_work_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.bucket_id in ('shown-work', 'workbook-pages') then
    perform public.assert_family_writable(split_part(old.name, '/', 1)::uuid);
  end if;
  if new.bucket_id in ('shown-work', 'workbook-pages') then
    perform public.assert_family_writable(split_part(new.name, '/', 1)::uuid);
  end if;
  return new;
end $$;

-- A deletion completes only when the family's folders in both buckets are empty.
create or replace function public.complete_family_deletion(p uuid, token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from auth.users where id = p) or exists(select 1 from public.parents where id = p)
    or exists(select 1 from public.family_payment_operations where parent_id = p and outcome is null)
    or exists(select 1 from storage.objects where bucket_id in ('shown-work', 'workbook-pages') and split_part(name,'/',1) = p::text) then return false; end if;
  delete from public.family_deletions where parent_id = p and lease_token = token and phase = 'deleting';
  return found;
end $$;
