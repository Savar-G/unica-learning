# Assessment block verification

Date: 2026-11-05. Worktree: `.claude/worktrees/assessment-blocks`. Branch: `site/assessment-blocks`.

## Public interfaces

`npm test -- --maxWorkers=2`:

```
 Test Files  400 passed (400)
      Tests  15920 passed | 1 skipped (15921)
   Duration  648.15s (transform 15.49s, setup 0ms, import 89.81s, tests 1168.37s, environment 2.21s)
```

The new core cases run a saved JSON round trip after each action. They cover ten school grades, four curriculum settings, six scripted ability levels and three seeds. The extra cases check early movement, explicit unknown responses, rushing exclusion and withholding an unsupported placement. They are synthetic children, not evidence of real placement accuracy.

The attempt tests prove review recovery, lost-response retries, concurrent lock presses, a change racing with a lock, a failed lock write and refusal for another family or an unfinished test. Existing staged-test checks also pass. These local tests use the memory store.

## Database

Migration `assessment_blocks` is applied as `20261105205813`. The migration registry contains it. Hosted privilege checks show `security invoker`, an empty search path, no execute privilege for anon or authenticated, and execute privilege for service_role. A missing test returns `closed`.

The local PGlite probe loads the migration and checks changed-answer rejection, one lock commit, stale-lock retry, locked-answer refusal, admin progress fields and grants. It does not establish hosted concurrent locks.

The separate hosted probe used a marked test family and two simultaneous RPC requests for one six-answer review. Its results were one `stored` and one `changed`. The persisted test had exactly one locked block and one next block. Five unknown answers plus one corrected answer selected Grade 3 from Grade 4. No report job ran.

## Browser

Aside, account u0, local Next development server, real session for a marked test family. No production family was used.

- The unknown button was absent on initial display and appeared after its delay. It enabled Next on both choice and number questions.
- Six answers opened a six-question review. Pause and return preserved that review. Reopening the first question preserved its unknown response. Changing it saved the new choice and returned to review.
- The persisted down fixture had six answers: one right and five unknown. The browser continued at Question 7 with Grade 3 work and no access to the locked part.
- The persisted up fixture had six right answers and zero unknown responses. The browser continued at Question 7 with Grade 5 work.
- Desktop and portrait tablet screenshots were inspected. The added buttons were grouped after an initial layout defect. At 768 by 1024, the controls did not overlap Next and the document had no horizontal overflow.

Both QA tabs were closed. No report email, paid model call or workbook generation ran. Browser proof covers the first routing decision, review and resume. The full completion paths and grade ranges are covered by the core and attempt tests.

`npx eslint src` and `npx tsc --noEmit` passed. The production build passed on the fixed candidate. The independent review approved it in round 2, with S1, S2 and S3 resolved.

## Review fixes

The independent reviewer found S1, S2 and S3 in `review-ledger.md`. All three were reproduced with failing public-interface checks before the source fixes. The corrected regressions pass together: four files, 298 tests. This includes refusal to finish when an area's only answers were excluded as rushed, all pool rows and selected positions in the export, and unknown responses plus their change history in deletion copies.

The full 400-file run above preceded the rebase to `97c96c22d52dc94b3c05e01968a79eb8f922abd7`. The assessment, attempt, report and placement checks then passed on that base: 54 files and 5674 tests. The review fixes have the additional 298-test run. The final PR checks establish the result on the pushed head.
