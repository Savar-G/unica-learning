-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration change_answer_keep_drawing, 2026-10-18.
-- #252 (D-128): a change in which the child drew nothing (the board opened empty and stayed so) changes only the typed
-- working. The drawing and strokes stay as the row has them under the lock, so a typed-only change never points the
-- row at a file another change replaced and removed, and never removes a file the row still holds.
--
-- Additive: one new function; public.change_answer is not changed, and the code on main does not call this one.
-- public.change_answer_keep_drawing takes the test's row lock first (the same lock change_answer takes, so changes of
-- one test run one at a time), reads the answer's drawing and strokes paths under it, and calls change_answer with
-- them as the work, so the guards stay in one place (also the #253 stage 1 lock) and the paths cannot be stale.
-- Returns what change_answer returns: the work the row held ({"work_path", "strokes_path"}, the same paths it keeps),
-- or null when a guard failed and nothing changed. Only the server calls it, with the secret key (service_role).
create function public.change_answer_keep_drawing(
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
  p_work_text text
) returns jsonb
language plpgsql set search_path = '' as $$
declare kept_work text; kept_strokes text;
begin
  perform 1 from public.assessments where id = p_assessment for update;
  if not found then return null; end if;
  select work_path, strokes_path into kept_work, kept_strokes from public.answers
    where assessment_id = p_assessment and position = p_position;
  return public.change_answer(
    p_assessment => p_assessment,
    p_position => p_position,
    p_question_id => p_question_id,
    p_unanswered_from => p_unanswered_from,
    p_response => p_response,
    p_correct => p_correct,
    p_misconception => p_misconception,
    p_time_ms => p_time_ms,
    p_answered_at => p_answered_at,
    p_answer_changes => p_answer_changes,
    p_read_aloud_count => p_read_aloud_count,
    p_read_aloud_at_ms => p_read_aloud_at_ms,
    p_away_count => p_away_count,
    p_away_ms => p_away_ms,
    p_work_changed => true,
    p_work_path => kept_work,
    p_work_text => p_work_text,
    p_strokes_path => kept_strokes
  );
end $$;

revoke all on function public.change_answer_keep_drawing(uuid, integer, text, integer, text, boolean, text, integer, timestamptz, jsonb, integer, integer[], integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.change_answer_keep_drawing(uuid, integer, text, integer, text, boolean, text, integer, timestamptz, jsonb, integer, integer[], integer, integer, text)
  to service_role;
