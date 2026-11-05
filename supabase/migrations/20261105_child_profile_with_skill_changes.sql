-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration child_profile_with_skill_changes, 2026-11-05.
-- PR #575, review round 3. The child's profile and its skill state history rows are saved together, in one transaction
-- under the build token, so a rebuild that loses the race writes neither and builds again.
--
-- evidence_at: the time of the test or mark that caused the change (null when it came from a workbook or from no
--   evidence). The rule replays the evidence (src/lib/assessment/skill-state.ts), so a rebuild also adds a state that no
--   earlier rebuild stored, and evidence_at says which evidence the history has already read, so it never adds a change
--   twice.
-- save_child_profile_and_skill_changes: the code works out the rows from the history it read after the stored build, so
--   this function only stores them, in order. Same rules as the plain save of child_profiles: a first save is an insert
--   (a second first save fails on the primary key, 23505); a later save is an update filtered on the build token it
--   expects; the fence trigger and the foreign keys answer as they do for the plain save. Returns the new revision and
--   build token, or null when p_expected is not the stored build (nothing is stored). p_expected null: none stored.
--
-- Additive. record_skill_state_changes (add_skill_state_history) stays, but no code calls it any more: drop it in a later
-- migration. The table holds 0 rows on the day of this migration, so no old row lacks a time.
alter table public.skill_state_history add column evidence_at timestamptz;

create function public.save_child_profile_and_skill_changes(
  p_child uuid, p_parent uuid, p_assessment uuid, p_expected uuid, p_schema_version smallint, p_profile jsonb, p_changes jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_revision integer;
  v_token uuid;
  v_change jsonb;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 1000 then
    raise exception 'skill_changes_invalid: changes must be an array of at most 1000' using errcode = '22023';
  end if;
  perform public.assert_family_writable(p_parent);
  if p_expected is null then
    insert into public.child_profiles (child_id, parent_id, assessment_id, revision, schema_version, profile, built_at)
    values (p_child, p_parent, p_assessment, 1, p_schema_version, p_profile, now())
    returning revision, build_token into v_revision, v_token;
  else
    update public.child_profiles
    set parent_id = p_parent, assessment_id = p_assessment, revision = revision + 1, build_token = gen_random_uuid(),
        schema_version = p_schema_version, profile = p_profile, built_at = now()
    where child_id = p_child and build_token = p_expected
    returning revision, build_token into v_revision, v_token;
    if not found then
      return null;
    end if;
  end if;
  -- One at a time, so the ids keep the order of the changes.
  for v_change in select e.value from jsonb_array_elements(p_changes) with ordinality as e(value, ord) order by e.ord loop
    insert into public.skill_state_history (child_id, parent_id, standard, state, reason, evidence_source, evidence_at)
    values (p_child, p_parent, v_change->>'standard', v_change->>'state', v_change->>'reason', v_change->>'evidence', (v_change->>'evidence_at')::timestamptz);
  end loop;
  return jsonb_build_object('revision', v_revision, 'build_token', v_token);
end $$;
revoke all on function public.save_child_profile_and_skill_changes(uuid, uuid, uuid, uuid, smallint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_child_profile_and_skill_changes(uuid, uuid, uuid, uuid, smallint, jsonb, jsonb) to service_role;
