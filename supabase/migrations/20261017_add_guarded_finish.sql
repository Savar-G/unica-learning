-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_guarded_finish, 2026-10-17.
-- Back and change an answer (#249, #250, D-128): the finish must score the answers that are stored when it writes, so
-- a change and a finish never both win on stale answers. Additive: one new function. The code on main completes a test
-- with its own guarded update and does not call it, so it keeps working before and after this change.
--
-- public.complete_test: completes a test with its placement, only while it is in progress and only while its stored
-- answers are still the ones the placement scored (p_answers: [[question_id, response, time_ms], ...] in position
-- order). It locks the test's row first (for update), as public.change_answer does, so a change waits for it and it
-- waits for a change; then it compares the answers. Returns 'changed' when an answer changed since the server read it
-- (nothing is written: the server reads the test again and scores the final answers), else 'done' (also when the test
-- was not in progress: a second finish at the same moment changes nothing, as before). p_extra_finished: a round taken
-- during the test finishes with it (#190). Only the server calls it, with the secret key (service_role). The family
-- write fence still runs on the update.
create function public.complete_test(
  p_assessment uuid,
  p_completed_at timestamptz,
  p_placement jsonb,
  p_help text,
  p_extra_finished boolean,
  p_answers jsonb
) returns text
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.assessments where id = p_assessment and status = 'in_progress' for update;
  if not found then return 'done'; end if;
  if (select coalesce(jsonb_agg(jsonb_build_array(question_id, response, time_ms) order by position), '[]'::jsonb)
      from public.answers where assessment_id = p_assessment) is distinct from p_answers then
    return 'changed';
  end if;
  update public.assessments set
    status = 'completed',
    completed_at = p_completed_at,
    route = p_placement->>'route',
    placement = p_placement,
    help = p_help,
    extra_finished_at = case when p_extra_finished then p_completed_at else extra_finished_at end
  where id = p_assessment and status = 'in_progress';
  return 'done';
end $$;

revoke all on function public.complete_test(uuid, timestamptz, jsonb, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.complete_test(uuid, timestamptz, jsonb, text, boolean, jsonb) to service_role;
