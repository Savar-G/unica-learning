-- The monthly summary email (#563, spec #544, D-248): one email per parent per month with a link to the Overview, sent
-- by the reminder job (src/lib/monthly-summary-email.ts, run by /api/reminders). It lives in public.email_log, so the
-- email copies (D-103), the delivery events (D-104), the unsubscribe link and the family deletion work as they do for
-- the other emails.
-- kind monthly_summary: one row per parent per month (`summary_month`, the first day of the family-local month the email
--   names); the send claim of the email delivery module, with the unsubscribe token hash. About the parent, not one child.
-- kind monthly_summary_unsubscribe: the parent turned off this email (one row per parent). It stops no other email, and
--   no other unsubscribe stops it: each link stops its own emails.
-- Additive: the old kinds keep every rule they had; the code on main writes no new kind and never sets `summary_month`.
alter table public.email_log add column summary_month date;

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('continue', 'come_back', 'start', 'start_followup', 'unsubscribe', 'maya_daily', 'maya_weekly', 'maya_unsubscribe', 'monthly_summary', 'monthly_summary_unsubscribe'));

-- A reminder is about a child; the unsubscribes, the Maya emails and the monthly summary email are about the parent.
alter table public.email_log drop constraint email_log_check;
alter table public.email_log add constraint email_log_check
  check ((kind in ('unsubscribe', 'maya_unsubscribe', 'maya_daily', 'maya_weekly', 'monthly_summary', 'monthly_summary_unsubscribe')) = (child_id is null));

-- Only the unsubscribes have no send state and no token.
alter table public.email_log drop constraint email_log_check2;
alter table public.email_log add constraint email_log_check2
  check ((kind in ('unsubscribe', 'maya_unsubscribe', 'monthly_summary_unsubscribe')) = (status is null));
alter table public.email_log drop constraint email_log_check3;
alter table public.email_log add constraint email_log_check3
  check ((kind in ('unsubscribe', 'maya_unsubscribe', 'monthly_summary_unsubscribe')) = (unsubscribe_hash is null));

alter table public.email_log add constraint email_log_summary_month
  check ((kind = 'monthly_summary') = (summary_month is not null));
alter table public.email_log add constraint email_log_summary_month_first
  check (summary_month is null or extract(day from summary_month) = 1);

-- One monthly summary email per parent per month, and one unsubscribe of this email per parent. A second claim fails here.
create unique index email_log_one_monthly_summary on public.email_log (parent_id, summary_month) where kind = 'monthly_summary';
create unique index email_log_one_monthly_summary_unsubscribe_per_parent on public.email_log (parent_id) where kind = 'monthly_summary_unsubscribe';
