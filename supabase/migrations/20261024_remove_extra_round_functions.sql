-- The extra round is removed (D-145, 2026-10-24; was #190, D-116): the database functions stop knowing it. Step 1 of
-- the follow-up: no column is dropped and no row is changed. The site live when this runs (PR #272) never calls
-- record_extra_offer or finish_extra_round, reads none of the progress columns removed here, and keeps part 2 closed for
-- a test with an old round record (stricter than change_answer is after this). The 6-argument complete_test stays until
-- the site that calls the 5-argument one is live; a later migration drops it. The removed round's answers have question
-- ids "x-0" to "x-7" (the assessment core's fromRemovedRound), so no function needs answers.round any more.

-- The finish, without the round: the stored answers are still checked against the scored ones under the row lock.
create or replace function public.complete_test(p_assessment uuid, p_completed_at timestamptz, p_placement jsonb, p_help text, p_answers jsonb)
returns text language plpgsql set search_path = '' as $$
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
    help = p_help
  where id = p_assessment and status = 'in_progress';
  return 'done';
end $$;
revoke all on function public.complete_test(uuid, timestamptz, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_test(uuid, timestamptz, jsonb, text, jsonb) to service_role;

-- A change of an answer, without the round: an answer of the test changes only while the test is in progress, stage 1
-- only until its route is stored (#253). The removed round's answers never change, and they are not newer answers that
-- stop a change (they sit after the main answers of a test left part way through the round). Grants stay with create
-- or replace.
create or replace function public.change_answer(p_assessment uuid, p_position integer, p_question_id text, p_unanswered_from integer, p_response text, p_correct boolean, p_misconception text, p_time_ms integer, p_answered_at timestamptz, p_answer_changes jsonb, p_read_aloud_count integer, p_read_aloud_at_ms integer[], p_away_count integer, p_away_ms integer, p_work_changed boolean, p_work_path text, p_work_text text, p_strokes_path text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  old_work text; old_strokes text;
  test_status text; stored_route text; stage1_length integer;
begin
  select status, route, jsonb_array_length(test->'stage1')
    into test_status, stored_route, stage1_length
    from public.assessments where id = p_assessment
    for update;
  if not found then return null; end if;
  select work_path, strokes_path into old_work, old_strokes from public.answers
    where assessment_id = p_assessment and position = p_position and question_id = p_question_id;
  if not found then return null; end if;
  if left(p_question_id, 2) = 'x-' or test_status <> 'in_progress' then return null; end if;
  -- #253: stage 1 is locked once a route is stored.
  if p_position < stage1_length and stored_route is not null then return null; end if;
  if exists (select 1 from public.answers where assessment_id = p_assessment and position >= p_unanswered_from
      and left(question_id, 2) <> 'x-') then
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

-- The template table (#199) counts main test questions only: the removed round's answers and shows are left out.
-- Same result columns, so grants stay with create or replace.
create or replace function public.admin_template_stats_v2(with_tests boolean default false, school_grade integer default null, curriculum text default null)
returns table(template_id text, shown bigint, answered bigint, correct bigint, median_ms double precision, wrong jsonb)
language sql stable security definer set search_path = '' as $$
  with eligible as materialized (
    select a.id
    from public.assessments a
    where (select public.is_admin())
      and (school_grade is null or a.grade = school_grade)
      and (curriculum is null or a.province = curriculum)
      and (with_tests or (
        not exists (select 1 from public.admin_users u where u.user_id = a.parent_id)
        and not exists (select 1 from public.test_accounts t where t.parent_id = a.parent_id)
      ))
  ),
  kept as (
    select an.template_id, an.correct, an.time_ms, an.response, an.misconception
    from public.answers an
    join eligible e on e.id = an.assessment_id
    where left(an.question_id, 2) <> 'x-'
    union all
    select q.value ->> 'templateId', null::boolean, null::integer, null::text, null::text
    from public.question_shows s
    join eligible e on e.id = s.assessment_id
    join public.assessments a on a.id = s.assessment_id
    cross join lateral jsonb_array_elements(
      coalesce(a.test -> 'stage1', '[]'::jsonb)
      || coalesce(a.test #> '{stage2,up}', '[]'::jsonb)
      || coalesce(a.test #> '{stage2,stay}', '[]'::jsonb)
      || coalesce(a.test #> '{stage2,down}', '[]'::jsonb)
    ) q(value)
    where not exists (
      select 1 from public.answers an where an.assessment_id = s.assessment_id and an.position = s.position
    )
      and q.value ->> 'id' = s.question_id
      and q.value ->> 'templateId' is not null
  ),
  counts as (
    select k.template_id, count(*) as shown, count(k.correct) as answered,
      count(*) filter (where k.correct) as correct,
      percentile_cont(0.5) within group (order by k.time_ms) as median_ms
    from kept k
    group by k.template_id
  ),
  wrong_answers as (
    select k.template_id, k.response, k.misconception, count(*) as n
    from kept k
    where k.correct = false
    group by k.template_id, k.response, k.misconception
  ),
  wrong_lists as (
    select w.template_id,
      jsonb_agg(jsonb_build_object('response', w.response, 'misconception', w.misconception, 'count', w.n) order by w.n desc, w.response) as wrong
    from wrong_answers w
    group by w.template_id
  )
  select c.template_id, c.shown, c.answered, c.correct, c.median_ms, coalesce(l.wrong, '[]'::jsonb)
  from counts c
  left join wrong_lists l on l.template_id = c.template_id
$$;

-- Test progress (add_admin_test_progress, add_admin_test_progress_for) without the round's times, length and prompts.
-- The result columns change, so each function is dropped and made again with its grants.
drop function public.admin_test_progress(uuid[]);
create function public.admin_test_progress(ids uuid[] default null)
returns table(
  id uuid, status text, route text,
  started_at timestamptz, last_answer_at timestamptz, completed_at timestamptz, resume_until timestamptz,
  break_started_at timestamptz, break_ended_at timestamptz,
  stage1 integer, up integer, stay integer, down integer, answered integer,
  last_shown_position integer, last_shown_at timestamptz,
  facts_started_at timestamptz, facts_answered integer,
  next_prompt text
)
language sql stable security definer set search_path = '' as $$
  with t as (
    select a.*,
      coalesce(jsonb_array_length(a.test->'stage1'), 0) as s1,
      coalesce(jsonb_array_length(a.test->'stage2'->'up'), 0) as l_up,
      coalesce(jsonb_array_length(a.test->'stage2'->'stay'), 0) as l_stay,
      coalesce(jsonb_array_length(a.test->'stage2'->'down'), 0) as l_down,
      coalesce(jsonb_array_length(a.test->'stage2'->a.route), 0) as form,
      (select count(*)::int from public.answers x where x.assessment_id = a.id and left(x.question_id, 2) <> 'x-') as n
    from public.assessments a
    where (select public.is_admin())
      and (case when ids is null then a.status = 'in_progress' else a.id = any(ids) end)
  )
  select t.id, t.status, t.route,
    t.started_at, t.last_answer_at, t.completed_at, t.resume_until,
    t.break_started_at, t.break_ended_at,
    t.s1, t.l_up, t.l_stay, t.l_down, t.n,
    sh.position::int, sh.shown_at,
    f.started_at,
    (select count(*)::int from public.fact_answers fa where fa.assessment_id = t.id and fa.response <> ''),
    case
      when t.n < t.s1 then t.test->'stage1'->t.n->>'prompt'
      when t.route is null then null
      when t.n < t.s1 + t.form then t.test->'stage2'->t.route->(t.n - t.s1)->>'prompt'
      else null
    end
  from t
  left join lateral (
    select s.position, s.shown_at from public.question_shows s
    where s.assessment_id = t.id and left(s.question_id, 2) <> 'x-'
    order by s.position desc limit 1
  ) sh on true
  left join public.assessment_facts f on f.assessment_id = t.id
  where ids is not null
    or t.resume_until > now()
    or (t.route is not null and t.n >= t.s1 + t.form
        and greatest(t.last_answer_at, sh.shown_at) > now() - interval '24 hours')
  order by t.last_answer_at desc nulls last
  limit 50
$$;
revoke execute on function public.admin_test_progress(uuid[]) from public, anon;
grant execute on function public.admin_test_progress(uuid[]) to authenticated;

drop function public.admin_test_progress_for(uuid[]);
create function public.admin_test_progress_for(ids uuid[])
returns table(
  id uuid, status text, route text,
  started_at timestamptz, last_answer_at timestamptz, completed_at timestamptz, resume_until timestamptz,
  break_started_at timestamptz, break_ended_at timestamptz,
  stage1 integer, up integer, stay integer, down integer, answered integer,
  last_shown_position integer, last_shown_at timestamptz,
  facts_started_at timestamptz, facts_answered integer, facts_tried integer, facts_drawn integer,
  next_prompt text
)
language sql stable security definer set search_path = '' as $$
  with t as (
    select a.*,
      coalesce(jsonb_array_length(a.test->'stage1'), 0) as s1,
      coalesce(jsonb_array_length(a.test->'stage2'->'up'), 0) as l_up,
      coalesce(jsonb_array_length(a.test->'stage2'->'stay'), 0) as l_stay,
      coalesce(jsonb_array_length(a.test->'stage2'->'down'), 0) as l_down,
      coalesce(jsonb_array_length(a.test->'stage2'->a.route), 0) as form,
      (select count(*)::int from public.answers x where x.assessment_id = a.id and left(x.question_id, 2) <> 'x-') as n
    from public.assessments a
    where (select public.is_admin()) and a.id = any(ids)
    order by a.last_answer_at desc nulls last
    limit 50
  )
  select t.id, t.status, t.route,
    t.started_at, t.last_answer_at, t.completed_at, t.resume_until,
    t.break_started_at, t.break_ended_at,
    t.s1, t.l_up, t.l_stay, t.l_down, t.n,
    sh.position::int, sh.shown_at,
    f.started_at, coalesce(fc.answered, 0), coalesce(fc.tried, 0), coalesce(jsonb_array_length(f.test->'facts'), 0),
    case
      when t.n < t.s1 then t.test->'stage1'->t.n->>'prompt'
      when t.route is null then null
      when t.n < t.s1 + t.form then t.test->'stage2'->t.route->(t.n - t.s1)->>'prompt'
      else null
    end
  from t
  left join lateral (
    select s.position, s.shown_at from public.question_shows s
    where s.assessment_id = t.id and left(s.question_id, 2) <> 'x-'
    order by s.position desc limit 1
  ) sh on true
  left join public.assessment_facts f on f.assessment_id = t.id
  left join lateral (
    select count(*)::int as tried, (count(*) filter (where fa.response <> ''))::int as answered
    from public.fact_answers fa where fa.assessment_id = t.id
  ) fc on true
$$;
revoke execute on function public.admin_test_progress_for(uuid[]) from public, anon;
grant execute on function public.admin_test_progress_for(uuid[]) to authenticated;

-- The copy without names (#201): its sources no longer carry the round's times or an answer's round, and a copy may no
-- longer hold the round's record or a question's round (copy version 2 sends neither). Grants stay with create or replace.
create or replace function public.family_copy_sources(p uuid)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'copied', exists(select 1 from public.anonymous_test_links l where l.assessment_id = a.id),
    'testFamily', exists(select 1 from public.test_accounts t where t.parent_id = a.parent_id),
    'grade', a.grade, 'province', a.province, 'status', a.status, 'route', a.route, 'help', a.help,
    'startedAt', a.started_at, 'completedAt', a.completed_at,
    'breakStartedAt', a.break_started_at, 'breakEndedAt', a.break_ended_at, 'breakSkipped', a.break_skipped,
    'breakMs', a.break_ms, 'device', a.device,
    'stored', a.test, 'placement', a.placement,
    'answers', (select coalesce(jsonb_agg(jsonb_build_object(
        'position', x.position, 'questionId', x.question_id, 'templateId', x.template_id, 'values', x."values",
        'response', x.response, 'correct', x.correct, 'misconception', x.misconception, 'timeMs', x.time_ms,
        'workRequired', x.work_required, 'drawing', x.work_path is not null, 'typed', x.work_text is not null,
        'strokes', x.strokes_path is not null, 'shownAt', x.shown_at, 'answeredAt', coalesce(x.answered_at, x.created_at),
        'changes', x.answer_changes, 'readAloudCount', x.read_aloud_count, 'readAloudAtMs', to_jsonb(x.read_aloud_at_ms),
        'awayCount', x.away_count, 'awayMs', x.away_ms
      ) order by x.position), '[]'::jsonb) from public.answers x where x.assessment_id = a.id),
    'shows', (select coalesce(jsonb_agg(jsonb_build_object(
        'position', s.position, 'questionId', s.question_id, 'shownAt', s.shown_at
      ) order by s.position), '[]'::jsonb) from public.question_shows s where s.assessment_id = a.id),
    'facts', (select jsonb_build_object('startedAt', f.started_at, 'stored', f.test, 'answers', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'position', y.position, 'factId', y.fact_id, 'response', y.response, 'correct', y.correct, 'atMs', y.at_ms,
          'serverMs', y.server_ms, 'browserMs', y.browser_ms
        ) order by y.position), '[]'::jsonb) from public.fact_answers y where y.assessment_id = a.id
      )) from public.assessment_facts f where f.assessment_id = a.id),
    -- The profile's facts: its AI parts (#197, free text) and its build id (#197, a random id of the family's profile
    -- row) never leave the database.
    'profile', (select l.profile - 'ai' - 'buildId' from public.learner_profiles l where l.assessment_id = a.id),
    'learning', (select jsonb_build_object(
        'styles', c.learning_styles, 'interests', c.interests, 'feeling', c.math_feeling, 'goal', c.learning_goal,
        'weeklyTime', c.weekly_time
      ) from public.children c where c.id = a.child_id)
  ) order by a.id), '[]'::jsonb)
  from public.assessments a where a.parent_id = p;
$$;

create or replace function public.save_family_test_copy(p uuid, token uuid, test_id uuid, test_copy jsonb)
returns boolean language plpgsql security definer set search_path = '' set "TimeZone" to 'UTC' as $$
declare q public.family_deletions; a public.assessments; marked boolean; extra text; made uuid;
begin
  select * into q from public.family_deletions where parent_id = p for update;
  if not found or q.phase <> 'deleting' or q.lease_token is distinct from token or q.lease_until <= now() then
    raise exception 'copy_lease_unavailable' using errcode = '55000';
  end if;
  select * into a from public.assessments where id = test_id and parent_id = p;
  if not found then raise exception 'copy_scope' using errcode = '55000'; end if;
  if exists(select 1 from public.anonymous_test_links where assessment_id = test_id) then return false; end if;
  if jsonb_typeof(test_copy) is distinct from 'object' or jsonb_typeof(test_copy->'questions') is distinct from 'array' then
    raise exception 'copy_fields' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(test_copy->'questions') shown(v) where jsonb_typeof(shown.v) <> 'object') then
    raise exception 'copy_fields' using errcode = '22023';
  end if;
  select k into extra from (
    select k from jsonb_object_keys(test_copy) k where k <> all(array['copyVersion', 'grade', 'province', 'testMonth', 'testFamily', 'status', 'route', 'help', 'durationMs', 'break', 'device', 'placement', 'questions', 'facts', 'profile', 'questionnaire'])
    union all
    select k from jsonb_array_elements(test_copy->'questions') shown(v), jsonb_object_keys(shown.v) k where k <> all(array['position', 'questionId', 'templateId', 'standard', 'wording', 'level', 'strand', 'format', 'prompt', 'choices', 'figure', 'values', 'answer', 'showWork', 'shownAtMs', 'answeredAtMs', 'response', 'correct', 'misconception', 'timeMs', 'changes', 'readAloud', 'away', 'work'])
  ) listed limit 1;
  if extra is not null then raise exception 'copy_fields' using errcode = '22023'; end if;
  marked := exists(select 1 from public.test_accounts where parent_id = p);
  if test_copy->'grade' is distinct from to_jsonb(a.grade) or test_copy->'province' is distinct from to_jsonb(a.province)
    or test_copy->'testMonth' is distinct from to_jsonb(to_char(a.started_at, 'YYYY-MM'))
    or test_copy->'testFamily' is distinct from to_jsonb(marked) then
    raise exception 'copy_mismatch' using errcode = '22023';
  end if;
  insert into public.anonymous_tests(copy_version, grade, province, test_month, test_family, copy)
    values ((test_copy->>'copyVersion')::smallint, a.grade, a.province, date_trunc('month', a.started_at)::date, marked, test_copy)
    returning id into made;
  insert into public.anonymous_test_links(assessment_id, copy_id) values (test_id, made);
  return true;
end $$;

-- The round's own functions: the site no longer calls them.
drop function public.record_extra_offer(uuid, timestamptz, jsonb);
drop function public.finish_extra_round(uuid, timestamptz, jsonb, jsonb);
