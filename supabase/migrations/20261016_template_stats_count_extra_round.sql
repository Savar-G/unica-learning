-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration template_stats_count_extra_round, 2026-10-16
-- (SQL editor, registry 20261016222202).
-- #221, spec #181: count a served, unanswered extra-round question (#190) in "times shown", like a main-test question
-- (D-111). The round's questions are stored with the test (test->'extra', ids x-0, x-1, ...) when the child takes it,
-- and their serves go to question_shows with positions numbered on after the main test.
-- Additive: replaces admin_template_stats_v2 with the same signature, return type and grants; the only change is that
-- the stored questions searched for an unanswered serve now include test->'extra'. admin_template_stats stays as it is.
create or replace function public.admin_template_stats_v2(with_tests boolean default false, school_grade integer default null, curriculum text default null)
returns table (template_id text, shown bigint, answered bigint, correct bigint, median_ms double precision, wrong jsonb)
  language sql stable security definer set search_path = ''
as $$
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
      || coalesce(a.test -> 'extra', '[]'::jsonb)
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

revoke execute on function public.admin_template_stats_v2(boolean, integer, text) from public, anon;
grant execute on function public.admin_template_stats_v2(boolean, integer, text) to authenticated;
