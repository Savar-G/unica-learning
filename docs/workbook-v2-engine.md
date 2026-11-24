# Workbook engine v2

The v2 engine turns a bank snapshot file into a book: page models, answers, a PDF, page images and the position of each rectangle. It is in `src/lib/workbook-v2/`, apart from the v1 generator, and it is not connected to the app yet. This first part (UNI-135) holds one shape, one page template and one invented sheet.

## Use it

```sh
npm run typst:install    # once for each computer
npm run workbook:v2 -- --snapshot src/lib/workbook-v2/fixtures/snapshot.json --book src/lib/workbook-v2/fixtures/book.json --out /tmp/example-book
```

Run it from the repository root. The build uses no network. The output folder must be new or empty. It gets `book.pdf`, `page-1.png` and up (150 pixels an inch), `pages.json` (page models), `positions.json` (what Typst reports), `answers.json` and `record.json` (the engine, Typst, fonts, snapshot and input that made the book). A book that fails writes nothing and lists each problem with its place.

The snapshot file holds the content of one level. The book file holds the book id, the child id, and for each sheet the attempt and the text of the two QR codes. The caller makes all of these; the engine makes none.

## Modules

| Module | Interface | Place |
|---|---|---|
| Contract | types, paper and print rules; imports nothing | `contract.ts` |
| Bank | `validateSnapshot(raw)`: the checked snapshot and its hash, or every problem | `bank/` |
| Shapes | one file for each shape family; the interface is in `shape.ts` | `shapes/` |
| Layout | `buildPages(sheets)`; templates are fixed rectangles in points | `layout/` |
| Checks | `checkPage(page, items)`, `checkPositions(pages, positions)`, `checkTexts(pages, texts)` | `checks/` |
| Renderer | the interface to a typesetter (`render(pages)`) | `renderer.ts` |
| Render | the only module that calls Typst; fonts, pins, install | `render/` |
| Build | `buildBook(input, renderer)`: the book, or a list of problems | `build/` |

## Rules

- **Pure boundary:** everything outside `render/` and `testing/` is pure and cannot import `render/`. `buildBook` gets a `Renderer`. Behind it, `render/` may read files and start Typst, with no clock, random source, network or setting of the computer. `npm run check:guard` enforces this, the import list and the rule of no level branches (`scripts/engine-guard.mjs`).
- **Seed:** the child, the sheet id and the attempt decide the numbers. Rows sort easy to hard, and a question comes back on a sheet only when its row has no other left.
- **Answers:** a shape computes each answer, computes it again with other code (`solveAgain`), and ends its worked steps in it. If they differ, the build stops.
- **Geometry:** every position is in the page model. `page.typ` only draws it. The build compares the rectangles and the text that Typst reports with the model.
- **Typst and fonts:** pinned by version and SHA-256 in `render/pins.ts` and checked before each use. `typst:install` puts the official program in `~/.cache/unica-learning/typst/`. Computer fonts and Typst's own fonts are off. Any Typst warning stops the build. Typst gives no warning for a character that a font does not hold, so `validateSnapshot` refuses those characters (`isPrintable`).
- **A change that can change a page** (Typst, a font, `page.typ`, a template, a shape) also changes `ENGINE_VERSION`.

## Tests

`npx vitest run src/lib/workbook-v2` takes about 3 seconds and needs no browser, network or database. The tests that draw pages use the real Typst. In CI they fail when it is absent; on a laptop without it they are skipped and print the reason.

## Where the next parts connect

- Fit and ink checks (UNI-137): `checks/`, beside `checkPage`; `Rendering.images` holds the page images.
- A Vercel function (UNI-138): a second way to fill `RenderAssets`, or another `Renderer`.
- More shapes (UNI-236): one file in `shapes/` and one line in `shapes/index.ts`. A new look of a question is a new `Face` and a template that takes it.
