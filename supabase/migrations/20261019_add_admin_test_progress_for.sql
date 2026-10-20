-- Live test progress, review round 2 (PR #265). public.admin_test_progress_for(ids) takes the place of
-- public.admin_test_progress() from add_admin_test_progress, which no code calls any more (additive: it stays):
-- - Only the tests the page asks for, by id. The page picks them from the families it shows, so hidden test families
--   can no longer fill the row limit, and no call scans every old test that is still in progress.
-- - The quick facts section ends early when every drawn fact has a response, skips included (factsStep), so the row
--   also gives the facts tried and the facts drawn.

create function public.admin_test_progress_for(ids uuid[])
returns table (
  id uuid, status text, route text,
  started_at timestamptz, last_answer_at timestamptz, completed_at timestamptz, resume_until timestamptz,
  break_started_at timestamptz, break_ended_at timestamptz,
  extra_offered_at timestamptz, extra_skipped_at timestamptz, extra_started_at timestamptz, extra_finished_at timestamptz,
  stage1 int, up int, stay int, down int, extra int, answered int,
  last_shown_position int, last_shown_at timestamptz,
  facts_started_at timestamptz, facts_answered int, facts_tried int, facts_drawn int,
  next_prompt text
)
language sql stable security definer set search_path = ''
as $$
  with t as (
    select a.*,
      coalesce(jsonb_array_length(a.test->'stage1'), 0) as s1,
      coalesce(jsonb_array_length(a.test->'stage2'->'up'), 0) as l_up,
      coalesce(jsonb_array_length(a.test->'stage2'->'stay'), 0) as l_stay,
      coalesce(jsonb_array_length(a.test->'stage2'->'down'), 0) as l_down,
      coalesce(jsonb_array_length(a.test->'extra'), 0) as l_extra,
      coalesce(jsonb_array_length(a.test->'stage2'->a.route), 0) as form,
      (select count(*)::int from public.answers x where x.assessment_id = a.id) as n
    from public.assessments a
    where (select public.is_admin()) and a.id = any(ids)
    order by a.last_answer_at desc nulls last
    limit 50
  )
  select t.id, t.status, t.route,
    t.started_at, t.last_answer_at, t.completed_at, t.resume_until,
    t.break_started_at, t.break_ended_at,
    t.extra_offered_at, t.extra_skipped_at, t.extra_started_at, t.extra_finished_at,
    t.s1, t.l_up, t.l_stay, t.l_down, t.l_extra, t.n,
    sh.position::int, sh.shown_at,
    f.started_at, coalesce(fc.answered, 0), coalesce(fc.tried, 0), coalesce(jsonb_array_length(f.test->'facts'), 0),
    case
      when t.n < t.s1 then t.test->'stage1'->t.n->>'prompt'
      when t.route is null then null
      when t.n < t.s1 + t.form then t.test->'stage2'->t.route->(t.n - t.s1)->>'prompt'
      else t.test->'extra'->(t.n - t.s1 - t.form)->>'prompt'
    end
  from t
  left join lateral (
    select s.position, s.shown_at from public.question_shows s where s.assessment_id = t.id order by s.position desc limit 1
  ) sh on true
  left join public.assessment_facts f on f.assessment_id = t.id
  left join lateral (
    select count(*)::int as tried, (count(*) filter (where fa.response <> ''))::int as answered
    from public.fact_answers fa where fa.assessment_id = t.id
  ) fc on true
$$;

revoke execute on function public.admin_test_progress_for(uuid[]) from public, anon;
grant execute on function public.admin_test_progress_for(uuid[]) to authenticated;
