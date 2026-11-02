-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_workbook_runs, 2026-10-31.
-- Background generation and admin review (#312, spec #296). Three new tables and the functions of the run's life:
--
-- public.workbook_runs: one row per "Prepare next workbook". The job (src/lib/workbook-job.ts) stores its step, its
--   progress (day pages written of all), each attempt's error, the run's error and, when done, its draft. One run at
--   a time per child (a partial unique index). A run holds a lease (a random token per job call) and a heartbeat: only
--   the holder of the lease writes to it, and a run with no heartbeat for p_stale_seconds is stopped ("stale") by the
--   next start, so a run that stopped (a function past its time limit) never blocks the child, and a late write of a
--   stale run changes nothing.
-- public.workbook_draft_revisions: the revisions of a draft. Revision 1 is the generated draft as stored in
--   public.workbook_drafts (content null: the draft row holds it); later revisions (#313: edits and "Redo page") hold
--   their whole content. Each revision has its rendering: the page images and question boxes, or what did not render.
-- public.workbook_audit: who did what and when to a run, a draft or a workbook. The actor is null for the job.
--
-- Only the server writes, with the secret key (service_role skips row-level security), through these functions or
-- the job's progress update. Admins read. Parents read nothing: runs, drafts and their files are team work. The page
-- images and PDFs of a draft are in the workbook-pages bucket at <parent id>/<draft id>/<name>; the parent policy of
-- that bucket reads only folders of shipped workbooks, so a parent never reads a draft's files.
-- A family deletion removes every row through the foreign keys (on delete cascade from the parent and the child) and
-- every file with the family's folder (FAMILY_BUCKETS in src/lib/assessment/deletion.ts). The family write fence
-- covers new and changed rows. Additive: three new tables and six new functions that the code on main does not use.

create table public.workbook_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  number int not null check (number between 1 and 1000),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'stale')),
  step text check (step in ('plan', 'write', 'render', 'save')),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  max_attempts smallint not null check (max_attempts between 1 and 10),
  done_pages int check (done_pages >= 0),
  total_pages int check (total_pages >= 0),
  lease uuid,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text check (char_length(error) <= 2000),
  errors jsonb not null default '[]' check (jsonb_typeof(errors) = 'array' and pg_column_size(errors) < 50000),
  draft_id uuid references public.workbook_drafts (id) on delete set null,
  started_by uuid,
  started_by_email text check (char_length(started_by_email) <= 320),
  constraint workbook_runs_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_runs_parent_idx on public.workbook_runs (parent_id);
create index workbook_runs_child_idx on public.workbook_runs (child_id, created_at desc);
create index workbook_runs_created_idx on public.workbook_runs (created_at desc);
create unique index workbook_runs_one_active on public.workbook_runs (child_id) where status in ('queued', 'running');

create table public.workbook_draft_revisions (
  draft_id uuid not null references public.workbook_drafts (id) on delete cascade,
  revision int not null check (revision between 1 and 10000),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  kind text not null check (kind in ('generated', 'edit', 'redo-page')),
  by_user uuid,
  by_email text check (char_length(by_email) <= 320),
  note text check (char_length(note) <= 2000),
  content jsonb check (content is null or (jsonb_typeof(content) = 'object' and pg_column_size(content) < 5000000)),
  rendering jsonb check (rendering is null or (jsonb_typeof(rendering) = 'object' and pg_column_size(rendering) < 1000000)),
  render_problems jsonb not null default '[]' check (jsonb_typeof(render_problems) = 'array' and pg_column_size(render_problems) < 200000),
  primary key (draft_id, revision),
  constraint workbook_draft_revisions_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint workbook_draft_revisions_first check ((revision = 1) = (kind = 'generated') and (revision = 1) = (content is null))
);
create index workbook_draft_revisions_parent_idx on public.workbook_draft_revisions (parent_id);

create table public.workbook_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  run_id uuid references public.workbook_runs (id) on delete set null,
  draft_id uuid references public.workbook_drafts (id) on delete set null,
  workbook_id uuid references public.workbooks (id) on delete set null,
  actor_id uuid,
  actor_email text check (char_length(actor_email) <= 320),
  action text not null check (action ~ '^[a-z][a-z-]{1,40}$'),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) < 20000),
  constraint workbook_audit_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_audit_parent_idx on public.workbook_audit (parent_id);
create index workbook_audit_run_idx on public.workbook_audit (run_id);
create index workbook_audit_draft_idx on public.workbook_audit (draft_id);
create index workbook_audit_child_idx on public.workbook_audit (child_id, at desc);

do $$
declare t text;
begin
  foreach t in array array['workbook_runs', 'workbook_draft_revisions', 'workbook_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated, service_role', t);
    execute format('grant select on table public.%I to authenticated, service_role', t);
    execute format('create policy "Admins read %s" on public.%I for select to authenticated using ((select public.is_admin()))', replace(t, '_', ' '), t);
    execute format('create trigger fence_family_write before insert or update on public.%I for each row execute function public.fence_family_write()', t);
  end loop;
end $$;
-- The job's progress update is a plain update by the lease holder; every other write goes through the functions.
grant update (step, done_pages, total_pages, heartbeat_at) on table public.workbook_runs to service_role;

