-- Versioned blocks live in the existing private test JSON. Existing staged tests are unchanged.
create function public.lock_assessment_block(p_assessment uuid, p_expected integer, p_adaptive jsonb, p_answers jsonb, p_resume_until timestamptz)
returns text language plpgsql set search_path = '' as $$
declare stored jsonb; actual jsonb;
begin
  select test->'adaptive' into stored from public.assessments
    where id = p_assessment and status = 'in_progress' for update;
  if not found or stored is null then return 'closed'; end if;
  if (stored->>'locked')::integer <> p_expected then return 'changed'; end if;
  if (stored->>'complete')::boolean then return 'closed'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(question_id, response, time_ms) order by position), '[]'::jsonb)
    into actual from public.answers where assessment_id = p_assessment;
  if actual is distinct from p_answers then return 'changed'; end if;
  if (p_adaptive->>'version')::integer <> 1 or (p_adaptive->>'locked')::integer <> p_expected + 1
    or p_adaptive->'pool' is distinct from stored->'pool' then
    raise exception 'Invalid assessment block transition';
  end if;
  update public.assessments set test = jsonb_set(test, '{adaptive}', p_adaptive),
    last_answer_at = greatest(last_answer_at, p_resume_until - interval '24 hours'),
    resume_until = greatest(resume_until, p_resume_until)
    where id = p_assessment;
  return 'stored';
