# Workbook generator v2

Workbook generator v2 makes a workbook from an approved question bank. Code selects the questions, fills in the numbers and the theme, and puts them into fixed page templates. No AI runs when a book is made.

## Status

- v2 is being built. v1 still makes the books.
- The switch to v2 is not done. From the switch, v2 makes every book, and v1 is deleted after it (architecture spec 10.6). v2 imports no v1 generator code.
- For v1 books, read [rendering](workbook-rendering.md), [rounds](workbook-rounds.md) and [the fast loop](workbook-fast-loop.md).

## Where the documents are

- The product spec and the architecture spec are in Linear (parent issue UNI-130). They are the source of truth.
- The engine document will be `docs/workbook-v2-engine.md`. UNI-135 adds it.
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
