-- R404 follow-up to the applied workbook_runner_checks migration.
-- Preserve its runner overloads, ai_off, call_id and requests columns.
-- Keep unfinished intents after crashes; update accounting by id before saving result checkpoints.
alter table public.workbook_run_ai_calls drop constraint workbook_run_ai_calls_outcome_check;
alter table public.workbook_run_ai_calls add constraint workbook_run_ai_calls_outcome_check
  check (outcome in ('started', 'answered', 'failed', 'unavailable'));

create function public.renew_workbook_run(p_run uuid, p_lease uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.workbook_runs set heartbeat_at = now() where id = p_run and lease = p_lease and status = 'running';
  return found;
end $$;

-- Each intent and completion uses the same durable id. Retries update rather than double-count it.
-- No lease guard: costs remain recorded even when the caller loses its lease.
create function public.save_workbook_run_ai_calls_v2(p_run uuid, p_calls jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; c jsonb; v_count int := 0; v_rows int;
begin
  if jsonb_typeof(p_calls) <> 'array' or jsonb_array_length(p_calls) > 200 then raise exception 'p_calls must be an array of at most 200 calls'; end if;
  select parent_id, child_id into r from public.workbook_runs where id = p_run;
  if not found then return 0; end if;
  for c in select value from jsonb_array_elements(p_calls) loop
    if c->>'id' is null then raise exception 'a durable call id is required'; end if;
    insert into public.workbook_run_ai_calls (call_id, run_id, parent_id, child_id, kind, provider, model, outcome, ms, usd, note, requests)
      values ((c->>'id')::uuid, p_run, r.parent_id, r.child_id, c->>'kind', c->>'provider', left(c->>'model', 100), c->>'outcome',
        greatest(0, least(2147483647, round((c->>'ms')::numeric)))::int, (c->>'usd')::numeric, left(c->>'note', 300), coalesce((c->>'requests')::int, 1))
    on conflict (call_id) do update set
      outcome = case when excluded.outcome = 'started' then public.workbook_run_ai_calls.outcome else excluded.outcome end,
      ms = greatest(public.workbook_run_ai_calls.ms, excluded.ms),
      usd = greatest(excluded.usd, public.workbook_run_ai_calls.usd),
      note = coalesce(excluded.note, public.workbook_run_ai_calls.note),
      requests = greatest(public.workbook_run_ai_calls.requests, excluded.requests)
    where public.workbook_run_ai_calls.run_id = p_run;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'renew_workbook_run(uuid, uuid)',
    'save_workbook_run_ai_calls_v2(uuid, jsonb)'
  ] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;
