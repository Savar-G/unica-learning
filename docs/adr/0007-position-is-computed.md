# ADR 0007: Position is computed, never stored

- Status: Accepted. Decided, not built yet.
- Date: 2026-11-24
- Source: product spec 2.1, 2.2, 2.3, 2.4 (choice 7), 7.1, 7.3 and 18; architecture spec 9.2, 9.3, 10.3 and 15 (step B3) (Workbook generator v2)

## Context

Position is where a child is in a level: the sheets that must repeat, then the next new sheet. Marks can arrive after the next book is planned. About 7 of 10 days are marked at that time. A mark can also change later.

## Decision

- Code computes the position: `position(state, issued, receipts, results, snapshot)`.
- `receipts` are the accepted page photos. A page that is scanned and waits for its mark is not the same as a page that was never scanned.
- The queue puts repeats first, then the next sheets in order (Workbook 2 and later).
- The rules run in this order:
  1. If under half of a book is scanned at planning time, its unknown sheets repeat once, and the team is told. The count uses distinct accepted pages against issued pages.
  2. If not, a sheet that was issued and has no marks yet counts as passed until marks arrive.
  3. A late fail opens the next eligible book.
  4. A sheet below the mastery line repeats.
- `child_bank_state` holds only what cannot be computed: the child, the level, the start sheet, the level-test state and the parent's request for more or fewer pages.

## Options rejected

- **A `child_bank_positions` table.** A stored position can go out of date. A computed position cannot.

## Consequence

- A mark that arrives late or changes needs no position update. The sheet result is rebuilt, and the next plan uses it.
- A freeze of a new snapshot does not move a child: the position carries over by sheet id. The version notes map a removed sheet to its replacement.
- The code needs the issued sheets, receipts and sheet results of each child. Position is per child, also on a shared device.
- The freeze computes page numbers and display codes from the order of the sheets. They are display fields.
- All new per-child tables join the family deletion path.
- Open: the rules do not say what happens to a sheet with marks on only some of its items (result `unknown`) when at least half of the book is scanned. Decide it before `position` is built.
- A synthetic book tests the rules: its issued sheets, receipts and marks must give the expected results, on both sides of the half-book limit.
