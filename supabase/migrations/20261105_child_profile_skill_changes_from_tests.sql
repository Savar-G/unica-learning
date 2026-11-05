-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration child_profile_skill_changes_from_tests, 2026-11-05.
-- PR #575, review round 4. Saves the child's profile and its skill state history rows like
-- save_child_profile_and_skill_changes, and also refuses them when a test the rows were worked out from no longer exists.
-- Neither the build token nor the profile's own test sees that: an older test can earn Mastered while a newer test
-- supplies the profile's test, and the older test can be deleted after the rebuild reads it and before it saves.
--
-- p_tests: every test the rule read. Each is locked before anything else (for key share, which a delete waits for), in id
--   order, so it cannot be deleted before this transaction ends, and one deleted already is not found. Tests before the
--   profile, because a test's delete holds the test and then deletes the profile built on it: the other order can deadlock.
-- Returns null when a test is gone, or when p_expected is not the stored build: nothing is stored, and the rebuild builds
--   again from what is left. p_expected null: none stored.
--
-- What the rows mean changed in this round (src/lib/assessment/skill-state.ts): the history records the states the child's
-- map showed as each rebuild saw them, so evidence_at no longer says what the history has read. The comments below say what
-- each time is for.
--
-- Additive: no code calls the old functions save_child_profile_and_skill_changes and record_skill_state_changes after this
-- PR, and they stay until a later migration drops them. This function does not depend on either.
create function public.save_child_profile_and_skill_changes_from_tests(
  p_child uuid, p_parent uuid, p_assessment uuid, p_expected uuid, p_schema_version smallint, p_profile jsonb, p_changes jsonb, p_tests uuid[]
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_revision integer;
  v_token uuid;
  v_change jsonb;
  v_locked integer;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 1000 then
    raise exception 'skill_changes_invalid: changes must be an array of at most 1000' using errcode = '22023';
  end if;
  if p_tests is null or cardinality(p_tests) > 1000 then
    raise exception 'skill_tests_invalid: tests must be an array of at most 1000' using errcode = '22023';
  end if;
  perform public.assert_family_writable(p_parent);
  select count(*) into v_locked from (
    select a.id from public.assessments a
    where a.id = any(p_tests) and a.child_id = p_child and a.parent_id = p_parent
    order by a.id
    for key share of a
  ) locked;
  if v_locked <> (select count(distinct t) from unnest(p_tests) as t) then
    return null;
  end if;
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
revoke all on function public.save_child_profile_and_skill_changes_from_tests(uuid, uuid, uuid, uuid, smallint, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.save_child_profile_and_skill_changes_from_tests(uuid, uuid, uuid, uuid, smallint, jsonb, jsonb, uuid[]) to service_role;

comment on column public.skill_state_history.changed_at is 'When a rebuild recorded this state. Read this for anything that counts or orders changes by time, such as a count for this month.';
comment on column public.skill_state_history.evidence_at is 'The time of the test or mark the state rests on; null for a workbook or no evidence. It can be older than the row before it. Do not count changes by it.';
