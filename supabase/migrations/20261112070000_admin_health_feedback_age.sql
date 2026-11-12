-- "What to fix" (D-331), fix after review: unread feedback is a waiting measure, so it is counted whatever its age.
--
-- The first version counted only feedback from the last 30 days, so a message unread for 31 days left the count and the
-- page said "none". Now n7 and n30 are both the messages not read yet, now (like marking_waiting), and `at` is the oldest of
-- them; d7 and d30 stay the messages that arrived in each window. Same signature, so create or replace.

create or replace function public.admin_health_v1(p_with_tests boolean default false)
returns table (key text, n7 bigint, d7 bigint, n30 bigint, d30 bigint, at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  t7 timestamptz := now() - interval '7 days';
  t30 timestamptz := now() - interval '30 days';
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_with_tests is null then raise exception 'health_tests'; end if;
  return query
  with team as (
    select t.parent_id as id from public.test_accounts t
    union select u.user_id from public.admin_users u
  ),
  mail as (
    -- every email to a parent: the log (not unsubscribe records) and the report emails
    select l.parent_id, l.email_id, (l.status = 'failed') as failed, coalesce(l.sent_at, l.created_at) as at
    from public.email_log l where l.status in ('sent', 'failed')
    union all
    select r.parent_id, r.email_id, (r.email_error is not null), coalesce(r.emailed_at, r.created_at)
    from public.reports r where r.emailed_at is not null or r.email_error is not null
  ),
  mail_flag as (
    select m.at, (m.failed or exists (
      select 1 from public.email_events e
      where e.email_id = m.email_id and e.type in ('bounced', 'failed', 'complained', 'suppressed')
    )) as bad
    from mail m
    where m.at >= t30 and (p_with_tests or m.parent_id not in (select id from team))
  ),
  waiting as (
    select i.evidence_at from public.scan_marking_items i
    where i.observation->>'state' in ('pending', 'parent-pending')
      and i.observation->>'result' is null
      and i.expected->>'method' in ('code', 'parent')
      and (i.observation->>'state' = 'parent-pending' or i.model is not null or coalesce(i.observation->>'certainty', 'not-read') <> 'not-read')
      and (p_with_tests or i.parent_id not in (select id from team))
      and not exists (select 1 from public.child_deletions d where d.child_id = i.child_id)
      and not exists (select 1 from public.family_deletions d where d.parent_id = i.parent_id)
  ),
  seen as (
    select i.evidence_at from public.scan_marking_items i
    where i.evidence_at >= t30 and (p_with_tests or i.parent_id not in (select id from team))
  ),
  checks as (
    select p.created_at, p.photo_check from public.scan_photos p
    where p.created_at >= t30 and p.photo_check->>'state' in ('done', 'unknown')
      and (p_with_tests or p.parent_id not in (select id from team))
  ),
  calls as (
    select c.created_at, c.outcome_reason, (c.safety_flag or c.flag is not null) as flagged
    from public.maya_calls c
    where c.created_at >= t30 and c.status = 'ended' and (p_with_tests or c.parent_id not in (select id from team))
  ),
  finished as (
    select a.completed_at, not exists (select 1 from public.reports r where r.assessment_id = a.id) as no_report
    from public.assessments a
    where a.status = 'completed' and a.completed_at >= t30 and a.completed_at < now() - interval '1 hour'
      and (p_with_tests or a.parent_id not in (select id from team))
  )
  select 'runs_failed'::text,
    count(*) filter (where r.status in ('failed', 'stale') and r.created_at >= t7),
    count(*) filter (where r.created_at >= t7),
    count(*) filter (where r.status in ('failed', 'stale')),
    count(*),
    max(r.created_at) filter (where r.status in ('failed', 'stale'))
  from public.workbook_runs r where r.created_at >= t30 and (p_with_tests or r.parent_id not in (select id from team))
  union all
  select 'fit_failed',
    coalesce(sum(d.failed + d.not_checked) filter (where d.created_at >= t7), 0)::bigint,
    coalesce(sum(d.questions) filter (where d.created_at >= t7), 0)::bigint,
    coalesce(sum(d.failed + d.not_checked), 0)::bigint,
    coalesce(sum(d.questions), 0)::bigint,
    max(d.created_at) filter (where d.failed + d.not_checked > 0)
  from public.workbook_drafts d where d.created_at >= t30 and (p_with_tests or d.parent_id not in (select id from team))
  union all
  select 'gate_flags',
    count(*) filter (where g.outcome = 'flag' and g.created_at >= t7),
    count(*) filter (where g.created_at >= t7),
    count(*) filter (where g.outcome = 'flag'),
    count(*),
    max(g.created_at) filter (where g.outcome = 'flag')
  from public.workbook_run_gates g where g.created_at >= t30 and (p_with_tests or g.parent_id not in (select id from team))
  union all
  select 'marking_waiting',
    (select count(*) from waiting), (select count(*) filter (where s.evidence_at >= t7) from seen s),
    (select count(*) from waiting), (select count(*) from seen),
    (select min(w.evidence_at) from waiting w)
  union all
  select 'photo_refused',
    count(*) filter (where c.photo_check->>'state' = 'done' and c.photo_check->>'problem' is not null and c.created_at >= t7),
    count(*) filter (where c.photo_check->>'state' = 'done' and c.created_at >= t7),
    count(*) filter (where c.photo_check->>'state' = 'done' and c.photo_check->>'problem' is not null),
    count(*) filter (where c.photo_check->>'state' = 'done'),
    max(c.created_at) filter (where c.photo_check->>'state' = 'done' and c.photo_check->>'problem' is not null)
  from checks c
  union all
  select 'photo_unknown',
    count(*) filter (where c.photo_check->>'state' = 'unknown' and c.created_at >= t7),
    count(*) filter (where c.created_at >= t7),
    count(*) filter (where c.photo_check->>'state' = 'unknown'),
    count(*),
    max(c.created_at) filter (where c.photo_check->>'state' = 'unknown')
  from checks c
  union all
  select 'maya_technical',
    count(*) filter (where c.outcome_reason = 'technical_issue' and c.created_at >= t7),
    count(*) filter (where c.created_at >= t7),
    count(*) filter (where c.outcome_reason = 'technical_issue'),
    count(*),
    max(c.created_at) filter (where c.outcome_reason = 'technical_issue')
  from calls c
  union all
  select 'maya_flagged',
    count(*) filter (where c.flagged and c.created_at >= t7),
    count(*) filter (where c.created_at >= t7),
    count(*) filter (where c.flagged),
    count(*),
    max(c.created_at) filter (where c.flagged)
  from calls c
  union all
  select 'email_failed',
    count(*) filter (where m.bad and m.at >= t7),
    count(*) filter (where m.at >= t7),
    count(*) filter (where m.bad),
    count(*),
    max(m.at) filter (where m.bad)
  from mail_flag m
  union all
  select 'report_missing',
    count(*) filter (where f.no_report and f.completed_at >= t7),
    count(*) filter (where f.completed_at >= t7),
    count(*) filter (where f.no_report),
    count(*),
    max(f.completed_at) filter (where f.no_report)
  from finished f
  union all
  select 'feedback_new',
    count(*) filter (where b.status = 'new'),
    count(*) filter (where b.created_at >= t7),
    count(*) filter (where b.status = 'new'),
    count(*) filter (where b.created_at >= t30),
    min(b.created_at) filter (where b.status = 'new')
  from public.feedback b where (b.status = 'new' or b.created_at >= t30) and (p_with_tests or b.parent_id not in (select id from team));
end $$;

revoke all on function public.admin_health_v1(boolean) from public, anon;
grant execute on function public.admin_health_v1(boolean) to authenticated;
