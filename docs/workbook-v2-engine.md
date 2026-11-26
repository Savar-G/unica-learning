# Workbook engine v2

The v2 engine turns a bank snapshot file into a book: page models, answers, a PDF, page images and the position of each rectangle. It is in `src/lib/workbook-v2/`, apart from the v1 generator, and it is not connected to the app yet. It holds fourteen shapes (addition, subtraction and multiplication in columns, the facts of +, -, × and ÷, repeated addition, skip counting, a missing factor, a missing addend, division with a remainder, long division and place value), fifteen page templates and invented sheets of all of them.

## Use it

```sh
npm run typst:install    # once for each computer
npm run workbook:v2 -- --snapshot src/lib/workbook-v2/fixtures/snapshot.json --book src/lib/workbook-v2/fixtures/book.json --out /tmp/example-book
npm run workbook:v2:check -- --snapshot src/lib/workbook-v2/fixtures/snapshot.json    # every sheet and row of a level
```

Run them from the repository root. No command uses the network, apart from the install. The output folder of a book must be new or empty. It gets `book.pdf`, `page-1.png` and up (150 pixels an inch), `pages.json` (page models), `positions.json` (what Typst reports), `answers.json` and `record.json` (the engine, snapshot and input, the version of Typst, and the SHA-256 of its program on this computer, of the drawing file and of each font). A book that fails writes nothing and lists each problem with its place.

The command writes the whole book into a hidden folder beside the output folder and renames it in one step. The system refuses that step when the output folder holds something: of two processes one wins and the other stops. An error removes the hidden folder; a process that is killed can leave one (`.workbook-v2-*`), which is safe to delete.

`snapshot-4-digits.json` and `book-4-digits.json` in the same folder are a sheet of the wide template. `snapshot-add-sub.json` and `book-add-sub.json` are a sheet of `add.column` and one of `sub.column`, each with a side of both column templates. `snapshot-facts.json` and `book-facts.json` are five sheets of facts, equations with a blank inside and sequences. `snapshot-division.json` and `book-division.json` are seven sheets of divisions, in lines and in brackets. `snapshot-place-value.json` and `book-place-value.json` are two sheets of place value, one of each template of fields.

The snapshot file holds the content of one level. The book file holds the book id, the child id, and for each sheet the attempt and the text of the two QR codes. The caller makes all of these; the engine makes none. Both must be plain JSON data: the build reads a copy, and the hashes cover exactly that copy. An inherited, hidden or computed value is refused. A level name is a number, and a page number and the next one must be exact whole numbers.

## Modules

| Module | Interface | Place |
|---|---|---|
| Contract | types, paper and print rules; imports nothing | `contract.ts` |
| Bank | `validateSnapshot(raw)`: the checked snapshot and its hash, or every problem | `bank/` |
| Shapes | one file for each shape family; the interface is in `shape.ts` | `shapes/` |
| Layout | `buildPages(sheets)`; templates are fixed rectangles in points | `layout/` |
| Checks | before the drawing: `checkPrintedAnswers(pages, items, shapes)`, `checkPage(page, items)`; after it: `checkDrawing(pages, items, drawn)`, which is `checkRendering`, `checkPositions`, `placeTexts`, `checkFit`, `checkPlaces`, `checkImages` and `checkPdf` | `checks/` |
| Renderer | the interface to a typesetter: `render(pages)`, and `images(pages)` and `report(pages)` for a part of it | `renderer.ts` |
| Render | the only module that calls Typst; fonts, pins, install | `render/` |
| Build | `buildBook(input, renderer)`: the book with its notices, or a list of problems; `planBook(input)`: the pages and items of the book before the drawing, as `{ ok: true, ... }`, or `{ ok: false, problems }`; `checkBank(snapshot, renderer)`: the problems of a level, with sheet, side and row | `build/` |

## Rules

