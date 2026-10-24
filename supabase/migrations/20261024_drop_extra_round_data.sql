-- D-145, last step (2026-10-24, Savar approved): the removed extra round's data and columns go. No code reads them
-- since PR #273. Two finished tests held the round: 16 answers and 16 serves with question ids "x-0" to "x-7", no work
-- files, no AI reviews. Their stored test, placement and report model lose the round's part. The stored learner
-- profiles of those two tests are left as they are: every read leaves the round out (fromRemovedRound).
delete from public.question_shows where left(question_id, 2) = 'x-';
delete from public.work_reviews where left(question_id, 2) = 'x-';
delete from public.answers where left(question_id, 2) = 'x-';
update public.assessments set test = test - 'extra' where test ? 'extra';
update public.assessments set placement = placement - 'extraRound' where placement ? 'extraRound';
update public.reports set model = model - 'extraRound' where model ? 'extraRound';

alter table public.assessments
  drop constraint assessments_extra_finish_check,
  drop column extra_offered_at,
  drop column extra_skipped_at,
  drop column extra_started_at,
  drop column extra_finished_at;
alter table public.answers drop column round;
