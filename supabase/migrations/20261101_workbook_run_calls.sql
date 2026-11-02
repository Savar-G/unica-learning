-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_run_calls, 2026-11-01.
-- Review R379-7-1: the pages of a day make their first AI call at once, but each is stored only after the page before
-- it. A job call that stopped in that gap lost the answers it had paid for (their attempts stayed counted), so a resume
-- asked again, and a question could run out of attempts. Now each AI call of a page is stored as soon as it comes back,
-- built and checked, with the attempts it counted: one row per run, book page and the call's place among the page's
-- calls (seq: 0 the first call, then the redo, then the shorter rewrite). A later job call replays a page's stored
-- calls in order instead of asking the AI again.
-- The call holds what the AI wrote and code built from it (questions, worked examples, checks, attempt counts). The AI
-- is never told the child's name, so no row holds it.
-- Written by the lease holder only, through save_workbook_run_call (false and nothing stored when the lease does not
-- hold the run; the first row at a key stays); admins read; parents read nothing; deleted with the run and with the
-- family; the family write fence covers it. Additive: one table and one function.

create table public.workbook_run_calls (
  run_id uuid not null references public.workbook_runs (id) on delete cascade,
  page int not null check (page between 1 and 1000),
  seq smallint not null check (seq between 0 and 9),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  call jsonb not null check (jsonb_typeof(call) = 'object' and pg_column_size(call) < 500000),
  primary key (run_id, page, seq),
  constraint workbook_run_calls_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_run_calls_parent_idx on public.workbook_run_calls (parent_id);
alter table public.workbook_run_calls enable row level security;
revoke all on table public.workbook_run_calls from anon, authenticated, service_role;
grant select on table public.workbook_run_calls to authenticated, service_role;
create policy "Admins read workbook run calls" on public.workbook_run_calls for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_run_calls
  for each row execute function public.fence_family_write();

-- Stores one AI call of a page, with a heartbeat. False when the lease does not hold the run (nothing is stored). A
-- call already stored at the same page and place stays (the first one wins).
create function public.save_workbook_run_call(p_run uuid, p_lease uuid, p_page int, p_seq int, p_call jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  update public.workbook_runs set heartbeat_at = now() where id = p_run and lease = p_lease and status = 'running'
    returning parent_id, child_id into r;
  if not found then return false; end if;
  insert into public.workbook_run_calls (run_id, page, seq, parent_id, child_id, call) values (p_run, p_page, p_seq, r.parent_id, r.child_id, p_call)
    on conflict (run_id, page, seq) do nothing;
  return true;
end $$;
revoke all on function public.save_workbook_run_call(uuid, uuid, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.save_workbook_run_call(uuid, uuid, int, int, jsonb) to service_role;