- **Pure boundary:** everything outside `render/` and `testing/` is pure and cannot import `render/`. `buildBook` gets a `Renderer`. Behind it, `render/` may read files and start Typst, with no clock, random source, network or setting of the computer. `npm run check:guard` enforces this, the import list and the rule of no level branches (`scripts/engine-guard.mjs`, which says what it does not see). A drawing file may use `json("pages.json")`, `str(sys.version)` and `"report" in sys.inputs`, and no other file, clock or fact of the computer. The checks read page images with `inflateSync` of `node:zlib` and with `jsqr`. Both turn bytes into a value and touch nothing else, so the guard lists them for the pure part.
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

No check repairs a page: a text is never clipped, made smaller or wrapped to fit. A book that fails one stops with the list of problems, each with its page and place. The checks of the drawing know no part and no template; they read the model, the paper and the print rules. Only the place value check knows faces: the stack and the bracket.

| Layer | What it proves | When |
|---|---|---|
| 1. Measure (`checks/fit.ts`) | Typst measures each text with all the room it wants, and says where it drew it. The width, and the ink above and below its line, fit the rectangle of the text. Its size and weight are those of the model, it is on one line, as wide as it wants, and at the left, in the middle or at the right of its place. | every drawing |
| 2. Own slot (`inkOutside` in `checks/blank.ts`) | A question that is drawn alone on an empty page has all ink of its model, in its colours, on an image of the right size, and no ink outside its slot. | the bank check |
| 3. Blank zones (`strayInk` in `checks/blank.ts`) | A page has no ink but that of its model. | every page of every book, and the full pages of the bank check |

**Flow text** is an ink of its own kind (`flow` in `contract.ts`): words and math in a rectangle, from its top left corner. A word is split after each of its hyphens and nowhere else; math is one piece, so a negative number must be math. Typst wraps the pieces, and layer 1 checks each piece: its width, its line and its place inside the rectangle. The first piece starts at the corner of the rectangle. The next one starts where the one before it ends, after one space of the font when a token begins, or on the next line at the left, exactly the leading of the model below. The problem names the token. No bank field and no template uses it yet (UNI-139).

**Place value** (`checks/place-value.ts`), where Typst reports the digits: those of a stack stand in the columns of its question, counted from its right end. Those inside a bracket stand in the first columns of the answer area above, from its left end, so that a digit can stand over each one; the number outside and the sign stand left of them, in their own order. A digit may be 2% of a column from the middle. `checkPage` says the same of the model before the drawing ("Faces and templates").

**Page images** are read one time (`checks/images.ts`). The QR code must fill its box and read as the text of its own page, and there must be no second code. Every text must have ink in its rectangle and the sides of an outline must have no gap in their middle half, with pixels below 72; each whole pixel of a fill must be 0. Ink is a pixel with a part of its colour below 245. Every pixel must be a grey, and an area of 3 by 3 pixels of one grey must be within 2 of black or white. Each place with ink that the model does not have is named, and an image of several wrong places gives a problem for each of them. A pixel belongs to the first place that holds its middle (answer areas first), so a mark on an edge can be named in two places.

**Edges in pixels** (150 an inch, so 1 point is 2.08 pixels). Typst gives a pixel at the edge of ink a part of its colour, so:

- The print of the model covers each pixel that it touches: a fill, the rectangle of a text, and a band for each side of a border (0.75 points is 1.56 pixels, which touches 2 or 3 pixels).
- A zone is the pixels that are in it with all of their area. A zone holds its own print and no other, whatever else the model says: an answer area its border, a QR box its squares, and a reach, a work area, the spine zone (90 points) and the margins (36 points) nothing. A reach also holds the border of its answer area, which is in it.
- The rest of a page may hold ink only where the model prints.

A square of 1 point is found at each place of a zone, also in the grey of 244 and beside a border, because it always covers a whole pixel past the edge. A square that touches the border itself is seen only in the part that is past the border.

**The PDF** goes to the printer, and Typst makes it in a run of its own. `checks/pdf-file.ts` reads it back with no other program, and refuses everything that a book does not have: another drawing command (a picture, a clip, a curve, see-through ink), a turn or a scale, a colour, a note, a page box or a start action. `checks/pdf.ts` then compares each page with the model: the count and the size of the pages, white paper, and the fills, outlines and texts in their order, with place, size, weight and width, all in black. A letter may stand from the one before it only as far as the fonts kern a pair (-30 to 160 thousandths of the size, measured over all pairs that may be printed), so a letter that is moved and moved back is refused. Typst hangs no punctuation over the edge of a text (`overhang: false`), so the report and the PDF have one place for it.

