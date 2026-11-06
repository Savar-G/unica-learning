# Issue 664: Mixed set operation selection

HANDOFF_READY

Status: the issue 664 correction is implemented and verified locally. The full plain U16 book retains one preexisting step-coverage failure. This is not a clean release result.

## Scope and attribution

- Computer: `Savars-MacBook-Pro-5.local`.
- Supplied worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e5c1f86c`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-e5c1f86c`.
- Branch: `site/workbook-mixed-operation`.
- Required base: `f3133376535b3c96f4c81f62f1f8d1cc80322a23`.
- Initial HEAD: `550fdcf1619c0e515e8ac33e2a65869d8c937af7`, clean. The supplied worktree advanced to the required base with `git merge --ff-only origin/main` after a fetch.
- Implementation and verification: Codex `gpt-6.1-sol`, high effort, in the supplied implementation task. No child agent or other model was started.
- Commit trailer: the repository requires `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. That required trailer does not identify the model that did this work.

Read: the full issue, `mixed-issue.md`, the generator audit, `AGENTS.md`, the three assigned workflow documents, the Mixed set contract in CONTEXT, and accepted D-228, D-231 and D-233. No design change or new response schema is needed.

## Correction

The template factory now selects a code-owned story with one clear operation for a Mixed set. It keeps the selected curriculum step, template expression, sampled numbers and answer check. It rejects decimal naming, comparisons and tasks that cannot offer one truthful operation. A rounded-up division answer such as `q + 1` cannot become an addition story because its operands are not the story's printed givens. A curriculum Mixed set cannot fall back to a generic arithmetic builder.

The item uses the existing `tick-and-number` format. It contains an operation choice, an answer box and a work box. Existing template checks verify the numeric answer and the code-selected operation key. The numeric template check stays first for existing consumers of calculation metadata. The generator supplies the operation signs the level has met.

The page uses the existing two-stage Mixed set template. It no longer substitutes "Answer each question." for the required instruction. Its layout plan records two cards per row and puts their answer regions below the story. The other row, clipping, fit, fullness, workspace, Challenge, step and time checks remain active.

Quality rejects a Mixed set item with a missing operation choice, answer box or work box. It also rejects a wrong operation key, an invalid choice format or an invalid package. The check identifies Mixed set items through either the question place or the printed block.

Owned source files changed: `workbook-generator.ts`, `workbook-quality.ts`, `workbook-template.ts`, `workbook-step-items.ts`.

Focused test files changed: `workbook-generator-mixed.test.ts`, `workbook-quality.test.ts`, `workbook-step-items.test.ts`.

No change to `workbook-render.ts`, `question-package.ts`, `workbook-print-contract.ts`, AI factory/worker code or SQL.

## Falsifiers and old-source reproduction

The source claim fails if a generated Mixed set lacks operation choices, an answer box or a work box while quality accepts it. The print claim fails if Chromium finds a missing region, clipping, an incomplete row, insufficient workspace or a day at 35 minutes. A changed operation key or numeric key must fail the public package checker.

The saved first-customer sample reproduced the defect through the public template and quality interfaces: four Mixed set items, zero operation-choice fields, no operation prompt, "Answer each question." present, and `ready=true`.

Evidence: `.workbook-sample/mixed-before.ts`, `mixed-before.mjs`, `mixed-before.jsonl`.

The current generator and quality regression tests were also run against the exact base source through an ignored Vitest source-load override. No product file was reset or replaced. Both tests failed: the generator supplied `write-words` instead of `tick-and-number`, and quality returned `ready=true` for an ordinary checked story placed in a Mixed set.

Command: `npx vitest run --config .workbook-sample/vitest-old.config.mts src/lib/workbook-generator-mixed.test.ts src/lib/workbook-quality.test.ts -t 'prints each generated|ordinary step template'`.

Exit 1. Two failed tests and 27 skipped tests. Evidence: `.workbook-sample/mixed-fixed-base-red.log`, `vitest-old.config.mts`, `old-source/`.

## Local checks

All paths below are inside this worktree. Generated sample outputs and scratch files are ignored.

Fixed sample seed: `17fc5da1-2442-488a-a450-611a471e73e6`.

- `npm run workbook:fast -- --levels U16 --out .workbook-sample/mixed-fast-v2`, with the fixed seed: exit 0. U16 days 1, 5 and 10, 28 pages, 197 questions, `ready=true`, zero failed questions, fit failures, render problems or omissions. Real strict Chromium fit, QR and ink checks ran. Evidence: `mixed-fast-v2.log` and `mixed-fast-v2/`.
- The first fast check failed because the old layout plan treated the answer regions as if they sat beside the story's first line. That failure led to the template layout-plan correction. Evidence: `mixed-fast.log`. This was not waived.
- The generator regression renders two complete Mixed set cards in real Chromium through `renderWorkbook`. Each choice, answer and work region has visible measured geometry. Answer boxes are at least 48 CSS pixels high. Work boxes are at least 64 CSS pixels high.
- The four operation tests build real curriculum templates through public interfaces. Each checks its selected step and both keys. Changed operation and numeric keys fail `checkQuestionPackage`.
- Final focused command: `npx vitest run src/lib/workbook-generator-mixed.test.ts src/lib/workbook-quality.test.ts src/lib/workbook-step-items.test.ts src/lib/workbook-template.test.ts src/lib/workbook-generator-personal.test.ts`. Exit 0. Five files, 122 tests passed in 91.12 seconds. This includes the real Chromium regression and all four existing personalization tests.
- Generator/package subsystem: proves the selected public generation path, four operation keys, template step declarations, missing-region rejection and wrong-key rejection. The other generated pages pass through a fake capacity seam in that test.
- Template/render subsystem: proves the generated cards' two-stage text and real Chromium geometry. Full-book render and fullness evidence comes from the sample commands, rather than the unit-test capacity seam.
- Personalization subsystem: the existing four persona tests pass. This does not establish a real family's current profile or hosted job.
- Focused ESLint command: `npx eslint src/lib/workbook-generator.ts src/lib/workbook-step-items.ts src/lib/workbook-template.ts src/lib/workbook-quality.ts src/lib/workbook-generator-mixed.test.ts src/lib/workbook-quality.test.ts src/lib/workbook-step-items.test.ts`. Exit 0, no diagnostics. Evidence: `.workbook-sample/mixed-eslint-final.log`.
- `npx next typegen`, then `npx tsc --noEmit --incremental false`: both exit 0. Evidence: `mixed-typegen.log`, `mixed-typecheck-final.log`. An earlier type check found missing generated Next route types and two local type errors. The route types were generated and the local errors were corrected. The final result is not a build result. The controller still owns the combined build gate.

## Saved first-customer comparison

Command: `env WORKBOOK_SAMPLE_ID=17fc5da1-2442-488a-a450-611a471e73e6 node scripts/workbook-samples.mjs --fake --no-store --levels U16 --persona first-customer --days 1,5,10 --concurrency 3 --diff /Users/savargupta/unica-workbook-samples/codex-sol-high-u16-20261105 --out .workbook-sample/mixed-first-customer`.

Exit 0. The local fake book has 28 pages and 195 questions. Quality is ready. There are no failed questions, fit failures, strict render problems or omissions. No hosted draft was stored.

Read `U16-first-customer-pages.md` and `U16-first-customer-diff.md`. Visually inspected `U16-first-customer-changed.png`. Page 9 now prints two complete Mixed set cards. Each prints all four operation choices, "1 Tick the operation", "2 Write the answer", an answer box and a separate work box. The row is complete and the page keeps its review work.

Checked the printed keys directly: question 9 has 4 books in each of 2 trays, so its operation is multiplication and its answer is 8. Question 10 starts with 10,000 tickets and gives 9,470 away, so its operation is subtraction and its answer is 530.

Only pages 9 and 19 differ from the saved sample. Page 19 is the warm-up writer output from the fake client, compared with the saved real client. That difference does not prove a change to the real warm-up. No real model call was made.

The current public quality function also rejects the unchanged saved sample (`ready=false`), through `.workbook-sample/mixed-saved-after.mjs`. Evidence: `mixed-saved-after.jsonl`.

Current-source contract probe: `.workbook-sample/mixed-contract-proof.ts` and its compiled `.mjs`. It checks the saved output with the current public quality function and layout plan. It checks each selected Mixed set template against the current curriculum template, checks both printed instructions, recomputes the arithmetic from the stored givens, compares the operation and numeric keys, and requires the work region and a complete row. The first-customer probe exits 0 with two Mixed set items, one multiplication and one subtraction, no quality issues, and a maximum day estimate of 30.3 minutes. Evidence: `mixed-first-customer-proof.jsonl`.

## Full fake books: all ten days

Baseline command: `env WORKBOOK_SAMPLE_ID=17fc5da1-2442-488a-a450-611a471e73e6 node scripts/workbook-samples.mjs --fake --no-store --levels U4,U16 --concurrency 3 --out .workbook-sample/mixed-baseline`.

Corrected command: `env WORKBOOK_SAMPLE_ID=17fc5da1-2442-488a-a450-611a471e73e6 node scripts/workbook-samples.mjs --fake --no-store --levels U4,U16 --concurrency 3 --diff .workbook-sample/mixed-baseline --out .workbook-sample/mixed-full`.

Both commands exit 0. The full-output CLI does not make a quality failure a nonzero command exit. Read the quality result separately.

| Book | Pages | Questions | Failed questions | Strict render problems | Omissions | Quality | Maximum day minutes |
|---|---:|---:|---:|---:|---:|---|---:|
| Baseline U4 | 84 | 627 | 0 | 0 | 0 | ready | 32.2 |
| Corrected U4 | 84 | 627 | 0 | 0 | 0 | ready | 32.2 |
| Baseline U16 | 84 | 605 | 0 | 0 | 0 | not ready: page 22 | 31.2 |
| Corrected U16 | 84 | 591 | 0 | 0 | 0 | not ready: page 22 | 30.9 |

Both books include days 1 through 10. U4 has zero changed pages in the page manifest. U16 has 26 changed pages, including all eight Mixed set pages. No Challenge page changed. The new work boxes take room. The measured capacity loop selects two Mixed set cards on each ordinary day and adjusts other practice and review selections. Friday 5 remains on days 5 and 10.

Read the Mixed set text and keys in the text dumps and the diff. Inspected the full U16 changed-pages sheet in seven readable local crops (`changed-part-0.png` through `changed-part-6.png`). The Mixed set cards have visible operation choices, answer boxes, separate work boxes and complete two-card rows. The existing failed page 22 has the failure banner in both versions.

The final public contract probe exits 0 on both full books. It finds zero Mixed set items in U4 and 16 in U16, with two on each of days 1, 2, 3, 4, 6, 7, 8 and 9. All 16 current template selections, operation keys, arithmetic keys, required fields and rows pass the probe. Evidence: `.workbook-sample/mixed-full-proof.jsonl`. The printed number pairs and keys were also read directly: 2x3=6, 7x5=35, 4x4=16, 40x2=80, 6x9=54, 2x6=12, 3x3=9, 7x6=42, 6x6=36, 4x6=24, 30x3=90, 7x3=21, 9x8=72, 5x4=20, 20x3=60 and 7x4=28.

Two limits need controller review:

1. The full plain U16 baseline and corrected book have the same sole quality issue: page 22 practises its own step in 2 of 6 practice questions and needs 3. The quality issue arrays are identical. The generator stores that whole-book failure as one failed page. This is separate from the strict renderer, which reports zero render problems. This lane did not change that requirement or fix the separate practice-page defect.
2. The plain U16 plan selected multiplication for all 16 compatible Mixed set stories. The first-customer plan selected multiplication and subtraction. All four signs print on every card. This correction preserves the plan's permitted steps. It does not add a new rule to balance operation kinds or widen the plan's review scope. Do not report operation variety as proved for the plain U16 book.

Corrected full-run wall time: about 4.0 minutes for U4 and 7.7 minutes for U16. U16 made 1,013 physical fit prints, compared with 748 in the baseline. These are local measurements on a shared Mac. No speed claim is made. No real model request or API fallback occurred.

Evidence: `.workbook-sample/mixed-baseline.log`, `mixed-baseline/`, `mixed-full.log`, `mixed-full/`, and `mixed-full-proof.jsonl`.

## Remaining proof and limits

The controller owns the combined full gate, independent review, final real Unify subscription U4/U16 replay pair, push, PR and merge. This child makes a local commit only.

Fake generation and the key solver do not prove independent real-model answer correctness or real wording. Chromium proves the selected local rendering path. It does not prove hosted operation, printer output, scan marking, sample approval or a live customer book.

No paid API, real model sample, live worker setting change, service restart, claimed family job, customer-book generation or hosted write occurred. The shared checkout and reports outside this worktree were read-only. Issues 479, 480 and 611 remain outside this correction.

## Controller correction after Sol round 1

Sol reported S1, P1: an operation inferred from the answer expression can differ from the operation on the story's complete printed quantities. A fraction denominator produced multiplication instead of division. A negative temperature magnitude produced subtraction instead of addition.

The controller confirmed the finding and excluded those templates from Mixed sets. A printed operand must be a complete quantity, rather than a signed magnitude, fraction component or joined digit fragment. Whole-book quality also checks the canonical story template, so a legacy package with the unsafe key is rejected.

Four public-interface regressions fail against the exact reviewed commit `b4d6c2e76cfed12ded169850c6e02523610032ba`: two template-selection controls and two legacy-package quality controls. Both affected suites pass with the correction, 51 tests. The original addition, subtraction, multiplication and division controls pass. The five-file regression passed, 126 tests, including the strict Chromium case. Scoped lint and whitespace checks passed. The strict fake sample is being checked before re-review.

The first negative-temperature test fixture did not select its intended template. The controller corrected the fixture's attempt selection before the exact-old comparison. An initial guard also rejected valid spaced unit placeholders; preserving whitespace at token boundaries corrected it. Neither intermediate state is the delivery candidate.

Sol found no requirement to balance operation counts in the plain U16 book. Its 16 multiplication items retain permitted review skills. The mastery-step compatibility check adds no review scope. The unchanged page 22 coverage failure remains a separate full-book limit.

The controller's strict fake U16 check after the correction exited 0: 28 pages, 197 questions, ready=true, zero failed questions, fit failures, render problems or omissions. It used the fixed sample seed and days 1,5,10. All 54 fake solve checks passed. Evidence: `.workbook-sample/root-s1-fast/` and the controller's `664-s1-fast.log`. This is a selected-day fake check, not the full-book or real-provider acceptance result.

S1 needs re-review before publication. No clean release result is claimed.
