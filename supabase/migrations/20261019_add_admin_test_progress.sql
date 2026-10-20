-- Live test progress for the admin (src/lib/admin-progress.ts, PR #265). One small row per test: the lengths of the
-- stored parts, the answer count, the newest question serve, the quick facts, the dates, and the prompt of the next
-- question to answer. The admin page polls it every few seconds, so it never returns the stored test itself (~17 KB).
--
-- `ids` null: every test a child can still go on with: in progress, and the deadline has not passed, or every main
-- answer is in (such a test never expires, src/lib/test-attempt.ts) and something happened in the last 24 hours.
-- Admins only, as public.admin_assessments(): everyone else gets no rows. Additive: nothing else changes.

create function public.admin_test_progress(ids uuid[] default null)
returns table (
  id uuid, status text, route text,
  started_at timestamptz, last_answer_at timestamptz, completed_at timestamptz, resume_until timestamptz,
  break_started_at timestamptz, break_ended_at timestamptz,
  extra_offered_at timestamptz, extra_skipped_at timestamptz, extra_started_at timestamptz, extra_finished_at timestamptz,
  stage1 int, up int, stay int, down int, extra int, answered int,
  last_shown_position int, last_shown_at timestamptz,
  facts_started_at timestamptz, facts_answered int,
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
    where (select public.is_admin())
      and (case when ids is null then a.status = 'in_progress' else a.id = any(ids) end)
  )
  select t.id, t.status, t.route,
    t.started_at, t.last_answer_at, t.completed_at, t.resume_until,
    t.break_started_at, t.break_ended_at,
    t.extra_offered_at, t.extra_skipped_at, t.extra_started_at, t.extra_finished_at,
    t.s1, t.l_up, t.l_stay, t.l_down, t.l_extra, t.n,
    sh.position::int, sh.shown_at,
    f.started_at,
    (select count(*)::int from public.fact_answers fa where fa.assessment_id = t.id and fa.response <> ''),
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
  where ids is not null
    or t.resume_until > now()
    or (t.route is not null and t.n >= t.s1 + t.form
        and greatest(t.last_answer_at, sh.shown_at, t.extra_offered_at, t.extra_skipped_at, t.extra_started_at, t.extra_finished_at) > now() - interval '24 hours')
  order by t.last_answer_at desc nulls last
  limit 50
$$;

revoke execute on function public.admin_test_progress(uuid[]) from public, anon;
grant execute on function public.admin_test_progress(uuid[]) to authenticated;
