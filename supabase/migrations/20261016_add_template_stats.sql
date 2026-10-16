-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_template_stats, 2026-10-16.
-- The admin table per question template (#199, spec #181). For each template, across all children: the times shown
-- (the answers: a question is answered before the next one shows), the right answers, the median thinking time the
-- browser measured (answers.time_ms), and each different wrong answer (the same response and misconception) with its
-- count. The database counts, so the page reads one row per template and not every answer.
-- The same rules in TypeScript: templateStats in src/lib/admin-templates.ts.
--
-- with_tests: count the team and test families too (D-099: admin accounts and test_accounts; left out by default).
-- school_grade, curriculum: only the tests of that school grade and that curriculum (assessments.grade, province).
--
-- Admins only: security definer, so it reads answers and assessments for an admin, and it returns no rows to anyone
-- else (is_admin, as the admin_* functions). Additive: a new function; no table or policy changes.
create function public.admin_template_stats(with_tests boolean default false, school_grade integer default null, curriculum text default null)
returns table (template_id text, shown bigint, correct bigint, median_ms double precision, wrong jsonb)
  language sql stable security definer set search_path = ''
as $$
  with kept as (
    select an.template_id, an.correct, an.time_ms, an.response, an.misconception
    from public.answers an
    join public.assessments a on a.id = an.assessment_id
    where (select public.is_admin())
      and (school_grade is null or a.grade = school_grade)
      and (curriculum is null or a.province = curriculum)
      and (with_tests or (
        not exists (select 1 from public.admin_users u where u.user_id = a.parent_id)
        and not exists (select 1 from public.test_accounts t where t.parent_id = a.parent_id)
      ))
  ),
  counts as (
    select k.template_id, count(*) as shown, count(*) filter (where k.correct) as correct,
      percentile_cont(0.5) within group (order by k.time_ms) as median_ms
    from kept k
    group by k.template_id
  ),
  wrong_answers as (
    select k.template_id, k.response, k.misconception, count(*) as n
    from kept k
    where not k.correct
    group by k.template_id, k.response, k.misconception
  ),
  wrong_lists as (
    select w.template_id,
      jsonb_agg(jsonb_build_object('response', w.response, 'misconception', w.misconception, 'count', w.n) order by w.n desc, w.response) as wrong
    from wrong_answers w
    group by w.template_id
  )
  select c.template_id, c.shown, c.correct, c.median_ms, coalesce(l.wrong, '[]'::jsonb)
  from counts c
  left join wrong_lists l on l.template_id = c.template_id
$$;

revoke execute on function public.admin_template_stats(boolean, integer, text) from public, anon;
grant execute on function public.admin_template_stats(boolean, integer, text) to authenticated;
