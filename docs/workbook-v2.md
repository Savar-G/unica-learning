# Workbook generator v2

Workbook generator v2 is under development. It will make workbooks from an approved question bank. Code will select the questions, fill in the numbers and the theme, and put them into fixed page templates. No AI will run when a book is made.

## Status

- v2 is being built. v1 still makes the books.
- The switch to v2 is not done. After the switch, v2 will make every new workbook, and the v1 generator and its tests will be removed (architecture spec 10.6). Existing v1 books must still scan. v2 imports no v1 generator code.
- For v1 books, read [rendering](workbook-rendering.md), [rounds](workbook-rounds.md) and [the fast loop](workbook-fast-loop.md).

## Where the documents are

- The product spec and the architecture spec are in Linear (parent issue UNI-130). They are the source of truth.
- The architecture spec describes the engine modules, the checks and the build plan. The [engine document](workbook-v2-engine.md) says how to run the engine, what each module does and which rules it keeps.
- The seven decisions below are in `docs/adr/`. Read them before you change the engine.

## Decisions

| ADR | Decision |
| --- | --- |
| [0001](adr/0001-bank-content-in-the-database.md) | Bank content lives in the database |
| [0002](adr/0002-no-ai-when-a-book-is-made.md) | No AI when a book is made |
| [0003](adr/0003-mastery-per-sheet.md) | Mastery is judged per sheet |
| [0004](adr/0004-a-book-is-a-pure-function.md) | A book is a pure function, and every book can be replayed |
| [0005](adr/0005-geometry-is-fixed-data-drawn-by-typst.md) | Geometry is fixed data, and Typst draws it |
| [0006](adr/0006-only-the-contract-module-is-shared.md) | The generator and the scan code share only the contract module |
| [0007](adr/0007-position-is-computed.md) | Position is computed, never stored |
