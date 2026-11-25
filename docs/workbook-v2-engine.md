# Workbook engine v2

The v2 engine turns a bank snapshot file into a book: page models, answers, a PDF, page images and the position of each rectangle. It is in `src/lib/workbook-v2/`, apart from the v1 generator, and it is not connected to the app yet. It holds ten shapes (addition, subtraction and multiplication in columns, the facts of +, - and ×, repeated addition, skip counting, a missing factor and a missing addend), seven page templates and invented sheets of all of them.

## Use it

```sh
npm run typst:install    # once for each computer
npm run workbook:v2 -- --snapshot src/lib/workbook-v2/fixtures/snapshot.json --book src/lib/workbook-v2/fixtures/book.json --out /tmp/example-book
```

```sh
npm run workbook:v2:check -- --snapshot src/lib/workbook-v2/fixtures/snapshot.json    # every sheet and row of a level
```

Run both from the repository root. The build uses no network. The output folder must be new or empty. It gets `book.pdf`, `page-1.png` and up (150 pixels an inch), `pages.json` (page models), `positions.json` (what Typst reports), `answers.json` and `record.json` (the engine, snapshot and input, the version of Typst, and the SHA-256 of its program on this computer, of the drawing file and of each font). A book that fails writes nothing and lists each problem with its place.

The command writes the whole book into a hidden folder beside the output folder and renames it in one step. The system refuses that step when the output folder holds something: of two processes one wins and the other stops. An error removes the hidden folder; a process that is killed can leave one (`.workbook-v2-*`), which is safe to delete.

`snapshot-4-digits.json` and `book-4-digits.json` in the same folder are a sheet of the wide template. `snapshot-add-sub.json` and `book-add-sub.json` are a sheet of `add.column` and one of `sub.column`, each with a side of both column templates. `snapshot-facts.json` and `book-facts.json` are five sheets of facts, equations with a blank inside and sequences.

The snapshot file holds the content of one level. The book file holds the book id, the child id, and for each sheet the attempt and the text of the two QR codes. The caller makes all of these; the engine makes none. Both must be plain JSON data: the build reads a copy, and the hashes cover exactly that copy. An inherited, hidden or computed value is refused. A level name is a number, and a page number and the next one must be exact whole numbers.

## Modules

| Module | Interface | Place |
|---|---|---|
| Contract | types, paper and print rules; imports nothing | `contract.ts` |
| Bank | `validateSnapshot(raw)`: the checked snapshot and its hash, or every problem | `bank/` |
| Shapes | one file for each shape family; the interface is in `shape.ts` | `shapes/` |
| Layout | `buildPages(sheets)`; templates are fixed rectangles in points | `layout/` |
| Checks | before the drawing: `checkPrintedAnswers(pages, items, shapes)`, `checkPage(page, items)`; after it: `checkDrawing(pages, items, drawn)`, which is `checkRendering`, `checkPositions`, `checkTexts`, `checkFit`, `checkPlaces`, `checkImages` and `checkPdf` | `checks/` |
| Renderer | the interface to a typesetter (`render(pages)`) | `renderer.ts` |
| Render | the only module that calls Typst; fonts, pins, install | `render/` |
| Build | `buildBook(input, renderer)`: the book with its notices, or a list of problems; `planBook(input)`: the pages and items of the book before the drawing, as `{ ok: true, ... }`, or `{ ok: false, problems }`; `checkBank(snapshot, renderer)`: the problems of a level, with sheet, side and row | `build/` |

## Rules

