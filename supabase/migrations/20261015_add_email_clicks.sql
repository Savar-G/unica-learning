-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_email_clicks, 2026-10-15.
-- Our own click tracking (D-105): a click on an email's button counts when the parent lands on our page from it,
-- signed in. No open tracking and no link rewriting (Resend tracking stays off). A link scanner is not signed in, so it
-- does not count. Landings less than 30 minutes apart are one visit: a reload is not a second click.
-- email_log: the reminders (start, start_followup, continue, come_back). reports: the report email to the parent.
-- The record_* functions are the only writers, run by the server with the secret key. Additive: no code on main reads
-- the new columns or calls the functions.
alter table public.email_log
  add column first_clicked_at timestamptz,
  add column last_clicked_at timestamptz,
  add column clicks integer not null default 0 check (clicks >= 0);
alter table public.reports
  add column email_first_clicked_at timestamptz,
  add column email_last_clicked_at timestamptz,
  add column email_clicks integer not null default 0 check (email_clicks >= 0);

-- A reminder link names its kind and child, and for continue and come_back its test: that is one email_log row.
create function public.record_reminder_click(p_parent uuid, p_child uuid, p_kind text, p_assessment uuid) returns void
language sql security definer set search_path = '' as $$
  update public.email_log set
    clicks = clicks + case when last_clicked_at is null or last_clicked_at < now() - interval '30 minutes' then 1 else 0 end,
    first_clicked_at = coalesce(first_clicked_at, now()),
    last_clicked_at = now()
  where parent_id = p_parent and child_id = p_child and kind = p_kind and kind <> 'unsubscribe'
    and case when p_kind in ('continue', 'come_back') then assessment_id = p_assessment else assessment_id is null end;
$$;

-- The report email's links open the report with src=email.
create function public.record_report_email_click(p_parent uuid, p_report uuid) returns void
language sql security definer set search_path = '' as $$
  update public.reports set
    email_clicks = email_clicks + case when email_last_clicked_at is null or email_last_clicked_at < now() - interval '30 minutes' then 1 else 0 end,
    email_first_clicked_at = coalesce(email_first_clicked_at, now()),
    email_last_clicked_at = now()
  where id = p_report and parent_id = p_parent and emailed_at is not null;
$$;

revoke all on function public.record_reminder_click(uuid, uuid, text, uuid), public.record_report_email_click(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_reminder_click(uuid, uuid, text, uuid), public.record_report_email_click(uuid, uuid) to service_role;
