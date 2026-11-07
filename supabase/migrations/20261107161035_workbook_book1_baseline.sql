-- #472 Book 1 progress baseline, its prospective correction boundary, and the child's second-try ledger.
-- Additive: two new tables, four new functions, and a compatible widening of the saved preview engine check and command
-- (every version 1 record and request keeps its exact rules). No trigger, job, route, queue or printed-book write.
-- Writes go only through the service functions; admins read through RLS; parents and anon read nothing.

-- One immutable baseline per final draft revision. A later revision (R3) needs its own baseline; the source read picks
-- the one whose revision the approval audit names, so an R2 baseline never binds an R3 book.
create table public.workbook_book1_baselines (
  id uuid primary key,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  run_id uuid not null references public.workbook_runs(id) on delete cascade,
  draft_id uuid not null references public.workbook_drafts(id) on delete cascade,
  draft_revision integer not null check (draft_revision between 1 and 10000),
  printed_revision text not null check (printed_revision ~ '^[0-9a-f]{28}$'),
  engine text not null check (engine = 'book1-baseline/1'),
  planning_kind text not null check (planning_kind in ('prospective-capture', 'exact-recovery')),
  plan_input_hash text not null check (plan_input_hash ~ '^[0-9a-f]{64}$'),
  print_hash text not null check (print_hash ~ '^[0-9a-f]{64}$'),
  -- What the database itself held at the save, checked again on every source read.
  db_content_hash text not null check (db_content_hash ~ '^[0-9a-f]{64}$'),
  db_rendering_hash text not null check (db_rendering_hash ~ '^[0-9a-f]{64}$'),
  db_frame_hash text not null check (db_frame_hash ~ '^[0-9a-f]{64}$'),
  -- The correction boundary: the save's own time, under the family's scan lock, with no earlier activity.
  boundary_at timestamptz not null default clock_timestamp(),
  initial_activity jsonb not null check (initial_activity = '{"items":0,"changes":0,"events":0,"receipts":0,"secondTries":0}'::jsonb),
  actor_id uuid not null,
  -- Exact canonical UTF-8 bytes, not a jsonb reserialization.
  payload text not null check (octet_length(payload) between 2 and 4000000),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$' and payload_hash = encode(sha256(convert_to(payload, 'UTF8')), 'hex')),
  created_at timestamptz not null default clock_timestamp(),
  unique (draft_id, draft_revision),
  foreign key (child_id, parent_id) references public.children(id, parent_id) on delete cascade,
  foreign key (draft_id, draft_revision) references public.workbook_draft_revisions(draft_id, revision) on delete cascade
);
create index workbook_book1_baselines_family on public.workbook_book1_baselines(parent_id, child_id);

