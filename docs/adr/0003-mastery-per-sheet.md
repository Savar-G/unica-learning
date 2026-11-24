# ADR 0003: Mastery is judged per sheet

- Status: Accepted. Decided, not built yet.
- Date: 2026-11-24
- Source: product spec 2.1, 2.3, 2.4 (choice 3), 7.3 and 18; architecture spec 9.2, 9.3, 10.1, 10.3 and 10.5 (Workbook generator v2)

## Context

The engine must decide which work a child repeats and which work comes next. A sheet is one physical leaf with two printed pages, front and back. It teaches one skill step. A page is one printed side.

## Decision

- The sheet is the unit of mastery. It is judged on both sides together.
- A sheet result is mastered, repeat or unknown. Code computes it from the first-try marks of the sheet. Later corrections do not change the first try. A blank counts as wrong.
- The mastery line is 90% at Levels 1 to 6 and 80% at Level 7 and up. It is stored for each level as data.
- A sheet with final marks on fewer than 80% of its items is unknown.
- A sheet that is not mastered comes back as the same sheet, with new numbers and new words, until it is mastered. There is no automatic step back.
- Each sheet has a stable `sheet_id`. The id is opaque and does not come from the position of the sheet.

## Options rejected

- **Progress by day and by old curriculum step, as in v1.** The spec does not record a reason.
- **A fixed number of mistakes for each sheet (an earlier rule).** The spec does not record a reason.
- **An automatic step back to an earlier skill.** The spec does not record a reason.

## Consequence

- Each book records its issued sheets and their attempt numbers in `workbook_sheets`.
- `child_sheet_results` holds the results. It is rebuilt when a mark changes.
- `sheetResults` computes the result for v2 books. The v1 paths stay for v1 books only.
- Teaching context version 2 names the `sheet_id` and the attempt.
- The engine has no level branch for the mastery line. The line comes from the level config.
- Sheet ids stay the same between snapshots, so results and positions stay valid. A removed sheet maps to its replacement in the version notes.