- **Pure boundary:** everything outside `render/` and `testing/` is pure and cannot import `render/`. `buildBook` gets a `Renderer`. Behind it, `render/` may read files and start Typst, with no clock, random source, network or setting of the computer. `npm run check:guard` enforces this, the import list and the rule of no level branches (`scripts/engine-guard.mjs`, which says what it does not see). The checks read page images with `inflateSync` of `node:zlib` and with `jsqr`. Both turn bytes into a value and touch nothing else, so the guard lists them for the pure part.
- **Seed:** the child, the sheet id and the attempt decide the numbers. See "Repeats" for the questions of a sheet. A new attempt of a sheet may repeat a question of an earlier attempt, also when others exist; the choice of unseen questions is UNI-258.
- **Order on a side:** the difficulty decides it, from easy to hard, so the questions of two rows may mix. A row in order (see "Rows in order") is not sorted and mixes with no row. Questions of equal difficulty keep the row order of the bank. Each item records its row (`rowId`). Scores compare only inside one shape, so rows of two shapes never mix.
- **Places:** a side has no more questions than the places of its template on that side.
- **Answers:** a shape computes each answer from the parameters of the question. The second computation (`solveAgain`) gets only the printed rows, which the build takes from the rectangles of the page model, from top to bottom and from left to right. An answer area beside or inside its question is a blank of the row (`□`, a character that no page prints). Each answer must first have a good form: parts with names that marking knows, each one time, of the kind of the shape, with a value in the form of the kind (`checks/answer-form.ts`). The second computation must read the same question and compute the same answer, with the same parts in the same order, and the last worked step must be it and draw nothing. If not, the build stops.
- **Worked steps:** see "Steps" below.
- **Geometry:** every position is in the page model. `page.typ` only draws it. The build compares the rectangles and the text that Typst reports with the model.
- **Proof of each page:** see "Fit and ink" below.
- **Typst and fonts:** pinned by version and SHA-256 in `render/pins.ts`. The fonts and the drawing file are read once and each drawing uses that copy in a private folder; the program is checked again before each drawing. `typst:install` puts the official program in `~/.cache/unica-learning/typst/`. Computer fonts and Typst's own fonts are off. Any Typst warning stops the build. Typst prints an empty box, with no warning, for a character that a font does not hold, so `validateSnapshot` refuses those characters in the bank and `checkPage` refuses them in every text that a page prints (`isPrintable`).
- **A change that can change a page or an output file** (Typst, a font, `page.typ`, a template, a shape, or the fields of `answers.json`) also changes `ENGINE_VERSION`. Each `BookItem` in `answers.json` carries `shapeVersion` from its shape; `solveAgain` and layout do not read it.

## Fit and ink

No check repairs a page: a text is never clipped, made smaller or wrapped to fit. A book that fails one stops with the list of problems, each with its page and place. The checks know no face, part or template; they read the model, the paper and the print rules. Only the place value check knows a face, the stack.

| Layer | What it proves | When |
|---|---|---|
| 1. Measure (`checks/fit.ts`) | Typst measures each text with all the room it wants, and says where it drew it. The width, and the ink above and below its line, fit the rectangle of the text. Its size and weight are those of the model, it is on one line, as wide as it wants, and at the left, in the middle or at the right of its place. | every drawing |
| 2. Own slot (`inkOutside` in `checks/blank.ts`) | A question that is drawn alone on an empty page leaves no ink outside its slot, and has some ink. | the bank check |
| 3. Blank zones (`strayInk` in `checks/blank.ts`) | A page has no ink but that of its model. | every page of every book, and the full pages of the bank check |

**Flow text** is an ink of its own kind (`flow` in `contract.ts`): words and math in a rectangle, from its top left corner. A word is split after each of its hyphens and nowhere else; math is one piece, so a negative number must be math. Typst wraps the pieces, and layer 1 checks each piece: its width, its line, its place inside the rectangle, its order, and one space between two tokens. The problem names the token. No bank field and no template uses it yet (UNI-139).

**Place value** (`checks/place-value.ts`): the digits of a stack stand in the columns of its question, counted from its right end, where Typst reports them. A digit may be 2% of a column from the middle.

**Page images** are read one time (`checks/images.ts`). The QR code must fill its box and read as the text of its own page, and there must be no second code. Every text must have ink in its rectangle and the sides of an outline must have no gap in their middle half, with pixels below 72; each whole pixel of a fill must be 0. Ink is a pixel with a part of its colour below 245. Every pixel must be a grey, and an area of 3 by 3 pixels of one grey must be within 2 of black or white. What these do not see: a stray mark inside the rectangle of a text, a middle letter that is missing, and a grey from 3 to 71 in lines that are less than 3 pixels wide. The PDF check sees all three.

**Edges in pixels** (150 an inch, so 1 point is 2.08 pixels). Typst gives a pixel at the edge of ink a part of its colour, so:

- The print of the model covers each pixel that it touches: a fill, the rectangle of a text, and a band for each side of a border (0.75 points is 1.56 pixels, which touches 2 or 3 pixels).
- A zone is the pixels that are in it with all of their area. A zone holds its own print and no other, whatever else the model says: an answer area its border, a QR box its squares, and a reach, a work area, the spine zone (90 points) and the margins (36 points) nothing. A reach also holds the border of its answer area, which is in it.
- The rest of a page may hold ink only where the model prints.

