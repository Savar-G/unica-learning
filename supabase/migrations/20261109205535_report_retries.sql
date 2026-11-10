-- Report retries (#771). The report job ran only once, from the finish route's after(): a job that stopped before the
-- report row was written, or a parent report email the provider refused, was never run again, and the parent page said
-- the report was on its way for ever. The 15-minute /api/reminders run now retries those tests (src/lib/report-retry.ts).
--
-- public.report_retries: one row per test the run retried. `attempts` counts the retries, `next_at` is the test's place
-- in the list (the earliest time of its next retry, or of its give-up), so a test that always fails moves back and the
-- others go first. After the last retry the run gives up once: `gave_up_at` is the claim of the one alert to the team,
-- with its email id or error. The code passes the policy (ages, attempt bound, delays); the database decides by its own
-- clock.
--
-- What a test needs (report_retry_need):
--   'send'  : the email may go (finished under p_email_age_s ago, not a test family, not a team account) and the test has
--             no report row, or its report row's parent email was never claimed or was released (refused);
--   'build' : no report row, and the email may not go: the job builds the report row with no email;
--   null    : nothing to do (a report row whose email was claimed, sent or unknown; a test too new; a family being
--             deleted; a test not completed).
--
-- Only the server reads and writes it, through these functions and the secret key. Deleted with the test (cascade), so
-- with the family; the family write fence covers it. Additive: one new table and four new functions.

create table public.report_retries (
  assessment_id uuid primary key references public.assessments(id) on delete cascade,
  attempts integer not null default 0 check (attempts >= 0),
  next_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_email boolean,
  gave_up_at timestamptz,
  alert_email_id text check (char_length(alert_email_id) <= 100),
  alert_error text check (char_length(alert_error) <= 500),
  created_at timestamptz not null default now()
);

alter table public.report_retries enable row level security;
revoke all on table public.report_retries from anon, authenticated, service_role;
grant select on table public.report_retries to service_role;
grant update (gave_up_at, alert_email_id, alert_error) on table public.report_retries to service_role;

create trigger fence_family_write before insert or update on public.report_retries
  for each row execute function public.fence_family_write();

create function public.report_retry_need(p_assessment uuid, p_at timestamptz, p_min_age_s integer, p_email_age_s integer)
returns text
language sql stable security definer set search_path = '' as $$
  select case
    when rp.id is not null and (rp.email_id is not null or rp.emailed_at is not null) then null
    when a.completed_at > p_at - make_interval(secs => p_email_age_s)
      and not exists (select 1 from public.test_accounts t where t.parent_id = a.parent_id)
      and not exists (select 1 from public.admin_users u where u.user_id = a.parent_id) then 'send'
    when rp.id is null then 'build'
  end
  from public.assessments a
  join public.parents p on p.id = a.parent_id and p.deletion_requested_at is null
  left join public.reports rp on rp.assessment_id = a.id
  where a.id = p_assessment and a.status = 'completed' and a.completed_at is not null
    and a.completed_at <= p_at - make_interval(secs => p_min_age_s)
$$;
revoke all on function public.report_retry_need(uuid, timestamptz, integer, integer) from public, anon, authenticated, service_role;

-- The tests due now, in list order: a retry, or the give-up of a test whose retries are used up.
create function public.report_retries_due(p_limit integer, p_min_age_s integer, p_email_age_s integer)
returns table (out_assessment uuid, out_attempts integer)
language sql stable security definer set search_path = '' as $$
  select a.id, coalesce(r.attempts, 0)
  from public.assessments a
  left join public.report_retries r on r.assessment_id = a.id
  where a.status = 'completed' and a.completed_at is not null
    and a.completed_at <= now() - make_interval(secs => p_min_age_s)
    and (r.assessment_id is null or (r.next_at <= now() and r.gave_up_at is null))
    and public.report_retry_need(a.id, now(), p_min_age_s, p_email_age_s) is not null
  order by coalesce(r.next_at, a.completed_at), a.id
  limit p_limit
$$;
revoke all on function public.report_retries_due(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.report_retries_due(integer, integer, integer) to service_role;

-- Counts one retry of the test, under the row lock, by the clock read after the lock: no row (another run took this
-- retry, the test needs nothing, or its retries are used up) or the attempt number and whether the job may email.
-- The next place is the delay after this attempt (the last delay again past the end of the list).
create function public.claim_report_retry(p_assessment uuid, p_min_age_s integer, p_email_age_s integer, p_max_attempts integer, p_delays_s integer[])
returns table (out_attempt integer, out_email boolean)
language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz;
  need text;
  r public.report_retries%rowtype;
begin
  -- A test that needs nothing gets no row (and a family being deleted is never written to).
  if public.report_retry_need(p_assessment, clock_timestamp(), p_min_age_s, p_email_age_s) is null then return; end if;
  insert into public.report_retries (assessment_id) values (p_assessment) on conflict (assessment_id) do nothing;
  select * into r from public.report_retries where assessment_id = p_assessment for update;
  t := clock_timestamp();
  if r.attempts >= p_max_attempts or r.next_at > t or r.gave_up_at is not null then return; end if;
  need := public.report_retry_need(p_assessment, t, p_min_age_s, p_email_age_s);
  if need is null then return; end if;
  update public.report_retries
    set attempts = r.attempts + 1,
        next_at = t + make_interval(secs => p_delays_s[least(r.attempts + 1, cardinality(p_delays_s))]),
        last_attempt_at = t,
        last_email = (need = 'send')
    where assessment_id = p_assessment;
  return query select r.attempts + 1, need = 'send';
end $$;
revoke all on function public.claim_report_retry(uuid, integer, integer, integer, integer[]) from public, anon, authenticated;
grant execute on function public.claim_report_retry(uuid, integer, integer, integer, integer[]) to service_role;

-- Claims the one give-up alert of a test whose retries are used up and that still needs its report or its email, once
-- the last retry had its time. Null when it is not due, or another run claimed it.
create function public.claim_report_give_up(p_assessment uuid, p_min_age_s integer, p_email_age_s integer, p_max_attempts integer)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz;
  claimed timestamptz;
begin
  perform 1 from public.report_retries where assessment_id = p_assessment for update;
  t := clock_timestamp();
  update public.report_retries set gave_up_at = t
    where assessment_id = p_assessment and attempts >= p_max_attempts and gave_up_at is null and next_at <= t
      and public.report_retry_need(p_assessment, t, p_min_age_s, p_email_age_s) is not null
    returning gave_up_at into claimed;
  return claimed;
end $$;
revoke all on function public.claim_report_give_up(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_report_give_up(uuid, integer, integer, integer) to service_role;
