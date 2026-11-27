# Workbook v2: sheet results per child

UNI-243 (B3). The architecture spec, sections 9.3 and 10.3, is the source of the rules. This page tells how they are built.

## What is stored

| Table | Holds | Written by |
| --- | --- | --- |
| `child_sheet_results` | One row per issued sheet attempt of a v2 book: questions on the sheet, questions scored, mistakes, result (`mastered`, `repeat`, `unknown`) and the `marks_version` it came from | `write_child_sheet_results` (service role only) |
| `child_bank_state` | Per child and level: the start sheet, the level-test state and the parent's request for fewer or more pages | The service role (`BookStore.saveChildState`) |

The result migrations are `20261127205443_child_sheet_results`, `20261127215019_child_sheet_results_hardening`, and `20261127234052_reconcile_legacy_sheet_results`. Position is never stored. `position(...)` computes it each time from the issued sheets, the accepted page scans and these results.

A result row references the issued sheet in `workbook_sheets` (`workbook_id`, `sheet_id`, `attempt`). The database refuses a result for a sheet attempt that the workbook did not issue to the child or whose printed revision differs from the workbook.

## The rules

- `sheetResults(marks, items, config)` (`src/lib/workbook-v2/results/sheet-results.ts`) groups the questions of a book by sheet attempt and calls `sheetResult` for each one.
- Only the first try counts. A blank is a mistake. A correction never changes the first try.
- A proven fail comes first: more mistakes than `maxMistakes` is `repeat`, however many questions have no mark.
- Otherwise, a sheet with less than 80% of its questions marked is `unknown`. `position(...)` then applies the half-book scan rule.
- The mastery line comes from the level config (`masteryPercent`: 90 at Levels 1 to 6, 80 from Level 7). The engine has no level branch. The adapter picks the config of a book's levels with `masteryConfigFor(levels)` (`src/lib/workbook-v2-results/rebuild.ts`).

## Rebuild when a mark changes

`rebuildSheetResults` (`src/lib/workbook-v2-results/rebuild.ts`) does these steps:

1. Check that the child has a v2 book. A child with v1 books only stops after one read.
2. Read the marks version: `scan_marking_revisions.revision` (the `revision` action of `scan_marking_command`). It only goes up: marking raises it in the same transaction as each applied mark, publication and team mark change.
3. Read the books again after the marks version. Read the issued sheets, the printed questions, and the effective marks.
4. Match each mark to its workbook, printed revision and item ID. Compute every sheet attempt and write the results with the marks version.
5. Record the completed revision when every book was processed and the results saved.

The version is read before the marks, so a row is never newer than its version. `write_child_sheet_results` writes a row when its stored version is the same or older. It skips the row and counts it as `stale` when the stored version is newer. A trigger refuses any other write that lowers `marks_version` (SQLSTATE `PT409`). If a result names a later duplicate v2 issuance, the next rebuild at the same or a later version re-scores it on the first issuance. An older rebuild leaves that result in place and still saves the other results in its batch.

Marking calls the rebuild in `src/lib/scan-marking-server.ts`: after each profile rebuild (a photo, a closed-plan publication and the recovery run) and after our team's mark change (`publishMarkChange`). A failed sheet result rebuild reports `scan.recovery_failed` with step `sheet_results`. The recovery queue retries while the sheet results are behind the marks, even after the profile is current.

A v2 question's package id is `v2:<engine item id>`. `childMarksFrom` (`marks.ts`) maps the effective set to engine ids. A question that still waits for a reading or a parent check has no mark.

## BookStore

`BookStore` (`src/lib/workbook-v2-results/types.ts`) has a memory adapter and a Supabase adapter. `book-store.test.ts` runs the same contract on the memory adapter and the Supabase adapter with a fake PostgREST server. The hosted SQL probe runs inside a transaction and rolls back all synthetic rows.

`rebuild.test.ts` runs invented marks on an invented book through `BookStore`, `sheetResults` and `position` on both adapters. It covers both sides of the half-book scan rule, a late fail, a team mark change and a slow, stale rebuild.

## Checks on the hosted database

`supabase/tests/child_sheet_results_hosted.sql` runs in one transaction and rolls back. It proves the grants, the monotonic marks version, the readers (a parent who is not an admin reads no row, anon reads nothing), the family and child write fences, and the cascades (0 rows left after a child or family deletion). Last run: 27 November 2026, passed.

`supabase/tests/child_sheet_results_legacy.sql` runs on local PostgreSQL. It adds a synthetic legacy duplicate and checks that a rebuild can correct the result while keeping both issued sheets and the latest marks version. The transaction rolls back.

## Limits

- New books store each sheet's queue reason at publication. Older rows with a null reason use the previous attempt's result to infer the reason. A late mark can change that inference for an older book. Scan coverage always uses all the issued pages in the book, including pages for retired sheets.
- If older books issued the same sheet attempt, the earliest workbook number supplies that attempt's result and position. All issued pages still count for scan coverage.
- A sheet result is only for books with a printed revision.
- `child_bank_state` has no writer in the product yet. The book job reads it when position drives the next book.
