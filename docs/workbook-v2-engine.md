# Workbook engine v2

The v2 engine turns a bank snapshot file into a book: page models, answers, a PDF, page images and the position of each rectangle. It is in `src/lib/workbook-v2/`, apart from the v1 generator, and it is not connected to the app yet. It holds three shapes (`mul.column`: 2, 3 or 4 digits by 1 digit; `add.column` and `sub.column`: two numbers of 1 to 4 digits), two page templates and four invented sheets.

## Use it

```sh
npm run typst:install    # once for each computer
npm run workbook:v2 -- --snapshot src/lib/workbook-v2/fixtures/snapshot.json --book src/lib/workbook-v2/fixtures/book.json --out /tmp/example-book
```

Run it from the repository root. The build uses no network. The output folder must be new or empty. It gets `book.pdf`, `page-1.png` and up (150 pixels an inch), `pages.json` (page models), `positions.json` (what Typst reports), `answers.json` and `record.json` (the engine, snapshot and input, the version of Typst, and the SHA-256 of its program on this computer, of the drawing file and of each font). A book that fails writes nothing and lists each problem with its place.

The command writes the whole book into a hidden folder beside the output folder and renames it in one step. The system refuses that step when the output folder holds something: of two processes one wins and the other stops. An error removes the hidden folder; a process that is killed can leave one (`.workbook-v2-*`), which is safe to delete.

`snapshot-4-digits.json` and `book-4-digits.json` in the same folder are a sheet of the wide template. `snapshot-add-sub.json` and `book-add-sub.json` are a sheet of `add.column` and one of `sub.column`, each with a side of both templates.

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
| Build | `buildBook(input, renderer)`: the book, or a list of problems; `planBook(input)`: the pages and items of the book before the drawing, as `{ ok: true, ... }`, or `{ ok: false, problems }` | `build/` |

## Rules

- **Pure boundary:** everything outside `render/` and `testing/` is pure and cannot import `render/`. `buildBook` gets a `Renderer`. Behind it, `render/` may read files and start Typst, with no clock, random source, network or setting of the computer. `npm run check:guard` enforces this, the import list and the rule of no level branches (`scripts/engine-guard.mjs`, which says what it does not see). The checks read page images with `inflateSync` of `node:zlib` and with `jsqr`. Both turn bytes into a value and touch nothing else, so the guard lists them for the pure part.
- **Seed:** the child, the sheet id and the attempt decide the numbers. A question comes back on a sheet only when its row has no other left. A new attempt of a sheet may repeat a question of an earlier attempt, also when others exist; the choice of unseen questions is UNI-258.
- **Order on a side:** the difficulty decides it, from easy to hard, so the questions of two rows may mix. Questions of equal difficulty keep the row order of the bank. Each item records its row (`rowId`). Scores compare only inside one shape, so rows of two shapes never mix.
- **Places:** a side has no more questions than the places of its template on that side.
- **Answers:** a shape computes each answer from the parameters of the question. The second computation (`solveAgain`) gets only the printed rows, which the build takes from the rectangles of the page model, from top to bottom and from left to right. It must read the same question and compute the same answer, and the last worked step must be it and draw nothing. If not, the build stops.
- **Worked steps:** see "Steps" below.
- **Geometry:** every position is in the page model. `page.typ` only draws it. The build compares the rectangles and the text that Typst reports with the model.
- **Proof of each page:** the build reads each page image back. Its QR code must fill its box and read as the text of its own page, and there must be no second code. Every text of the model must have ink there, every fill must be dark in all of its area, and the sides of an outline must have no gap in their middle half. This takes about 2 seconds for 120 pages on a laptop. It does not prove the PDF, which Typst makes in a run of its own from the same files.
- **Typst and fonts:** pinned by version and SHA-256 in `render/pins.ts`. The fonts and the drawing file are read once and each drawing uses that copy in a private folder; the program is checked again before each drawing. `typst:install` puts the official program in `~/.cache/unica-learning/typst/`. Computer fonts and Typst's own fonts are off. Any Typst warning stops the build. Typst prints an empty box, with no warning, for a character that a font does not hold, so `validateSnapshot` refuses those characters in the bank and `checkPage` refuses them in every text that a page prints (`isPrintable`).
- **A change that can change a page or an output file** (Typst, a font, `page.typ`, a template, a shape, or the fields of `answers.json`) also changes `ENGINE_VERSION`. Each `BookItem` in `answers.json` carries `shapeVersion` from its shape; `solveAgain` and layout do not read it.