A square of 1 point is found at each place of a zone, also in the grey of 244 and beside a border, because it always covers a whole pixel past the edge. A square that touches the border itself is seen only in the part that is past the border.

**The PDF** goes to the printer, and Typst makes it in a run of its own. `checks/pdf-file.ts` reads it back with no other program, and refuses everything that a book does not have: another drawing command (a picture, a clip, a curve, see-through ink), a turn or a scale, a colour, a note, a page box or a start action. `checks/pdf.ts` then compares each page with the model: the count and the size of the pages, white paper, and the fills, outlines and texts in their order, with place, size, weight and width, all in black. The PDF and the images have the same drawing file, program, fonts and settings; only the run that reports has one more input. Not proved: the shapes of the letters in the fonts of the PDF, that each letter name in it is the letter that is drawn, and what a printer makes of it (UNI-145, the physical run).

**The bank check** (`build/check-bank.ts`, for the freeze of a level, UNI-140) reads a snapshot and lists its problems with sheet, side and row:

- 200 seeds make each sheet, with every check that needs no drawing. The first seed that fails is named, and the rows that fail alone.
- Each different text that those seeds print is measured in the size of its place. The widest question of a shape has the most digits, and not the widest digits: "20" is wider than "10".
- The widest question of each form of each row is drawn at every place of its template on both sides, with every check of a book, and one time alone (layer 2). Questions that two rows share are drawn alone one time.

| Level | Time on a laptop |
|---|---|
| A sheet of columns (4 rows) | 0.7 s |
| Five sheets of facts and sequences (17 rows; one sequence of ten terms has many forms) | 14 s |
| 200 sheets, made by repeating the nine example sheets (822 rows, 807,200 questions, 10,268 full pages) | 4 minutes, 450 MB of memory |

The check of 200 different sheets draws more questions alone: about 4 ms for each, and up to 160 for a sheet of facts. A level can take some minutes more.

120 pages build in about 4 seconds with all checks: 2 for Typst and 1.5 for the checks of the drawing.

## Answer parts

An answer is a list of `AnswerPart` in reading order, each with a name, a kind and a value (`contract.ts`). Each part has one answer area with one reach, and these rectangles carry the name of the part (`Region.part`). A question with one area calls its part `answer`, and the ids of its rectangles are as before (`answer-3`, `reach-3`). Other parts are in the id: `answer-3-blank-2`. A sequence names its parts `blank-1`, `blank-2` and so on; later shapes add `quotient` or `remainder`.

`checkPage` stops a part with no area or two, an area of no part, two areas that overlap, an area in the reach of another part, areas that a reader meets in another order than the parts, and a face whose blanks are not the parts. Each rectangle of a question belongs to a question of its page, the others belong to none, and the whole id of each one must be the page, its role, the number of the question and the part. Each answer area has exactly one outline, which is its rectangle; the image check looks for it. `checkPrintedAnswers` stops an answer with a bad form, and a value, a name or a kind in the wrong part. The last worked step is the value of each part, such as `20, 30`.

## Faces and templates

A face is what a question looks like. The layout knows no math in it.

| Face | What it is | Answer areas |
|---|---|---|
| `column` | a stack of two numbers | one, directly below, with a work area |
| `equation` | tokens on one line: texts and blanks | in the line, with no work area |
| `sequence` | terms and blanks, one below the other | in the ladder of terms, with no work area |

A place of a token template has fixed cells. A cell holds a text, an answer area, or either of them. A place can have more than one form, and the layout takes the form with an area for each blank; a question with fewer tokens takes the first or the last cells of it. No rectangle moves with the text.

| Template | Questions a side | Form |
|---|---|---|
| `facts-2x10` | 20 | five tokens with the blank at the end, two columns of answer areas |
| `sums-1x10` | 10 | up to nine numbers with the blank at the end, one column |
| `blanks-1x10` | 10 | a blank in the place of the first or second number, all areas in one column |
| `sequences-2x2` | 4 | up to five terms, two columns |
| `sequences-2x1` | 2 | up to ten terms, two columns |

