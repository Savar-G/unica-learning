# Workbook consistency: physical review repair

This is the checkpoint before Cedric's final step-template integration. It
fixes the physical U4 refusal and retains the existing writer for skills that
have no code builder. No real-model sample was made for this repair.

## Fake review results

| Check | U4 | U14 |
|---|---|---|
| Day pages / PDF pages | 40 / 44 | 80 / 84 |
| Questions | 154 | 517 |
| Failed questions / pages | 0 / 0 | 0 / 0 |
| Questions dropped after writing | 0 | 0 |
| Strict render problems | 0 | 0 |
| Measured vertical use, min / mean | 80.9% / 92.6% | 80.4% / 93.4% |
| Estimated longest day | 22.0 minutes | 25.4 minutes |
| Subscription / API calls | 0 / 0 | 0 / 0 |
| Technical checks | PASS | PASS |
| Approval | HOLD, fake | HOLD, fake |

Reports:
`/tmp/ui-review/samples-480-fake-u4/index.md` and
`/tmp/ui-review/samples-480-fake-u14/index.md`.

The pinned main U14 comparison is
`12b891c98e1096bc0196ca28250dde14e85c3780`. Its fake review has 84 PDF pages,
780 questions, 73 failed questions, no failed pages and no strict render
problems. The current run has fewer questions because it takes the current
template capacity before writing. It has no failed items, missing coverage,
post-write omissions or render errors. This is a comparison of fake code and
layout checks. It does not establish real-model teaching quality.

## What changed

- Stories carry a line and character budget. Code picks a compact candidate
  before fitting. Writer output must meet the same budget.
- Required story blocks stay. A long fixed story no longer makes the capacity
  pass remove unrelated review items before it refuses the book.
- Likelihood reminders use a full-width paragraph. They do not repeat the
  definition in a narrow side column.
- Each supported U4 Challenge page has two hard stories. Their work spaces
  share the page. Early stories need two operations; later stories need three.
- Choice strips can wrap inside a narrow card. Two-story U4 pages have more
  writing room. Warm-up space goes to the facts rather than unused space in
  the In your head block.
- Missing builders keep the existing writer and current daily checks. Saved
  routing remains binding during edits and recovery. U4 alone is fully covered
  by the current hand-built list. See `workbook-builder-coverage.md`.
- The index separates technical checks from approval. A generation refusal
  returns a nonzero exit. Fake books always keep the approval hold.

## Verification

`workbook-review-run.test.ts` runs the complete selected-day U4 command with
real Chromium, fit and fullness checks. It requires a 44-page PDF with 40 day
pages, zero failed items and pages, zero omissions and passing quality.
The earlier isolated Friday tests remain.

The final gates passed: 283 files and 12,569 tests; ESLint; production build,
including TypeScript. All commands exited 0. The earlier run of the new full
review test caught the 79.8 percent page-use failure before the writing area
was corrected. The final run passed.

Time values are estimates. No child was timed. The fake solver reads the key.
The subscription and an independent real model were not run. Nothing was
printed, shipped or written to a real family. Savar must still approve the
bank and the next authorised real sample. Issue #480 stays open.

## Earlier review records

### Earlier U4 consistency review

The sample below was rejected. Its results apply only to the earlier content
candidate. It does not validate the current code. No new review sample has
been generated after the review request.

## Review fixes

The branch includes #481 through
`ab6c75a1d6091428014a98bbe2798966ed39e7c9`.