**What a book does not prove:**

- The PNG files and the PDF come from two runs of Typst with the same program, drawing file, fonts and pages; only the run that reports has one more input. No check compares the two drawings with each other. A different digit inside its own rectangle in the image alone is not seen. In the PDF it is.
- In the images: a stray mark inside the rectangle of a text, a missing middle letter, a grey from 3 to 71 in lines that are less than 3 pixels wide, and an area lighter than 245 that is less than 3 pixels wide. The PDF check sees all of them.
- In the PDF: the shapes of the letters in its fonts, that each letter name in it is the letter that is drawn, and a letter that is moved inside the bound of the kerning. What a printer makes of it is for the physical run (UNI-145).

**The bank check** (`build/check-bank.ts`, for the freeze of a level, UNI-140) reads a snapshot and lists its problems with sheet, side and row:

- 200 seeds make each sheet, with every check that needs no drawing. The first seed that fails is named, and the rows that fail alone.
- **Every text that the limits of a row admit is measured in its place**, at each place of both sides of its template (`build/row-texts.ts`), and not only what the seeds print. The widest question of a shape has the most digits and not the widest digits: "20" is wider than "10".
  - A shape with a list: the texts of every question of the list. A question that does not fit the template is a problem. Limits that a row in order never reaches count too, because the limits admit them.
  - A shape with no list: the texts of the widest question of each form, with every digit 0 to 9 in the place of its digits, and with as many digits as the longest number of that question, plus 0.021 of the size between two digits (the most that the fonts add). A stack fills all of its digit places in both lines; a bracket prints as many digits as its widest question. This is at least as wide as each question of the limits, as long as the shape gives each form and no question needs more than the widest one of its form; the shape harness checks both with its seeds.
  - Each text that the seeds print, with the heading, the instruction and the footer. A text that does not fit names every row that prints it.
- A shape that gives no form, or a row for which nothing is drawn, is a problem (also in `validateSnapshot` and in the shape harness).
- The widest question of each form of each row is drawn at every place of its template on both sides, with every check of a book, and one time alone (layer 2). Questions that two rows share are drawn alone one time.
- A drawing that Typst cannot make is made again row by row, question by question or text by text, and a shape that throws names its sheet, side and row. When the parts can only not be drawn together, the problem names all of their rows.

| Level | Time on a laptop |
|---|---|
| A sheet of columns (4 rows) | 0.6 s |
| Five sheets of facts and sequences (17 rows; one sequence of ten terms has many forms) | 13 s |
| Seven sheets of divisions, in lines and in brackets (28 rows) | 3 s |
| 200 sheets, made by repeating the nine example sheets (822 rows, 807,200 questions, 10,268 full pages) | 4 minutes, 400 MB of memory |

The check of 200 different sheets draws more questions alone: about 3 ms for each, and up to 160 for a sheet of facts. A level can take some minutes more.

120 pages build in about 3.5 seconds with all checks: 2 for Typst and 1.5 for the checks of the drawing. The texts of a drawing are matched with the model one time for all its checks (`checks/texts.ts`). A question that is drawn alone needs only its image, and a text that is only measured needs only the report (`Renderer.images` and `Renderer.report`).

## Answer parts

An answer is a list of `AnswerPart` in reading order, each with a name, a kind and a value (`contract.ts`). Each part has one answer area with one reach, and these rectangles carry the name of the part (`Region.part`). A question with one area calls its part `answer`, and the ids of its rectangles are as before (`answer-3`, `reach-3`). Other parts are in the id: `answer-3-blank-2`. A sequence names its parts `blank-1`, `blank-2` and so on. A division with a remainder has the parts `quotient` and `remainder`, and a division that asks for the quotient only has `answer`. Place value has a part for each place of its number, from the highest one: `thousands`, `hundreds`, `tens` and `ones`, each of the kind `digit` (one digit, 0 to 9; `10` and `00` are refused). Its last step is the digits, such as `4, 3, 0, 7`.

