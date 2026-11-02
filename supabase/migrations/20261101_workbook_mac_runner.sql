-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_mac_runner, 2026-11-01.
-- D-200: workbook generation runs on Savar's Mac by default (the workbook worker, npm run workbooks:worker), on his
-- Claude subscription through `claude -p`, with the paid API as the fallback. Three parts:
-- 1. workbook_runs.runner: where a run is made. 'server' (the default, today's path: the admin route runs it on Vercel
--    with after()) or 'mac' (the admin route only queues it; the Mac worker claims it). route_workbook_run moves a run
--    that no one is working on to a runner: a queued run, or a running run with no holder or no progress for
--    p_stale_seconds. The worker takes only 'mac' runs, so a server run is never taken by the Mac, and the admin's
--    "Run on the server" button moves a waiting run back to 'server' before the server claims it.
-- 2. workbook_run_ai_calls: one row per AI call of a run (the page writer's and the solve check's), with the provider
--    that took it ('subscription' or 'api'), the model, the outcome, the time and the cost in US dollars (0 for the
--    subscription, null when the API did not say). Stored without the lease: a call was made (and maybe paid for) even
--    when its job call lost the run. Admins read; the server writes through save_workbook_run_ai_calls; deleted with
--    the run and with the family; the family write fence covers it.
-- 3. workbook_workers: the Mac worker's heartbeat (one row per worker), so the admin pages can say whether it is online.
--    Holds no family data. Admins read; the server writes.
-- Additive: one column with a default, two tables and three functions. The live code keeps working in between.

alter table public.workbook_runs add column runner text not null default 'server' check (runner in ('server', 'mac'));
create index workbook_runs_runner_idx on public.workbook_runs (runner, created_at) where status in ('queued', 'running');

-- Moves a run that no one is working on to a runner, with an audit entry. Answers 'queued' (a queued run), 'stalled'
-- (a running run with no holder, or no progress for p_stale_seconds: the runner takes it up with resume) or null (the
-- run is done, failed, or someone is working on it: nothing changes).
create function public.route_workbook_run(p_run uuid, p_runner text, p_stale_seconds int)
returns text language plpgsql security definer set search_path = '' as $$
declare r record; v_answer text;
begin
  if p_runner not in ('server', 'mac') then raise exception 'unknown runner %', p_runner; end if;
  select parent_id, child_id, status, lease, heartbeat_at, runner into r from public.workbook_runs where id = p_run for update;
  if not found then return null; end if;
  if r.status = 'queued' then v_answer := 'queued';
  elsif r.status = 'running' and (r.lease is null or r.heartbeat_at is null or r.heartbeat_at < now() - make_interval(secs => p_stale_seconds)) then v_answer := 'stalled';
  else return null;
  end if;
  if r.runner <> p_runner then
    update public.workbook_runs set runner = p_runner where id = p_run;
    insert into public.workbook_audit (parent_id, child_id, run_id, action, detail)
      values (r.parent_id, r.child_id, p_run, 'run-routed', jsonb_build_object('runner', p_runner, 'from', r.runner));
  end if;
  return v_answer;
end $$;
revoke all on function public.route_workbook_run(uuid, text, int) from public, anon, authenticated;
grant execute on function public.route_workbook_run(uuid, text, int) to service_role;

create table public.workbook_run_ai_calls (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.workbook_runs (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('write', 'solve')),
  provider text not null check (provider in ('subscription', 'api')),
  model text not null check (char_length(model) between 1 and 100),
  outcome text not null check (outcome in ('answered', 'failed', 'unavailable')),
  ms int not null check (ms >= 0),
  usd numeric(12, 6) check (usd >= 0),
  note text check (char_length(note) <= 300),
  constraint workbook_run_ai_calls_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_run_ai_calls_run_idx on public.workbook_run_ai_calls (run_id, id);
create index workbook_run_ai_calls_parent_idx on public.workbook_run_ai_calls (parent_id);
alter table public.workbook_run_ai_calls enable row level security;
revoke all on table public.workbook_run_ai_calls from anon, authenticated, service_role;
grant select on table public.workbook_run_ai_calls to authenticated, service_role;
create policy "Admins read workbook run ai calls" on public.workbook_run_ai_calls for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_run_ai_calls
  for each row execute function public.fence_family_write();

-- Stores AI calls of a run (at most 200 at a time). Answers how many were stored: 0 when there is no such run.
create function public.save_workbook_run_ai_calls(p_run uuid, p_calls jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_count int;
begin
  if jsonb_typeof(p_calls) <> 'array' or jsonb_array_length(p_calls) > 200 then raise exception 'p_calls must be an array of at most 200 calls'; end if;
  select parent_id, child_id into r from public.workbook_runs where id = p_run;
  if not found then return 0; end if;
  insert into public.workbook_run_ai_calls (run_id, parent_id, child_id, kind, provider, model, outcome, ms, usd, note)
    select p_run, r.parent_id, r.child_id, c->>'kind', c->>'provider', left(c->>'model', 100), c->>'outcome',
      greatest(0, least(2147483647, round((c->>'ms')::numeric)))::int, (c->>'usd')::numeric, left(c->>'note', 300)
    from jsonb_array_elements(p_calls) as c;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.save_workbook_run_ai_calls(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_workbook_run_ai_calls(uuid, jsonb) to service_role;

create table public.workbook_workers (
  id text primary key check (char_length(id) between 1 and 100),
  started_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  build text check (char_length(build) <= 100),
  run_id uuid references public.workbook_runs (id) on delete set null,
  primary_ai text not null default 'subscription' check (primary_ai in ('subscription', 'api')),
  note text check (char_length(note) <= 300)
);
alter table public.workbook_workers enable row level security;
revoke all on table public.workbook_workers from anon, authenticated, service_role;
grant select on table public.workbook_workers to authenticated, service_role;
create policy "Admins read workbook workers" on public.workbook_workers for select to authenticated using ((select public.is_admin()));

-- The worker's heartbeat: adds or updates its row with seen_at now. p_started: true when the worker just started.
create function public.beat_workbook_worker(p_id text, p_build text, p_run uuid, p_primary_ai text, p_note text, p_started boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workbook_workers (id, started_at, seen_at, build, run_id, primary_ai, note)
    values (p_id, now(), now(), left(p_build, 100), p_run, p_primary_ai, left(p_note, 300))
  on conflict (id) do update set seen_at = now(), build = excluded.build, run_id = excluded.run_id, primary_ai = excluded.primary_ai,
    note = excluded.note, started_at = case when p_started then now() else public.workbook_workers.started_at end;
end $$;
revoke all on function public.beat_workbook_worker(text, text, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.beat_workbook_worker(text, text, uuid, text, text, boolean) to service_role;