-- Starts a run for the child: stops the child's active runs with no heartbeat for p_stale_seconds (status stale, an
-- audit entry each), then adds a queued run for the child's next workbook number (the highest stored workbook's number
-- plus 1), with an audit entry. Answers {"status":"started","run":<id>}, {"status":"busy","run":<the active run's id>}
-- or {"status":"refused","reason":...} (no such child; the family write fence answers family_unavailable).
create function public.start_workbook_run(p_child uuid, p_by uuid, p_by_email text, p_max_attempts int, p_stale_seconds int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_parent uuid; v_number int; v_run uuid; v_active uuid; r record;
begin
  select parent_id into v_parent from public.children where id = p_child for update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  for r in select id from public.workbook_runs
    where child_id = p_child and status in ('queued', 'running')
      and coalesce(heartbeat_at, created_at) < now() - make_interval(secs => p_stale_seconds)
  loop
    update public.workbook_runs set status = 'stale', finished_at = now(), lease = null,
      error = coalesce(error, 'The run stopped without finishing (no progress for ' || (p_stale_seconds / 60) || ' minutes).')
      where id = r.id;
    insert into public.workbook_audit (parent_id, child_id, run_id, actor_id, actor_email, action)
      values (v_parent, p_child, r.id, p_by, p_by_email, 'run-stopped');
  end loop;
  select id into v_active from public.workbook_runs where child_id = p_child and status in ('queued', 'running');
  if found then return jsonb_build_object('status', 'busy', 'run', v_active); end if;
  select coalesce(max(number), 0) + 1 into v_number from public.workbooks where child_id = p_child;
  insert into public.workbook_runs (parent_id, child_id, number, max_attempts, started_by, started_by_email)
    values (v_parent, p_child, v_number, p_max_attempts, p_by, p_by_email) returning id into v_run;
  insert into public.workbook_audit (parent_id, child_id, run_id, actor_id, actor_email, action, detail)
    values (v_parent, p_child, v_run, p_by, p_by_email, 'run-started', jsonb_build_object('number', v_number));
  return jsonb_build_object('status', 'started', 'run', v_run);
end $$;

-- The job takes a queued run: running, attempt 1, its lease and a heartbeat. False when the run is not queued (another
-- call took it, or it was stopped).
create function public.claim_workbook_run(p_run uuid, p_lease uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.workbook_runs set status = 'running', lease = p_lease, attempts = 1, step = 'plan', heartbeat_at = now(), started_at = now()
    where id = p_run and status = 'queued';
  return found;
end $$;

-- The lease holder starts its next attempt after an error: the attempt's error is kept, with an audit entry. False
-- when the run is not running under this lease, or it has no attempt left.
create function public.retry_workbook_run(p_run uuid, p_lease uuid, p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  update public.workbook_runs
    set attempts = attempts + 1, heartbeat_at = now(),
      errors = errors || jsonb_build_array(jsonb_build_object('attempt', attempts, 'at', now(), 'error', left(p_error, 1000)))
    where id = p_run and lease = p_lease and status = 'running' and attempts < max_attempts
    returning parent_id, child_id, attempts into r;
  if not found then return false; end if;
  insert into public.workbook_audit (parent_id, child_id, run_id, action, detail)
    values (r.parent_id, r.child_id, p_run, 'run-retried', jsonb_build_object('attempt', r.attempts, 'error', left(p_error, 1000)));
  return true;
end $$;

-- The lease holder ends the run as failed, with its error. False when the run is not running under this lease.
create function public.fail_workbook_run(p_run uuid, p_lease uuid, p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  update public.workbook_runs
    set status = 'failed', finished_at = now(), heartbeat_at = now(), lease = null, error = left(p_error, 2000),
      errors = errors || jsonb_build_array(jsonb_build_object('attempt', attempts, 'at', now(), 'error', left(p_error, 1000)))
    where id = p_run and lease = p_lease and status = 'running'
    returning parent_id, child_id into r;
  if not found then return false; end if;
  insert into public.workbook_audit (parent_id, child_id, run_id, action, detail)
    values (r.parent_id, r.child_id, p_run, 'run-failed', jsonb_build_object('error', left(p_error, 1000)));
  return true;
end $$;

-- The lease holder ends the run as done with its stored draft, in one step: the run names the draft, the draft gets
-- revision 1 with its rendering, and the audit log gets the entry. False (nothing changes) when the run is not running
-- under this lease (it was stopped, and a newer run may hold the child), or the draft is not this child's.
create function public.finish_workbook_run(p_run uuid, p_lease uuid, p_draft uuid, p_rendering jsonb, p_render_problems jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select parent_id, child_id into r from public.workbook_runs where id = p_run and lease = p_lease and status = 'running' for update;
  if not found then return false; end if;
  perform 1 from public.workbook_drafts where id = p_draft and child_id = r.child_id and parent_id = r.parent_id;
  if not found then return false; end if;
  update public.workbook_runs set status = 'done', step = null, finished_at = now(), heartbeat_at = now(), lease = null, draft_id = p_draft
    where id = p_run;
  insert into public.workbook_draft_revisions (draft_id, revision, parent_id, child_id, kind, rendering, render_problems)
    values (p_draft, 1, r.parent_id, r.child_id, 'generated', p_rendering, coalesce(p_render_problems, '[]'));
  insert into public.workbook_audit (parent_id, child_id, run_id, draft_id, action, detail)
    values (r.parent_id, r.child_id, p_run, p_draft, 'draft-stored',
      jsonb_build_object('rendered', p_rendering is not null, 'renderProblems', jsonb_array_length(coalesce(p_render_problems, '[]'))));
  return true;
end $$;

-- Whether the lease still holds the run: the job checks it before it stores a draft.
create function public.workbook_run_held(p_run uuid, p_lease uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workbook_runs where id = p_run and lease = p_lease and status = 'running');
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'start_workbook_run(uuid, uuid, text, int, int)', 'claim_workbook_run(uuid, uuid)', 'retry_workbook_run(uuid, uuid, text)',
    'fail_workbook_run(uuid, uuid, text)', 'finish_workbook_run(uuid, uuid, uuid, jsonb, jsonb)', 'workbook_run_held(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