## Steps

A question has a list of `Step` (`contract.ts`): `text`, the line that a parent reads, and `marks`, what the step puts on the paper. A `StepMark` is one number at one place: place 0 is the ones, place 1 the tens, and so on. The last step is the answer, with no marks. 247 × 3 has these steps:

| Text | Marks |
|---|---|
| 3 × 7 = 21, write 1, carry 2 | write 1 at 0, carry 2 at 1 |
| 3 × 4 = 12, plus 2 is 14, write 4, carry 1 | write 4 at 1, carry 1 at 2 |
| 3 × 2 = 6, plus 1 is 7 | write 7 at 2 |
| 741 | |

A subtraction has two more marks, both with `row: "top"`: "cross-out" strikes the number that a place shows now, and "borrow" writes the new one above it. 302 - 147 has these steps:

| Text | Marks |
|---|---|
| borrow 1 hundred, 3 hundreds become 2 hundreds | cross-out 3 at 2, borrow 2 at 2, borrow 10 at 1 |
| borrow 1 ten, 10 tens become 9 tens | cross-out 10 at 1, borrow 9 at 1, borrow 12 at 0 |
| 12 - 7 = 5, write 5 | write 5 at 0 |
| 9 - 4 = 5, write 5 | write 5 at 1 |
| 2 - 1 = 1 | write 1 at 2 |
| 155 | |

How a shape writes them (the harness checks each rule for an answer that is one whole number, `testing/steps-evaluator.ts` and `testing/step-marks.ts`):

- Every working step follows a closed clause grammar, in strict order, separated by `", "`: an equation (`3 × 4 = 12`) or, in a column whose lower number has no digit there, only the top digit (`3, plus 1 is 4`; a last column with nothing to add says `3, write 3`), an optional incoming carry addition (`plus 2 is 14`), a write clause (`write 4`; required before the last column, optional on the last column where it must write all digits of the column total), and an optional carry clause (`carry 1`; required before the last column when the total is 10 or more, forbidden on the last column). Unknown clauses, repeated clauses, out-of-order clauses, or wrong numbers fail.
- All "write" marks together are the digits of the answer: each place one time.
- A step that carries writes one digit and puts its "carry" mark one place above that digit. The next step writes that place and adds the same digit.
- The words say the same as the marks, and no mark and no word says a carry of 0.

- A step that borrows has exactly two clauses, `borrow 1 ten` and `4 tens become 3 tens`, with the right unit and singular or plural words ("1 ten becomes 0 tens").

When the printed rows are a column (two rows, with `+`, `-` or `×` before the lower number), the checker also works on the paper (`testing/step-marks.ts`). It starts from the two printed rows and goes column by column from the ones. Each step must have exactly the operands that its column shows then, in the printed order and with the printed sign (`3 × 4` for the 4 of 247 × 3), or the only digit of a column that has one. It writes its own place, and no column is left out, repeated or too many. For a subtraction it applies each step in order and refuses one that does not follow from what the paper shows then:

- A borrow is for the column that is next, and only when that column has too little. It comes from the nearest place above that is not 0, crosses out the number that this place shows, writes one less, and shows ten more in the place just below. Over zeros the next borrow then hands the ten on, place by place.
- A column says exactly what the paper shows (`12 - 7`, or only the top number when nothing is below), and writes the digit that is left at its own place.
- A zero in front of the answer is not written: the step says `write nothing` and has no marks. A first digit that became 0 with nothing below it has no step. Any other column with no step is refused.

What the marks cannot say yet: rows and offsets for long division and two partial products. A later shape adds typed marks to `STEP_MARKS` (and its clause kind in the single list `CLAUSE_KINDS` in `testing/steps-evaluator.ts`, plus its check in `testing/step-marks.ts`) without changing the forms above or the shapes themselves.

## Limits and large spaces

Limits are ranges and words with no default, so that one meaning has one form (`readLimitFields` in `shapes/shape.ts` reads them). The limits of `mul.column` are in `shapes/mul-column-count.ts`. A carry is a carry into the next written column: `carryIntoTens`, `carryIntoHundreds` and `carryIntoThousands` are ranges of the carry itself (0 is none), and `carries` counts the columns that get one. What the last column makes is written, not carried.