-- A child's written second try, linked to the marking row and the exact result version it corrects. Never a parent
-- mark change (an original adjudication) and never a Maya answer. #471's marking lane is its only intended writer.
create table public.workbook_second_tries (
  id uuid primary key,
  baseline_id uuid not null references public.workbook_book1_baselines(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  printed_revision text not null check (printed_revision ~ '^[0-9a-f]{28}$'),
  item_row_id uuid not null references public.scan_marking_items(id) on delete cascade,
  page_id uuid not null,
  item_id text not null check (char_length(item_id) between 1 and 200),
  based_on_version integer not null check (based_on_version >= 1),
  source text not null check (source = 'child-written-answer'),
  result text not null check (result in ('right', 'wrong', 'blank')),
  help text not null check (help in ('none', 'math-help', 'unknown')),
  evidence_reference text not null check (char_length(evidence_reference) between 1 and 500),
  engine text not null check (engine = 'workbook-second-try/1'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (item_row_id, based_on_version, evidence_reference),
  foreign key (child_id, parent_id) references public.children(id, parent_id) on delete cascade
);
create index workbook_second_tries_baseline on public.workbook_second_tries(baseline_id, id);

-- Admins read through a fence-aware predicate. It returns no private evidence.
create function public.workbook_book1_access(p_parent uuid, p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid())
    and exists(select 1 from public.parents where id = p_parent and deletion_requested_at is null)
    and exists(select 1 from public.children where id = p_child and parent_id = p_parent)
    and not exists(select 1 from public.family_deletions where parent_id = p_parent)
    and not exists(select 1 from public.child_deletions where child_id = p_child);
$$;
revoke all on function public.workbook_book1_access(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.workbook_book1_access(uuid, uuid) to authenticated;

create function public.immutable_workbook_book1() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'immutable_book1_record' using errcode = '55000'; end $$;
revoke all on function public.immutable_workbook_book1() from public, anon, authenticated, service_role;

do $$ declare t text; begin
  foreach t in array array['workbook_book1_baselines', 'workbook_second_tries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to authenticated, service_role', t);
    execute format('create policy %I on public.%I for select to service_role using (true)', t || '_service_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.workbook_book1_access(parent_id, child_id))', t || '_admin_read', t);
    execute format('create trigger fence_family_write before insert or update on public.%I for each row execute function public.fence_family_write()', t);
    execute format('create trigger fence_child_delete_write before insert or update on public.%I for each row execute function public.fence_child_delete_write()', t);
    execute format('create trigger immutable_record before update on public.%I for each row execute function public.immutable_workbook_book1()', t);
  end loop;
end $$;

-- Read or save a baseline. Save checks, under the family's scan lock, that the run made Book 1, that the revision is the
-- draft's latest, that any workbook row already holds the same printed revision, and that the book has no marking,
-- learning event, scan receipt or second try yet; then it stores the record and opens the boundary in one step.
create function public.workbook_book1_baseline_command(p_action text, p_actor uuid, p_parent uuid, p_child uuid, p_run uuid,
  p_draft uuid, p_request uuid, p_payload text default null, p_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare doc jsonb; r public.workbook_runs; d public.workbook_drafts; rev public.workbook_draft_revisions; w public.workbooks;
  existing public.workbook_book1_baselines; latest integer; frame jsonb; activity jsonb;
begin
  if p_action not in ('read', 'save') or p_request is null then return jsonb_build_object('status', 'unavailable'); end if;
  -- Parent SHARE precedes the scan lock, matching marking, correction and child-deletion lock order.
  perform public.assert_family_writable(p_parent);
  perform 1 from public.admin_users where user_id = p_actor for share;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  if not exists(select 1 from public.children where id = p_child and parent_id = p_parent)
    or exists(select 1 from public.family_deletions where parent_id = p_parent)
    or exists(select 1 from public.child_deletions where child_id = p_child) then return jsonb_build_object('status', 'unavailable'); end if;
  select * into existing from public.workbook_book1_baselines where id = p_request;
  if found and (existing.parent_id, existing.child_id, existing.run_id, existing.draft_id) is distinct from (p_parent, p_child, p_run, p_draft) then
    return jsonb_build_object('status', 'conflict');
  end if;
  if p_action = 'read' then
    if existing.id is null then return jsonb_build_object('status', 'missing'); end if;
    return jsonb_build_object('status', 'found', 'id', existing.id, 'payload', existing.payload, 'hash', existing.payload_hash,
      'boundary_at', existing.boundary_at, 'initial_activity', existing.initial_activity);
  end if;
  if p_payload is null or octet_length(p_payload) not between 2 and 4000000 or p_hash is null
    or p_hash <> encode(sha256(convert_to(p_payload, 'UTF8')), 'hex') then return jsonb_build_object('status', 'conflict'); end if;
  doc := p_payload::jsonb;
  -- Null-safe: a missing field refuses, it never passes.
  if coalesce(doc->>'version' is distinct from '1' or doc->>'engine' is distinct from 'book1-baseline/1' or doc->>'id' is distinct from p_request::text
    or doc->>'parentId' is distinct from p_parent::text or doc->>'childId' is distinct from p_child::text or doc->>'runId' is distinct from p_run::text
    or doc->>'draftId' is distinct from p_draft::text or doc->>'number' is distinct from '1' or jsonb_typeof(doc->'draftRevision') is distinct from 'number'
    or (doc->'binding'->>'printedRevision') !~ '^[0-9a-f]{28}$' or (doc->'binding'->>'printHash') !~ '^[0-9a-f]{64}$'
    or (doc->'planning'->>'inputHash') !~ '^[0-9a-f]{64}$' or doc->'planning'->>'kind' not in ('prospective-capture', 'exact-recovery')
    or doc->'priorMastery'->'passed' is distinct from '{}'::jsonb, true) then return jsonb_build_object('status', 'conflict'); end if;
  -- A lost-response retry keeps the first exact record.
  if existing.id is not null then
    return jsonb_build_object('status', case when existing.payload = p_payload and existing.payload_hash = p_hash then 'duplicate' else 'conflict' end);
  end if;
  select * into r from public.workbook_runs where id = p_run and parent_id = p_parent and child_id = p_child for share;
  if not found or r.status <> 'done' or r.number <> 1 or r.draft_id is distinct from p_draft then return jsonb_build_object('status', 'refused', 'reason', 'not-book1-run'); end if;
  -- Draft revisions are written under the draft row's lock: SHARE here waits for, and then sees, any newer revision.
  select * into d from public.workbook_drafts where id = p_draft and parent_id = p_parent and child_id = p_child for share;
  if not found or d.number <> 1 then return jsonb_build_object('status', 'refused', 'reason', 'not-book1-run'); end if;
  select max(revision) into latest from public.workbook_draft_revisions where draft_id = p_draft;
  if latest is distinct from (doc->>'draftRevision')::integer then return jsonb_build_object('status', 'refused', 'reason', 'revision-changed'); end if;
  select * into rev from public.workbook_draft_revisions where draft_id = p_draft and revision = latest and parent_id = p_parent and child_id = p_child;
  if not found or rev.rendering is null or rev.rendering->>'pdfSha256' is distinct from doc->'binding'->>'printHash' then
    return jsonb_build_object('status', 'refused', 'reason', 'rendering-differs');
  end if;
  select f.frame into frame from public.workbook_run_frames f where f.run_id = p_run and f.parent_id = p_parent and f.child_id = p_child;
  if frame is null then return jsonb_build_object('status', 'refused', 'reason', 'frame-missing'); end if;
  select * into w from public.workbooks where id = p_draft for share;
  if found and (w.parent_id, w.child_id, w.number, w.printed_revision) is distinct from (p_parent, p_child, 1, doc->'binding'->>'printedRevision') then
    return jsonb_build_object('status', 'refused', 'reason', 'workbook-revision-differs');
  end if;
  activity := jsonb_build_object(
    'items', (select count(*) from public.scan_marking_items where workbook_id = p_draft),
    'changes', (select count(*) from public.scan_mark_changes c join public.scan_marking_items i on i.id = c.item_id where i.workbook_id = p_draft),
    'events', (select count(*) from public.learning_events where workbook_id = p_draft),
    'receipts', (select count(*) from public.workbook_scan_receipts where workbook_id = p_draft),
    'secondTries', (select count(*) from public.workbook_second_tries where workbook_id = p_draft));
  if activity <> '{"items":0,"changes":0,"events":0,"receipts":0,"secondTries":0}'::jsonb then
    return jsonb_build_object('status', 'refused', 'reason', 'activity-before-boundary');
  end if;
  if exists(select 1 from public.workbook_book1_baselines where draft_id = p_draft and draft_revision = latest) then return jsonb_build_object('status', 'conflict'); end if;
  insert into public.workbook_book1_baselines(id, parent_id, child_id, run_id, draft_id, draft_revision, printed_revision, engine, planning_kind,
    plan_input_hash, print_hash, db_content_hash, db_rendering_hash, db_frame_hash, initial_activity, actor_id, payload, payload_hash)
  values (p_request, p_parent, p_child, p_run, p_draft, latest, doc->'binding'->>'printedRevision', doc->>'engine', doc->'planning'->>'kind',
    doc->'planning'->>'inputHash', doc->'binding'->>'printHash',
    encode(sha256(convert_to(coalesce(rev.content, d.draft)::text, 'UTF8')), 'hex'), encode(sha256(convert_to(rev.rendering::text, 'UTF8')), 'hex'),
    encode(sha256(convert_to(frame::text, 'UTF8')), 'hex'), activity, p_actor, p_payload, p_hash)
  on conflict do nothing;
  if not found then return jsonb_build_object('status', 'conflict'); end if;
  return jsonb_build_object('status', 'saved');
end $$;
revoke all on function public.workbook_book1_baseline_command(text, uuid, uuid, uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.workbook_book1_baseline_command(text, uuid, uuid, uuid, uuid, uuid, uuid, text, text) to service_role;

-- The source loader's read: the baseline bound to the book's approved revision, its boundary and the whole ledger.
-- Missing when no baseline binds that revision. Stale when the draft, rendering or frame changed since the save.
create function public.workbook_book1_sources(p_parent uuid, p_child uuid, p_workbook uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.workbook_book1_baselines; approved integer; d public.workbook_drafts; rev public.workbook_draft_revisions; frame jsonb; rows jsonb; n integer;
begin
  if not exists(select 1 from public.parents where id = p_parent and deletion_requested_at is null)
    or not exists(select 1 from public.children where id = p_child and parent_id = p_parent)
    or exists(select 1 from public.family_deletions where parent_id = p_parent)
    or exists(select 1 from public.child_deletions where child_id = p_child) then return jsonb_build_object('status', 'unavailable'); end if;
  select (a.detail->>'revision')::integer into approved from public.workbook_audit a
    where a.workbook_id = p_workbook and a.parent_id = p_parent and a.child_id = p_child and a.action = 'workbook-approved' order by a.id desc limit 1;
  if approved is null then return jsonb_build_object('status', 'missing'); end if;
  select * into b from public.workbook_book1_baselines where draft_id = p_workbook and draft_revision = approved and parent_id = p_parent and child_id = p_child;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  select * into d from public.workbook_drafts where id = b.draft_id;
  select * into rev from public.workbook_draft_revisions where draft_id = b.draft_id and revision = b.draft_revision;
  select f.frame into frame from public.workbook_run_frames f where f.run_id = b.run_id;
  if (select max(revision) from public.workbook_draft_revisions where draft_id = b.draft_id) <> b.draft_revision
    or encode(sha256(convert_to(coalesce(rev.content, d.draft)::text, 'UTF8')), 'hex') <> b.db_content_hash
    or encode(sha256(convert_to(rev.rendering::text, 'UTF8')), 'hex') is distinct from b.db_rendering_hash
    or encode(sha256(convert_to(frame::text, 'UTF8')), 'hex') is distinct from b.db_frame_hash then return jsonb_build_object('status', 'stale'); end if;
  select count(*), coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) into n, rows from public.workbook_second_tries t where t.baseline_id = b.id;
  return jsonb_build_object('status', 'found', 'id', b.id, 'payload', b.payload, 'hash', b.payload_hash, 'boundary_at', b.boundary_at,
    'initial_activity', b.initial_activity, 'count', n, 'rows', rows);
end $$;
revoke all on function public.workbook_book1_sources(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.workbook_book1_sources(uuid, uuid, uuid) to service_role;

-- #471's seam: record a child's written second try against the marking row's current result, when that result is a
-- resolved wrong or blank answer. Idempotent by id.
create function public.record_workbook_second_try(p_id uuid, p_baseline uuid, p_item_row uuid, p_based_on_version integer,
  p_result text, p_help text, p_evidence_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.workbook_book1_baselines; i public.scan_marking_items; existing public.workbook_second_tries;
begin
  if coalesce(p_id is null or p_baseline is null or p_item_row is null or p_based_on_version is null or p_based_on_version < 1
    or p_result not in ('right', 'wrong', 'blank') or p_help not in ('none', 'math-help', 'unknown')
    or p_evidence_reference is null or char_length(p_evidence_reference) not between 1 and 500, true) then return jsonb_build_object('status', 'refused'); end if;
  select * into b from public.workbook_book1_baselines where id = p_baseline;
  if not found then return jsonb_build_object('status', 'refused'); end if;
  perform public.assert_family_writable(b.parent_id);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || b.parent_id::text, 0));
  if exists(select 1 from public.child_deletions where child_id = b.child_id) then return jsonb_build_object('status', 'refused'); end if;
  select * into existing from public.workbook_second_tries where id = p_id;
  if found then
    return jsonb_build_object('status', case when (existing.baseline_id, existing.item_row_id, existing.based_on_version, existing.result, existing.help, existing.evidence_reference)
      = (p_baseline, p_item_row, p_based_on_version, p_result, p_help, p_evidence_reference) then 'duplicate' else 'conflict' end);
  end if;
  select * into i from public.scan_marking_items where id = p_item_row for share;
  if not found or coalesce((i.parent_id, i.child_id, i.workbook_id, i.printed_revision) is distinct from (b.parent_id, b.child_id, b.draft_id, b.printed_revision)
    or i.result_version <> p_based_on_version or i.observation->>'result' not in ('wrong', 'blank')
    or not (i.observation->>'state' = 'parent-checked' or (i.observation->>'state' = 'scored' and i.observation->>'certainty' = 'certain')), true) then
    return jsonb_build_object('status', 'refused');
  end if;
  insert into public.workbook_second_tries(id, baseline_id, parent_id, child_id, workbook_id, printed_revision, item_row_id, page_id, item_id,
    based_on_version, source, result, help, evidence_reference, engine)
  values (p_id, b.id, b.parent_id, b.child_id, i.workbook_id, i.printed_revision, i.id, i.page_id, i.item_id, p_based_on_version,
    'child-written-answer', p_result, p_help, p_evidence_reference, 'workbook-second-try/1')
  on conflict do nothing;
  if not found then return jsonb_build_object('status', 'conflict'); end if;
  return jsonb_build_object('status', 'saved');
end $$;
revoke all on function public.record_workbook_second_try(uuid, uuid, uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.record_workbook_second_try(uuid, uuid, uuid, integer, text, text, text) to service_role;

-- Saved previews: version 2 (Book 1 sources, a real plan) beside version 1. Version 1 rules are unchanged.
alter table public.workbook_plan_previews drop constraint workbook_plan_previews_engine_check;
alter table public.workbook_plan_previews add constraint workbook_plan_previews_engine_check check (engine in (
  'workbook-preview-sources/1;progress/1;history/1;plan-preview/1',
  'workbook-preview-sources/2;progress/1;history/1;plan-preview/1;book1-baseline/1'));

create or replace function public.workbook_preview_command(p_action text,p_actor uuid,p_parent uuid,p_child uuid,p_book uuid,
  p_revision text,p_request uuid,p_payload text default null,p_hash text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.workbooks; existing public.workbook_plan_previews; doc jsonb; req jsonb; source_book jsonb;
  current_revision bigint; delivery_audit bigint; delivered timestamptz; selected_cutoff timestamptz; v2 boolean; book1 jsonb;
  bound public.workbook_book1_baselines; tries integer;
begin
  if p_action not in ('read','save') or p_request is null then return jsonb_build_object('status','unavailable'); end if;
  -- Parent SHARE precedes the scan lock, matching marking, correction and child-deletion lock order.
  perform public.assert_family_writable(p_parent);
  perform 1 from public.admin_users where user_id=p_actor for share;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  if not exists(select 1 from public.children where id=p_child and parent_id=p_parent)
    or exists(select 1 from public.family_deletions where parent_id=p_parent)
    or exists(select 1 from public.child_deletions where child_id=p_child)
    or not exists(select 1 from public.workbooks wb join public.workbook_delivery_receipts r on r.workbook_id=wb.id
      where wb.id=p_book and wb.parent_id=p_parent and wb.child_id=p_child and wb.status='shipped' and wb.printed_revision=p_revision
        and r.parent_id=p_parent and r.child_id=p_child and r.number=wb.number)
    then return jsonb_build_object('status','unavailable'); end if;
  select * into w from public.workbooks where id=p_book and parent_id=p_parent and child_id=p_child for share;
  select * into existing from public.workbook_plan_previews where id=p_request;
  if found and (existing.parent_id,existing.child_id,existing.workbook_id,existing.printed_revision,existing.actor_id)
    is distinct from (p_parent,p_child,p_book,p_revision,p_actor) then return jsonb_build_object('status','conflict'); end if;
  if p_action='read' then
    if existing.id is null then return jsonb_build_object('status','missing'); end if;
    return jsonb_build_object('status','found','payload',existing.payload,'hash',existing.payload_hash);
  end if;
  if p_payload is null or octet_length(p_payload) not between 2 and 4000000 or p_hash is null
    or p_hash<>encode(sha256(convert_to(p_payload,'UTF8')),'hex') then return jsonb_build_object('status','conflict'); end if;
  doc:=p_payload::jsonb; req:=doc->'request';
  v2:=doc->>'version'='2';
  if coalesce((case when v2 then doc->>'engine' is distinct from 'workbook-preview-sources/2;progress/1;history/1;plan-preview/1;book1-baseline/1'
        or doc->'frozen'->>'version' is distinct from '2' or coalesce(jsonb_typeof(doc->'frozen'->'book1'),'missing') not in ('object','null')
        or doc->'outcome'->>'availability' not in ('unavailable','held','complete')
        or (doc->'outcome'->>'availability'='complete') <> (jsonb_typeof(doc->'outcome'->'plan')='object' and jsonb_typeof(doc->'outcome'->'decision')='object')
        or (doc->'outcome'->>'availability'<>'complete' and (doc->'outcome'->'decision' is distinct from 'null'::jsonb or doc->'outcome'->'plan' is distinct from 'null'::jsonb))
      else doc->>'version' is distinct from '1' or doc->>'engine' is distinct from 'workbook-preview-sources/1;progress/1;history/1;plan-preview/1'
        or doc->'frozen'->>'version' is distinct from '1'
        or doc->'outcome'->>'availability' is distinct from 'unavailable' or doc->'outcome'->'decision' is distinct from 'null'::jsonb
        or doc->'outcome'->'plan' is distinct from 'null'::jsonb or doc->'outcome'->'consumedVersions' is distinct from '[]'::jsonb end)
    or doc->>'actorId' is distinct from p_actor::text or req->>'version' is distinct from '1' or req->>'requestId' is distinct from p_request::text
    or req->>'parentId' is distinct from p_parent::text or req->>'childId' is distinct from p_child::text
    or req->>'workbookId' is distinct from p_book::text or req->>'printedRevision' is distinct from p_revision
    or req->>'scope' not in ('day7','later-book','backstop') or jsonb_typeof(req->'selection') is distinct from 'object'
    or doc->'frozen'->>'parentId' is distinct from p_parent::text
    or doc->'frozen'->>'childId' is distinct from p_child::text or jsonb_typeof(doc->'frozen'->'books') is distinct from 'array'
    or (req->>'cutoff') !~ '^[0-9]{1,16}$', true) then return jsonb_build_object('status','conflict'); end if;
  if jsonb_array_length(doc->'frozen'->'books') not between 1 and 20
    or (select count(*) from jsonb_array_elements(doc->'frozen'->'books') b where b->'book'->>'id'=p_book::text)<>1
    then return jsonb_build_object('status','conflict'); end if;
  selected_cutoff:=to_timestamp((req->>'cutoff')::numeric/1000);
  if selected_cutoff>clock_timestamp() then return jsonb_build_object('status','unavailable'); end if;
  -- Lost-response retries keep the first exact input/result, even if later evidence changes.
  if existing.id is not null then
    if existing.payload<>p_payload or existing.payload_hash<>p_hash then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','duplicate');
  end if;
  select revision into current_revision from public.scan_marking_revisions where parent_id=p_parent and child_id=p_child;
  if to_jsonb(current_revision) is distinct from nullif(doc->'frozen'->'markingRevision','null'::jsonb) then return jsonb_build_object('status','unavailable'); end if;
  for source_book in select value from jsonb_array_elements(doc->'frozen'->'books') loop
    select * into w from public.workbooks where id=(source_book->'book'->>'id')::uuid and parent_id=p_parent and child_id=p_child for share;
    if not found or w.status<>'shipped' or w.printed_revision is distinct from source_book->'book'->>'printed_revision'
      or w.print_manifest is distinct from source_book->'book'->'print_manifest' then return jsonb_build_object('status','unavailable'); end if;
    select coalesce((select max(audit_id) from public.workbook_delivery_corrections where workbook_id=w.id),r.audit_id),
      coalesce((select c.delivered_at from public.workbook_delivery_corrections c where c.workbook_id=w.id order by audit_id desc limit 1),r.delivered_at)
      into delivery_audit,delivered from public.workbook_delivery_receipts r where r.workbook_id=w.id and r.parent_id=p_parent and r.child_id=p_child;
    if delivery_audit is distinct from (source_book->'delivery'->>'auditId')::bigint
      or delivered is distinct from (source_book->'delivery'->>'deliveredAt')::timestamptz or delivered>selected_cutoff then return jsonb_build_object('status','unavailable'); end if;
  end loop;
  -- Version 2: the frozen Book 1 baseline is still the stored one, with the same boundary and ledger size.
  book1:=doc->'frozen'->'book1';
  if v2 and jsonb_typeof(book1)='object' then
    select * into bound from public.workbook_book1_baselines where id=(book1->'baseline'->>'id')::uuid and parent_id=p_parent and child_id=p_child and draft_id=p_book;
    select count(*) into tries from public.workbook_second_tries where baseline_id=bound.id;
    if bound.id is null or bound.payload_hash is distinct from book1->'baseline'->>'hash' or bound.boundary_at is distinct from (book1->'corrections'->>'boundaryAt')::timestamptz
      or tries is distinct from (book1->'corrections'->>'count')::integer then return jsonb_build_object('status','unavailable'); end if;
  end if;
  select * into w from public.workbooks where id=p_book;
  insert into public.workbook_plan_previews(id,parent_id,child_id,workbook_id,number,printed_revision,actor_id,engine,cutoff,payload,payload_hash)
    values(p_request,p_parent,p_child,p_book,w.number,p_revision,p_actor,doc->>'engine',selected_cutoff,p_payload,p_hash)
    on conflict(id) do nothing;
  if not found then
    select * into existing from public.workbook_plan_previews where id=p_request;
    if existing.payload<>p_payload or existing.payload_hash<>p_hash then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','duplicate');
  end if;
  return jsonb_build_object('status','saved');
end $$;
revoke all on function public.workbook_preview_command(text,uuid,uuid,uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.workbook_preview_command(text,uuid,uuid,uuid,uuid,text,uuid,text,text) to service_role;
