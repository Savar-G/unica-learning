# Workbook engine v2

The v2 engine turns a bank snapshot file into a book: page models, answers, a PDF, page images and the position of each rectangle. It is in `src/lib/workbook-v2/`, apart from the v1 generator, and it is not connected to the app yet. This first part (UNI-135) holds one shape, one page template and one invented sheet.

## Use it

```sh
npm run typst:install    # once for each computer
npm run workbook:v2 -- --snapshot src/lib/workbook-v2/fixtures/snapshot.json --book src/lib/workbook-v2/fixtures/book.json --out /tmp/example-book
```

Run it from the repository root. The build uses no network. The output folder must be new or empty. It gets `book.pdf`, `page-1.png` and up (150 pixels an inch), `pages.json` (page models), `positions.json` (what Typst reports), `answers.json` and `record.json` (the engine, snapshot and input, the version of Typst, and the SHA-256 of its program on this computer, of the drawing file and of each font). A book that fails writes nothing and lists each problem with its place.

The command writes the whole book into a hidden folder beside the output folder and renames it in one step. The system refuses that step when the output folder holds something: of two processes one wins and the other stops. An error removes the hidden folder; a process that is killed can leave one (`.workbook-v2-*`), which is safe to delete.

The snapshot file holds the content of one level. The book file holds the book id, the child id, and for each sheet the attempt and the text of the two QR codes. The caller makes all of these; the engine makes none. Both must be plain JSON data: the build reads a copy, and the hashes cover exactly that copy. An inherited, hidden or computed value is refused. A level name is a number, and a page number and the next one must be exact whole numbers.

## Modules

| Module | Interface | Place |
|---|---|---|
| Contract | types, paper and print rules; imports nothing | `contract.ts` |
| Bank | `validateSnapshot(raw)`: the checked snapshot and its hash, or every problem | `bank/` |
| Shapes | one file for each shape family; the interface is in `shape.ts` | `shapes/` |
| Layout | `buildPages(sheets)`; templates are fixed rectangles in points | `layout/` |
| Checks | before the drawing: `checkPrintedAnswers(pages, items, shapes)`, `checkPage(page, items)`; after it: `checkRendering(pages, drawn)`, `checkPositions(pages, positions)`, `checkTexts(pages, texts)`, `checkImages(pages, images)` | `checks/` |
| Renderer | the interface to a typesetter (`render(pages)`) | `renderer.ts` |
| Render | the only module that calls Typst; fonts, pins, install | `render/` |
| Build | `buildBook(input, renderer)`: the book, or a list of problems | `build/` |

## Rules

- **Pure boundary:** everything outside `render/` and `testing/` is pure and cannot import `render/`. `buildBook` gets a `Renderer`. Behind it, `render/` may read files and start Typst, with no clock, random source, network or setting of the computer. `npm run check:guard` enforces this, the import list and the rule of no level branches (`scripts/engine-guard.mjs`, which says what it does not see). The checks read page images with `inflateSync` of `node:zlib` and with `jsqr`. Both turn bytes into a value and touch nothing else, so the guard lists them for the pure part.
- **Seed:** the child, the sheet id and the attempt decide the numbers. A question comes back on a sheet only when its row has no other left. A new attempt of a sheet may repeat a question of an earlier attempt, also when others exist; the choice of unseen questions is UNI-258.
- **Order on a side:** the difficulty decides it, from easy to hard, so the questions of two rows may mix. Questions of equal difficulty keep the row order of the bank. Each item records its row (`rowId`). Scores compare only inside one shape, so rows of two shapes never mix.
- **Places:** a side has no more questions than the places of its template on that side.
- **Answers:** a shape computes each answer from the parameters of the question. The second computation (`solveAgain`) gets only the printed rows, which the build takes from the rectangles of the page model, from top to bottom and from left to right. It must read the same question and compute the same answer, and the worked steps must end in it. If not, the build stops.
- **Geometry:** every position is in the page model. `page.typ` only draws it. The build compares the rectangles and the text that Typst reports with the model.
- **Proof of each page:** the build reads each page image back. Its QR code must fill its box and read as the text of its own page, and there must be no second code. Every text of the model must have ink there, every fill must be dark in all of its area, and the sides of an outline must have no gap in their middle half. This takes about 2 seconds for 120 pages on a laptop. It does not prove the PDF, which Typst makes in a run of its own from the same files.
- **Typst and fonts:** pinned by version and SHA-256 in `render/pins.ts`. The fonts and the drawing file are read once and each drawing uses that copy in a private folder; the program is checked again before each drawing. `typst:install` puts the official program in `~/.cache/unica-learning/typst/`. Computer fonts and Typst's own fonts are off. Any Typst warning stops the build. Typst prints an empty box, with no warning, for a character that a font does not hold, so `validateSnapshot` refuses those characters in the bank and `checkPage` refuses them in every text that a page prints (`isPrintable`).
- **A change that can change a page** (Typst, a font, `page.typ`, a template, a shape) also changes `ENGINE_VERSION`.

## Tests

`npx vitest run src/lib/workbook-v2` takes about 5 seconds and needs no browser, network or database. The tests that draw pages use the real Typst. In CI they fail when it is absent; on a laptop without it they are skipped and print the reason.

## Running in a Vercel function

Way W1 ships the official pinned linux x64 Typst program inside the function bundle so a Vercel Node function can call `openRenderer(vercelAssets(process.cwd()))` and run the same `buildBook` checks as a laptop.

- **Assets (`render/vercel.ts`):** `vercelAssets(root)` points at `.workbook-v2/typst/<version>/x86_64-unknown-linux-musl/typst`, the pinned `x86_64-unknown-linux-musl` target, the drawing file and the bundled fonts. It sets `copyIfNotExecutable: true`: if the deployment bundle is read-only and the binary lost its execute bit, `openRenderer` checks its SHA-256 against the pin and copies those verified bytes into each render's private temp folder with mode `0755`, then removes the folder in `finally`. When the bundled binary keeps its execute bit, it runs directly from the read-only bundle with no copy.
- **Staging and bundle size:** `npm run typst:stage` (and `node scripts/stage-typst.mjs --if-needed` in `npm run build`) reuses `installTypst` to verify and stage the linux x64 binary (`53.2 MB` for Typst `0.15.1`) plus `page.typ`, the two Geist fonts and licence notices (`~0.2 MB`). On Vercel, the download cache lives in `.next/cache` so repeat builds reuse it.
- **Zero cost until a route needs it:** `WORKBOOK_V2_ROUTES` in `src/lib/workbook-v2/render/vercel.ts` lists the routes that build v2 books, and `next.config.ts` calls `workbookV2TracingIncludes` for those routes only. Because `.workbook-v2/` is a dot-folder, unrelated routes do not trace it and stay unchanged. While `WORKBOOK_V2_ROUTES` has no production route, production builds skip staging and any forced staging failure logs a warning instead of breaking the deploy. When a production book-building route lands (UNI-260), add `{ route: "...", scope: "production" }` to `WORKBOOK_V2_ROUTES`: production builds will then require the staged binary and fail loudly if the download fails.

## Where the next parts connect

- Fit and ink checks (UNI-137): `checks/`; `readPageImage` gives the pixels of a page image and `checkImages` already reads each one.
- A Vercel function (UNI-138): `render/vercel.ts`, `scripts/stage-typst.ts`, and `workbookV2TracingIncludes` in `next.config.ts`.
- More shapes (UNI-236): one file in `shapes/` and one line in `shapes/index.ts`. A new look of a question is a new `Face` and a template that takes it.