`checkPage` stops a part with no area or two, an area of no part, two areas that overlap, an area in the reach of another part, areas that a reader meets in another order than the parts, and a face whose blanks are not the parts. Each rectangle of a question belongs to a question of its page, the others belong to none, and the whole id of each one must be the page, its role, the number of the question and the part. Each answer area has exactly one outline, which is its rectangle; the image check looks for it. `checkPrintedAnswers` stops an answer with a bad form, and a value, a name or a kind in the wrong part. The last worked step is the value of each part, such as `20, 30`, or `9 R1` for a quotient and a remainder (`answerLine`).

Whether a division prints one area or two is the `remainder` limit of its row, and never its numbers: a row that can leave something prints both areas for each question, and the remainder 0 is the answer "0". So a page does not say which questions leave nothing. The instruction of such a side must say what to write then ("Write 0 after R when nothing is left."); it is content of the bank and nothing checks it. For marking (UNI-253): an empty remainder area beside a right quotient, when the remainder is 0, and a 0 in front of a quotient that stands over the bracket (`073`) need a rule.

## Faces and templates

A face is what a question looks like. The layout knows no math in it.

| Face | What it is | Answer areas |
|---|---|---|
| `column` | a stack of two numbers | one, directly below, with a work area |
| `equation` | tokens on one line: texts and blanks | in the line, with no work area |
| `sequence` | terms and blanks, one below the other | in the ladder of terms, with no work area |
| `bracket` | a number inside a bracket and one outside it (`6)438`), with tokens above | the first one over the number inside, so that a digit can stand over each digit; the next one after a printed text in the same line |
| `fields` | a prompt, and below it a row for each blank: a label, then its area | one in each row, after its label, with no work area |

The sign of a bracket is a printed text, so the rows of a question are `□R□` and `6)438`: the two numbers never run together. A bracket says how many lines of work it needs (`workLines`): `checkPage` wants a work area directly below it, under the sign and the whole area of the quotient, with `PRINT_RULES.workLine` (18 points) for each line, and none when it is worked in the head. The work area of a stack has at least `PRINT_RULES.stackWork`.

What a question must print is one rule (`checks/face-print.ts`, used by `checkPage`): each text and each line of its face at its exact place and in its size, and nothing more. The places follow from the answer areas of the question and `PRINT_RULES`, never from a template: the line of a stack, the bar and the sign of a bracket, the R, the line above a sequence or a question of fields that stands below another one, the prompt of fields directly above the reach of its first area, and each label in the line of its area, from the left end of the question to the reach. A face of fields must have a prompt and labels that are not empty, and its blanks are the answer parts in order. The rows of fields read as `4307`, `thousands□`, `hundreds□` and so on. The image check then looks for all of them on the paper.

The frame of a page has one rule too (`checks/frame-print.ts`, used by `checkPage`): the two lines of each scan mark at its corner, the heading, the instruction, the footer, and the number of each question, each in its rectangle with the size, the weight and the end of `PRINT_RULES.frame` and `PRINT_RULES.label`, and nothing more. The number stands at the left end of its slot, on the line that its question starts on. The footer stands between the QR code and the other scan mark.

A place of a token template has fixed cells. A cell holds a text, an answer area, or either of them. A place can have more than one form, and the layout takes the form with an area for each blank; a question with fewer tokens takes the first or the last cells of it. No rectangle moves with the text.

| Template | Questions a side | Form |
|---|---|---|
| `facts-2x10` | 20 | five tokens with the blank at the end, two columns of answer areas |
| `sums-1x10` | 10 | up to nine numbers with the blank at the end, one column |
| `blanks-1x10` | 10 | a blank in the place of the first or second number, all areas in one column |
| `sequences-2x2` | 4 | up to five terms, two columns |
| `sequences-2x1` | 2 | up to ten terms, two columns |
| `remainders-1x10` | 10 | seven tokens with two blanks (`37 ÷ 4 = □ R □`), two columns |
| `brackets-2x6`, `-2x4`, `-2x3` | 12, 8, 6 | brackets with one area and room for no, three or six lines of work, two columns |
| `brackets-1x4`, `-1x3` | 4, 3 | brackets with two areas and room for three or six lines of work, two columns |
| `places-2x2`, `-2x3` | 4, 6 | fields with up to four or two rows, the areas at the right end of two columns |

