-- The first pages of Workbook 1 (docs/first-pages.md): four real pages of a child's first workbook (the cover, the
-- first lesson and two practice pages), made after the report for a BC family without a saved card, shown on the owned
-- report and sent once by email. One row per finished test. The job (src/lib/first-pages.ts) writes under a lease
-- through the functions below, as the workbook runs do: the plan (frame), each finished day page, each AI call, each
-- solve check (the first stored at a key stays) and each slot's AI attempts (counted before the call). A Workbook 1 run
-- keeps the ready pages (adopt_workbook_first_pages): the run takes the reserved Workbook 1 id as its draft key and the
-- pages and attempts become the run's, in one step.
--
-- Only the server writes, with the secret key. Admins read. Parents read nothing directly: the report page reads the
-- row with the secret key after the parent's own session proved the report is theirs. A family deletion empties the
-- parent's folder and removes the row (on delete cascade); a child deletion removes the row and its files
-- (child_delete_roots names <parent>/<workbook_id>); a test deletion removes the row. The family write fence and the
-- child deletion fence cover new rows and updates.
-- Also: the email log's kind `first_pages` (one per test, about a test), and email_copies.attachments (each attached
-- file's name, type, size and SHA-256; never its bytes).
-- Additive: new table and functions, a wider check on email_log, a new nullable column; the code on main uses none.

create table public.workbook_first_pages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  assessment_id uuid not null unique references public.assessments (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null unique default gen_random_uuid(),
  queued_by text not null check (queued_by in ('report', 'admin')),
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed', 'unavailable', 'hidden')),
  runner text not null default 'mac' check (runner in ('server', 'mac')),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  max_attempts smallint not null default 2 check (max_attempts between 1 and 5),
  lease uuid,
  heartbeat_at timestamptz,
  ready_at timestamptz,
  finished_at timestamptz,
  error text check (char_length(error) <= 2000),
  errors jsonb not null default '[]' check (jsonb_typeof(errors) = 'array' and pg_column_size(errors) < 50000),
  frame jsonb check (frame is null or (jsonb_typeof(frame) = 'object' and pg_column_size(frame) < 2000000)),
  pages jsonb not null default '{}' check (jsonb_typeof(pages) = 'object' and pg_column_size(pages) < 1500000),
  calls jsonb not null default '{}' check (jsonb_typeof(calls) = 'object' and pg_column_size(calls) < 3000000),
  slot_attempts jsonb not null default '{}' check (jsonb_typeof(slot_attempts) = 'object'),
  solves jsonb not null default '{}' check (jsonb_typeof(solves) = 'object' and pg_column_size(solves) < 2000000),
  ai_calls jsonb not null default '[]' check (jsonb_typeof(ai_calls) = 'array' and pg_column_size(ai_calls) < 200000),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and pg_column_size(result) < 2000000)),
  kept_by uuid references public.workbook_runs (id) on delete set null,
  kept_at timestamptz,
  decision text check (decision in ('keep-plan', 'drop')),
  decided_by uuid,
  decided_by_email text check (char_length(decided_by_email) <= 320),
  decided_at timestamptz,
  check ((status = 'ready' or status = 'hidden') = (result is not null)),
  constraint workbook_first_pages_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_first_pages_parent_idx on public.workbook_first_pages (parent_id);
create index workbook_first_pages_child_idx on public.workbook_first_pages (child_id);
create index workbook_first_pages_open_idx on public.workbook_first_pages (status, runner) where status in ('queued', 'running');

alter table public.workbook_first_pages enable row level security;
revoke all on table public.workbook_first_pages from anon, authenticated, service_role;
grant select on table public.workbook_first_pages to authenticated, service_role;
create policy "Admins read first pages" on public.workbook_first_pages for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_first_pages
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.workbook_first_pages
  for each row execute function public.fence_child_delete_write();

