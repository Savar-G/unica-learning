-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_run_attempts, 2026-10-31.
-- Review R379-2-1: each question has at most two AI attempts, also across a job retry or a crash. Before each AI call
-- the job records the attempt of every question slot the call asks for, under the lease, in
-- public.workbook_run_attempts (one row per run, book page and slot). A later attempt of the run reads the counts and
-- never asks for a slot that used both attempts, even when its page was never stored.
-- use_workbook_run_attempts locks the run row, compares the lease and adds 1 to each slot, in one transaction: false
-- (nothing counted) when the caller no longer holds the run. Server writes; admins read; parents read nothing;
-- deleted with the run and with the family; the family write fence covers it. Additive: one table and one function.

create table public.workbook_run_attempts (
  run_id uuid not null references public.workbook_runs (id) on delete cascade,
  page int not null check (page between 1 and 1000),
  slot text not null check (slot ~ '^[0-9]{1,3}\.[0-9]{1,3}$'),
  attempts smallint not null check (attempts between 1 and 10),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (run_id, page, slot),
  constraint workbook_run_attempts_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_run_attempts_parent_idx on public.workbook_run_attempts (parent_id);
alter table public.workbook_run_attempts enable row level security;
revoke all on table public.workbook_run_attempts from anon, authenticated, service_role;
grant select on table public.workbook_run_attempts to authenticated, service_role;
create policy "Admins read workbook run attempts" on public.workbook_run_attempts for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_run_attempts
  for each row execute function public.fence_family_write();

create function public.use_workbook_run_attempts(p_run uuid, p_lease uuid, p_page int, p_slots text[])
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select parent_id, child_id into r from public.workbook_runs where id = p_run and lease = p_lease and status = 'running' for update;
  if not found then return false; end if;
  insert into public.workbook_run_attempts (run_id, page, slot, attempts, parent_id, child_id)
    select p_run, p_page, s, 1, r.parent_id, r.child_id from unnest(p_slots) as s
    on conflict (run_id, page, slot) do update set attempts = public.workbook_run_attempts.attempts + 1, updated_at = now();
  update public.workbook_runs set heartbeat_at = now() where id = p_run;
  return true;
end $$;
revoke all on function public.use_workbook_run_attempts(uuid, uuid, int, text[]) from public, anon, authenticated;
grant execute on function public.use_workbook_run_attempts(uuid, uuid, int, text[]) to service_role;