- A row is an answer area of the smallest size with its reach: 61.2 points. Ten rows fit between the instruction and the QR code; eleven or twelve do not.
- A sequence goes down the page. On one line, five blanks need 600 points and there are 486; on a grid of lines the blanks stand in four columns, and a side may have two. Down the page each blank has its own area and reach, and all blanks of a side are in two columns.
- A side has two answer columns, so a bracket with a remainder stands alone in its row. An area with its reach and the number below it are 92 points high; the rest of the row is the work area.
- A number of a fact has a cell of 36.94 points, which any three digits fit, and a sign one of 12.06. They stand up to 2 points before the reach of the area (`PRINT_RULES.equationGap`).
- Questions run down a column, so that a table in order reads down. Stacks, brackets and fields run across.
- A question of fields has a prompt of up to 4 characters at 22 points and labels of up to 9 characters at 16 points, right of the label of the question and left of the reach. A row is an area with its reach (61.2 points): 4 rows fit in a place of `places-2x2` and 2 in one of `places-2x3`. A question with fewer rows takes the first ones. Only the templates of fields take fields, and they take nothing else. Both prompt and labels are measured by the fit check (`checks/fit.ts`) and `checkBank`.
- `needsOf` says how large a question is, and `holds` how large a place is. `placeProblem` compares them for one place and looks for a form: the layout asks it for each question at the place where it is drawn. `fitProblem` asks it for all places of both sides; the bank check and the harness use it for the widest question of each form of a row (`formsOf`). A shape whose blanks can stand in more than one place gives the forms.
- The child must be able to tell the rule of a sequence, so the instruction of a side with sequences says that the step stays the same ("The step stays the same. Write the missing numbers."). It is content of the bank: nothing checks it.

## Rows in order and swapped forms

A fact limit `tables` is stored as a set: the first numbers in rising order, such as `[2, 5, 10]`; a range is refused. The limit `order` is `mixed`, `up` or `down`. For the last two, `orderedRuns(limits, items)` gives every row that it can be: consecutive questions of one table (of the tables one after the other when no table is long enough). The seed of the row names the first of them, and the builder takes the next one when it repeats a question. A row is one decision, so a seed for each place could not make it, and the builder cannot sort a row into the order of a table because it knows no math. The difficulty of the questions is stored as always, the range of the limits still decides whether a row may stand below another one, and the sort of the side leaves the row alone.

`swapped(question, limits)` gives the swapped form of a fact (7 × 5 for 5 × 7) and whether the limits allow it, or null (5 × 5, and every subtraction). The swapped form of 35 ÷ 7 is 35 ÷ 5, with another answer (the registration says `swapChangesAnswer`); 49 ÷ 7, 7 ÷ 7 and 0 ÷ 7 have none. Nothing prints it yet; the choice of unseen questions is UNI-258.

## Repeats

For a shape with a list, `build/row-questions.ts` chooses the questions of all its rows on a sheet together, as a function of the seeds only:

- No question repeats on a sheet when the rows of both sides can all be different, and none repeats on a side when the rows of that side can.
- A row in order takes the first run, from the one that its seed names, that shares no question with the rows in order before it and leaves enough for all other rows. Then each place of a mixed row takes the question that its seed gives, or one of those that are left, each with the same chance. When none is left, an earlier place moves to another question (an augmenting path).
- When the sides cannot be different, the back side uses as few questions of the front as its choice allows. When a side cannot be different, a question repeats, but never in one row.
- A search looks at 20,000 choices of runs at most. Only a sheet with very many rows in order could need more; it is then treated as one with no choice.

A shape that prints one question in more than one form gives its `identity`: for a division the two numbers, so that 37 ÷ 4 in a line and in a bracket, with one area or two, are one question.

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

A division has four marks, each one digit at a place of the dividend and in a row: row 0 is the line of the quotient, and the rows of the work below the dividend count from 1. 614 ÷ 6 has these steps:

