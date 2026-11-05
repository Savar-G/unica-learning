# Workbook teaching data, issue 525

Base: `9b5c35f5` from `origin/main`. Branch: `site/wb-maya-operations`.
Seed: `17fc5da1-2442-488a-a450-611a471e73e6`.

The generator adds teaching data after selection, fit and book checks. The page editor calls the same checked attachment function before its number-preservation check. It compares the original printed data when it checks preservation. The module reads the checked template source. It does not infer an operation from the printed words or search for an operation with the same answer. Existing operations stay intact. The template's answer regions stay intact. The package checker must accept the operation, answer, steps, wrong answer and smaller example together. Otherwise the module returns the original package.

The `operationSource: "maya"` flag identifies the added data. The renderer, book quality check, scheduled number check and task identity use the original print data for these packages. Panel examples stay unchanged. The package checker and Maya use the added teaching data. Maya's controller and its accepted kinds do not change.

## Seeded fake sample

These counts cover days 1, 5 and 10 on this base. They do not describe the earlier real drafts in issue 525, which had 204 U4 questions and 231 U16 questions.

| Level | Questions | Operations before | Operations after | Maya accepts before | Maya accepts after |
|---|---:|---:|---:|---:|---:|
| U4 | 196 | 0 | 91 | 0 | 83 |
| U16 | 223 | 43 | 102 | 43 | 92 |

The count of questions with an operation differs from the count Maya accepts. Maya still holds operation kinds or worked steps she cannot teach. Non-arithmetic questions and unsupported template expressions stay without a new operation. Targets with no valid smaller example also stay unchanged.

Local evidence:

- `/tmp/ui-review/525-before`: seeded fake baseline with strict physical fit and full print output.
- `/tmp/ui-review/525-complete`: final code, strict physical fit and full print output with `--diff /tmp/ui-review/525-before`. Both page manifests, both measurements files and both printed Markdown bodies are byte-identical to the baseline. Both page diffs and changed-page sheets show zero changed pages. Each book has 28 pages, zero failed questions, failed pages, render problems and omissions.
- The coverage table is additional report content. Thus the complete new Markdown report differs from the old report by that table. The printed-page body stays identical.

The report code adds coverage to both `<label>-pages.md` and `index.md`. The count includes failed questions and absent packages in its denominator. It calls the public `createSession` for every question. It counts question kinds from the template format, or the item format when no template format exists.

## Subscription replay

The final real U4 and U16 pair ran in parallel, once, with `--subscription-only --no-store --days 1,5,10 --concurrency 3 --replay --diff`.

- U4: `/tmp/ui-review/525-real-u4`, zero new calls and zero replayed calls. Code supplied all questions.
- U16: `/tmp/ui-review/525-real-u16`, 47 replayed calls, zero new calls. This includes 42 solver calls.
- Both samples passed the book check and strict print check. Both had zero failed questions, failed pages, render problems and omissions.
- Both reports contain a coverage table. No live family rows or files changed. No paid API ran.

These samples use made-up learner profiles. They do not prove a live customer's book, a model conversation, voice operation, hosted operation or approval of a sample.

## Tests

The public generator test covers all ten days of U3, U4 and U16. These levels cover the parent, early and mid print bands. The snapshots fix the question, operation and `createSession` acceptance counts for every kind. The existing U3 fake writer leaves one failed question. The snapshot includes it in the denominator. U4 and U16 have no failed questions in this fixture.

Each attached package must pass `checkQuestionPackage`. The solver input and key must equal those of the original package. The printed HTML, text and book quality must also equal the original. Unit cases cover subtraction stories, number bonds, decimal and fraction arithmetic, multiple arithmetic steps, altered keys, invalid source ranges, unsupported expressions and non-arithmetic tasks.

| Full seeded book | Questions | With operation | Maya accepts |
|---|---:|---:|---:|
| U3 | 419 | 91 | 85 |
| U4 | 535 | 179 | 158 |
| U16 | 595 | 297 | 260 |

The test uses an in-memory fit seam to fix generator coverage. The separate strict samples provide physical print evidence.


Public edit regressions cover an edit that preserves the checked operation and an edit that changes the maths. The latter gets a fresh operation matching its new item key, or no operation. Both new edit tests and both existing consistency cases pass.

## G1 integration

`G1_MERGE_PENDING`: integrate the final attachment call and the edit attachment hunk in `workbook-generator.ts` after `site/wb-personal-items`. Both use the same module. The edit hunk runs before number preservation and compares printed data. Replace this marker with `G1_MERGE_DONE` after integration. `workbook-book.ts` and `workbook-generator-items.ts` have no changes.

## Gate

The initial unfiltered `npm test` run used `VITEST_MAX_WORKERS=2`. It reported 307 passed files and 11 failed files out of 318, with 13,929 passed tests and 25 failed tests. There were 21 timeouts during high host load and four assertion failures. The assertion failures identified the edit, panel, task-identity and zero-example cases. Those cases have fixes and public regressions. The isolated reruns use one file at a time and a 300-second harness timeout. Functional assertions do not change. `/tmp/525-reruns.tsv` records each exit code and log.

The final `npx eslint src` and `RAYON_NUM_THREADS=2 npm run build` both passed. The build includes TypeScript checking and all 113 static pages. Maya's controller, prompt and model configuration do not change, so no paid Maya practice run is required.

Final isolated reruns: all 11 files passed. This includes all 13 teaching-data tests, all 82 consistency tests, the four U4 refill controls, all 140 generator tests and all 38 job tests. The final seeded fake pair also passed on the final code.
