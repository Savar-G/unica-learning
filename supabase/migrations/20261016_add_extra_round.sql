-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_extra_round, 2026-10-16.
-- The optional extra round (#190, spec #181). After the last main question, when an area's result is an early sign,
-- the child can take up to 8 more questions or skip them; a skipped round is offered again on the report while the
-- test is the child's latest. Additive: new nullable columns, and one column with a default that marks every existing
-- answer as a main answer. The code on main does not read or write these columns, so it keeps working before and after
-- this change.
-- assessments.extra_offered_at: when the server first offered the round (the step after the last main question).
-- assessments.extra_skipped_at: when the child skipped it during the test.
-- assessments.extra_started_at: when the child took it, during the test or from the report. The round's questions go
--   into `test` (test->'extra') in the same update.
-- assessments.extra_finished_at: when the round was finished: with the test's completion (a round taken during the
--   test), or later, when a round taken from the report was finished and the placement was scored again.
-- answers.round: 'extra' for an answer to the extra round, else 'main'. The answer's place in the test (position)
--   goes on after the main test, so the unique (assessment_id, position) still keeps one answer per question.
-- Each time is written once, by an update guarded in the update itself (src/lib/test-attempt-server.ts). No grant to
-- authenticated: parents never read them; admins read them through public.admin_assessments() (select *) and the
-- admin answers policy. The family write fence already covers both tables.
alter table public.assessments
  add column extra_offered_at timestamptz,
  add column extra_skipped_at timestamptz,
  add column extra_started_at timestamptz,
  add column extra_finished_at timestamptz,
  -- A round finishes only after it started.
  add constraint assessments_extra_finish_check check (extra_finished_at is null or extra_started_at is not null);

alter table public.answers
  add column round text not null default 'main' check (round in ('main', 'extra'));