- A row is an answer area of the smallest size with its reach: 61.2 points. Ten rows fit between the instruction and the QR code; eleven or twelve do not.
- A sequence goes down the page. On one line, five blanks need 600 points and there are 486; on a grid of lines the blanks stand in four columns, and a side may have two. Down the page each blank has its own area and reach, and all blanks of a side are in two columns.
- Questions run down a column, so that a table in order reads down.
- `needsOf` says how large a question is, and `holds` how large a place is. `placeProblem` compares them for one place and looks for a form: the layout asks it for each question at the place where it is drawn. `fitProblem` asks it for all places of both sides; the bank check and the harness use it for the widest question of each form of a row (`formsOf`). A shape whose blanks can stand in more than one place gives the forms.
- The child must be able to tell the rule of a sequence, so the instruction of a side with sequences says that the step stays the same ("The step stays the same. Write the missing numbers."). It is content of the bank: nothing checks it.

## Rows in order and swapped forms

A fact limit `tables` is stored as a set: the first numbers in rising order, such as `[2, 5, 10]`; a range is refused. The limit `order` is `mixed`, `up` or `down`. For the last two, `orderedRuns(limits, items)` gives every row that it can be: consecutive questions of one table (of the tables one after the other when no table is long enough). The seed of the row names the first of them, and the builder takes the next one when it repeats a question. A row is one decision, so a seed for each place could not make it, and the builder cannot sort a row into the order of a table because it knows no math. The difficulty of the questions is stored as always, the range of the limits still decides whether a row may stand below another one, and the sort of the side leaves the row alone.

`swapped(question, limits)` gives the swapped form of a fact (7 × 5 for 5 × 7) and whether the limits allow it, or null (5 × 5, and every subtraction). Nothing prints it yet; the choice of unseen questions is UNI-258.

## Repeats

For a shape with a list, `build/row-questions.ts` chooses the questions of all its rows on a sheet together, as a function of the seeds only:

- No question repeats on a sheet when the rows of both sides can all be different, and none repeats on a side when the rows of that side can.
- A row in order takes the first run, from the one that its seed names, that shares no question with the rows in order before it and leaves enough for all other rows. Then each place of a mixed row takes the question that its seed gives, or one of those that are left, each with the same chance. When none is left, an earlier place moves to another question (an augmenting path).
- When the sides cannot be different, the back side uses as few questions of the front as its choice allows. When a side cannot be different, a question repeats, but never in one row.
- A search looks at 20,000 choices of runs at most. Only a sheet with very many rows in order could need more; it is then treated as one with no choice.

A shape with no list asks 500 times for a question that the sheet does not have, then takes one that the side or at least the row does not have. It stops as soon as the sheet has met as many different questions of these limits as `count` says and none of them is less used than the one it holds: more tries would give the same question. A book with a repeat is built: `notices` of the book, which the command prints, name each row that has a question of an earlier row of the side or of the front side. The bank check stops a row that asks for more questions than its own limits allow.

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

The registration of a shape says how its answer is worked (`working`). A column stack must say `columns`.

With `lines`, each step before the answer is one true equation with a whole number, nothing is drawn, and the value of each part is the result of some line.

With `columns` (the harness checks each rule, `testing/steps-evaluator.ts` and `testing/step-marks.ts`):

- Every working step follows a closed clause grammar, in strict order, separated by `", "`: an equation (`3 × 4 = 12`) or, in a column whose lower number has no digit there, only the top digit (`3, plus 1 is 4`; a last column with nothing to add says `3, write 3`), an optional incoming carry addition (`plus 2 is 14`), a write clause (`write 4`; required before the last column, optional on the last column where it must write all digits of the column total), and an optional carry clause (`carry 1`; required before the last column when the total is 10 or more, forbidden on the last column). Unknown clauses, repeated clauses, out-of-order clauses, or wrong numbers fail.
- All "write" marks together are the digits of the answer: each place one time.
- A step that carries writes one digit and puts its "carry" mark one place above that digit. The next step writes that place and adds the same digit.
- The words say the same as the marks, and no mark and no word says a carry of 0.
- A step that borrows has exactly two clauses, `borrow 1 ten` and `4 tens become 3 tens`, with the right unit and singular or plural words ("1 ten becomes 0 tens").

