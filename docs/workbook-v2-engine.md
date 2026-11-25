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
| Build | `buildBook(input, renderer)`: the book, or a list of problems; `planBook(input)`: the same without the drawing | `build/` |

## Rules

- **Pure boundary:** everything outside `render/` and `testing/` is pure and cannot import `render/`. `buildBook` gets a `Renderer`. Behind it, `render/` may read files and start Typst, with no clock, random source, network or setting of the computer. `npm run check:guard` enforces this, the import list and the rule of no level branches (`scripts/engine-guard.mjs`, which says what it does not see). The checks read page images with `inflateSync` of `node:zlib` and with `jsqr`. Both turn bytes into a value and touch nothing else, so the guard lists them for the pure part.
- **Seed:** the child, the sheet id and the attempt decide the numbers. A question comes back on a sheet only when its row has no other left. A new attempt of a sheet may repeat a question of an earlier attempt, also when others exist; the choice of unseen questions is UNI-258.
- **Order on a side:** the difficulty decides it, from easy to hard, so the questions of two rows may mix. Questions of equal difficulty keep the row order of the bank. Each item records its row (`rowId`). Scores compare only inside one shape, so rows of two shapes never mix.
- **Places:** a side has no more questions than the places of its template on that side.
- **Answers:** a shape computes each answer from the parameters of the question. The second computation (`solveAgain`) gets only the printed rows, which the build takes from the rectangles of the page model, from top to bottom and from left to right. It must read the same question and compute the same answer, and the worked steps must end in it. If not, the build stops.
- **Geometry:** every position is in the page model. `page.typ` only draws it. The build compares the rectangles and the text that Typst reports with the model.
- **Proof of each page:** the build reads each page image back. Its QR code must fill its box and read as the text of its own page, and there must be no second code. Every text of the model must have ink there, every fill must be dark in all of its area, and the sides of an outline must have no gap in their middle half. This takes about 2 seconds for 120 pages on a laptop. It does not prove the PDF, which Typst makes in a run of its own from the same files.
- **Typst and fonts:** pinned by version and SHA-256 in `render/pins.ts`. The fonts and the drawing file are read once and each drawing uses that copy in a private folder; the program is checked again before each drawing. `typst:install` puts the official program in `~/.cache/unica-learning/typst/`. Computer fonts and Typst's own fonts are off. Any Typst warning stops the build. Typst prints an empty box, with no warning, for a character that a font does not hold, so `validateSnapshot` refuses those characters in the bank and `checkPage` refuses them in every text that a page prints (`isPrintable`).
- **A change that can change a page or an output file** (Typst, a font, `page.typ`, a template, a shape, or the fields of `answers.json`) also changes `ENGINE_VERSION`. Each `BookItem` in `answers.json` carries `shapeVersion` from its shape; `solveAgain` and layout do not read it.

## Adding a shape

1. Add one shape file in `shapes/` with `version: 1`, and the shape in `shapes/index.ts` (`SHAPES`).
2. Add its registration in `testing/shape-registrations.ts`. It shares no code with the shape and speaks of printed rows only (`testing/shape-registration.ts` has the interface; `testing/example-shapes.ts` has a listed space and a space that is too large to list):
   - `limits`: one rule for each limit, as data (`rangeLimit`, `neverLimit`). The harness makes limits, wider limits and bad limits from the rules.
   - `read(rows)`: the answer, one feature for each limit, at least one width and every worked step, computed from the printed rows in another way than the shape.
   - `space`: the list of every printed question, or the count and the ends for any limits.
   - `cases` (the limits of each bank row must be one), `smallSpaces` with complete lists by hand, `witnesses` (for each limit a question inside and one that breaks only it), and the named lists.
   - Steps: the harness compares the whole list of steps with the list of the reader, and then reads each part of a step that holds "=" (parts end at `,` `.` `;` or `:`). Such a part must be one true equation, as in "3 × 4 = 12, write 2, carry 1". Any other part with "=" is refused.
3. Run `npm run workbook:v2:fingerprints`, then `npx vitest run src/lib/workbook-v2/shapes --sequence.shuffle`.

`worstCase` is one question that is the widest in every width and in digit places. If the widths pull apart (99 - 4 leaves as much as 100 - 5 in fewer places), register the digit places as the width.

The harness (`testing/shape-harness.ts`) takes 1,000 production seeds for each shape: `planBook` builds one book with both sides and all places of each template that fits any of the limits, and each generated question is compared with the reader, the rules, the second solver, the steps and the ranges. Limits come from fast-check with a fixed seed, so a failure comes back in the next run, and its message holds the call that repeats it. `testing/shape-harness.test.ts` holds a broken shape for each check. An answer with parts needs a new kind in `ANSWER_KINDS` and `Answer` (`contract.ts`) and its rule in `ANSWER_FORMS` (`testing/shape-checks.ts`); the rest compares whole answers.

**Fingerprints:** `testing/shape-fingerprints.json` holds one SHA-256 for each version of a shape: every question of a listed space, or 1,000 questions of a large one, with the registered limits. A change of the output needs a new `version`, then the command. A stored entry never changes: `scripts/shape-fingerprint-base.mjs` compares the file with the base of the branch, in the `scope` job of CI (the one job that always has the base) and in `npm run check:fast`.

## Tests

`npx vitest run src/lib/workbook-v2` takes about 5 seconds and needs no browser, network or database. The tests that draw pages use the real Typst. In CI they run in the `engine` job (`Workbook engine` in `.github/workflows/ci.yml`), which installs the pinned Typst, runs `npm run check:guard`, runs `npm run engine:typecheck`, runs the engine tests, and reports the test time against the 15 s budget. In CI those tests fail when Typst is absent; on a laptop without it they are skipped and print the reason.

## In a Vercel function

`openRenderer(vercelAssets(process.cwd()))` draws with the official pinned Typst program for linux x64, and `buildBook` runs all checks as on a laptop. Proved on a preview deployment on 2026-11-24 (UNI-138): the PDF and each page image were the same bytes as on a Mac. With a new renderer the two-page book took 0.75 to 1.02 s (three calls in one function instance), and the temp folder was empty after each call. The Node binding of Typst was faster (0.3 to 0.6 s) but gave other page images, always reads the fonts of the computer, and cannot be pinned by SHA-256 or stopped, so it is not used.

- **Program:** it must be a regular file with the pinned SHA-256. `npm run typst:stage` puts the verified program (53 MB) in `.workbook-v2/`, which Git ignores. `workbookV2TraceFiles()` lists the files that the bundle of the function must hold.
- **No permission to run:** the bundle can only be read. When the program in it may not run, each drawing copies the verified bytes into its private temp folder.
- **Not connected:** no function builds books yet, so no build stages the program. The first one (UNI-260) adds `typst:stage` to the build, where a failed download must fail the deployment, and the files to `outputFileTracingIncludes` for its route.

## Where the next parts connect

- Fit and ink checks (UNI-137): `checks/`; `readPageImage` gives the pixels of a page image and `checkImages` already reads each one.
- The book job (UNI-260): see "In a Vercel function".
- More shapes (UNI-237 to 240): follow "Adding a shape" above. A new look of a question is a new `Face` and a template that takes it.