| Text | Marks |
|---|---|
| 6 × 1 = 6, 6 × 2 = 12 is too much, write 1 | quotient 1 at 2, product 6 at 2 in row 1 |
| 6 - 6 = 0, bring down 1, now 1 | rest 0 at 2 and bring-down 1 at 1, in row 2 |
| 1 is less than 6, write 0, bring down 4, now 14 | quotient 0 at 1, bring-down 4 at 0 in row 2 |
| 6 × 2 = 12, 6 × 3 = 18 is too much, write 2 | quotient 2 at 0, product 1 at 1 and 2 at 0, in row 3 |
| 14 - 12 = 2 | rest 2 at 0 in row 4 |
| 102 R2 | |

The estimate of each digit says the largest multiple that fits and that the next one is too much. When the first digit is too small and more than two digits are there, the first step is `4 is less than 6, use 43`, with no marks; two digits that are the whole dividend are used together with no word. All words are in `SAY` (`shapes/division.ts`).

The registration of a shape says how its answer is worked (`working`). A column stack must say `columns`, and a bracket must not.

With `places` (`placesProblem` in `testing/step-marks.ts`), the printed rows must be a whole number of 2 to 4 digits with no 0 in front, and a row for each of its places from the highest one, and the answer parts must be those places. One step says the value of each place in that order, with the digit of the printed number there: `4 thousands is 4000`, `0 tens is 0`, and the word of one for the digit 1 (`1 ten is 10`); the clause kind `place` reads it and checks the words and that the digit times the place is the value. The next step adds exactly these values, in that order, to the printed number (`4000 + 300 + 0 + 7 = 4307`), and the last one is the digits. No step draws anything. A place clause is refused in `columns`, `lines` and `division`.

With `lines`, each step before the answer is one true equation with a whole number, nothing is drawn, and the value of each part is the result of some line.

With `division` (`testing/division-steps.ts`), the checker starts from the printed dividend and divisor, in a line or in a bracket, and works on the paper. It wants as many printed areas as the answer has parts. Each digit of the dividend is used one time from the left. Each step must be the one that comes next: a multiple of the printed divisor that fits while the next one is said and is too much, the subtraction of exactly the part that the paper shows, the next digit brought down with the right number, or a 0 where the divisor does not fit, never in front of the quotient. The marks of each step must be exactly its digits at their places and rows, no step is left out, repeated or too many, the digits of the quotient are the first part, and the last rest is the remainder, or 0 when there is one part. No mark and no clause of a division may stand in columns or lines, and no mark of columns in a division.

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

What the marks cannot say yet: two partial products. A later shape adds typed marks to `STEP_MARKS` (and its clause kind in the single list `CLAUSE_KINDS` in `testing/steps-evaluator.ts`, plus its check in `testing/step-marks.ts`) without changing the forms above or the shapes themselves.

## Limits and large spaces

Limits are ranges, sets in rising order and words with no default, so that one meaning has one form (`readLimitFields` in `shapes/shape.ts` reads them). The limits of `mul.column` are in `shapes/mul-column-count.ts`. A carry is a carry into the next written column: `carryIntoTens`, `carryIntoHundreds` and `carryIntoThousands` are ranges of the carry itself (0 is none), and `carries` counts the columns that get one. What the last column makes is written, not carried.

`add.column` and `sub.column` share `shapes/column-count.ts`. Their carries are the same, each 0 or 1; `borrows` and `borrowFromTens` to `borrowFromThousands` say the same of the places that give a ten. `carryChain` is a carry that a column makes only because it gets one. `acrossZero` and `acrossTwoZeros` are a borrow that one zero, or two, of the top number must get first. A zero in a place of a number (`aZeroInTens`, `bZeroInOnes`, ...) is after its first digit. Numbers start at 1, and the top number never has fewer digits than the lower one. Contradicting limits have the count 0. `readLimits` then names each limit that alone could be wider to have some, or, when no one change is enough, all limits that are narrower than they could be (`emptyProblem` in `shapes/shape.ts`, also for `mul.column`).

