-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_start_followup_reminder, 2026-10-15.
-- The second start reminder (D-102): 72 hours after a child was added with no test started, and at least 48 hours
-- after the first start reminder. Like 'start', it is about a child, not a test, and goes once per child.
-- Additive: the old kinds stay valid, and no code on main writes the new one.
alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('continue', 'come_back', 'start', 'start_followup', 'unsubscribe'));
create unique index email_log_one_start_followup_per_child on public.email_log (child_id) where kind = 'start_followup';
