# Workbook v2 per-book checks

Every v2 book passes three checks before `buildBook` gives it back as `"built"` (architecture 11.3, UNI-259): **source**, **layout** and **level**. They are pure engine code in `src/lib/workbook-v2/checks/` and run on the planned book and its drawing. A book that fails stops with a list of findings. Content fit was proved at the freeze, so a layout finding in a book is an engine fault, and replay reproduces it.

| Module | Gives |
| -- | -- |
| `book-checks.ts` | `checkBook(input)`, and `BOOK_CHECK_STEPS` (each check alone, so that a caller can time it) |
| `book-input.ts` | `BookCheckInput`, `BookCheckOptions` (`wholeBook(pagesPerDay)` or `PART_OF_BOOK`) |
| `findings.ts` | `BookFinding`, `formatFinding` |
| `source-check.ts` | `checkSource`, `snapshotRowHashes`, `itemRowHash` |
| `membership.ts` | whether a printed question is one of its frozen row (`Shape.contains`, the list, or a space of at most 20,000) |
| `repeat-rule.ts` | the repeat rule of architecture 9.3, read back from the book |
| `layout-check.ts` | `checkLayout` |
| `level-check.ts` | `checkLevel` |

## Findings

Each finding is `{ check, rule, sheet, page, slot, message }`. `formatFinding` writes it in plain words that name all four places:

```
Layout check, sheet "times-facts", page 121, slot "answer-3": the image has ink that the model does not have, at (150, 190) in "answer-3".
```

`slot` is the short name of a rectangle of the page (`slot-3`, `answer-3`, `reach-3`, `heading`, `qr`), a zone (`spine-zone`, `margin`), a time-log box, `page` for a problem of a whole page, or `none` for a problem of the whole book (the page count, or a typesetter that gave no PDF). `sheet` and `page` are `none` only for a problem of the whole book.

## The rules

