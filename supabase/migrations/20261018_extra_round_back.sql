-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration extra_round_back, 2026-10-18.
-- Back and "Check your answers" in the extra round (#249, ticket #254, D-129). The round gets the rules of the main
-- test: an answered round question changes until the round is locked, and the finish of a round taken from the report
-- scores the answers that are stored when it writes.
-- Additive: one new function, and public.change_answer replaced with the same signature. For a main answer (round
-- 'main') its guards are the same as before (migration add_stage1_lock); only a round answer (round 'extra'), which
-- the code on main never sends (its module refuses a change in the round), gets the new guard. So the code on main
-- keeps working before and after this change, and public.change_answer_keep_drawing (which calls change_answer) gets
-- the round's guard with no change of its own.
--
-- public.change_answer: locks the test's row first (for update), as before, then reads the round of the answer at
-- p_position (for the same question). A round answer changes only while the round takes answers: it started and is not
-- finished, and either the test is in progress and the round was not stopped (a skip at or after the start, D-116), or
-- the test is completed (a round taken from the report). A main answer changes only while the test is in progress and
-- the extra round was neither offered, skipped nor started, and a stage 1 answer only while no route is stored. Both:
-- the test has no answer at p_unanswered_from or after it. Returns the work it replaced, or null when a guard failed.
create or replace function public.change_answer(
  p_assessment uuid,
  p_position integer,
  p_question_id text,
  p_unanswered_from integer,
  p_response text,
  p_correct boolean,
  p_misconception text,
  p_time_ms integer,
  p_answered_at timestamptz,
  p_answer_changes jsonb,
  p_read_aloud_count integer,
  p_read_aloud_at_ms integer[],
  p_away_count integer,
  p_away_ms integer,
  p_work_changed boolean,
  p_work_path text,
  p_work_text text,
  p_strokes_path text
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  old_work text; old_strokes text; answer_round text;
  test_status text; stored_route text; stage1_length integer;
  offered timestamptz; skipped timestamptz; started timestamptz; finished timestamptz;
begin
  select status, route, jsonb_array_length(test->'stage1'), extra_offered_at, extra_skipped_at, extra_started_at, extra_finished_at
    into test_status, stored_route, stage1_length, offered, skipped, started, finished
    from public.assessments where id = p_assessment
    for update;
  if not found then return null; end if;
  select work_path, strokes_path, round into old_work, old_strokes, answer_round from public.answers
    where assessment_id = p_assessment and position = p_position and question_id = p_question_id;
  if not found then return null; end if;
  if answer_round = 'extra' then
    -- #254: the round takes answers: started, not finished; during the test not stopped, or from the report.
    if started is null or finished is not null then return null; end if;
    if test_status = 'in_progress' then
      if skipped is not null and skipped >= started then return null; end if;
    elsif test_status <> 'completed' then
      return null;
    end if;
  else
    if test_status <> 'in_progress' or offered is not null or skipped is not null or started is not null then return null; end if;
    -- #253: stage 1 is locked once a route is stored.
    if p_position < stage1_length and stored_route is not null then return null; end if;
  end if;
  if exists (select 1 from public.answers where assessment_id = p_assessment and position >= p_unanswered_from) then
    return null;
  end if;
  update public.answers set
    response = p_response,
    correct = p_correct,
    misconception = p_misconception,
    time_ms = p_time_ms,
    answered_at = p_answered_at,
    answer_changes = p_answer_changes,
    read_aloud_count = p_read_aloud_count,
    read_aloud_at_ms = p_read_aloud_at_ms,
    away_count = p_away_count,
    away_ms = p_away_ms,
    work_path = case when p_work_changed then p_work_path else work_path end,
    work_text = case when p_work_changed then p_work_text else work_text end,
    strokes_path = case when p_work_changed then p_strokes_path else strokes_path end
  where assessment_id = p_assessment and position = p_position;
  return jsonb_build_object('work_path', old_work, 'strokes_path', old_strokes);
end $$;

revoke all on function public.change_answer(uuid, integer, text, integer, text, boolean, text, integer, timestamptz, jsonb, integer, integer[], integer, integer, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.change_answer(uuid, integer, text, integer, text, boolean, text, integer, timestamptz, jsonb, integer, integer[], integer, integer, boolean, text, text, text)
  to service_role;

-- public.finish_extra_round: finishes a round taken from the report: stores the placement scored again and the finish
-- time, only while the test is completed and its round started and not finished, and only while the stored answers are
-- still the ones the placement scored (p_answers: [[question_id, response, time_ms], ...] in position order). It locks
-- the test's row first (for update), as public.change_answer does, so a change waits for it and it waits for a change.
-- Returns 'finished'; 'already' when the round is not open (another request finished it first); 'changed' when an
-- answer changed since the server read it (nothing is written: the server reads the test again and scores the final
-- answers). Only the server calls it, with the secret key (service_role). The family write fence still runs on the
-- update.
create function public.finish_extra_round(
  p_assessment uuid,
  p_finished_at timestamptz,
  p_placement jsonb,
  p_answers jsonb
) returns text
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.assessments
    where id = p_assessment and status = 'completed' and extra_started_at is not null and extra_finished_at is null
    for update;
  if not found then return 'already'; end if;
  if (select coalesce(jsonb_agg(jsonb_build_array(question_id, response, time_ms) order by position), '[]'::jsonb)
      from public.answers where assessment_id = p_assessment) is distinct from p_answers then
    return 'changed';
  end if;
  update public.assessments set placement = p_placement, extra_finished_at = p_finished_at where id = p_assessment;
  return 'finished';
end $$;

revoke all on function public.finish_extra_round(uuid, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_extra_round(uuid, timestamptz, jsonb, jsonb) to service_role;
