-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_runner_checks, 2026-11-01.
-- Review fixes of the Mac workbook worker (PR #404, D-200):
-- 1. R404-2: claim_workbook_run and resume_workbook_run take the runner the caller makes runs for. A run the admin moved
--    to the server ("Run on the server with the API") is never claimed or taken up by the Mac worker, and a Mac run never
--    by the server, even when the caller read the run before it was moved: the check is in the same update or row lock.
--    New overloads; the old two- and three-argument functions stay for the code deployed before this.
-- 2. R404-4: workbook_runs.ai_off keeps the AI providers a run may no longer use (a usage limit, a missing CLI or a lost
--    login on the subscription; a key or credit problem on the API), as {"<provider>": {"note": ..., "at": ...}}, so a
--    job call after a restart restores them before its first AI call. Written by exclude_workbook_run_ai, without the
--    lease: it is a fact about the account, true whoever holds the run.
-- 3. R404-6 and R404-8: workbook_run_ai_calls.call_id, a unique id the worker gives each call when it comes back, so a
--    save that is tried again stores each call once; and workbook_run_ai_calls.requests, the HTTP requests the call made
--    (the API adapter tries a request again after a 408, 429 or 5xx). save_workbook_run_ai_calls stores both; a caller
--    that sends neither (the code deployed before this) stores rows as before.
-- Additive: two nullable or defaulted columns, two new overloads and one new function; one function replaced with the
-- same arguments and the same answers.

create function public.claim_workbook_run(p_run uuid, p_lease uuid, p_runner text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.workbook_runs set status = 'running', lease = p_lease, attempts = 1, step = 'plan', heartbeat_at = now(), started_at = now()
    where id = p_run and status = 'queued' and runner = p_runner;
  return found;
end $$;
revoke all on function public.claim_workbook_run(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_workbook_run(uuid, uuid, text) to service_role;

create function public.resume_workbook_run(p_run uuid, p_lease uuid, p_stale_seconds int, p_runner text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select parent_id, child_id, lease, heartbeat_at, resumes into r from public.workbook_runs
    where id = p_run and status = 'running' and runner = p_runner for update;
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
revoke all on function public.resume_workbook_run(uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function public.resume_workbook_run(uuid, uuid, int, text) to service_role;

alter table public.workbook_runs add column ai_off jsonb not null default '{}'::jsonb check (jsonb_typeof(ai_off) = 'object');

-- Turns an AI provider off for the rest of a run, with why. Answers false when there is no such run.
create function public.exclude_workbook_run_ai(p_run uuid, p_provider text, p_note text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_provider not in ('subscription', 'api') then raise exception 'unknown provider %', p_provider; end if;
  update public.workbook_runs set ai_off = ai_off || jsonb_build_object(p_provider, jsonb_build_object('note', left(coalesce(p_note, ''), 300), 'at', now()))
    where id = p_run;
  return found;
end $$;
revoke all on function public.exclude_workbook_run_ai(uuid, text, text) from public, anon, authenticated;
grant execute on function public.exclude_workbook_run_ai(uuid, text, text) to service_role;

alter table public.workbook_run_ai_calls add column call_id uuid unique;
alter table public.workbook_run_ai_calls add column requests int check (requests between 0 and 100);

-- Stores AI calls of a run (at most 200 at a time); a call whose call_id is stored already is not stored again. Answers
-- how many were stored: 0 when there is no such run.
create or replace function public.save_workbook_run_ai_calls(p_run uuid, p_calls jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_count int;
begin
  if jsonb_typeof(p_calls) <> 'array' or jsonb_array_length(p_calls) > 200 then raise exception 'p_calls must be an array of at most 200 calls'; end if;
  select parent_id, child_id into r from public.workbook_runs where id = p_run;
  if not found then return 0; end if;
  insert into public.workbook_run_ai_calls (run_id, parent_id, child_id, kind, provider, model, outcome, ms, usd, note, call_id, requests)
    select p_run, r.parent_id, r.child_id, c->>'kind', c->>'provider', left(c->>'model', 100), c->>'outcome',
      greatest(0, least(2147483647, round((c->>'ms')::numeric)))::int, (c->>'usd')::numeric, left(c->>'note', 300),
      (c->>'call_id')::uuid, (c->>'requests')::int
    from jsonb_array_elements(p_calls) as c
  on conflict (call_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