A column face is also worked on its paper (`testing/step-marks.ts`); its printed rows must be two, with `+`, `-` or `×` before the lower number. The checker starts from the two printed rows and goes column by column from the ones. Each step must have exactly the operands that its column shows then, in the printed order and with the printed sign (`3 × 4` for the 4 of 247 × 3), or the only digit of a column that has one. It writes its own place, and no column is left out, repeated or too many. For a subtraction it applies each step in order and refuses one that does not follow from what the paper shows then:

- A borrow is for the column that is next, and only when that column has too little. It comes from the nearest place above that is not 0, crosses out the number that this place shows, writes one less, and shows ten more in the place just below. Over zeros the next borrow then hands the ten on, place by place.
- A column says exactly what the paper shows (`12 - 7`, or only the top number when nothing is below), and writes the digit that is left at its own place.
- A zero in front of the answer is not written: the step says `write nothing` and has no marks. A first digit that became 0 with nothing below it has no step. Any other column with no step is refused.

What the marks cannot say yet: rows and offsets for long division and two partial products. A later shape adds typed marks to `STEP_MARKS` (and its clause kind in the single list `CLAUSE_KINDS` in `testing/steps-evaluator.ts`, plus its check in `testing/step-marks.ts`) without changing the forms above or the shapes themselves.

## Limits and large spaces

Limits are ranges, sets in rising order and words with no default, so that one meaning has one form (`readLimitFields` in `shapes/shape.ts` reads them). The limits of `mul.column` are in `shapes/mul-column-count.ts`. A carry is a carry into the next written column: `carryIntoTens`, `carryIntoHundreds` and `carryIntoThousands` are ranges of the carry itself (0 is none), and `carries` counts the columns that get one. What the last column makes is written, not carried.

`add.column` and `sub.column` share `shapes/column-count.ts`. Their carries are the same, each 0 or 1; `borrows` and `borrowFromTens` to `borrowFromThousands` say the same of the places that give a ten. `carryChain` is a carry that a column makes only because it gets one. `acrossZero` and `acrossTwoZeros` are a borrow that one zero, or two, of the top number must get first. A zero in a place of a number (`aZeroInTens`, `bZeroInOnes`, ...) is after its first digit. Numbers start at 1, and the top number never has fewer digits than the lower one. Contradicting limits have the count 0. `readLimits` then names each limit that alone could be wider to have some, or, when no one change is enough, all limits that are narrower than they could be (`emptyProblem` in `shapes/shape.ts`, also for `mul.column`).

A shape whose space is too large to list must not list it for each question. `mul.column` has 79,920 questions: `shapes/mul-column-count.ts` counts them by place and finds the question at one place of the order, with no list and nothing kept between calls. A question takes about 0.1 ms or less, and the choice is the same as from the whole list. `count.skip` has 1,857,096: it counts lines (step, start, terms) and choices of blanks apart, because only the number of terms joins them. `add.column` (90,899,091) and `sub.column` (49,995,000) take 0.02 to 0.4 ms a question. They fill the columns from the ones up and keep, for each thing that the columns so far can change above, in how many ways it comes. Their registrations count from the first column down (`testing/column-facts.ts`), and read a difference as the sum that it undoes.

A small space (`shapes/small-space.ts`) is listed for each question, and the shape gives the list to the builder.

## Adding a shape

1. Add one shape file in `shapes/` with `version: 1`, and the shape in `shapes/index.ts` (`SHAPES`).
2. Add its registration in a file of its own, `testing/registrations/<shape>.ts`, and the file in the list of `testing/shape-registrations.ts`. It shares no code with the shape and speaks of printed rows only (`testing/shape-registration.ts` has the interface; `testing/example-shapes.ts` has a listed space and a space that is too large to list):
   - `limits`: one rule for each limit, as data (`rangeLimit`, `neverLimit`, `onlyLimit`). With many limits, `oftenWide` keeps most of the made limits wide, or almost no question is left: the suite asks for 60 limits that some question meets. The harness makes limits, wider limits and bad limits from the rules.
   - `read(rows)`: the answer, one feature for each limit, at least one width and every worked step with its marks (`step("2 × 4 = 8, write 8", "w8@0")`), computed from the printed rows in another way than the shape.
   - `space`: the list of every printed question, or the count and the ends for any limits. `listed` is a part of a large space whose questions are all inspected (2 and 3 digits of `mul.column`).
   - `cases` (the limits of each bank row must be one), `smallSpaces` with complete lists by hand, `witnesses` (for each limit a question inside and one that breaks only it), and the named lists.
   - `working`, and only for a shape that has them: `ordered` (which limits ask for a row in order, and what comes after a question) and `swapped` (the printed swapped form).
   - Steps: the harness compares the whole list of steps and marks with the list of the reader, checks every clause of each step against the closed grammar (`testing/steps-evaluator.ts`), and checks the marks against the clauses and answer ("Steps" above).