end $$;
revoke all on function public.lock_assessment_block(uuid, integer, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.lock_assessment_block(uuid, integer, jsonb, jsonb, timestamptz) to service_role;

create or replace function public.change_answer(p_assessment uuid, p_position integer, p_question_id text, p_unanswered_from integer, p_response text, p_correct boolean, p_misconception text, p_time_ms integer, p_answered_at timestamptz, p_answer_changes jsonb, p_read_aloud_count integer, p_read_aloud_at_ms integer[], p_away_count integer, p_away_ms integer, p_work_changed boolean, p_work_path text, p_work_text text, p_strokes_path text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  old_work text; old_strokes text;
  test_status text; stored_route text; stored_stage3 text; stage1_length integer; stage2_length integer; adaptive jsonb; locked_length integer;
begin
  select status, route, stage3_route, jsonb_array_length(test->'stage1'), coalesce(jsonb_array_length(test->'stage2'->route), 0), test->'adaptive'
    into test_status, stored_route, stored_stage3, stage1_length, stage2_length, adaptive
    from public.assessments where id = p_assessment
    for update;
  if not found then return null; end if;
  select work_path, strokes_path into old_work, old_strokes from public.answers
    where assessment_id = p_assessment and position = p_position and question_id = p_question_id;
  if not found then return null; end if;
  if left(p_question_id, 2) = 'x-' or test_status <> 'in_progress' then return null; end if;
  if adaptive is not null then
    select coalesce(sum(jsonb_array_length(b.value->'questions')), 0)::integer into locked_length
      from jsonb_array_elements(adaptive->'blocks') with ordinality b(value, n)
      where b.n <= (adaptive->>'locked')::integer;
    if p_position < locked_length or (adaptive->>'complete')::boolean then return null; end if;
  end if;
  -- #253: stage 1 is locked once a route is stored.
  if p_position < stage1_length and stored_route is not null then return null; end if;
  -- D-282: stage 2 is locked once a third stage record is stored.
  if p_position < stage1_length + stage2_length and stored_stage3 is not null then return null; end if;
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
      coalesce(a.test #> '{adaptive,pool}', '[]'::jsonb)
      || coalesce(a.test -> 'stage1', '[]'::jsonb)
      || coalesce(a.test #> '{stage2,up}', '[]'::jsonb)
      || coalesce(a.test #> '{stage2,stay}', '[]'::jsonb)
      || coalesce(a.test #> '{stage2,down}', '[]'::jsonb)
      || coalesce(a.test #> '{stage3,up}', '[]'::jsonb)
      || coalesce(a.test #> '{stage3,down}', '[]'::jsonb)
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


drop function public.admin_test_progress(uuid[]);
create function public.admin_test_progress(ids uuid[] default null)
returns table(
  id uuid, status text, route text, stage3_route text,
  started_at timestamptz, last_answer_at timestamptz, completed_at timestamptz, resume_until timestamptz,
  break_started_at timestamptz, break_ended_at timestamptz,
  stage1 integer, up integer, stay integer, down integer, stage3_up integer, stage3_down integer, answered integer,
  last_shown_position integer, last_shown_at timestamptz,
  facts_started_at timestamptz, facts_answered integer,
  next_prompt text, block_lengths integer[], blocks_locked integer, blocks_complete boolean
)
language sql stable security definer set search_path = '' as $$
  with t as (
    select a.*,
      coalesce(jsonb_array_length(a.test->'stage1'), 0) as s1,
      coalesce(jsonb_array_length(a.test->'stage2'->'up'), 0) as l_up,
      coalesce(jsonb_array_length(a.test->'stage2'->'stay'), 0) as l_stay,
      coalesce(jsonb_array_length(a.test->'stage2'->'down'), 0) as l_down,
      coalesce(jsonb_array_length(a.test->'stage2'->a.route), 0) as form,
      coalesce(jsonb_array_length(a.test->'stage3'->'up'), 0) as l3_up,
      coalesce(jsonb_array_length(a.test->'stage3'->'down'), 0) as l3_down,
      case a.stage3_route when 'up' then coalesce(jsonb_array_length(a.test->'stage3'->'up'), 0)
        when 'down' then coalesce(jsonb_array_length(a.test->'stage3'->'down'), 0) else 0 end as third,
      (select count(*)::int from public.answers x where x.assessment_id = a.id and left(x.question_id, 2) <> 'x-') as n
    from public.assessments a
    where (select public.is_admin())
      and (case when ids is null then a.status = 'in_progress' else a.id = any(ids) end)
  )
  select t.id, t.status, t.route, t.stage3_route,
    t.started_at, t.last_answer_at, t.completed_at, t.resume_until,
    t.break_started_at, t.break_ended_at,
    t.s1, t.l_up, t.l_stay, t.l_down, t.l3_up, t.l3_down, t.n,
    sh.position::int, sh.shown_at,
    f.started_at,
    (select count(*)::int from public.fact_answers fa where fa.assessment_id = t.id and fa.response <> ''),
    case
      when t.test ? 'adaptive' then (
        select q.value->>'prompt' from jsonb_array_elements(t.test#>'{adaptive,blocks}') b(value)
        cross join lateral jsonb_array_elements(b.value->'questions') q(value)
        offset t.n limit 1
      )
      when t.n < t.s1 then t.test->'stage1'->t.n->>'prompt'
      when t.route is null then null
      when t.n < t.s1 + t.form then t.test->'stage2'->t.route->(t.n - t.s1)->>'prompt'
      when t.n < t.s1 + t.form + t.third then t.test->'stage3'->t.stage3_route->(t.n - t.s1 - t.form)->>'prompt'
      else null
    end,
    case when t.test ? 'adaptive' then array(select jsonb_array_length(b.value->'questions') from jsonb_array_elements(t.test#>'{adaptive,blocks}') b(value)) end,
    (t.test#>>'{adaptive,locked}')::integer,
    (t.test#>>'{adaptive,complete}')::boolean
  from t
  left join lateral (
    select s.position, s.shown_at from public.question_shows s
    where s.assessment_id = t.id and left(s.question_id, 2) <> 'x-'
    order by s.position desc limit 1
  ) sh on true
  left join public.assessment_facts f on f.assessment_id = t.id
  where ids is not null
    or t.resume_until > now()
    or (t.route is not null and t.n >= t.s1 + t.form + t.third
        and greatest(t.last_answer_at, sh.shown_at) > now() - interval '24 hours')
  order by t.last_answer_at desc nulls last
  limit 50
$$;
revoke execute on function public.admin_test_progress(uuid[]) from public, anon;
grant execute on function public.admin_test_progress(uuid[]) to authenticated;

drop function public.admin_test_progress_for(uuid[]);
create function public.admin_test_progress_for(ids uuid[])
returns table(
  id uuid, status text, route text, stage3_route text,
  started_at timestamptz, last_answer_at timestamptz, completed_at timestamptz, resume_until timestamptz,
  break_started_at timestamptz, break_ended_at timestamptz,
  stage1 integer, up integer, stay integer, down integer, stage3_up integer, stage3_down integer, answered integer,
  last_shown_position integer, last_shown_at timestamptz,
  facts_started_at timestamptz, facts_answered integer, facts_tried integer, facts_drawn integer,
  next_prompt text, block_lengths integer[], blocks_locked integer, blocks_complete boolean
)
language sql stable security definer set search_path = '' as $$
  with t as (
    select a.*,
      coalesce(jsonb_array_length(a.test->'stage1'), 0) as s1,
      coalesce(jsonb_array_length(a.test->'stage2'->'up'), 0) as l_up,
      coalesce(jsonb_array_length(a.test->'stage2'->'stay'), 0) as l_stay,
      coalesce(jsonb_array_length(a.test->'stage2'->'down'), 0) as l_down,
      coalesce(jsonb_array_length(a.test->'stage2'->a.route), 0) as form,
      coalesce(jsonb_array_length(a.test->'stage3'->'up'), 0) as l3_up,
      coalesce(jsonb_array_length(a.test->'stage3'->'down'), 0) as l3_down,
      case a.stage3_route when 'up' then coalesce(jsonb_array_length(a.test->'stage3'->'up'), 0)
        when 'down' then coalesce(jsonb_array_length(a.test->'stage3'->'down'), 0) else 0 end as third,
      (select count(*)::int from public.answers x where x.assessment_id = a.id and left(x.question_id, 2) <> 'x-') as n
    from public.assessments a
    where (select public.is_admin()) and a.id = any(ids)
    order by a.last_answer_at desc nulls last
    limit 50
  )
  select t.id, t.status, t.route, t.stage3_route,
    t.started_at, t.last_answer_at, t.completed_at, t.resume_until,
    t.break_started_at, t.break_ended_at,
    t.s1, t.l_up, t.l_stay, t.l_down, t.l3_up, t.l3_down, t.n,
    sh.position::int, sh.shown_at,
    f.started_at, coalesce(fc.answered, 0), coalesce(fc.tried, 0), coalesce(jsonb_array_length(f.test->'facts'), 0),
    case
      when t.test ? 'adaptive' then (
        select q.value->>'prompt' from jsonb_array_elements(t.test#>'{adaptive,blocks}') b(value)
        cross join lateral jsonb_array_elements(b.value->'questions') q(value)
        offset t.n limit 1
      )
      when t.n < t.s1 then t.test->'stage1'->t.n->>'prompt'
      when t.route is null then null
      when t.n < t.s1 + t.form then t.test->'stage2'->t.route->(t.n - t.s1)->>'prompt'
      when t.n < t.s1 + t.form + t.third then t.test->'stage3'->t.stage3_route->(t.n - t.s1 - t.form)->>'prompt'
      else null
    end,
    case when t.test ? 'adaptive' then array(select jsonb_array_length(b.value->'questions') from jsonb_array_elements(t.test#>'{adaptive,blocks}') b(value)) end,
    (t.test#>>'{adaptive,locked}')::integer,
    (t.test#>>'{adaptive,complete}')::boolean
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
