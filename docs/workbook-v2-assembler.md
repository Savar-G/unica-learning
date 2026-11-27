# Workbook v2 assembler

The assembler (`src/lib/workbook-v2/assemble/`) turns a child's history into the request of the next book. It is pure and has no level branch (`scripts/engine-guard.mjs`). The engine overview is in [workbook-v2-engine.md](workbook-v2-engine.md).

| Module | Gives |
| -- | -- |
| `position.ts` | `position(state, issued, receipts, results, snapshot)`: the queue (repeats first, then new sheets in level order), computed and never stored |
| `plan-book.ts` | `nextBookSheets`, `planNextBook`: the first sheets of the queue at a pace, as a request that `planBook` reads |
| `level-config.ts` | `LevelConfig` (`pagesPerDay`, `minutesPerPage`, `masteryPercent`, `days`), `readLevelConfig`, `WORKBOOK_1_PACES` |
| `workbook-plan.ts` | `planWorkbook(input)`: `planNextBook` at a config's pace, plus the day and printed pages of each sheet and the cover facts |

## Level config (UNI-245)

A level config is data. The assembler reads its fields and never asks which level it is for. `WORKBOOK_1_PACES` holds the Workbook 1 numbers confirmed in UNI-167 (2026-11-26), keyed by the snapshot's `level.name`. The caller (outside the engine) picks the record of a child's level.

| Levels | Pages a day | Minutes a page | Mastery | 10-day book |
| -- | -- | -- | -- | -- |
| 2 to 6 | 10 | 2 | 90% | 50 sheets, 104 pages |
| 7 to 9 | 8 | 3 | 80% | 40 sheets, 84 pages |
| 10 | 6 | 4 | 80% | 30 sheets, 64 pages |
| 11 and 12 | 4 | 6 | 80% | 20 sheets, 44 pages |

Level 1 and Calc 1 and 2 have no confirmed pace, so they have no record. `days` defaults to 10 (Monday to Friday, two weeks). `LevelConfig` extends the `ResultConfig` of `results/sheet-results.ts`, so one config also gives the mastery line to `sheetResult`.

## Book size

* A book has 4 cover pages (`COVER_PAGES`) and 2 pages a sheet. It has at most 120 pages in all (`MAX_TOTAL_PAGES`), so at most 58 sheets (`MAX_SHEETS`). `planNextBook` and `planWorkbook` use the same cap. Before UNI-245, `MAX_SHEETS` was 60 and did not count the cover.
* An odd sheet count takes one more sheet of the queue. That sheet belongs to the last day. When the queue has no more sheets, or the extra sheet goes over 58, the book is refused. The book never has a blank page.
* Every accepted book has a page count that is a multiple of 4.

## Cover facts

`planWorkbook` returns `coverFacts`: `coverPages`, `interiorPages`, `totalPages`, `pagesPerDay`, `minutesPerPage` and one entry for each day that has sheets. A day entry has `sheetIds`, `sheets`, `topics` (each topic one time, in the order the day meets them, with no limit), `repeatCount` (attempt 2 or later), and `startPage` and `endPage`.

`startPage` and `endPage` are places in the booklet: interior page 1 is the front of the first sheet, the first page after the inside front cover. They are not the page numbers printed on the sheets. The printed number of a sheet is its bank page, given in `sheets[i].pages` in the same form as `IssuedSheet.pages`.

Workbook 1 is the same for every child who starts at the same sheet: the sheets, attempts, day starts and cover facts are equal. Only the child id, and so the question numbers and the QR texts, differ.

The nudges to Maya and the team notices of the position come with the plan for the caller to send. Nothing of them is printed.
