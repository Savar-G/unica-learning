-- Weekly Maya family recap (#332). Keep the daily kind, column and index for existing rows and old deployments.
-- The weekly code claims (parent, week_start), where week_start is Monday in the family's time zone.
alter table public.email_log add column week_start date;

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('continue', 'come_back', 'start', 'start_followup', 'unsubscribe', 'maya_daily', 'maya_weekly', 'maya_unsubscribe'));

-- Reminders belong to a child. Maya recaps and unsubscribes belong to the parent.
alter table public.email_log drop constraint email_log_check;
alter table public.email_log add constraint email_log_check
  check ((kind in ('unsubscribe', 'maya_unsubscribe', 'maya_daily', 'maya_weekly')) = (child_id is null));

-- The daily day constraint stays unchanged. Weekly rows need a Monday date and retain normal send-state rules.
alter table public.email_log add constraint email_log_maya_week
  check ((kind = 'maya_weekly') = (week_start is not null));
alter table public.email_log add constraint email_log_maya_week_monday
  check (week_start is null or extract(isodow from week_start) = 1);
create unique index email_log_one_maya_weekly on public.email_log (parent_id, week_start) where kind = 'maya_weekly';