A shape whose space is too large to list must not list it for each question. `mul.column` has 79,920 questions: `shapes/mul-column-count.ts` counts them by place and finds the question at one place of the order, with no list and nothing kept between calls. A question takes about 0.1 ms or less, and the choice is the same as from the whole list. `count.skip` has 1,857,096: it counts lines (step, start, terms) and choices of blanks apart, because only the number of terms joins them. `add.column` (90,899,091) and `sub.column` (49,995,000) take 0.02 to 0.4 ms a question. They fill the columns from the ones up and keep, for each thing that the columns so far can change above, in how many ways it comes. Their registrations count from the first column down (`testing/column-facts.ts`), and read a difference as the sum that it undoes.

A small space (`shapes/small-space.ts`) is listed for each question, and the shape gives the list to the builder.

The three division shapes share `shapes/division.ts` (the method, its words, both forms and the `remainder` limit: "none", "any", "some" or a range, where a range that a word says is refused) and `shapes/division-rows.ts` (the second computation: it tries every quotient and remainder and wants exactly one pair). The `form` of a row is "line" or "bracket", never both. A divisor is never 0 or 1, and a dividend that is less than its divisor needs a `quotient` limit with 0. `div.fact` (99 questions) and `div.remainder` (432) are small spaces. `div.long` has 7,920 pairs of numbers and gives the builder no list: the facts of each pair are bits that are made one time. Each call makes a temporary list of the places of the matching pairs, counts it or picks from it, and keeps nothing. This takes less than 0.1 ms. In `div.long`, `start` says whether the first digit is enough, `leftOver` counts the digits of the quotient before the last one that leave something, and `zeroInside` and `zeroAtEnd` are zeros of the quotient.

`place.value` asks for the digit of each place of a number from 10 to 9999. Its limits are `digits` (2 to 4), `number`, `zeros` (how many digits are 0, up to 3) and `zeroInOnes`, `zeroInTens` and `zeroInHundreds`. The first digit is never 0, so `zeroInTens: "only"` allows 3 and 4 digits only, and `zeroInHundreds: "only"` 4 digits only. The facts of the 9,990 numbers are made one time; each call filters them and keeps nothing, and the choice is the place `pick` gives in the rising list. The shape gives the builder no list. `forms` gives the largest number of each count of digits, so that each count of rows is fitted. More digits are harder; then zeros inside the number (before its last digit that is not 0), more of them harder; then zeros only at the end; then no zero; then the larger number. The second computation reads the number and the labels and takes each digit by division (`Math.floor(n / 10^p) % 10`). A 0 still has its area, and its answer is "0": the instruction of a side must say so ("A zero is 0."), which is content of the bank that nothing checks. For marking (UNI-253): an empty area is not a 0, and the kind `digit` needs its reader.

## Adding a shape

1. Add one shape file in `shapes/` with `version: 1`, and the shape in `shapes/index.ts` (`SHAPES`).
2. Add its registration in a file of its own, `testing/registrations/<shape>.ts`, and the file in the list of `testing/shape-registrations.ts`. It shares no code with the shape and speaks of printed rows only (`testing/shape-registration.ts` has the interface; `testing/example-shapes.ts` has a listed space and a space that is too large to list):
   - `limits`: one rule for each limit, as data (`rangeLimit`, `neverLimit`, `onlyLimit`). With many limits, `oftenWide` keeps most of the made limits wide, or almost no question is left: the suite asks for 60 limits that some question meets. The harness makes limits, wider limits and bad limits from the rules.
   - `read(rows)`: the answer, one feature for each limit, at least one width and every worked step with its marks (`step("2 × 4 = 8, write 8", "w8@0")`), computed from the printed rows in another way than the shape.
   - `space`: the list of every printed question, or the count and the ends for any limits. `listed` is a part of a large space whose questions are all inspected (2 and 3 digits of `mul.column`).
   - `cases` (the limits of each bank row must be one), `smallSpaces` with complete lists by hand, `witnesses` (for each limit a question inside and one that breaks only it), and the named lists.
   - `working`, and only for a shape that has them: `ordered` (which limits ask for a row in order, and what comes after a question), `swapped` (the printed swapped form) and `swapChangesAnswer`. The `identity` of a shape must tell the questions of one list apart.
   - Steps: the harness compares the whole list of steps and marks with the list of the reader, checks every clause of each step against the closed grammar (`testing/steps-evaluator.ts`), and checks the marks against the clauses and answer ("Steps" above).
