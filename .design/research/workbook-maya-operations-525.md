# Workbook teaching data, issue 525

Base: `9b5c35f5` from `origin/main`. Branch: `site/wb-maya-operations`.
Seed: `17fc5da1-2442-488a-a450-611a471e73e6`.

The generator adds teaching data after selection, fit and book checks. The page editor calls the same checked attachment function before its number-preservation check. It compares the original printed data when it checks preservation. The module parses the printed relationship and the position of its unknown. It uses the checked template source only to verify the answer key. It never follows a derived answer construction as a teaching method. Existing operations stay intact. The template's answer regions stay intact. The package checker must accept the operation, answer, steps, wrong answer and smaller example together. Otherwise the module returns the original package.

The `operationSource: "maya"` flag identifies the added data. The renderer, book quality check, scheduled number check and task identity use the original print data for these packages. Panel examples stay unchanged. The package checker and Maya use the added teaching data. Maya's controller and its accepted kinds do not change.

## Seeded fake sample

These counts cover days 1, 5 and 10 on this base. They do not describe the earlier real drafts in issue 525, which had 204 U4 questions and 231 U16 questions.

| Level | Questions | Operations before | Operations after | Maya accepts before | Maya accepts after |
|---|---:|---:|---:|---:|---:|
| U4 | 196 | 0 | 64 | 0 | 56 |
| U16 | 223 | 43 | 115 | 43 | 101 |

The count of questions with an operation differs from the count Maya accepts. Maya still holds operation kinds or worked steps she cannot teach. Non-arithmetic questions and unsupported template expressions stay without a new operation. Targets with no valid smaller example also stay unchanged.

Local evidence:

- `/tmp/ui-review/525-before`: seeded fake baseline with strict physical fit and full print output.
- `/tmp/ui-review/580-printed-fake`: final code, strict physical fit and full print output with `--diff /tmp/ui-review/525-complete`. Both page manifests, both measurements files and both printed Markdown bodies are byte-identical to the baseline. Both page diffs and changed-page sheets show zero changed pages. Each book has 28 pages, zero failed questions, failed pages, render problems and omissions.
- The coverage table is additional report content. Thus the complete new Markdown report differs from the old report by that table. The printed-page body stays identical.

The report code adds coverage to both `<label>-pages.md` and `index.md`. The count includes failed questions and absent packages in its denominator. It calls the public `createSession` for every question. It counts question kinds from the template format, or the item format when no template format exists.

## Subscription replay

The final real U4 and U16 pair ran in parallel, once, with `--subscription-only --no-store --days 1,5,10 --concurrency 3 --replay --diff`.

- U4: `/tmp/ui-review/580-real-u4`, zero new calls and zero replayed calls. Code supplied all questions.
- U16: `/tmp/ui-review/580-real-u16`, 47 replayed calls, zero new calls. This includes 42 solver calls.
- Both samples passed the book check and strict print check. Both had zero failed questions, failed pages, render problems and omissions.
- Both reports contain a coverage table. No live family rows or files changed. No paid API ran.

These samples use made-up learner profiles. They do not prove a live customer's book, a model conversation, voice operation, hosted operation or approval of a sample.

## Tests

The public generator test covers all ten days of U3, U4 and U16. These levels cover the parent, early and mid print bands. The snapshots fix the question, operation and `createSession` acceptance counts for every kind. The existing U3 fake writer leaves one failed question. The snapshot includes it in the denominator. U4 and U16 have no failed questions in this fixture.

Each attached package must pass `checkQuestionPackage`. The solver input and key must equal those of the original package. The printed HTML, text and book quality must also equal the original. Unit cases cover subtraction stories, number bonds, decimal and fraction arithmetic, multiple arithmetic steps, altered keys, invalid source ranges, unsupported expressions and non-arithmetic tasks.

| Full seeded book | Questions | With operation | Maya accepts |
|---|---:|---:|---:|
| U3 | 419 | 45 | 39 |
| U4 | 535 | 114 | 93 |
| U16 | 595 | 313 | 289 |

The test uses an in-memory fit seam to fix generator coverage. The separate strict samples provide physical print evidence.


Public edit regressions cover an edit that preserves the checked operation and an edit that changes the maths. The latter gets a fresh operation matching its new item key, or no operation. Both new edit tests and both existing consistency cases pass.

## G1 integration

