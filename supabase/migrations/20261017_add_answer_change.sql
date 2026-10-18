-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_answer_change, 2026-10-17.
-- Back and change an answer (#249, #250, D-128). The child can go back to an answered question of the open section and
-- change the answer. The change overwrites the answer's row (no new table, no new column), so the report, the admin
-- page, the export and the copy without names read the final answer in the columns they read today.
-- Additive: one new function. The code on main does not call it, so it keeps working before and after this change.
--
-- public.change_answer: overwrites the answer at one place of a test, whole, only while its section is open. One
-- function, so the guards and the write are one transaction:
--   * it locks the test's row first (for update). An answer insert waits for it (the foreign key check takes a key
--     share lock on that row), and so do the round's offer, skip and start (updates of that row); it waits for them.
--     So the guards below read what they committed, and a change and the answer that closes its section never both win;
--   * the test is in progress, and the extra round was neither offered, skipped nor started (the test has not moved
--     past stage 2);
--   * the test has no answer at p_unanswered_from or after it (the section is not over: stage 1 closes with its last
--     answer, which routes the test);
--   * the row at p_position is for the same question.
-- The serve time (shown_at) stays. With p_work_changed false, the stored drawing, strokes and typed working stay.
-- Returns the work it replaced ({"work_path", "strokes_path"}), so the server removes those files after the change;
-- null when a guard failed and nothing changed. Two changes at once: the row lock orders them, and the last one wins.
-- Only the server calls it, with the secret key (service_role). The family write fence still runs on the update.
create function public.change_answer(
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
declare old_work text; old_strokes text;
begin
  perform 1 from public.assessments
    where id = p_assessment and status = 'in_progress'
      and extra_offered_at is null and extra_skipped_at is null and extra_started_at is null
    for update;
  if not found then return null; end if;
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