3. Run `npm run workbook:v2:fingerprints` (with `-- --shape <id>` for one shape), then `npx vitest run src/lib/workbook-v2/shapes --sequence.shuffle`.

`worstCase` is one question that is the widest in every width and in digit places. If the widths pull apart (99 - 4 leaves as much as 100 - 5 in fewer places), register the digit places as the width.

The harness (`testing/shape-harness.ts`, with the step checks in `shape-steps.ts` and the fit checks in `shape-fit.ts`) takes 1,000 production seeds for each shape: `planBook` builds one book with both sides and all places of each template that fits any of the limits, and each generated question is compared with the reader, the rules, the second solver, the steps and the ranges. Limits come from fast-check with a fixed seed, so a failure comes back in the next run, and its message holds the call that repeats it. `testing/shape-harness.test.ts` holds a broken shape for each check. A new answer kind needs its name in `ANSWER_KINDS` (`contract.ts`) and its rule in `VALUE_FORMS`, and a new part its name in `PART_NAME` (both in `checks/answer-form.ts`); the rest compares whole answers.

**Fingerprints:** `testing/fingerprints/<shape id>.json` holds one file per shape, with one SHA-256 for each version of that shape: every question of a listed space, or every `listed` question and small space plus 1,000 seeded questions of a large one, with the registered limits, and the list, the forms, the rows in order and the swapped forms of a shape that has them. An answer in one area counts as its kind and value, as before answers had parts. In a large space, questions outside `listed` and `smallSpaces` have sampled coverage only. A change of the output needs a new `version`, then the command. Parallel branches that add shapes merge cleanly because `.gitattributes` sets `merge=union` on `shapes/index.ts` and `testing/shape-registrations.ts`, and each shape has its own registration file and fingerprint file. A stored entry never changes: `scripts/shape-fingerprint-base.mjs` compares the folder with the base of the branch, in the `scope` job of CI (the one job that always has the base) and in `npm run check:fast`.

## Tests

`npx vitest run src/lib/workbook-v2` takes about 10 seconds and needs no browser, network or database. The tests that draw pages use the real Typst. In CI they run in the `engine` job (`Workbook engine` in `.github/workflows/ci.yml`), which installs the pinned Typst, runs `npm run check:guard`, runs `npm run engine:typecheck`, runs the engine tests, and reports the test time against the 15 s budget. In CI those tests fail when Typst is absent; on a laptop without it they are skipped and print the reason.

## In a Vercel function

`openRenderer(vercelAssets(process.cwd()))` draws with the official pinned Typst program for linux x64, and `buildBook` runs all checks as on a laptop. Proved on a preview deployment on 2026-11-24 (UNI-138): the PDF and each page image were the same bytes as on a Mac. With a new renderer the two-page book took 0.75 to 1.02 s (three calls in one function instance), and the temp folder was empty after each call. The Node binding of Typst was faster (0.3 to 0.6 s) but gave other page images, always reads the fonts of the computer, and cannot be pinned by SHA-256 or stopped, so it is not used.

- **Program:** it must be a regular file with the pinned SHA-256. `npm run typst:stage` puts the verified program (53 MB) in `.workbook-v2/`, which Git ignores. `workbookV2TraceFiles()` lists the files that the bundle of the function must hold.
- **No permission to run:** the bundle can only be read. When the program in it may not run, each drawing copies the verified bytes into its private temp folder.
- **Not connected:** no function builds books yet, so no build stages the program. The first one (UNI-260) adds `typst:stage` to the build, where a failed download must fail the deployment, and the files to `outputFileTracingIncludes` for its route.

## Where the next parts connect

- The freeze of a level (UNI-140) calls `checkBank`. Story text (UNI-139) prints the `flow` ink.
- The book job (UNI-260): see "In a Vercel function".
- More shapes (UNI-237 part 2 and UNI-240): follow "Adding a shape" above. A new look of a question is a new `Face` and a template that takes it.
