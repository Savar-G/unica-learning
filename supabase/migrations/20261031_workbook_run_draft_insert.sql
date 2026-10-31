-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration workbook_run_draft_insert, 2026-10-31.
-- Review R379-1: a run's draft is stored only while the caller holds the run. save_workbook_run_draft locks the run
-- row (for update), compares the lease and the status, and inserts the draft in the same transaction, so a call that
-- lost the run (another call took it up after the stale time) can never store a draft, even when its insert was slow:
-- the takeover (resume_workbook_run) waits for the same row lock. The draft id must be the run's draft_key, and the
-- draft's child and parent come from the run.
-- Answers 'saved', 'lost' (the caller does not hold the run: nothing stored) or 'used' (the run already has this
-- draft: stored by an earlier attempt of the same holder). Additive: one new function.

create function public.save_workbook_run_draft(
  p_run uuid, p_lease uuid, p_draft jsonb, p_number int, p_levels smallint[], p_model text, p_profile_build text,
  p_schema_version smallint, p_pages int, p_questions int, p_failed int, p_not_checked int, p_failed_pages int
) returns text language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select parent_id, child_id, draft_key into r from public.workbook_runs
    where id = p_run and lease = p_lease and status = 'running' for update;
  if not found then return 'lost'; end if;
  if (p_draft->>'id')::uuid is distinct from r.draft_key then raise exception 'the draft id is not the run''s draft key' using errcode = '22023'; end if;
  perform 1 from public.workbook_drafts where id = r.draft_key;
  if found then return 'used'; end if;
  insert into public.workbook_drafts (id, parent_id, child_id, number, levels, model, profile_build, schema_version, draft,
    pages, questions, failed, not_checked, failed_pages)
  values (r.draft_key, r.parent_id, r.child_id, p_number, p_levels, p_model, p_profile_build, p_schema_version, p_draft,
    p_pages, p_questions, p_failed, p_not_checked, p_failed_pages);
  update public.workbook_runs set heartbeat_at = now() where id = p_run;
  return 'saved';
end $$;
revoke all on function public.save_workbook_run_draft(uuid, uuid, jsonb, int, smallint[], text, text, smallint, int, int, int, int, int) from public, anon, authenticated;
grant execute on function public.save_workbook_run_draft(uuid, uuid, jsonb, int, smallint[], text, text, smallint, int, int, int, int, int) to service_role;
