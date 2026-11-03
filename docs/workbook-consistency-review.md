# Workbook consistency: third review repair

This checkpoint fixes the eight findings against `b1a4348`. It precedes the
step-template integration. No real-model sample was made. Issue #480 stays
open. Savar must approve the example bank and the next authorised real sample.

## Evidence

| Level | Day / PDF pages | Questions | Failed items / pages | Omissions | Render errors | Extra pages | Largest gap | Longest estimated day | Subscription / API | Technical / approval |
|---|---|---|---|---|---|---|---|---|---|
| U4 | 40 / 44 | 314 | 0 / 0 | 0 | 0 | 2 | 52.0 px | 29.9 min | 0 / 0 | PASS / HOLD |
| U14 | 80 / 84 | 590 | 0 / 0 | 0 | 0 | 2 | 60.0 px | 28.6 min | 0 / 0 | PASS / HOLD |

Reports: `/tmp/ui-review/samples-480-third-u4/index.md` and
`/tmp/ui-review/samples-480-third-u14/index.md`.

Occupied fractions (empty gaps excluded): U4 56.8% / 83.6%; U14 54.3% / 81.7%.
At the page maximum, the filling rule permits bounded even spacing.

Final gates: 283 files and 12,574 tests passed, with no test filters.
`VITEST_MAX_WORKERS=4` limits worker count. ESLint and the production build
passed. Every command exited 0.

The controls use the complete real Chromium templates and page measurements.
The U4 regression requires a real 44-page PDF, 40 day pages, two extra practice
pages, no failed questions or pages, no omissions and passing book checks.
The fake no-store command uses repeatable test QR tokens. Stored and real-model
runs keep random tokens. Every QR is still read from the actual page image.

The U14 main control is pinned at
`12b891c98e1096bc0196ca28250dde14e85c3780`: 84 PDF pages, 780 questions,
73 failed questions, no failed pages and no strict render errors. This is a
comparison of fake pipeline and layout checks. The new page budget changes
the question count. It does not prove real-model curriculum fidelity.

Fresh public-interface fallback controls use 70 questions, including 43 on
the existing path. The valid control has zero failed questions. Injected
unknown skills, excessive values, wrong formats, repeats, solver disagreement
and writer failure produce 45, 45, 9, 43, 44 and 45 failed questions. These
controls keep their mathematical and failure checks. Their fit seam passes;
the physical book runs provide the separate layout proof.

## Third-review requirements

| Requirement | Implemented check |
|---|---|
| Checked teaching panels survive repair | Pages keep their checked panel packages. A repair also keeps the original teaching blocks. Empty required panels fail coverage. A generate-then-repair test asserts retention. |
| Empty space is measured | Occupied intervals are merged. Gaps are excluded. The budget adds items from the same step before spacing. A gap over 60 px fails, including an injected 164 px gap. |
| No repeated code task | Exact code and existing-path items cannot recur outside warm-up. Story frames ignore incidental names and numbers. Repairs check the rest of the book before selecting a replacement. |
| Approved likelihood words | The choices, definitions, examples and layout selector use never / sometimes / always. |
| No drawing from U4 | The shared guard rejects drawing tasks, including mathematical drawing. Colouring a printed frame remains permitted. |
| Spare pages contain practice | Binding pages use the same planned-slot and number-allocation path. They contain practice from skills already used in the book. The PDF still has a multiple of four pages. |
| One cover sentence | Every level has a checked plain title. U4 says Numbers to 20 and has the requested learning sentence. The renderer has no bullet list. |
| Number periods | Every renderer uses the same formatter. Final-HTML tests cover every page family and both layout versions. |

## Full-brief check

| Brief section | Current result and boundary |
|---|---|
| 1: Skill and step progression | The existing ten-day number schedule remains. Skeleton-order progression and imported per-step ranges are the next integration stage. They are not claimed by this checkpoint. |
| 2: Child copy | Plain titles, one-line instructions, Maya, one error-card question and numbered items are retained. The book also checks rejected wording inside teaching panels. |
| 3: Child-led U4-U6 | The import contains the curriculum metadata change. It is part of the next stage. Parent copy is already suppressed from U4. |
| 4: Question types | Likelihood has circle choices. Drawing is rejected from U4. Printed colouring tasks remain. Existing-path skills retain their current checks until the step templates replace their missing builders. |
| 5 and 8: Layout | Shared page budgets protect required blocks. The measured layout uses a 32 px gutter, a header at most 150 px, the stated writing-box minimums and 40 px frame cells. Intentional work space fills the story cards. Legacy pages retain their layout limits. |
| 6: Spare pages | Both binding pages contain extra practice. |
| 7: Review length | Real plans remain ten consecutive days. Only the review command selects Days 1, 3, 5, 8 and 10. |
| 9: Variety | Page and book share limits, unique story frames and harder U4 Challenges are checked. Full per-step template variety, including the three-context minimum on number-only pages, belongs to the next integration stage. |
| 10: Source import | PR #487 is ready at `a6a36f8b99024fcec4b91cd8e965dc2fe5272be3`. Its 1,622 steps are not merged into this checkpoint. |
| 11: Checks | Language, coverage, repeated tasks, day estimates, number bounds, physical fit and actual unoccupied gaps are checked. Imported step progression checks are the next stage. |

The report does not establish a child's completion time or real-model teaching
quality. The fake solver reads the supplied key. No real family, print order,
shipment, database row, subscription call or API call was used by these runs.
