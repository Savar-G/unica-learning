-- Question quality gates of a workbook run (spec #850, slice D). One row per run and call key
-- ("<page>:<call>:<slot or panel>", the same key as a solve check). The first row at a key stays, so a resume
-- asks nothing again. Written by the lease holder through save_workbook_run_gates. Admins read. Parents read
-- nothing. Deleted with the run and with the family. The family write fence covers it.

create table public.workbook_run_gates (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.workbook_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  call_key text not null
    constraint workbook_run_gates_call_key_check check (call_key ~ '^[0-9]{1,4}:[0-9]:([0-9]{1,3}\.[0-9]{1,3}|e[0-9]{1,3})$'),
  question_id text not null check (char_length(question_id) between 1 and 200),
  model text not null check (char_length(model) between 1 and 200),
  threshold_version int not null check (threshold_version >= 1),
  outcome text not null check (outcome in ('pass', 'flag', 'unknown')),
  flags text[] not null check (
    cardinality(flags) <= 4
    and flags <@ array['reading_level', 'one_right_answer', 'picture_matches', 'uses_interest']::text[]
  ),
  probabilities jsonb not null check (jsonb_typeof(probabilities) = 'object' and pg_column_size(probabilities) < 4000),
  reason text check (reason is null or char_length(reason) <= 500),
  constraint workbook_run_gates_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint workbook_run_gates_run_key unique (run_id, call_key)
);
create index workbook_run_gates_parent_idx on public.workbook_run_gates (parent_id);
alter table public.workbook_run_gates enable row level security;
revoke all on table public.workbook_run_gates from anon, authenticated, service_role;
grant select on table public.workbook_run_gates to authenticated, service_role;
create policy "Admins read workbook run quality gates" on public.workbook_run_gates for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_run_gates
  for each row execute function public.fence_family_write();

-- Stores quality-gate results of the run, with a heartbeat. p_rows is an array of
-- {callKey, questionId, model, thresholdVersion, outcome, flags, probabilities, reason} (at most 500).
-- False when the lease does not hold the run (nothing is stored). A key already stored stays.
create function public.save_workbook_run_gates(p_run uuid, p_lease uuid, p_rows jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'p_rows must be an array of at most 500 gate results';
  end if;
  update public.workbook_runs set heartbeat_at = now() where id = p_run and lease = p_lease and status = 'running'
    returning parent_id, child_id into r;
  if not found then return false; end if;
  insert into public.workbook_run_gates (
    run_id, parent_id, child_id, call_key, question_id, model, threshold_version, outcome, flags, probabilities, reason
  )
  select p_run, r.parent_id, r.child_id, e->>'callKey', e->>'questionId', e->>'model', (e->>'thresholdVersion')::int,
    e->>'outcome',
    coalesce((select array_agg(value) from jsonb_array_elements_text(e->'flags') as value), '{}'),
    coalesce(e->'probabilities', '{}'::jsonb),
    e->>'reason'
  from jsonb_array_elements(p_rows) as e
  on conflict (run_id, call_key) do nothing;
  return true;
end $$;
revoke all on function public.save_workbook_run_gates(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_workbook_run_gates(uuid, uuid, jsonb) to service_role;
