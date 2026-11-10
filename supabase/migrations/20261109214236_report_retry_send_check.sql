-- Report retries (#771), review fix: the report email's rule is asked again right before the email is sent. A retry is
-- claimed (claim_report_retry) minutes before its job sends, and the retry route took the email flag from its caller, so
-- a test claimed just before 48 hours could be emailed after them, and a caller with the cron secret could ask for an
-- email the rule does not allow (a test family, a team account, an old test). The job now asks this function, by the
-- database's clock read when it runs, right before it claims the parent email; the caller's flag can only turn the email
-- off. True only when report_retry_need is 'send' (migration report_retries).
--
-- Service only. Additive: one new function.
create function public.report_retry_may_email(p_assessment uuid, p_min_age_s integer, p_email_age_s integer)
returns boolean
language sql volatile security definer set search_path = '' as $$
  select coalesce(public.report_retry_need(p_assessment, clock_timestamp(), p_min_age_s, p_email_age_s) = 'send', false)
$$;
revoke all on function public.report_retry_may_email(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.report_retry_may_email(uuid, integer, integer) to service_role;
