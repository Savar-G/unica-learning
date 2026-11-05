-- The print contract (#536, S2a of #455): what a later photo of a printed page is read against, captured at render and
-- frozen at approval (src/lib/workbook-print-contract.ts). Additive: every new column is null on a stored workbook, the
-- functions keep their signatures, and a caller that sends none of the new fields stores none. A workbook with no
-- printed revision is a legacy workbook: its photos stay attached and automatic marking stays unavailable.
--
-- Family deletion: all new data are columns on workbooks, workbook_pages and workbook_questions, which go with the family
-- (on delete cascade) under the existing write fence. No new table, bucket or file. Row-level security is unchanged: a
-- parent reads these columns only on their own shipped workbook.

alter table public.workbooks
  add column printed_revision text constraint workbooks_printed_revision_check check (printed_revision ~ '^[0-9a-f]{28}$'),
  add column pdf_sha256 text constraint workbooks_pdf_sha256_check check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  add column print_manifest jsonb constraint workbooks_print_manifest_check check (jsonb_typeof(print_manifest) = 'object');
alter table public.workbook_pages
  add column print_contract jsonb constraint workbook_pages_print_contract_check check (jsonb_typeof(print_contract) = 'object');
alter table public.workbook_questions
  add column regions jsonb constraint workbook_questions_regions_check check (jsonb_typeof(regions) = 'array'),
  add column teaching jsonb constraint workbook_questions_teaching_check check (jsonb_typeof(teaching) = 'object');

-- A workbook taken back to draft (finish_workbook_edit) has no printed revision until it is approved again: a contract is
-- one unit, and its pages are about to differ.
create function public.clear_printed_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'draft' and old.status <> 'draft' then new.printed_revision := null; end if;
  return new;
end $$;
revoke all on function public.clear_printed_revision() from public, anon, authenticated;
create trigger clear_printed_revision before update of status on public.workbooks
  for each row execute function public.clear_printed_revision();

-- Approval of a stored draft: the workbook takes the whole contract of the revision approved, or none.
create function public.apply_workbook_print_contract(p_workbook jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare w_id uuid := (p_workbook->>'id')::uuid; pg jsonb; q jsonb; v_page uuid;
begin
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
revoke all on function public.apply_workbook_print_contract(jsonb) from public, anon, authenticated;
grant execute on function public.apply_workbook_print_contract(jsonb) to service_role;

create or replace function public.write_workbook(p_workbook jsonb, p_schema_version smallint) returns jsonb
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
    insert into public.workbooks (id, parent_id, child_id, number, levels, pdf_path, profile_build, printed_revision, pdf_sha256, print_manifest)
    values (
      w_id, w_parent, (p_workbook->>'childId')::uuid, (p_workbook->>'number')::int,
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

-- New bytes end the printed revision. A caller with no contract clears the old one: stale calibration is never kept.
create or replace function public.save_workbook_rendering(p_rendering jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w_id uuid := (p_rendering->>'workbookId')::uuid;
  w_parent uuid;
  folder text;
  pg jsonb;
  q jsonb;
  v_page uuid;
  c text;
begin
  select parent_id into w_parent from public.workbooks where id = w_id for update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the workbook is not known'); end if;

  if (select coalesce(array_agg((e->>'number')::int order by (e->>'number')::int), '{}') from jsonb_array_elements(p_rendering->'pages') e)
     is distinct from (select coalesce(array_agg(page_number order by page_number), '{}') from public.workbook_pages where workbook_id = w_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'the pages are not the workbook''s pages');
  end if;
  for pg in select value from jsonb_array_elements(p_rendering->'pages') order by (value->>'number')::int loop
    if (select coalesce(array_agg((e->>'number')::int order by (e->>'number')::int), '{}') from jsonb_array_elements(pg->'questions') e)
       is distinct from (
         select coalesce(array_agg(wq.question_number order by wq.question_number), '{}')
         from public.workbook_questions wq join public.workbook_pages wp on wp.id = wq.page_id
         where wp.workbook_id = w_id and wp.page_number = (pg->>'number')::int
       ) then
      return jsonb_build_object('status', 'refused', 'reason', format('page %s: the questions are not the page''s questions', pg->>'number'));
    end if;
  end loop;

  folder := w_parent::text || '/' || w_id::text || '/';
  if exists (
    select 1 from (
      select p_rendering->>'pdfPath' as path
      union all select page->'image'->>'path' from jsonb_array_elements(p_rendering->'pages') page
    ) f where f.path is null or left(f.path, length(folder)) <> folder
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'a file is not in the family''s folder');
  end if;

  begin
    update public.workbooks set pdf_path = p_rendering->>'pdfPath', pdf_sha256 = p_rendering->>'pdfSha256', printed_revision = null where id = w_id;
    for pg in select value from jsonb_array_elements(p_rendering->'pages') loop
      update public.workbook_pages
      set image_path = pg->'image'->>'path', image_width = (pg->'image'->>'width')::int, image_height = (pg->'image'->>'height')::int,
          print_contract = nullif(pg->'printContract', 'null'::jsonb)
      where workbook_id = w_id and page_number = (pg->>'number')::int
      returning id into v_page;
      for q in select value from jsonb_array_elements(pg->'questions') loop
        update public.workbook_questions
        set box_x = (q->'box'->>'x')::int, box_y = (q->'box'->>'y')::int,
            box_width = (q->'box'->>'width')::int, box_height = (q->'box'->>'height')::int,
            regions = nullif(q->'regions', 'null'::jsonb)
        where page_id = v_page and question_number = (q->>'number')::int;
      end loop;
    end loop;
  exception
    when check_violation or not_null_violation then
      get stacked diagnostics c = constraint_name;
      return jsonb_build_object('status', 'refused', 'reason', format('the rendering does not pass the database check %s', coalesce(c, 'not null')));
  end;
  return jsonb_build_object('status', 'written', 'workbookId', w_id);
end $$;

create or replace function public.approve_workbook_draft(
  p_draft uuid, p_revision int, p_workbook jsonb, p_schema_version smallint, p_by uuid, p_by_email text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; v_latest int; v_write jsonb; v_run uuid;
begin
  -- FOR NO KEY UPDATE: two approvals and a mark of the same draft still wait for each other, but an edit revision's
  -- foreign key (FOR KEY SHARE on the draft) does not, so an edit and an approval cannot deadlock (P2-3).
  select id, parent_id, child_id, number into d from public.workbook_drafts where id = p_draft for no key update;
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
  if not exists(select 1 from public.workbooks where id=p_draft and status='draft') then
    v_write := public.write_workbook(p_workbook, p_schema_version);
    if v_write->>'status' <> 'written' then return v_write; end if;
  else
    -- An edit took the stored workbook back to draft: it takes the contract of this revision, or none, as one unit.
    perform public.apply_workbook_print_contract(p_workbook);
  end if;
  update public.workbooks set status = 'approved', approved_at = now() where id = p_draft;
  select id into v_run from public.workbook_runs where draft_id = p_draft order by created_at desc limit 1;
  insert into public.workbook_audit (parent_id, child_id, run_id, draft_id, workbook_id, actor_id, actor_email, action, detail)
    values (d.parent_id, d.child_id, v_run, p_draft, p_draft, p_by, p_by_email, 'workbook-approved',
      jsonb_build_object('revision', p_revision, 'number', d.number, 'printedRevision', p_workbook->>'printedRevision'));
  return jsonb_build_object('status', 'approved', 'workbookId', p_draft);
end $$;

-- A photo keeps the printed revision it was identified against. A legacy workbook has none: the photo keeps its old
-- timestamp value, which never equals a revision, so automatic marking stays unavailable.
create or replace function public.identify_scan_photo(p_parent uuid,p_id uuid,p_token text,p_width int,p_height int) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; pg record;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found or r.state<>'processing' or r.lease_until<=now() then return 'refused'; end if;
  select p.id,p.workbook_id,w.approved_at,w.printed_at,w.printed_revision into pg from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id
    where p.qr_token=p_token and p.parent_id=p_parent and w.child_id=r.child_id and w.status='shipped';
  if not found then return 'page'; end if;
  if exists(select 1 from public.scan_photos where page_id=pg.id and state in ('pending','saved')) then return 'duplicate'; end if;
  begin
    update public.scan_photos set page_id=pg.id,workbook_id=pg.workbook_id,
      printed_revision=coalesce(pg.printed_revision,coalesce(pg.printed_at,pg.approved_at)::text),width=p_width,height=p_height where id=p_id;
  exception when unique_violation then return 'duplicate'; end;
  return 'identified';
end $$;