`G1_MERGE_PENDING`: integrate the final attachment call and the edit attachment hunk in `workbook-generator.ts` after `site/wb-personal-items`. Both use the same module. The edit hunk runs before number preservation and compares printed data. Replace this marker with `G1_MERGE_DONE` after integration. `workbook-book.ts` and `workbook-generator-items.ts` have no changes.

## P0 correction after review

Reviewed head: `72380a74ddde85a74749066cca2fd42963a95b9b`. Review: `/tmp/pr580-review-report.md`.

The prior resolver followed answer construction expressions. Five printed missing factors instead need the product divided by the known factor. Result equality did not establish the method. The replacement resolver has no access to source bindings. It reads only the printed text. The template source verifies the key after the method is derived.

The parser supports closed numeric equations, inverse operations at an unknown, number bonds and closed story forms with named quantity roles. It retains the printed expression for multi-step arithmetic. Unsupported text gets no operation. An additional check requires each target operand, or each literal in a multi-step expression, to be a printed number. Existing teaching metadata is rechecked by the same rule. Original builder operations stay intact.

The exact five missing-factor regressions run the public fake generation CLI with strict physical fit, then call public `createSession`, start and fallback interfaces. They assert `6000 / 20`, `2000 / 20`, `2000 / 50`, `8000 / 20` and `5000 / 50`, with the original page and question numbers. Every new attachment in the generated U3, U4 and U16 books must use printed operands. Unit regressions cover every binary inverse position, an equal-key hidden method whose operands are visible, unsupported forms, hidden constants, expanded forms and stale teaching metadata.

Compared with the reviewed head, selected U4 operation/acceptance counts change from 91/83 to 64/56. Questions such as "What comes next?" imply an unprinted 1 and are held. Selected U16 counts change from 102/92 to 115/101 because more printed inverse relationships can be checked. No answer key or printed page changes.

## Template audit

The audit covers every imported and house template: 8,239 definitions and 8,277 wording variants. It includes all 3,372 templates whose answer references a derived binding, with 3,382 wording variants, and all 793 direct answer-alias variants. Each variant uses seeds 525, 580 and 11580 through the public template filler, package builder, attachment and session interfaces.

All 24,831 fills were admitted. Of these, 2,342 attach an operation and 22,489 are held. Every attachment matches its key, passes the package checker and uses printed target operands. The derived-answer subset has 1,101 attachments and 9,045 holds. All three missing-factor steps and the multi-step house variants were audited. Simple supported forms use division; compound forms retain the printed numbers in an inverse expression; unsupported forms are held. No answer alias is resolved to its construction formula.

Audit source: `.workbook-sample/580-derived-audit.ts`. Bundled command: `node .workbook-sample/580-derived-audit.cjs`. Local full ledger: `/tmp/580-derived-audit.json`. Summary: `/tmp/580-final-audit.log`. These artifacts are local. The committed generated-book and operand tests provide the continuing regression checks.

## Gate

The unfiltered `VITEST_MAX_WORKERS=2 npm test` ran once. It reported 316 passing files and three files with seven timeout cases: 13,962 passing tests out of 13,969. There were no assertion failures. Each timeout file then ran alone with `VITEST_MAX_WORKERS=1`, with no timeout override:

- `maya-text-log.test.ts`: 45 passed, including all three timed-out seed groups. Log: `/tmp/580-rerun-maya.log`.
- `workbook-consistency-review.test.ts`: 82 passed. Log: `/tmp/580-rerun-consistency.log`.
- `workbook-job.test.ts`: 38 passed. Log: `/tmp/580-rerun-job.log`.
- `npx eslint src`: passed with no output. Log: `/tmp/580-eslint.log`.
- `RAYON_NUM_THREADS=2 npm run build`: passed, including TypeScript. Log: `/tmp/580-build.log`.

Gate result: passed after the required isolated timeout reruns. No existing timeout limit changed. The original full-run log is `/tmp/580-test.log`. The full run also passed the new exact-five generated-book regression and the generated operand checks. The final coverage recount calls `createSession` for both saved samples and every question kind: `/tmp/580-final-coverage.jsonl`.

The template audit proves key equality and printed operand provenance for the supported forms. The fake generated-book test proves the five inverse operations through the public generation and session interfaces. The strict print samples prove local text, layout and measurement preservation. The tests do not prove hosted storage or a model conversation. No paid API, live family write or Maya controller change is part of this correction.
