-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_guarded_offer, 2026-10-18.
-- "Check your answers" (#249, #253, D-129), review of #253: "Done checking" on stage 2 records the extra round's offer
-- (the stage 2 lock) only while the answers it was computed from are still the stored ones. Without this guard, a
-- change that lands between the server's read and the offer write could leave an offer that the final answers no
-- longer need (the round then cannot start).
-- Additive: one new function. The code on main records the offer with its own update and does not call it, so it keeps
-- working before and after this change.
--
-- public.record_extra_offer: records extra_offered_at = p_at, only while the test is in progress, the round was
-- neither offered, skipped nor started, and the stored answers are still p_answers ([[question_id, response, time_ms],
-- ...] in position order, every answer of the test). It locks the test's row first (for update), as
-- public.change_answer, public.lock_stage1 and public.complete_test do, so a change waits for it and it waits for a
-- change. Returns 'offered' when this call recorded the offer; 'already' when an offer was recorded before (nothing
-- changes); 'changed' when an answer changed since the server read it (nothing is written: the server reads the test
-- again and decides from the final answers); 'closed' when the test is not in progress or the round was skipped or
-- started. Only the server calls it, with the secret key (service_role). The family write fence still runs on the update.
create function public.record_extra_offer(
  p_assessment uuid,
  p_at timestamptz,
  p_answers jsonb
) returns text
language plpgsql set search_path = '' as $$
declare offered timestamptz; skipped timestamptz; started timestamptz;
begin
  select extra_offered_at, extra_skipped_at, extra_started_at into offered, skipped, started from public.assessments
    where id = p_assessment and status = 'in_progress'
    for update;
  if not found then return 'closed'; end if;
  if offered is not null then return 'already'; end if;
  if skipped is not null or started is not null then return 'closed'; end if;
  if (select coalesce(jsonb_agg(jsonb_build_array(question_id, response, time_ms) order by position), '[]'::jsonb)
      from public.answers where assessment_id = p_assessment) is distinct from p_answers then
    return 'changed';
  end if;
  update public.assessments set extra_offered_at = p_at where id = p_assessment;
  return 'offered';
end $$;

revoke all on function public.record_extra_offer(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.record_extra_offer(uuid, timestamptz, jsonb) to service_role;