`add.column` and `sub.column` share `shapes/column-count.ts`. A carry of the last column is written, not carried, so `carries` and `carryIntoTens` to `carryIntoThousands` (0 or 1) count only carries into written columns; `borrows` and `borrowFromTens` to `borrowFromThousands` say the same of the places that give a ten. `carryChain` is a carry that a column makes only because it gets one. `acrossZero` and `acrossTwoZeros` are a borrow that one zero, or two, of the top number must get first. A zero in a place of a number (`aZeroInTens`, `bZeroInOnes`, ...) is after its first digit. Numbers start at 1, and the top number never has fewer digits than the lower one. Contradicting limits have the count 0. `readLimits` then names each limit that alone could be wider to have some, or, when no one change is enough, all limits that are narrower than they could be (`emptyProblem` in `shapes/shape.ts`, also for `mul.column`).

A shape whose space is too large to list must not list it for each question. `mul.column` has 79,920 questions: `shapes/mul-column-count.ts` counts them by place and finds the question at one place of the order, with no list and nothing kept between calls. A question takes about 0.1 ms or less, and the choice is the same as from the whole list. `add.column` (90,899,091 questions) and `sub.column` (49,995,000) take 0.1 to 0.4 ms. They fill the columns from the ones up and keep, for each thing that the columns so far can change above, in how many ways it comes. Their registrations count from the first column down (`testing/column-facts.ts`), and read a difference as the sum that it undoes.

## Adding a shape

1. Add one shape file in `shapes/` with `version: 1`, and the shape in `shapes/index.ts` (`SHAPES`).
2. Add its registration in a file of its own, `testing/registrations/<shape>.ts`, and the file in the list of `testing/shape-registrations.ts`. It shares no code with the shape and speaks of printed rows only (`testing/shape-registration.ts` has the interface; `testing/example-shapes.ts` has a listed space and a space that is too large to list):
   - `limits`: one rule for each limit, as data (`rangeLimit`, `neverLimit`, `onlyLimit`). With many limits, `oftenWide` keeps most of the made limits wide, or almost no question is left: the suite asks for 60 limits that some question meets. The harness makes limits, wider limits and bad limits from the rules.
   - `read(rows)`: the answer, one feature for each limit, at least one width and every worked step with its marks (`step("2 × 4 = 8, write 8", "w8@0")`), computed from the printed rows in another way than the shape.
   - `space`: the list of every printed question, or the count and the ends for any limits. `listed` is a part of a large space whose questions are all inspected (2 and 3 digits of `mul.column`).
   - `cases` (the limits of each bank row must be one), `smallSpaces` with complete lists by hand, `witnesses` (for each limit a question inside and one that breaks only it), and the named lists.
   - Steps: the harness compares the whole list of steps and marks with the list of the reader, checks every clause of each step against the closed grammar (`testing/steps-evaluator.ts`), and checks the marks against the clauses and answer ("Steps" above).
3. Run `npm run workbook:v2:fingerprints`, then `npx vitest run src/lib/workbook-v2/shapes --sequence.shuffle`.

`worstCase` is one question that is the widest in every width and in digit places. If the widths pull apart (99 - 4 leaves as much as 100 - 5 in fewer places), register the digit places as the width.

The harness (`testing/shape-harness.ts`) takes 1,000 production seeds for each shape: `planBook` builds one book with both sides and all places of each template that fits any of the limits, and each generated question is compared with the reader, the rules, the second solver, the steps and the ranges. Limits come from fast-check with a fixed seed, so a failure comes back in the next run, and its message holds the call that repeats it. `testing/shape-harness.test.ts` holds a broken shape for each check. An answer with parts needs a new kind in `ANSWER_KINDS` and `Answer` (`contract.ts`) and its rule in `ANSWER_FORMS` (`testing/shape-checks.ts`); the rest compares whole answers.

**Fingerprints:** `testing/fingerprints/<shape id>.json` holds one file per shape, with one SHA-256 for each version of that shape: every question of a listed space, or every `listed` question and small space plus 1,000 seeded questions of a large one, with the registered limits. In a large space, questions outside `listed` and `smallSpaces` have sampled coverage only. A change of the output needs a new `version`, then the command. Parallel branches that add shapes merge cleanly because `.gitattributes` sets `merge=union` on `shapes/index.ts` and `testing/shape-registrations.ts`, and each shape has its own registration file and fingerprint file. A stored entry never changes: `scripts/shape-fingerprint-base.mjs` compares the folder with the base of the branch, in the `scope` job of CI (the one job that always has the base) and in `npm run check:fast`.

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
- More shapes (UNI-237, 238 and 240): follow "Adding a shape" above. A new look of a question is a new `Face` and a template that takes it.
