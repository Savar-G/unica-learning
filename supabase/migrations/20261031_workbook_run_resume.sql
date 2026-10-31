-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_run_resume, 2026-10-31.
-- Resumable workbook runs (#312, after review): a run that reaches the function's time limit goes on where it stopped.
-- - workbook_runs.draft_key: the draft id the run writes, fixed when the run starts, so every job call of the run
--   writes the same draft (its questions' refs name it).
-- - workbook_runs.resumes: how many times the run was taken up again (at most 30).
-- - public.workbook_run_pages: each finished day page of a run, as the generator made it (GeneratedPage). A job call
--   that goes on loads them and writes only the pages that are missing. Server writes through save_workbook_run_page
--   (only the lease holder); admins read; parents read nothing; deleted with the run and with the family.
-- - yield_workbook_run: the lease holder lets go near the time limit (lease null), then calls the protected resume
--   route; resume_workbook_run: a new job call takes a running run that no one holds, or whose holder made no progress
--   for p_stale_seconds, with a new lease. The old holder's later writes change nothing (its lease no longer matches).
-- - start_workbook_run (replaced): a child's run that stopped mid-way (no holder for 2 minutes, or no progress for
--   p_stale_seconds) is answered as {"status":"stalled","run":<id>}, so "Prepare next workbook" takes it up again
--   instead of starting over; a stalled run past 30 resumes is failed and a new run starts.
-- Additive: two columns with defaults, one table and three functions; start_workbook_run keeps its arguments.

alter table public.workbook_runs add column draft_key uuid not null default gen_random_uuid();
alter table public.workbook_runs add column resumes smallint not null default 0 check (resumes between 0 and 30);

create table public.workbook_run_pages (
  run_id uuid not null references public.workbook_runs (id) on delete cascade,
  number int not null check (number between 1 and 1000),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  page jsonb not null check (jsonb_typeof(page) = 'object' and (page->>'number')::int = number and pg_column_size(page) < 500000),
  primary key (run_id, number),
  constraint workbook_run_pages_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_run_pages_parent_idx on public.workbook_run_pages (parent_id);
alter table public.workbook_run_pages enable row level security;
revoke all on table public.workbook_run_pages from anon, authenticated, service_role;
grant select on table public.workbook_run_pages to authenticated, service_role;
create policy "Admins read workbook run pages" on public.workbook_run_pages for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_run_pages
  for each row execute function public.fence_family_write();

-- Stores one finished day page, with a heartbeat. False when the lease does not hold the run. A page already stored
-- stays (the first one wins).
create function public.save_workbook_run_page(p_run uuid, p_lease uuid, p_number int, p_page jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  update public.workbook_runs set heartbeat_at = now() where id = p_run and lease = p_lease and status = 'running'
    returning parent_id, child_id into r;
  if not found then return false; end if;
  insert into public.workbook_run_pages (run_id, number, parent_id, child_id, page) values (p_run, p_number, r.parent_id, r.child_id, p_page)
    on conflict (run_id, number) do nothing;
  return true;
end $$;

-- The lease holder lets go of the run, to go on in a new job call.
create function public.yield_workbook_run(p_run uuid, p_lease uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.workbook_runs set lease = null, heartbeat_at = now() where id = p_run and lease = p_lease and status = 'running';
  return found;
end $$;

-- A new job call takes up a running run that no one holds, or whose holder made no progress for p_stale_seconds.
-- False when the run is not running, someone holds it and is working, or it was taken up 30 times (then it fails).
create function public.resume_workbook_run(p_run uuid, p_lease uuid, p_stale_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select parent_id, child_id, lease, heartbeat_at, resumes into r from public.workbook_runs where id = p_run and status = 'running' for update;
  if not found then return false; end if;
  if r.lease is not null and r.heartbeat_at >= now() - make_interval(secs => p_stale_seconds) then return false; end if;
  if r.resumes >= 30 then
    update public.workbook_runs set status = 'failed', finished_at = now(), lease = null,
      error = 'The run stopped and was taken up again 30 times without finishing.' where id = p_run;
    insert into public.workbook_audit (parent_id, child_id, run_id, action) values (r.parent_id, r.child_id, p_run, 'run-failed');
    return false;
  end if;
  update public.workbook_runs set lease = p_lease, heartbeat_at = now(), resumes = resumes + 1 where id = p_run;
  insert into public.workbook_audit (parent_id, child_id, run_id, action, detail)
    values (r.parent_id, r.child_id, p_run, 'run-resumed', jsonb_build_object('pages', (select count(*) from public.workbook_run_pages where run_id = p_run), 'after', case when r.lease is null then 'handover' else 'no progress' end));
  return true;
end $$;

create or replace function public.start_workbook_run(p_child uuid, p_by uuid, p_by_email text, p_max_attempts int, p_stale_seconds int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_parent uuid; v_number int; v_run uuid; a record;
begin
  select parent_id into v_parent from public.children where id = p_child for update;
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
  select coalesce(max(number), 0) + 1 into v_number from public.workbooks where child_id = p_child;
  insert into public.workbook_runs (parent_id, child_id, number, max_attempts, started_by, started_by_email)
    values (v_parent, p_child, v_number, p_max_attempts, p_by, p_by_email) returning id into v_run;
  insert into public.workbook_audit (parent_id, child_id, run_id, actor_id, actor_email, action, detail)
    values (v_parent, p_child, v_run, p_by, p_by_email, 'run-started', jsonb_build_object('number', v_number));
  return jsonb_build_object('status', 'started', 'run', v_run);
end $$;

do $$
declare f text;
begin
  foreach f in array array['save_workbook_run_page(uuid, uuid, int, jsonb)', 'yield_workbook_run(uuid, uuid)', 'resume_workbook_run(uuid, uuid, int)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
