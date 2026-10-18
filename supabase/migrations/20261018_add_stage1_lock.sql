-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_stage1_lock, 2026-10-18.
-- "Check your answers" (#249, #253, D-129). Stage 1 no longer closes at its last answer: the child checks it on a grid,
-- and "Done checking" locks it. The stored route (public.assessments.route) is the stage 1 lock record: it is written
-- once, from the final stage 1 answers, and a stage 1 answer never changes after it.
-- Additive: one new function, and public.change_answer replaced with the same signature and one more guard. The code
-- on main (#250) changes a stage 1 answer only before the last stage 1 answer, and records the route only after it, so
-- the new guard never refuses a change that code makes; it keeps working before and after this change.
--
-- public.lock_stage1: stores the route, only while the test is in progress and no route is stored, and only while the
-- stored stage 1 answers are still the ones the route was set from (p_answers: [[question_id, response], ...] in
-- position order, the first jsonb_array_length(test->'stage1') answers). It locks the test's row first (for update),
-- as public.change_answer and public.complete_test do, so a change waits for it and it waits for a change. Returns the
-- stored route: p_route, or the route stored before (a retry after a lost response, or another tab); 'changed' when a
-- stage 1 answer changed since the server read it (nothing is written: the server reads the test again and sets the
-- route from the final answers); 'closed' when the test is not in progress. Only the server calls it, with the secret
-- key (service_role). The family write fence still runs on the update.
create function public.lock_stage1(
  p_assessment uuid,
  p_route text,
  p_answers jsonb
) returns text
language plpgsql set search_path = '' as $$
declare stored_route text; stage1_length integer;
begin
  select route, jsonb_array_length(test->'stage1') into stored_route, stage1_length from public.assessments
    where id = p_assessment and status = 'in_progress'
    for update;
  if not found then return 'closed'; end if;
  if stored_route is not null then return stored_route; end if;
  if (select coalesce(jsonb_agg(jsonb_build_array(question_id, response) order by position), '[]'::jsonb)
      from public.answers where assessment_id = p_assessment and position < stage1_length) is distinct from p_answers then
    return 'changed';
  end if;
  update public.assessments set route = p_route where id = p_assessment;
  return p_route;
end $$;

revoke all on function public.lock_stage1(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.lock_stage1(uuid, text, jsonb) to service_role;

-- public.change_answer (migration add_answer_change), with one more guard: a stage 1 answer (a position before
-- jsonb_array_length(test->'stage1')) changes only while no route is stored, that is while stage 1 is not locked. The
-- rest is unchanged: it locks the test's row first, checks the test is in progress and the extra round was neither
-- offered, skipped nor started, that the test has no answer at p_unanswered_from or after it, and that the row at
-- p_position is for the same question; it returns the work it replaced, or null when a guard failed.
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
declare old_work text; old_strokes text; stored_route text; stage1_length integer;
begin
  select route, jsonb_array_length(test->'stage1') into stored_route, stage1_length from public.assessments
    where id = p_assessment and status = 'in_progress'
      and extra_offered_at is null and extra_skipped_at is null and extra_started_at is null
    for update;
  if not found then return null; end if;
  -- #253: stage 1 is locked once a route is stored.
  if p_position < stage1_length and stored_route is not null then return null; end if;
  if exists (select 1 from public.answers where assessment_id = p_assessment and position >= p_unanswered_from) then
    return null;
  end if;
  select work_path, strokes_path into old_work, old_strokes from public.answers
    where assessment_id = p_assessment and position = p_position and question_id = p_question_id;
  if not found then return null; end if;
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
