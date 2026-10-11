-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_report_unsubscribe, 2026-10-11.
-- CASL for the report email (#80): it offers a plan, so it carries an unsubscribe link. The background job
-- (src/lib/report-job.ts) makes a new random token for each send and keeps only its SHA-256 hash here, in the same
-- write that claims the email. The unsubscribe page and route (src/lib/reminder-store.ts) look a token up in
-- public.email_log first, then here; both stop the same thing for the parent: reminders and emails about our plans
-- (one 'unsubscribe' row in email_log). The report itself stays in the parent's account.
-- Additive: code on main does not read the column. Parents cannot read it: their select grant lists its columns.
alter table public.reports
  add column unsubscribe_hash text unique check (unsubscribe_hash ~ '^[0-9a-f]{64}$');