3. Run `npm run workbook:v2:fingerprints` (with `-- --shape <id>` for one shape), then `npx vitest run src/lib/workbook-v2/shapes --sequence.shuffle`.

`worstCase` is one question that is the widest in every width and in digit places. If the widths pull apart (99 - 4 leaves as much as 100 - 5 in fewer places), register the digit places as the width.

The harness (`testing/shape-harness.ts`, with the step checks in `shape-steps.ts` and the fit checks in `shape-fit.ts`) takes 1,000 production seeds for each shape: `planBook` builds one book with both sides and all places of each template that fits any of the limits, and each generated question is compared with the reader, the rules, the second solver, the steps and the ranges. Limits come from fast-check with a fixed seed, so a failure comes back in the next run, and its message holds the call that repeats it. `testing/shape-harness.test.ts` holds a broken shape for each check. A new answer kind needs its name in `ANSWER_KINDS` (`contract.ts`) and its rule in `VALUE_FORMS`, and a new part its name in `PART_NAME` (both in `checks/answer-form.ts`); the rest compares whole answers.

**Fingerprints:** `testing/fingerprints/<shape id>.json` holds one file per shape, with one SHA-256 for each version of that shape: every question of a listed space, or every `listed` question and small space plus 1,000 seeded questions of a large one, with the registered limits, and the list, the forms, the rows in order and the swapped forms of a shape that has them. An answer in one area counts as its kind and value, as before answers had parts. In a large space, questions outside `listed` and `smallSpaces` have sampled coverage only. A change of the output needs a new `version`, then the command. Parallel branches that add shapes merge cleanly because `.gitattributes` sets `merge=union` on `shapes/index.ts` and `testing/shape-registrations.ts`, and each shape has its own registration file and fingerprint file. A stored entry never changes: `scripts/shape-fingerprint-base.mjs` compares the folder with the base of the branch, in the `scope` job of CI (the one job that always has the base) and in `npm run check:fast`.

## Tests

`npx vitest run src/lib/workbook-v2` takes about 10 seconds with 3 workers and needs no browser, network or database. The tests that draw pages use the real Typst. In CI they run in the `engine` job (`Workbook engine` in `.github/workflows/ci.yml`), which installs the pinned Typst, runs `npm run check:guard`, runs `npm run engine:typecheck`, runs the engine tests, and reports the test time against the 15 s budget. In CI those tests fail when Typst is absent; on a laptop without it they are skipped and print the reason.

## In a Vercel function

`openRenderer(vercelAssets(process.cwd()))` draws with the official pinned Typst program for linux x64, and `buildBook` runs all checks as on a laptop. Proved on a preview deployment on 2026-11-24 (UNI-138): the PDF and each page image were the same bytes as on a Mac. With a new renderer the two-page book took 0.75 to 1.02 s (three calls in one function instance), and the temp folder was empty after each call. The Node binding of Typst was faster (0.3 to 0.6 s) but gave other page images, always reads the fonts of the computer, and cannot be pinned by SHA-256 or stopped, so it is not used.

- **Program:** it must be a regular file with the pinned SHA-256. `npm run typst:stage` puts the verified program (53 MB) in `.workbook-v2/`, which Git ignores. `workbookV2TraceFiles()` lists the files that the bundle of the function must hold.
- **No permission to run:** the bundle can only be read. When the program in it may not run, each drawing copies the verified bytes into its private temp folder.
- **Not connected:** no function builds books yet, so no build stages the program. The first one (UNI-260) adds `typst:stage` to the build, where a failed download must fail the deployment, and the files to `outputFileTracingIncludes` for its route.

## Where the next parts connect

- The freeze of a level (UNI-140) calls `checkBank`. Story text (UNI-139) prints the `flow` ink.
- The book job (UNI-260): see "In a Vercel function".
- More shapes: follow "Adding a shape" above. A new look of a question is a new `Face` and a template that takes it.