| Check | Rule | What it stops |
| -- | -- | -- |
| Source | `snapshot-item` | An item whose row hash (`sha256` of sheet, side, row, shape, shape version, number of questions and the row's canonical limits; for word problems, its question ids) is not the frozen snapshot row's; a question that is not one of that frozen row (for word problems, the frozen questions bound again to the book's theme and region), or that its shape cannot read back; an item of no sheet of the book; a row that prints more or fewer questions than the snapshot row asks for |
| Source | `story-text` | A word problem whose page does not print, word for word, the frozen phrasing filled for the question and numbers of its item, or whose unit differs from that filling (a page that asks another question than the key answers) |
| Source | `answer-form` | An answer of a wrong form (no part, an empty value, an unknown name), found before a page is made, at the page and slot of its question |
| Source | `answer-twice` | An answer that the second computation (`solveAgain` on the printed rows, or the story reader) does not agree with |
| Source | `no-repeat` | A question twice on a sheet while its row has questions that the sheet does not print; a row in table order whose run repeats questions of another row in table order of its side (or of the front, for a back row) while another legal run repeats fewer |
| Source | `ordered-run` | A row in table order (`orderedRuns`) that prints no whole run of its table, in the table's order |
| Source | `unseen-first` | On a repeat with history, a seen question while its row has unseen questions that the sheet does not print (a swap of the last attempt is not such a choice); for a row in table order, a run while another legal run has fewer seen questions and repeats no more |
| Source | `swapped-form` | A question of the last attempt in the same form when its limits allow the swapped form and the sheet does not print it |
| Source | `new-order` | A repeated side in the exact order of the last attempt when two questions of one row and one difficulty can change places; a row in table order that prints its run of the last attempt while another legal run is no worse |
| Layout | `fit` | A text, flow, position or digit place that layer 1 refuses (`fit.ts`, `positions.ts`, `texts.ts`, `place-value.ts`); before drawing, a QR text that cannot be scanned in its box (slot `qr`), a question with no place on its template (its `slot-N`), too many questions for the template (`page`) or no place for a time log (`time-log`) |
| Layout | `page-rule` | A page rule of `page-rules.ts` |
| Layout | `blank-zone-ink` | Ink in an answer area, reach box, work area, time-log box, the spine zone or a margin (layer 3) |
| Layout | `qr` | A QR code that cannot be read, reads another payload, does not fill its box, or a second QR code |
| Layout | `drawn-ink`, `colour`, `image`, `pdf`, `typesetter` | Model ink missing from the image, a grey or colour that the model does not use, an unreadable image, a PDF that differs from the model, a typesetter that gave too little |
| Layout | `page-count` | A whole book whose pages and 4 cover pages are not a multiple of 4, or more than 120 (`MAX_TOTAL_PAGES`) |
| Level | `in-level` | A sheet, page or question of a sheet that is not in the snapshot of the child's level |
| Level | `page-order` | Pages that do not print the planned sheets in their order, front then back (every book) |
| Level | `day-start` | A first page of a day with no time log, or another page with one, read in the order of the pages (every book; `planBook` checks it before drawing too) |
| Level | `repeats-first`, `order` | In a whole book: a repeat after a new sheet, or repeats or new sheets out of snapshot order |
| Level | `pages-a-day` | In a whole book: a day with another number of pages than `pagesPerDay` (only the last day may have one more sheet, when the book's sheet count is even), or a first sheet that does not start a day. `planNextBook` refuses a book that breaks this rule (`wrongDay` in `assemble/plan-book.ts`), for example a short queue that leaves 2 sheets at 6 pages a day |

The repeat rules decide from the items, the bound rows and the history only. They read a row's whole question space when the shape has `list`, or `space` with at most 20,000 questions, which is where the build reads it whole too. A larger space (column shapes) is not read: it has another question when its `count` is more than the keys that the sheet prints or the rule refuses and that `Shape.contains` places in the row. A key that cannot be read back counts as one of the row's, so a doubt never stops a book. A row in table order is judged by its runs, not item by item: it must print a whole legal run, and no other legal run may beat it, that is be no worse and better on one count of repeats of the other rows in table order, seen questions (on a repeat with history) and being the run of the last attempt. The rest of the sheet stays as it is printed, so a run beats only when it fits the sheet as well as the printed run: it has no more questions that the other rows of its side print, and no more that the other rows of the sheet print (rows that mix their questions too). The rules of repeats come before a seen question ("A sheet never repeats a question to avoid a seen one"), so the check does not ask a front row to take the questions of the back, or a back row the questions of a mixed row of its side.

The build makes the same choice (`settleRuns` in `build/row-questions.ts`). After its first choice of runs, a row in order whose run another legal run beats takes the best of those runs: the fewest repeats of the other rows in order, then the fewest seen questions, then not the last run, then the run seen longest ago. Legal is what the choice keeps: all questions different when the sheet or side was chosen all different, and the mixed rows still able to differ. So a row of the 3s or the 5s takes the 5s when two later rows can take only the 3s, and a repeat takes a run with one question of a newer book before a run with two questions of an older one. The seen count counts only on a repeat (attempt 2 or later), as in the check. A choice that no run beats is not changed, so every book that passed before prints the same bytes; a differential run over 6,309 fixture and random facts books found no changed book. Each change makes its row better and changes are capped at 1,000, so the search stays small.

`Shape.contains(question, limits)` reads a question back apart from `generate`: `add.column` and `sub.column` find its place in the order and read the question at that place again, `mul.column` counts the questions of its first number and multiplier, `count.skip` finds its line and blanks, and a word problem is filled again from its question, phrasing and numbers. A shape with no `contains` is checked against its list, or its whole space of at most 20,000.

## Whole books and parts of books

`buildBook(input, renderer, checks, shapes?)` needs `checks`: there is no default. `wholeBook(pagesPerDay)` says that the input is a whole planned book with that many pages a day, and the page count, order and day rules run too. `PART_OF_BOOK` says that it is not, and skips only those rules: every source rule, every layout rule but `page-count`, `in-level`, `page-order` and `day-start` still run. The publish job passes `wholeBook` with the pages a day of its allocation, and `allocationOf` refuses a request that breaks a whole-book rule before it writes anything (`wholeBookFindings`). The saved input of a published book keeps its checks (`checks: wholeBook(pagesPerDay)`), and replay and a bug fixture build with the checks of their input; an input saved before it kept them has none and is checked as `PART_OF_BOOK`, as before. Fixtures of a few sheets, the command line and tests pass `PART_OF_BOOK`. A publish request may set `pagesPerDay`; with none it is twice the sheets of day 1. Its days follow the planner's rule (`wrongDay`), so the last day may have one more sheet. The golden books and the full-size book pass `wholeBook`.

The publish tool's book (`src/lib/workbook-v2-publish/full-book.ts`) is a whole book: 54 sheets of a 56-sheet invented level (108 pages and 4 cover pages, 112 in all; 9 days of 6 sheets), 12 repeats first and then 42 new sheets, each part in level order. `requestProblem` counts the 4 cover pages, so a request of 60 sheets (124 pages) is refused.

When a check of the pages stops a book before drawing (answer forms, page layout and QR fit, the first printed-answer check, `checkPage`, time logs), `buildBook` gives findings too, with the same places as after drawing; `planBook` and `planPages` keep their earlier wording for the bank checks. A text that the typesetter drew on a page of the file and that the model does not have is placed on the page model of that page. When a check stops a book, `BuildResult` has `problems` (from `formatFinding`) and `findings`.

## Timing (target: under 5 s)

`src/lib/workbook-v2/testing/full-size-book.ts` makes a full-size synthetic book: Book 2 of a weak child on an invented level of 64 sheets. It has 58 sheets (116 pages and 4 cover pages, 120 in all) and 1,050 questions: 3 repeats with the history of Book 1, then 55 new sheets, at 6 pages a day (19 days of 3 sheets, and the last day 4).

`POST /api/workbook-v2-book-checks` draws that book in the function, runs the three checks, and answers `{ ok, renderer, totalPages, interiorPages, itemCount, totalMs, checks: { sourceMs, layoutMs, levelMs }, underBudget, drawMs, findings, problems }`. `totalMs` is the sum of the three rounded checks; `underBudget` is decided on the time before rounding; `drawMs` is the drawing before them and is not in the budget. A body of more than 1,024 bytes gets 413. Call it with `Authorization: Bearer <CRON_SECRET>` and an empty body (pinned Typst) or `{"renderer": "fake"}`. It writes nothing, answers 404 in production unless `WORKBOOK_V2_TEST_PUBLISH=on`, and runs one check at a time (429).

`checks/book-checks.test.ts` runs the same book with the fake typesetter on every run, and with Typst when it is installed. Its budget is on processor time, so a busy computer does not fail it.

Local measurements on Apple Silicon (MacBook, Node 22), 120-page book, Typst page images:

| Run | Typesetter | Source | Layout | Level | Total (clock) | Processor time |
| -- | -- | -- | -- | -- | -- | -- |
| 2026-11-27, final code | Typst | 15 ms | 1,555 ms | 0 ms | 1,571 ms | 1,897 ms |
| 2026-11-27, final code | Typst | 14 ms | 1,521 ms | 0 ms | 1,535 ms | 1,784 ms |
| 2026-11-27, final code | fake | 16 ms | 1,230 ms | 0 ms | 1,246 ms | 1,584 ms |
| 2026-11-27, final code | fake | 16 ms | 1,214 ms | 0 ms | 1,231 ms | 1,619 ms |
| 2026-11-27, second repair | Typst | 53 ms | 1,490 ms | 0 ms | 1,543 ms | 1,827 ms |
| 2026-11-27, second repair | fake | 59 ms | 1,168 ms | 1 ms | 1,227 ms | 1,597 ms |
| 2026-11-27, review repair | Typst | 69 ms | 1,788 ms | 1 ms | 1,858 ms | 2,247 ms |
| 2026-11-27, review repair | Typst | 57 ms | 1,559 ms | 0 ms | 1,616 ms | 1,786 ms |
| 2026-11-27, review repair | fake | 68 ms | 1,223 ms | 0 ms | 1,291 ms | 1,588 ms |
| 2026-11-27, review repair | fake | 60 ms | 1,168 ms | 0 ms | 1,228 ms | 1,377 ms |

The computer had a load average near 9 during the first runs, near 36 during the review-repair runs and near 12 during the second-repair runs. The review repair reads each question back against its frozen row, which moved the source check from about 15 ms to about 60 ms. With a load near 50 (other agents running), the clock total of the same book rose to about 5 s while the processor time stayed near 2 s; that is why the test budget is on processor time.

Where the layout time goes (same book): reading the 116 PNG files 0.59 s, the search for a second QR code 0.32 s, reading each QR code 0.12 s, the PDF 0.15 to 0.17 s, stray ink 0.09 s, flat greys 0.07 s, page rules 0.02 s. The source check is 57 to 69 ms after the review repair and the level check under 1 ms. The Vercel figure (x64) is not measured yet: call the route on a preview.