| Review requirement | Current check | Proof limit |
|---|---|---|
| Capacity and required parts | A saved measured budget precedes writing. Friday 5 keeps five items. The book rejects missing coverage and omissions. | Two Friday pages pass the real Chromium template check. |
| Repeated stories and variety | Task comparison removes names, objects and quantities. Page and book type limits apply. | Tests cover changed names, failed duplicate items and type excesses. |
| Harder Challenge | Code uses the day's upper limit and more operation steps than practice. Later count-on challenges have three steps. | The supported Challenge is the U4 count-on task. Other unimplemented skills fail closed. |
| Skill semantics | Doubles, near-doubles, fixed benchmarks, decimal places and the other retained builders have checks. | Public tests cover all 65 retained IDs. Six earlier mappings now fail closed. |
| Edits retain policy | Saved contracts and examples remain in edits. Drills stay in code. | Generate-then-edit tests reject changed operands and types. |
| Typed coin givens | AI parsing cannot add or widen the code-declared list. | The daily guard still rejects a second matching amount. The approved pipeline has no money builder. |
| Cover | Every level has a code title. U4 says Counting and adding to 20. | Tests check complete title lines for all 30 levels and the U4 learning list. |
| Explain how | The item refers to the first story on its own page. | The book requires a sound story there. New names or numbers fail the contract. |

The ten-day U4 unit fixture has no failed questions, no book quality issues
and no dropped questions. This uses a fake writer and fit seam. It proves
these code rules. It does not prove real-model copy, full-book physical fit,
page fullness or Savar's approval.

Current code gates passed:

- `npm test`: 282 files, 12,565 tests, exit 0.
- `npx eslint src`: exit 0.
- `npm run build`: exit 0, including TypeScript.

The earlier merged-head run had one Chromium launch failure. The file passed
on its separate run. The final full run above passed without a rerun.

The candidate example bank is in
[`workbook-example-bank-480.md`](workbook-example-bank-480.md).
Savar must approve that bank and a later authorised sample before merge.
Issue #480 stays open.

## Rejected sample record

The single subscription sample is in `/tmp/ui-review/samples-480`.

- Content candidate: `f5088397de5e23be1e735cf1098834cd04b467c2`.
- Merged #481 candidate: `643e49dc9f338b5f5edee9faf97fbda7c650a96a`.
- Review days: 1, 3, 5, 8, 10. Each has 8 practice pages.
- PDF pages: 44, including the cover, plan and binding blanks.
- Questions: 179. Failed: 1, or 0.56%.
- Parent-checked items: 60.
- Overflow and strict render errors: 0.
- Vertical page use: minimum 80.4%, mean 93.8%.
- Estimated day minutes: 19.9, 21.3, 19.8, 19.3, 21.3.
- Calls: 30 on the subscription, 0 on the API. API cost: USD 0.00.
- Independent solve checks: 16. Each agreed with the key.
- Room omissions: 112 during layout selection and 35 after fitting, 147 total.

The index records one repeated ten-frame task at p41 q8. It remains marked failed
in the PDF. Review every omission before approval. A low failure rate does not
prove that every planned part is present. The sample and the example bank need
Savar's approval. Issue #480 stays open.

The command used the Claude configuration directory
`/Users/savargupta/.claude_second`. It removed `OPENROUTER_API_KEY`,
`OPENROUTER_API_KEY_FILE` and `ANTHROPIC_API_KEY`. The options were
`--levels U4 --days 1,3,5,8,10 --subscription-only --no-store --concurrency 4`.
No other level was generated. There were no family, database, shipment or print
order writes. The report labels were then clarified to separate layout omissions
from fit omissions. No question or model answer changed during that report edit.

## Checks and their limits

- Item tests prove that code drills make no writer, solver or attempt-ledger
  request. They reject changed formats, operations and story numbers. They also
  prove that a checkpoint failure does not repeat a writer request.
- The book tests exercise negative cases for repeats, progression, format
  variety, day time and measured fullness. They check these mechanical rules.
  They do not replace a review of teaching quality or challenge difficulty.
- `npm test` passed: 278 files, 12,442 tests, exit 0.
- `npx eslint src` and `npm run build` passed, exit 0.
- The generated contact sheet and page images were inspected. The local dev
  server served the likelihood page image. The browser confirmed a complete
  1275 by 1650 PNG. Browser screenshot capture timed out. The rendered PNGs
  supplied the visual check.

The earlier type list covered 71 exact skill IDs. Other skills fail closed. This review
does not establish content support for every BC skill or any other level.
