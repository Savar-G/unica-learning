-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_run_frames, 2026-11-01.
-- Review R379-8-2: each job call of a workbook run read the child's current profile and made the plan again, so a
-- profile changed while the run was stopped gave a resume another plan, and the stored answers (found by run, page and
-- place only) could be replayed into new page content. Now the first job call stores the run's plan, once, under the
-- lease: the inputs the plan read (grade, curriculum key, profile revision, stored workbooks; never the profile's
-- content and never the child's name), the plan, and the fingerprints a later call must find unchanged (the curriculum,
-- the planned book, the AI and solve models, the deployed code). Every later call reads it.
-- Review R379-8-1: a page's AI call is stored before its solve checks start, and each solve check as it comes back,
-- under a key (call_key: "<book page>:<call>:<slot or panel>"), so a resume runs only the checks with no stored result.
-- workbook_run_frames is written by the lease holder only, through save_workbook_run_frame (false and nothing stored
-- when the lease does not hold the run; the first row stays); admins read; parents read nothing; deleted with the run
-- and with the family; the family write fence covers it. Additive: one table, one function, one nullable column with
-- its unique index, and save_workbook_run_solves taking the optional key (a check without one is stored as before).

create table public.workbook_run_frames (
  run_id uuid primary key references public.workbook_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  frame jsonb not null check (jsonb_typeof(frame) = 'object' and pg_column_size(frame) < 2000000),
  constraint workbook_run_frames_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_run_frames_parent_idx on public.workbook_run_frames (parent_id);
alter table public.workbook_run_frames enable row level security;
revoke all on table public.workbook_run_frames from anon, authenticated, service_role;
grant select on table public.workbook_run_frames to authenticated, service_role;
create policy "Admins read workbook run plans" on public.workbook_run_frames for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_run_frames
  for each row execute function public.fence_family_write();

-- Stores the run's plan, with a heartbeat. False when the lease does not hold the run (nothing is stored). A plan
-- already stored stays (the first one wins).
create function public.save_workbook_run_frame(p_run uuid, p_lease uuid, p_frame jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  update public.workbook_runs set heartbeat_at = now() where id = p_run and lease = p_lease and status = 'running'
    returning parent_id, child_id into r;
  if not found then return false; end if;
  insert into public.workbook_run_frames (run_id, parent_id, child_id, frame) values (p_run, r.parent_id, r.child_id, p_frame)
    on conflict (run_id) do nothing;
  return true;
end $$;
revoke all on function public.save_workbook_run_frame(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_workbook_run_frame(uuid, uuid, jsonb) to service_role;

alter table public.workbook_run_solves add column call_key text
  constraint workbook_run_solves_call_key_check check (call_key is null or call_key ~ '^[0-9]{1,4}:[0-9]:([0-9]{1,3}\.[0-9]{1,3}|e[0-9]{1,3})$');
create unique index workbook_run_solves_call_key_idx on public.workbook_run_solves (run_id, call_key);

-- Stores solve checks of the run, with a heartbeat: p_logs is an array of {callKey?, questionId, model, verdict, ms,
-- usd, log} (at most 500). False when the lease does not hold the run (nothing is stored). A check whose callKey is
-- already stored is not stored again (the first one stays); a check with no callKey is always stored.
create or replace function public.save_workbook_run_solves(p_run uuid, p_lease uuid, p_logs jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if jsonb_typeof(p_logs) is distinct from 'array' or jsonb_array_length(p_logs) > 500 then
    raise exception 'p_logs must be an array of at most 500 checks';
  end if;
  update public.workbook_runs set heartbeat_at = now() where id = p_run and lease = p_lease and status = 'running'
    returning parent_id, child_id into r;
  if not found then return false; end if;
  insert into public.workbook_run_solves (run_id, parent_id, child_id, call_key, question_id, model, verdict, ms, usd, log)
    select p_run, r.parent_id, r.child_id, e->>'callKey', e->>'questionId', e->>'model', e->>'verdict', (e->>'ms')::int, (e->>'usd')::numeric, e->'log'
    from jsonb_array_elements(p_logs) as e
    on conflict (run_id, call_key) do nothing;
  return true;
end $$;
revoke all on function public.save_workbook_run_solves(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_workbook_run_solves(uuid, uuid, jsonb) to service_role;
