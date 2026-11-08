-- The daily Maya email (#332, spec #297): one email per parent on each day with Maya calls, grouped across the
-- family's children, sent the next morning by the reminder job (src/lib/maya-daily-email.ts, run by /api/reminders).
-- It lives in public.email_log, so the email copies (D-103), the delivery events (D-104), the unsubscribe link and the
-- family deletion work as they do for the reminders.
-- kind maya_daily: one row per parent per day (`day`, the family's local date of the calls); the send claim of the
--   email delivery module, with the unsubscribe token hash, like a reminder. About the parent, not one child.
-- kind maya_unsubscribe: the parent turned off the daily Maya email (one row per parent). It does not stop reminders,
--   and the reminders' 'unsubscribe' does not stop it: each link stops its own emails.
-- Additive: the old kinds keep every rule they had; the code on main writes no new kind and never sets `day`.
alter table public.email_log add column day date;

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('continue', 'come_back', 'start', 'start_followup', 'unsubscribe', 'maya_daily', 'maya_unsubscribe'));
-- A reminder is about a child; an unsubscribe and the daily Maya email are about the parent.
alter table public.email_log drop constraint email_log_check;
alter table public.email_log add constraint email_log_check
  check ((kind in ('unsubscribe', 'maya_unsubscribe', 'maya_daily')) = (child_id is null));
-- Only the unsubscribes have no send state and no token.
alter table public.email_log drop constraint email_log_check2;
alter table public.email_log add constraint email_log_check2
  check ((kind in ('unsubscribe', 'maya_unsubscribe')) = (status is null));
alter table public.email_log drop constraint email_log_check3;
alter table public.email_log add constraint email_log_check3
  check ((kind in ('unsubscribe', 'maya_unsubscribe')) = (unsubscribe_hash is null));
alter table public.email_log add constraint email_log_maya_day
  check ((kind = 'maya_daily') = (day is not null));

-- One daily Maya email per parent per day, and one Maya unsubscribe per parent. A second claim fails here.
create unique index email_log_one_maya_daily on public.email_log (parent_id, day) where kind = 'maya_daily';
create unique index email_log_one_maya_unsubscribe_per_parent on public.email_log (parent_id) where kind = 'maya_unsubscribe';
