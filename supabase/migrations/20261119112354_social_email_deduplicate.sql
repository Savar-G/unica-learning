-- A plan-start email can appear in both the plan ledger and the generic send log.
create or replace function public.admin_social_email(p_day date)
returns table (sent bigint, delivered bigint, failed bigint, clicks bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  since_at timestamptz := public.pacific_day_start(p_day - 7);
  until_at timestamptz := public.pacific_day_start(p_day);
begin
  if (select public.is_admin()) is not true then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
  with messages as (
    select l.email_id, l.clicks as clicks from public.email_log l where l.sent_at >= since_at and l.sent_at < until_at
    union all
    select r.email_id, r.email_clicks from public.reports r where r.emailed_at >= since_at and r.emailed_at < until_at
    union all
    select c.email_id, 0 from public.reports r
    left join public.email_copies c on c.report_id = r.id and c.report_email = 'alert'
    where r.alerted_at >= since_at and r.alerted_at < until_at
    union all
    select e.email_id, 0 from public.workbook_emails e where e.sent_at >= since_at and e.sent_at < until_at
    union all
    select e.email_provider_id, 0 from public.plan_starts e where e.email_sent_at >= since_at and e.email_sent_at < until_at
    union all
    select e.email_id, 0 from public.email_sends e where e.outcome = 'sent' and e.created_at >= since_at and e.created_at < until_at
  ), unique_messages as (
    select m.email_id, max(m.clicks) as clicks
    from messages m where m.email_id is not null group by m.email_id
    union all
    select m.email_id, m.clicks from messages m where m.email_id is null
  ), outcomes as (
    select e.email_id, bool_or(e.type = 'delivered') as delivered,
      bool_or(e.type in ('failed', 'bounced', 'suppressed')) as failed
    from public.email_events e where e.email_id in (select m.email_id from messages m)
    group by e.email_id
  )
  select count(*), count(*) filter (where o.delivered), count(*) filter (where o.failed), coalesce(sum(m.clicks), 0)
  from unique_messages m left join outcomes o using (email_id);
end $$;
