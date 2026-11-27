# Workbook v2 per-book checks

Every v2 book passes three checks before `buildBook` gives it back as `"built"` (architecture 11.3, UNI-259): **source**, **layout** and **level**. They are pure engine code in `src/lib/workbook-v2/checks/` and run on the planned book and its drawing. A book that fails stops with a list of findings. Content fit was proved at the freeze, so a layout finding in a book is an engine fault, and replay reproduces it.

| Module | Gives |
| -- | -- |
| `book-checks.ts` | `checkBook(input)`, and `BOOK_CHECK_STEPS` (each check alone, so that a caller can time it) |
| `book-input.ts` | `BookCheckInput`, `BookCheckOptions` (`pagesPerDay`) |
| `findings.ts` | `BookFinding`, `formatFinding` |
| `source-check.ts` | `checkSource`, `snapshotItemHashes`, `itemSourceHash` |
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
| Source | `snapshot-item` | An item whose hash (`sha256` of sheet, side, row, shape and shape version) is not a row of the snapshot; an item of no sheet of the book; a row that prints more or fewer questions than the snapshot row asks for |
| Source | `answer-twice` | An answer that the second computation (`solveAgain` on the printed rows, or the story reader) does not agree with |
| Source | `no-repeat` | A question twice on a sheet while its row has questions that the sheet does not print |
| Source | `unseen-first` | On a repeat with history, a seen question while its row has unseen questions that the sheet does not print (a swap of the last attempt is not such a choice) |
| Source | `swapped-form` | A question of the last attempt in the same form when its limits allow the swapped form and the sheet does not print it |
| Source | `new-order` | A repeated side in the exact order of the last attempt when two questions of one row and one difficulty can change places |
| Layout | `fit` | A text, flow, position or digit place that layer 1 refuses (`fit.ts`, `positions.ts`, `texts.ts`, `place-value.ts`) |
| Layout | `page-rule` | A page rule of `page-rules.ts` |
| Layout | `blank-zone-ink` | Ink in an answer area, reach box, work area, time-log box, the spine zone or a margin (layer 3) |
| Layout | `qr` | A QR code that cannot be read, reads another payload, does not fill its box, or a second QR code |
| Layout | `drawn-ink`, `colour`, `image`, `pdf`, `typesetter` | Model ink missing from the image, a grey or colour that the model does not use, an unreadable image, a PDF that differs from the model, a typesetter that gave too little |
| Layout | `page-count` | A whole book whose pages and 4 cover pages are not a multiple of 4, or more than 120 (`MAX_TOTAL_PAGES`) |
| Level | `in-level` | A sheet, page or question of a sheet that is not in the snapshot of the child's level |
| Level | `repeats-first`, `order` | In a whole book: a repeat after a new sheet, or repeats or new sheets out of snapshot order |
| Level | `pages-a-day` | In a whole book: a day with another number of pages than `pagesPerDay` (only the last day may have one more sheet, when `planNextBook` adds one to make the sheet count even), or a first sheet that does not start a day |

The repeat rules decide from the items, the bound rows and the history only. They read a row's whole question space when the shape has `list`, or `space` with at most 20,000 questions, which is where the build reads it whole too. A row in table order (`orderedRuns`) is not judged item by item.

## Whole books and parts of books

`buildBook(input, renderer, shapes, { pagesPerDay })` says that the input is a whole planned book with that many pages a day. Then the page count, order and day rules run too. Without `pagesPerDay`, the build runs every rule that needs no plan: all source rules, all layout rules but `page-count`, and `in-level`. Test books of one or three sheets and the publish tool's 60-sheet test book (124 pages, attempts in turn) are parts of books in this sense. The golden books pass `pagesPerDay`, so every rule runs on them.

The problems that `planBook` finds before drawing (`checkPage`, the first printed-answer check, time logs) keep their earlier wording. When the three checks stop a book, `BuildResult` has `problems` (from `formatFinding`) and `findings`.

## Timing (target: under 5 s)

`src/lib/workbook-v2/testing/full-size-book.ts` makes a full-size synthetic book: Book 2 of a weak child on an invented level of 64 sheets. It has 58 sheets (116 pages and 4 cover pages, 120 in all) and 1,050 questions: 3 repeats with the history of Book 1, then 55 new sheets, at 6 pages a day (19 days of 3 sheets, and the last day 4).

`POST /api/workbook-v2-book-checks` draws that book in the function, runs the three checks, and answers `{ ok, renderer, totalPages, interiorPages, itemCount, totalMs, checks: { sourceMs, layoutMs, levelMs }, underBudget, drawMs, findings, problems }`. `totalMs` is the sum of the three checks; `drawMs` is the drawing before them and is not in the budget. Call it with `Authorization: Bearer <CRON_SECRET>` and an empty body (pinned Typst) or `{"renderer": "fake"}`. It writes nothing, answers 404 in production unless `WORKBOOK_V2_TEST_PUBLISH=on`, and runs one check at a time (429).

`checks/book-checks.test.ts` runs the same book with the fake typesetter on every run, and with Typst when it is installed. Its budget is on processor time, so a busy computer does not fail it.

Local measurements on Apple Silicon (MacBook, Node 22), 120-page book, Typst page images:

| Run | Typesetter | Source | Layout | Level | Total (clock) | Processor time |
| -- | -- | -- | -- | -- | -- | -- |
| 2026-11-27, final code | Typst | 15 ms | 1,555 ms | 0 ms | 1,571 ms | 1,897 ms |
| 2026-11-27, final code | Typst | 14 ms | 1,521 ms | 0 ms | 1,535 ms | 1,784 ms |
| 2026-11-27, final code | fake | 16 ms | 1,230 ms | 0 ms | 1,246 ms | 1,584 ms |
| 2026-11-27, final code | fake | 16 ms | 1,214 ms | 0 ms | 1,231 ms | 1,619 ms |

The computer had a load average near 9 during these runs. With a load near 50 (other agents running), the clock total of the same book rose to about 5 s while the processor time stayed near 2 s; that is why the test budget is on processor time.

Where the layout time goes (same book): reading the 116 PNG files 0.59 s, the search for a second QR code 0.32 s, reading each QR code 0.12 s, the PDF 0.15 to 0.17 s, stray ink 0.09 s, flat greys 0.07 s, page rules 0.02 s. The source check is 11 to 30 ms and the level check under 1 ms. The Vercel figure (x64) is not measured yet: call the route on a preview.
