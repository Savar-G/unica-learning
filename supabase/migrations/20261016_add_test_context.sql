-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_test_context, 2026-10-16.
-- The test context (#185, spec #181): the halfway break, the device and the time for each quick fact. Additive: new
-- nullable columns and checks on them only. The code on main does not read or write these columns, so it keeps
-- working before and after this change. Separate from the answer timeline columns of #184.
-- assessments.device: the device of the test, saved once (the first record wins), from the browser and checked by the
--   server (src/lib/test-context.ts): {"deviceClass", "input", "screenWidth", "screenHeight", "browser"}. Coarse classes
--   only, never the user agent string.
-- assessments.break_started_at, break_ended_at: when the halfway break was shown and when the child left it, by the
--   server's clock. break_skipped: true for "Keep going", false for "I am back from my break". Each is written once.
--   Null: no break was recorded (tests from before #185, or the break was not shown).
-- fact_answers.server_ms: the server's time on the fact, from the answer before it (or the start of the section) to
--   this answer's arrival. fact_answers.browser_ms: the browser's time on the fact, from when it appeared to Enter; it
--   leaves out the time the answer waited to be saved (#122), and the fact speed uses it. Both null for answers from
--   before #185; browser_ms is also null when the screen sent no time.
-- No grant to authenticated: a parent reads only the listed columns of their own assessments, and no fact answers.
-- Admins read every column through public.admin_assessments() (select *) and fact_answers through the admin policy.
alter table public.assessments
  add column device jsonb check (device is null or (jsonb_typeof(device) = 'object' and pg_column_size(device) < 1000)),
  add column break_started_at timestamptz,
  add column break_ended_at timestamptz,
  add column break_skipped boolean,
  -- A break ends only after it was shown, and an ended break says how it ended.
  add constraint assessments_break_end_check check (break_ended_at is null or break_started_at is not null),
  add constraint assessments_break_skipped_check check ((break_ended_at is null) = (break_skipped is null));

alter table public.fact_answers
  add column server_ms integer check (server_ms >= 0),
  add column browser_ms integer check (browser_ms >= 0);
