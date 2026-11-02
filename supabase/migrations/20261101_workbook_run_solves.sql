-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_run_solves, 2026-11-01.
-- The solve check's log of a workbook run (#312 round 3, after #380 round 7): the generator has a separate model read
-- each printed question whose words the AI wrote and answer it (src/lib/workbook-solve-check.ts). Each check is one row:
-- the question's package id, the model, the verdict, how long it took, its cost in US dollars when the provider said,
-- and the log (what the reader saw, what it answered, the key and the verdict's reason). Written by the lease holder
-- of the run, a page's checks at a time, through save_workbook_run_solves; admins read; parents read nothing; deleted
-- with the run and with the family. Additive: one table and one function.

create table public.workbook_run_solves (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.workbook_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  question_id text not null check (char_length(question_id) between 1 and 200),
  model text not null check (char_length(model) between 1 and 200),
  verdict text not null check (verdict in ('agreed', 'disagreed', 'failed')),
  ms int not null check (ms >= 0),
  usd numeric(12, 6) check (usd is null or usd >= 0),
  log jsonb not null check (jsonb_typeof(log) = 'object' and pg_column_size(log) < 100000),
  constraint workbook_run_solves_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index workbook_run_solves_run_idx on public.workbook_run_solves (run_id, id);
create index workbook_run_solves_parent_idx on public.workbook_run_solves (parent_id);
alter table public.workbook_run_solves enable row level security;
revoke all on table public.workbook_run_solves from anon, authenticated, service_role;
grant select on table public.workbook_run_solves to authenticated, service_role;
create policy "Admins read workbook run solve checks" on public.workbook_run_solves for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_run_solves
  for each row execute function public.fence_family_write();

-- Stores solve checks of the run, with a heartbeat: p_logs is an array of {questionId, model, verdict, ms, usd, log}
-- (at most 500). False when the lease does not hold the run (nothing is stored).
create function public.save_workbook_run_solves(p_run uuid, p_lease uuid, p_logs jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if jsonb_typeof(p_logs) is distinct from 'array' or jsonb_array_length(p_logs) > 500 then
    raise exception 'p_logs must be an array of at most 500 checks';
  end if;
  update public.workbook_runs set heartbeat_at = now() where id = p_run and lease = p_lease and status = 'running'
    returning parent_id, child_id into r;
  if not found then return false; end if;
  insert into public.workbook_run_solves (run_id, parent_id, child_id, question_id, model, verdict, ms, usd, log)
    select p_run, r.parent_id, r.child_id, e->>'questionId', e->>'model', e->>'verdict', (e->>'ms')::int, (e->>'usd')::numeric, e->'log'
    from jsonb_array_elements(p_logs) as e;
  return true;
end $$;
revoke all on function public.save_workbook_run_solves(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_workbook_run_solves(uuid, uuid, jsonb) to service_role;