-- Queues the first pages of a finished test, once, after the checks: the report offers the plan (BC); the test finished
-- in the last 48 hours (an admin's queue skips only this one); the child has no workbook and no run that is waiting,
-- working or done; no child of the family has a saved card; the family and the child are not being deleted.
create function public.queue_workbook_first_pages(p_assessment uuid, p_runner text, p_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; v_id uuid;
begin
  if p_runner not in ('server', 'mac') or p_by not in ('report', 'admin') then raise exception 'bad arguments' using errcode = '22023'; end if;
  select x.id, x.parent_id, x.child_id, x.status, x.completed_at into a from public.assessments x where x.id = p_assessment;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'no such test'); end if;
  select id into v_id from public.workbook_first_pages where assessment_id = p_assessment;
  if found then return jsonb_build_object('status', 'exists', 'id', v_id); end if;
  if a.status <> 'completed' then return jsonb_build_object('status', 'refused', 'reason', 'the test is not finished'); end if;
  if p_by = 'report' and (a.completed_at is null or a.completed_at < now() - interval '48 hours') then
    return jsonb_build_object('status', 'refused', 'reason', 'the test finished more than 48 hours ago');
  end if;
  if not exists (select 1 from public.reports r where r.assessment_id = p_assessment and r.model->>'callToAction' = 'card') then
    return jsonb_build_object('status', 'refused', 'reason', 'the report does not offer the plan');
  end if;
  if exists (select 1 from public.parents p where p.id = a.parent_id and p.deletion_requested_at is not null)
    or exists (select 1 from public.child_deletions d where d.child_id = a.child_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'the family or the child is being deleted');
  end if;
  if exists (select 1 from public.workbooks w where w.child_id = a.child_id)
    or exists (select 1 from public.workbook_runs r where r.child_id = a.child_id and r.status in ('queued', 'running', 'done')) then
    return jsonb_build_object('status', 'refused', 'reason', 'the child already has a workbook or a workbook run');
  end if;
  if exists (select 1 from public.card_setups c where c.parent_id = a.parent_id and c.card_saved_at is not null) then
    return jsonb_build_object('status', 'refused', 'reason', 'the family has a saved card');
  end if;
  insert into public.workbook_first_pages (assessment_id, parent_id, child_id, queued_by, runner)
    values (p_assessment, a.parent_id, a.child_id, p_by, p_runner)
    on conflict (assessment_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.workbook_first_pages where assessment_id = p_assessment;
    return jsonb_build_object('status', 'exists', 'id', v_id);
  end if;
  return jsonb_build_object('status', 'queued', 'id', v_id);
end $$;

-- Takes a queued set (one more attempt), or a running one with no holder or no progress for p_stale_seconds (one more
-- attempt). A set past its last attempt fails instead. True when this lease holds it now.
create function public.claim_workbook_first_pages(p_id uuid, p_lease uuid, p_runner text, p_stale_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select status, lease, heartbeat_at, created_at, attempts, max_attempts into r from public.workbook_first_pages where id = p_id for update;
  if not found then return false; end if;
  if not (r.status = 'queued' or (r.status = 'running' and (r.lease is null or coalesce(r.heartbeat_at, r.created_at) < now() - make_interval(secs => p_stale_seconds)))) then
    return false;
  end if;
  if r.attempts >= r.max_attempts then
    update public.workbook_first_pages set status = 'failed', lease = null, finished_at = now(),
      error = coalesce(error, 'The first pages stopped too many times without finishing.') where id = p_id;
    return false;
  end if;
  update public.workbook_first_pages set status = 'running', lease = p_lease, runner = p_runner, attempts = attempts + 1, heartbeat_at = now()
    where id = p_id;
  return true;
end $$;

create function public.renew_workbook_first_pages(p_id uuid, p_lease uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.workbook_first_pages set heartbeat_at = now() where id = p_id and lease = p_lease and status = 'running';
  return found;
end $$;

-- Stores one part under the lease, with a heartbeat: the plan ('frame', no key), a finished day page ('page', key the
-- book page), an AI call ('call', key "<page>:<seq>") or a solve check ('solve', key its call key). The first stays.
create function public.save_workbook_first_pages_part(p_id uuid, p_lease uuid, p_part text, p_key text, p_value jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_part not in ('frame', 'page', 'call', 'solve') or jsonb_typeof(p_value) <> 'object'
    or (p_part <> 'frame' and (p_key is null or char_length(p_key) > 100)) then
    raise exception 'bad arguments' using errcode = '22023';
  end if;
  update public.workbook_first_pages set heartbeat_at = now(),
    frame = case when p_part = 'frame' then coalesce(frame, p_value) else frame end,
    pages = case when p_part = 'page' and not pages ? p_key then pages || jsonb_build_object(p_key, p_value) else pages end,
    calls = case when p_part = 'call' and not calls ? p_key then calls || jsonb_build_object(p_key, p_value) else calls end,
    solves = case when p_part = 'solve' and not solves ? p_key then solves || jsonb_build_object(p_key, p_value) else solves end
    where id = p_id and lease = p_lease and status = 'running';
  return found;
end $$;

-- Counts one AI attempt of each slot of a page before its call, refusing a slot that used p_max. Null when the lease
-- does not hold the set.
create function public.count_workbook_first_pages_attempts(p_id uuid, p_lease uuid, p_page int, p_slots text[], p_max int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; s text; k text; refused text[] := '{}'; used int;
begin
  select slot_attempts into v from public.workbook_first_pages where id = p_id and lease = p_lease and status = 'running' for update;
  if not found then return null; end if;
  foreach s in array p_slots loop
    if s !~ '^([0-9]{1,3}\.[0-9]{1,3}|e[0-9]{1,3})$' then raise exception 'bad slot' using errcode = '22023'; end if;
    k := p_page::text || ':' || s;
    used := coalesce((v->>k)::int, 0);
    if used >= p_max then refused := refused || s;
    else v := v || jsonb_build_object(k, used + 1);
    end if;
  end loop;
  update public.workbook_first_pages set slot_attempts = v, heartbeat_at = now() where id = p_id;
  return jsonb_build_object('refused', to_jsonb(refused));
end $$;

create function public.finish_workbook_first_pages(p_id uuid, p_lease uuid, p_result jsonb, p_ai_calls jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.workbook_first_pages set status = 'ready', result = p_result, lease = null, ready_at = now(), finished_at = now(),
    heartbeat_at = now(), error = null, ai_calls = ai_calls || coalesce(p_ai_calls, '[]')
    where id = p_id and lease = p_lease and status = 'running';
  return found;
end $$;

-- Ends this attempt: 'failed' or 'unavailable' ends the set; 'retry' keeps the error and queues it again, or fails it
-- when no attempt is left.
create function public.end_workbook_first_pages(p_id uuid, p_lease uuid, p_outcome text, p_error text, p_ai_calls jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_outcome not in ('failed', 'unavailable', 'retry') then raise exception 'bad outcome' using errcode = '22023'; end if;
  update public.workbook_first_pages set
    status = case when p_outcome <> 'retry' then p_outcome when attempts < max_attempts then 'queued' else 'failed' end,
    lease = null, heartbeat_at = now(), error = left(p_error, 2000),
    finished_at = case when p_outcome = 'retry' and attempts < max_attempts then null else now() end,
    errors = errors || jsonb_build_array(jsonb_build_object('attempt', attempts, 'at', now(), 'error', left(p_error, 2000))),
    ai_calls = ai_calls || coalesce(p_ai_calls, '[]')
    where id = p_id and lease = p_lease and status = 'running';
  return found;
end $$;

-- A Workbook 1 run keeps the ready first pages, in one step under the run's lease, before the run has a plan or any
-- stored work: the run's draft key becomes the reserved Workbook 1 id, the day pages and their attempts become the run's,
-- the plan is stored, and the set names the run. Refused when the set is not this child's, not ready, hidden, kept by
-- another run that is waiting, working or done, or its id is another run's draft key or a stored draft.
create function public.adopt_workbook_first_pages(p_run uuid, p_lease uuid, p_first_pages uuid, p_frame jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; f record; k text;
begin
  select id, parent_id, child_id, number into r from public.workbook_runs where id = p_run and lease = p_lease and status = 'running' for update;
  if not found then return jsonb_build_object('status', 'lost'); end if;
  if r.number <> 1 then return jsonb_build_object('status', 'refused', 'reason', 'only Workbook 1 keeps first pages'); end if;
  if exists (select 1 from public.workbook_run_frames where run_id = p_run) or exists (select 1 from public.workbook_run_pages where run_id = p_run)
    or exists (select 1 from public.workbook_run_attempts where run_id = p_run) then
    return jsonb_build_object('status', 'refused', 'reason', 'the run already has stored work');
  end if;
  select id, child_id, workbook_id, status, kept_by, decision, pages, slot_attempts, result into f
    from public.workbook_first_pages where id = p_first_pages for update;
  if not found or f.child_id <> r.child_id then return jsonb_build_object('status', 'refused', 'reason', 'the first pages are not this child''s'); end if;
  if f.status <> 'ready' or f.result is null then return jsonb_build_object('status', 'refused', 'reason', 'the first pages are not ready'); end if;
  if f.decision = 'drop' then return jsonb_build_object('status', 'refused', 'reason', 'the first pages are hidden'); end if;
  if f.kept_by is not null and f.kept_by <> p_run and exists (select 1 from public.workbook_runs x where x.id = f.kept_by and x.status in ('queued', 'running', 'done')) then
    return jsonb_build_object('status', 'refused', 'reason', 'another run keeps the first pages');
  end if;
  if exists (select 1 from public.workbook_runs x where x.draft_key = f.workbook_id and x.id <> p_run and x.status in ('queued', 'running', 'done')) then
    return jsonb_build_object('status', 'refused', 'reason', 'another run writes the first pages'' workbook');
  end if;
  if exists (select 1 from public.workbook_drafts d where d.id = f.workbook_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'a draft with the first pages'' workbook id exists');
  end if;
  update public.workbook_runs set draft_key = f.workbook_id, heartbeat_at = now() where id = p_run;
  insert into public.workbook_run_pages (run_id, number, parent_id, child_id, page)
    select p_run, (e.value->>'number')::int, r.parent_id, r.child_id, e.value
    from jsonb_array_elements(f.result->'pages') d, jsonb_each(f.pages) e
    where e.key = d->>'number';
  for k in select jsonb_object_keys(f.slot_attempts) loop
    if exists (select 1 from jsonb_array_elements(f.result->'pages') d where d->>'number' = split_part(k, ':', 1)) then
      insert into public.workbook_run_attempts (run_id, page, slot, attempts, parent_id, child_id)
        values (p_run, split_part(k, ':', 1)::int, split_part(k, ':', 2), (f.slot_attempts->>k)::smallint, r.parent_id, r.child_id);
    end if;
  end loop;
  insert into public.workbook_run_frames (run_id, parent_id, child_id, frame) values (p_run, r.parent_id, r.child_id, p_frame);
  update public.workbook_first_pages set kept_by = p_run, kept_at = now() where id = p_first_pages;
  insert into public.workbook_audit (parent_id, child_id, run_id, action, detail)
    values (r.parent_id, r.child_id, p_run, 'first-pages-kept', jsonb_build_object('first_pages', p_first_pages));
  return jsonb_build_object('status', 'adopted');
end $$;

-- The admin's choice after Workbook 1's plan stopped matching the first pages: 'keep-plan' (the run plans from the
-- first pages' plan) or 'drop' (the set is hidden from the report; the run makes the book without it).
create function public.decide_workbook_first_pages(p_id uuid, p_decision text, p_by uuid, p_by_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  if p_decision not in ('keep-plan', 'drop') then raise exception 'bad decision' using errcode = '22023'; end if;
  select status, parent_id, child_id into f from public.workbook_first_pages where id = p_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if f.status <> 'ready' then return jsonb_build_object('status', 'refused', 'reason', 'the first pages are not ready'); end if;
  update public.workbook_first_pages set decision = p_decision, decided_by = p_by, decided_by_email = p_by_email, decided_at = now(),
    status = case when p_decision = 'drop' then 'hidden' else status end where id = p_id;
  insert into public.workbook_audit (parent_id, child_id, actor_id, actor_email, action, detail)
    values (f.parent_id, f.child_id, p_by, p_by_email, 'first-pages-' || p_decision, jsonb_build_object('first_pages', p_id));
  return jsonb_build_object('status', 'decided');
end $$;

do $$ declare fn text; begin
  foreach fn in array array[
    'queue_workbook_first_pages(uuid, text, text)', 'claim_workbook_first_pages(uuid, uuid, text, int)', 'renew_workbook_first_pages(uuid, uuid)',
    'save_workbook_first_pages_part(uuid, uuid, text, text, jsonb)', 'count_workbook_first_pages_attempts(uuid, uuid, int, text[], int)',
    'finish_workbook_first_pages(uuid, uuid, jsonb, jsonb)', 'end_workbook_first_pages(uuid, uuid, text, text, jsonb)',
    'adopt_workbook_first_pages(uuid, uuid, uuid, jsonb)', 'decide_workbook_first_pages(uuid, text, uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- A child deletion also removes the first pages' files: <parent>/<workbook_id>.
create or replace function public.child_delete_roots(p uuid,c uuid)
returns table(bucket text,prefix text) language sql stable security definer set search_path = '' as $$
  select 'shown-work',p::text||'/'||a.id::text from public.assessments a where a.parent_id=p and a.child_id=c
  union select 'workbook-pages',p::text||'/'||w.id::text from public.workbooks w where w.parent_id=p and w.child_id=c
  union select 'workbook-pages',p::text||'/'||d.id::text from public.workbook_drafts d where d.parent_id=p and d.child_id=c
  union select 'workbook-pages',p::text||'/'||f.workbook_id::text from public.workbook_first_pages f where f.parent_id=p and f.child_id=c
  union select 'scan-photos',p::text||'/'||s.id::text from public.scan_photos s where s.parent_id=p and s.child_id=c
  union select f->>'bucket',f->>'prefix' from public.child_deletions d,lateral jsonb_array_elements(d.folders) f where d.parent_id=p and d.child_id=c;
$$;

-- The sample email (one per test, about the child and the test).
alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check(kind in
  ('continue','come_back','start','start_followup','unsubscribe','maya_daily','maya_weekly','maya_unsubscribe',
   'monthly_summary','monthly_summary_unsubscribe','scan_inactivity','first_pages'));
alter table public.email_log drop constraint email_log_check1;
alter table public.email_log add constraint email_log_check1 check ((kind in ('continue','come_back','first_pages')) = (assessment_id is not null));

alter table public.email_copies add column attachments jsonb check (attachments is null or (jsonb_typeof(attachments) = 'array' and pg_column_size(attachments) < 10000));
