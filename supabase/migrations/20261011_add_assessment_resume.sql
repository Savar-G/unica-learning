-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_assessment_resume, 2026-10-11.
-- Stop, resume and retake (#72, D-083). Additive: the code on main does not read these columns, and the default
-- gives every new row a resume deadline, so it keeps working before and after this change.
-- last_answer_at: when the server stored the last answer (null before the first). The 1-hour "continue your test"
--   reminder (#73) counts from it.
-- resume_until: the last moment the test can continue: 24 hours after the child last worked on it (the start, an
--   answer, or opening it again). After it an in_progress test has expired, even before the server marks it 'expired';
--   the "come back" reminder (#73) counts from it. The app server writes both, from its own clock.
-- No backfill: the rows from before this change (development tests only) keep last_answer_at null and get a resume
-- deadline 24 hours after this migration ran.
alter table public.assessments
  add column last_answer_at timestamptz,
  add column resume_until timestamptz not null default (now() + interval '24 hours');

-- Open tests by deadline, for the expiry check and the reminder job (#73).
create index assessments_open_resume_until_idx on public.assessments (resume_until) where status = 'in_progress';

-- The account pages read these with the parent's own session (the start screen says until when a test can continue).
grant select (last_answer_at, resume_until) on table public.assessments to authenticated;
