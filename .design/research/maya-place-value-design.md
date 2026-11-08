# Maya's place-value teaching path (design for B1)

Branch `site/maya-place-value-design`, base `6de7e777` (PR #698 head, the integration branch `site/maya-wave-a`). Design plus a working board prototype. Nothing here is merged and no PR is open.

Scope: the **place value** family of the first customer's workbook (draft 90559915, revision 2): 117 questions that `createSession` holds today with "Maya cannot teach items with no operation yet". The workbook's printed text and stored packages do not change. All numbers in this document are synthetic; the customer's numbers stay in `~/unica-workbook-samples/customer-first-book-20261106/maya-coverage/`.

Rules this design keeps (from the Wave A brief): code computes and checks every step, answer and spoken form (D-195); every teaching fact has three independent agreements; the generator and `checkQuestionPackage` defaults do not change; shared files get small hooks; the controller order, step credit (#698) and "no `give_answer` path" rules hold; allow-lists, never deny-lists.

## 0. What Savar approves, and what the parent lane decides

Approve (screens in `~/unica-workbook-samples/customer-first-book-20261106/maya-coverage/place-value-screens/`):

1. The **place-value chart** on Maya's board: one column per place, the place names above, the number written digit by digit, a yellow stripe behind the column Maya points at, a value row, one sentence row, one answer row. Section 3.
2. The **step ladder** and **Maya's lines**. Section 4. Every wording is pending Savar's approval (D-202), as `lines.ts` says for new lines.
3. **Never the answer.** A place-value question has one step that makes the answer, so Maya has no H3 "show it" help on it. She points and asks; the child says the answer. Section 4.4.

The parent lane decides (section 8): how `place-value` is typed (recommended: a new operation kind, measured cost below), what happens after two misses on the last step (rule 3 says no `give_answer`), and whether the 3 "sum of two values" questions stay held.

## 1. What the stored data holds

Every one of the 117 questions has `operation: null`, `answer: null`, no steps, no easier example, and an `item` with one `template` check. The check's `source` holds what Maya needs, in three places that do not copy each other:

| Source | Holds | Example (synthetic) |
|---|---|---|
| `text` | the printed question | `In 53172, which digit is in the thousands place?` |
| `templateId` | the template and its variant | `5.1-place-value-million#1.1:bare` |
| `item.checks[0].source` | slot values, `derived` (how the printed number comes from a slot), and the answer expression, all Python-style text | `slots: n0 = 53172`, `answer: n // 1000 % 10` |
| `item.regions[0].answer` | the answer key | `3` |

The question shapes (counts are this workbook's):

| Ask | Templates (id suffix) | Printed form | Answer expression shape | Count |
|---|---|---|---|---|
| digit | `#1.1 #2.1 #3.1` bare | `In N, which digit is in the P place?` | `n // 10**k % 10` | 49 |
| value | `#1.2 #2.2 #3.2` bare, `#1.3 #2.3 #3.3` story | `What is the value of the digit in the P place of N?`, `<Name> saw the number N on a sign at <place>. What is the value of the digit in the P place?`, `N: value of the P digit?` | `n // 10**k % 10 * 10**k` | 43 |
| compare | `#1.5 #2.5 #3.5` true-false | `True or false: in N, the digit in the P1 place is bigger than the digit in the P2 place.` | `'true' if n // a % 10 > n // b % 10 else 'false'` | 20 |
| sum of two values | `#1.7 #2.7 #3.7` show-work | `In N, what is the value of the P1 digit plus the value of the P2 digit?` | `n // a % 10 * a + n // b % 10 * b` | 3 |
| build a decimal | `4.2-tenths#3.1` | `W wholes and T tenths is ? as a decimal.` | `round(w + p / 10, 1)` | 2 |

Three facts shape the design:

- **The printed number is not always the slot.** In the zero-placeholder variants (`#3.x`, 28 questions) `derived` rewrites the slot: `n0 if '0' in str(n0) else n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)`. In 21 of the 117 the printed number differs from `n0`. A derivation that reads the slot alone teaches the wrong number. The expression must be evaluated, `derived` first.
- **Zero is an answer.** 8 of the 117 have the answer 0 (the asked place holds a 0): "the value of the hundreds digit" of a number with a 0 there. The lines and the readers need a zero path.
- **The expressions are Python text.** Maya cannot use `eval`. Section 2.3 gives a small evaluator for exactly this grammar.

Offline check (a scratch script on the saved draft, no model, no database, nothing copied into git): all 117 questions agree on text number, text ask, evaluated expression and stored key. 0 fail. The grammar the 117 expressions use: integer literals, names, `+ - * / // % **`, comparisons, `and`, `not`, `in`, `if ... else`, `str()`, `round()`, and string literals.

## 2. The derived teaching object

### 2.1 The object

`src/lib/maya/place-value.ts` (new, pure TypeScript):

```ts
type PlaceKey = "ones" | "tens" | "hundreds" | "thousands" | "ten thousands" | "hundred thousands" | "millions" | "tenths" | "hundredths";

type PlaceValueAsk =
  | { ask: "digit"; place: PlaceKey }
  | { ask: "value"; place: PlaceKey }
  | { ask: "compare"; first: PlaceKey; second: PlaceKey; words: [string, string] }   // ["true","false"], from the stored choices
  | { ask: "build"; parts: { place: PlaceKey; digit: number }[] }
  | { ask: "sum"; first: PlaceKey; second: PlaceKey };                                // designed, not built in B1

interface PlaceValueObject {
  number: string;            // "53172", or "5.8" for build (kept inside code, never put on the board for build)
  ask: PlaceValueAsk;
  answer: AnswerValue;       // number, or {type:"choice"}
}
```

`placeValueOf(raw: QuestionPackage): PlaceValueObject | { held: string }` returns the object only when every check below agrees. Anything else returns a reason, and the question stays held. No guess, no partial teaching.

### 2.2 The checks (four agreements)

A question is taught only if all of these hold. Each is computed without reading the others.

1. **Template key** (allow-list, exact). The `templateId` matches `^5\.1-place-value-million#[123]\.(1|2|3|5|7):(bare|story|true-false)$` or `^4\.2-tenths#3\.1:bare$`. The variant number gives an expected ask: `.1` digit, `.2` and `.3` value, `.5` compare, `.7` sum, `4.2-tenths#3.1` build. An unknown key is held.
2. **Printed text** (closed forms, no free parsing, never a slot name in place of printed text). The text matches one of the 8 closed forms in the table above (the place words come from one list, `ones` through `millions`). It gives a number (digits only, 1 to 7 digits), an ask and its places. The ask must equal the one from the template key.
3. **Template expression on the slot values.** Evaluate `derived` and then `answer` with the evaluator of 2.3. Two things must hold: the derived `n` equals the printed number, and the expression has the shape of the ask (`n // 10**k % 10` is a digit; with `* 10**k` it is a value; the `'true' if … > … else 'false'` form is a compare, with its two places; `round(w + p / 10, 1)` is a build). The place `k` in the expression must be the place in the printed text. The expression's result is the expression answer.
4. **The code result and the answer key.** Code computes the answer from the printed number and the ask (`digitAt(number, place)`, `digit × 10^k`, `digitA > digitB`, `w + t/10`). It must equal the expression answer and the stored `item.regions[0].answer` (type `number` or `choice`).

Held (with the reason in `contentProblem`, as today): a key outside the list; text outside the closed forms; the evaluator refuses a token; derived `n` is not the printed number; the expression shape names a different place or ask than the text; any two of the three results differ; a number outside 1 to 7 digits; a build with a part above 9.

The package check still runs on what the adapter returns (section 6), so the stored `item` is also checked by `checkQuestionPackage` as today.

### 2.3 The evaluator

A recursive descent parser over the grammar of 1, with fixed limits: at most 200 tokens, integer results kept below 10^15, an exponent at most 12, no names except the slot names and `n`, calls only `str` and `round`, string literals only inside `in` and the compare answer. It returns a number or a string, or a reason. No `eval`, no `Function`, no property access. Property tests: random digits; the 21 shapes where `derived` changes the number; tampered tokens (`__import__`, `.`, `[`, a huge exponent) are refused, never run.

### 2.4 What the package Maya teaches from looks like

The adapter turns the object into a standard `OperationPackage` in memory only (the stored package is untouched, the printed book is untouched):

- `operation`: `{ kind: "place-value", operands: [number], ask }` (type decision in section 8; a new `Operation` kind, whose rule table lives in a new file `src/lib/question-package-place-value.ts`).
- `answer`: the checked answer, with accepted forms (`50000` and `50,000` are one number; `5.80` is `5.8`).
- `steps`: new `WorkedStep` kinds, one per place-value step (section 4.1). The last step is always `result`.
- `wrongAnswers`: from code, per ask (section 5.4), each with a cause from `MISCONCEPTIONS` (`N2` "Reads a digit's face value or the wrong place" and `place-shift` "Gives a digit's value one place too small or too large" already exist; `digit-compare` for compares).
- `easierExample`: code makes an example of the same shape with a smaller number (section 4.5).
- `text`: the printed question, unchanged, so `question.read` lines read the child's own words.

## 3. The board model

### 3.1 Prototype (built, drawn by the real board)

`src/lib/board/place-chart.ts` is a new board representation, registered in `scene.ts` like `columns`, `division` and `model`. It follows the representation contract (`create`, `targets`, `put`, `draw`), so it needs no change to the stroke player, the replay, the child-ink layer or the desk. 8 tests in `src/lib/board/place-chart.test.ts`; the 14 board test files (375 tests) pass; `tsc` and `eslint` are clean for `src/lib/board`.

The screens in `place-value-screens/` are rendered by the real core and the real `MayaBoard` component (`.design/research/maya-place-value-prototype/`, `node .design/research/maya-place-value-prototype/build.cjs <out dir>` writes static pages; the screens were taken from them with the Aside CLI). They use the board's own pen font, dotted paper, pen colours and fit-to-content camera, as the chat board does today (`chatBoardView`).

### 3.2 The command

```json
{ "op": "place_chart", "id": "question", "number": "53172", "place": { "region": "main" } }
{ "op": "place_chart", "id": "question", "parts": [ { "place": "ones", "digit": "5" }, { "place": "tenths", "digit": "8" } ], "place": { "region": "main" } }
```

- `number`: the number is written digit by digit (digit, value and compare asks). The number is the question's own, already printed on the page.
- `parts`: the build ask ("5 wholes and 8 tenths"). The chart shows the parts as words and leaves the digit row empty. The command never holds the number the child is asked to make, so the early-answer checks cannot read it off the command.
- Columns: from the number's top place down to its last decimal place. A short number gets empty columns so every chart is about as wide: at least 4 whole places for a whole number, and for a decimal at least 2 whole and 2 decimal places (so "5.8" shows tens, ones, tenths, hundredths). This keeps digits the same size under the board's fit-to-content zoom; without it a 2-column chart fills the screen.

### 3.3 Rows, targets, colours

| Row (`rowId`) | What is there | Who writes it | Checked by code |
|---|---|---|---|
| names | two lines per column ("ten" / "thousands"), black | the chart, at once | place order |
| parts (build only) | `5 wholes`, `8 tenths`, blue | the chart, at once | from the command |
| `digits` | the number's digits, blue; in build mode empty and written by `put`, green | the chart (number) or `put` (build) | `put` must equal the digit of that place |
| `value` | a digit's value in its column ("50,000"), green, drawn in the column | `put` | `put` must equal digit × place value |
| `equation` | one sentence under the chart, blue | `put` | must be in the chart's own list (below) |
| `answer` | the child's checked answer, green | `put` | short number or word |

The equation list is computed by the chart from its number: for each column `5 × 10,000 = 50,000`; for each pair of digits `8 > 2`, `2 < 8`, `4 = 4`; and the open forms `5 × 10,000 = ?` and `8 ? 2` (for hints that must not say the result). Any other sentence is refused (`wrong_value`). A `value` put for a digit that is not written yet (build) is refused (`not_allowed`). A padded column is never written.

Targets: `whole`, `column` (per place), `cell` (`digits` and `value`, per place), `row` (`equation`, `answer`) and `piece` `band-<place>`. Maya highlights with `mark` on the `band-<place>` piece and circles a digit with `mark circle` on the `digits` cell. The band exists because the board's highlight draws a tall target as one thick round-capped stroke: on the column's own rectangle the round caps spill past the frame. `band-<place>` is a rectangle worked out so the finished stripe sits inside the frame, with no change to `annotations.ts` (the existing 375 board tests stay as they are).

### 3.4 The screens

| File | State | Maya's line (from section 4) |
|---|---|---|
| `a-chart-highlight.png` | chart with the ten thousands highlighted (H1) | `point.place` #1 |
| `b-value-step.png` | value row `50,000` and the sentence `5 × 10,000 = 50,000` | `answer.value` #1, after the child said 50,000 |
| `c-compare.png` | two columns highlighted, `8 > 2` written | `answer.compare` #1, after the child said true |
| `d-tenths.png` | build chart: parts row, the 5 written, tenths highlighted | `operation.build` #1 (H2) |
| `e-phone.png` | the same chart at 390 px | `point.place` #1 |

The numbers on the screens (53172, 785243, 5 wholes and 8 tenths) are not in the customer's book.

On the phone the longest names ("hundred thousands", "thousands") are small (about 9 px tall) but legible; digits are large. A larger phone layout (names over two rows, bigger digits) is a later change to constants in `place-chart.ts`, not to the design.

### 3.5 Where the chart is drawn and what the checks must learn

Board offers (`boardOffersFor`, `session.ts`) are code-written ids: `question.chart` (create the chart for the question), `example.chart`, `question.band.<place>`, `question.circle.<place>`, `question.value.<place>` (the value put, offered in the turn Maya says a line that holds that value, or once its step is done), `question.equation.<id>`, `question.answer` (the child's checked answer, in the turn Maya's answer line is said). The model picks an id by name; code writes every command and every word.

The checks that read the board must know the new command (listed in section 6): `boardVisible` reads the `number` field; `boardProblem` allows it as the problem's own number; every put value must be in a line said that turn or a done step.

## 4. The step ladder and Maya's lines

### 4.1 Steps per ask

The controller runs as today: READY, OPEN, ASSESS, MODEL_EXAMPLE, TRY_TARGET, GUIDE_TARGET (H1 to H3), CHECK, WRITE_CLOSE, CLOSE. A step counts only on its whole turn (#698).

| Ask | Work steps (`workSteps`) | Final step (`result`) | Highest help on the final step |
|---|---|---|---|
| digit | none | the digit | H2 |
| value | `read-digit` (the digit in the place) | the value, digit × place value | H2 |
| compare | `read-digit` for each place; `bigger` when the two digits differ | true or false | H2 |
| build | none | the decimal | H2 |

"Find the column" is not a step of its own. It has no answer the child can say, so a step for it would never be done. It is the content of the H1 hint of the digit step: Maya colours the place and the child counts. The steps that have a spoken answer are the ones that can be credited.

New `WorkedStep` kinds (a small hook in `question-package.ts`; measured: 2 other places need a `case`, `question-package-math.ts:517` and `maya-call-note.ts:152`):

- `read-digit`: `{ id: "digit-<place>", kind: "read-digit", place, digit }`; answer `[digit]`.
- `bigger`: `{ id: "bigger", kind: "bigger", a, b, bigger }`; answer `[bigger]` (only when `a ≠ b`).

The `result` step's help is placed by `packageLines.help("result")`, which returns the ask's own H0 to H2 for a place-value package (today it returns one H0 line). `stepAnswers` (session.ts:573) returns `[number(step.digit)]` and `[number(step.bigger)]`.

### 4.2 The hint ladder

- **H0** invites and asks. **H1** points: Maya colours the place and the child counts, or the line says what each part is worth. **H2** narrows the question and circles the digit or writes the open equation (`5 × 10,000 = ?`). **H3** shows a step only for a non-final step (`step.show`, text from `stepText`: "The digit in the ten thousands place is 5."). A final step has **no H3**: its H3 would say the answer (`answer_too_early`).
- Help rises one level at a time (`hint_skipped`). A first guide may start at H2 when the error is located (a place-shift answer).
- After H3 on a step, a value or a "yes" that only copies what Maya showed gives no credit (#698).

### 4.3 Maya's lines

All lines are code-written from the checked object. Style follows `lines.ts`: short sentences, one idea each, everyday words (never "in all", "altogether", "total", "left over"), the curriculum's math words (place, digit, value), 5 wordings per key, none that praise a wrong answer. A new line id `chart.open` is added; the others reuse the line ids of `lines.ts` (`step.invite`, `step.point`, `step.operation`, `check.right_step`, `check.not_yet`, `answer.right`) with new template keys. Raise `LINES_VERSION` to 14.

Slots filled from the object: `{place}` ("ten thousands"), `{unit}` ("ten thousand"), `{perOne}` ("10,000"), `{digit}`, `{number}` ("53,172"), `{count}` ("ones, tens, hundreds, thousands, ten thousands"), `{ordinal}` ("fifth"), `{a}` `{b}` (the two digits), `{pa}` `{pb}` (their places), `{hi}` `{lo}`, `{pair}` (the printed pair, "true or false" or "yes or no", from the stored choices), `{w}` `{wp}` `{tp}` ("5", "5 wholes", "8 tenths").

**‡** marks a wording that passes `spokenOffer` for a voice-only turn. The current filter drops wordings with `look|watch|see|show me|follow along|find|bring down|write|put|on top|below|underneath|at the bottom`; place-value lines also name the chart, so add `circle|circled|color|colored|chart|wrote|highlight` to that one regex.

**Opening**

`chart.open` (the chart is drawn; said once after `question.problem`)
1. I drew a place-value chart for {number}.
2. Here is a chart of the places in {number}.
3. Let's put {number} in a place-value chart.
4. Let's think about the places in {number}. ‡
5. Every digit of {number} has its own place. ‡

`chart.open` for the build ask (no number is said)
1. I drew a chart with a place for wholes and a place for tenths.
2. Here is a place-value chart for wholes and tenths.
3. Let's put the wholes and the tenths in a chart.
4. Let's think about the wholes and the tenths. ‡
5. Wholes and tenths each have their own place. ‡

The `{expr}` of `question.problem`, `assess.ask` and `try.target` is one phrase from code: digit "the thousands digit of 53,172"; value "the value of the ten thousands digit of 53,172"; compare "the two digits of 785,243"; build "5 wholes and 8 tenths as a decimal".

**Digit (the digit ask's result step, and the `read-digit` step of the other asks)**

`step.invite` H0, key `invite.place`
1. Let's look at the {place} place. Which digit is there?
2. Which digit is in the {place} place? ‡
3. Now the {place} place. What digit do you see there?
4. What digit is in the {place} place of {number}? ‡
5. Tell me the digit in the {place} place. ‡

`step.point` H1, key `point.place` (board: colour `band-<place>`)
1. I colored the {place} place. Count the places from the right: {count}.
2. Find the {place} place. Start at the ones and count: {count}.
3. Start at the ones place and count to the left: {count}. ‡
4. The {place} place is the {ordinal} place from the right. Count: {count}. ‡
5. Let's count the places together, starting at the ones: {count}. ‡

`step.operation` H2, key `operation.place` (board: circle the digit cell)
1. I circled the digit in the {place} place. What is it?
2. Look at the circled digit. Which digit is it?
3. The circled digit is in the {place} place. Which digit is it?
4. Say just the one digit in the {place} place. ‡
5. What is the one digit that sits in the {place} place? ‡

`step.show` H3 (non-final `read-digit` only): the shared `step.show` templates around `stepText`: "The digit in the {place} place is {digit}."

`check.right_step` for a `read-digit` step: the shared key with `{eq}` = "{digit} {unit}" ("Yes! 5 ten thousands.", "Yes! 1 ten thousand.").

`check.right_step` when the digit is 0, key `check.right_step.zero`
1. Yes! 0 {place}. A zero holds the place.
2. That's right. There are 0 {place}. The zero keeps the place.
3. Yes, it's 0. A zero means there are none in the {place} place.
4. Good. The {place} place has 0, and the zero holds the place.
5. You got it. 0 {place}. The zero holds the place so the other digits stay where they are.

`check.not_yet`: the shared key, with `{where}` = "the {place} place" (a `whereOf` case).

`check.not_yet`, targeted, key `fix.digit` (the child said a value, such as 50,000, for a digit)
1. That is the value. The question asks for the digit. Which digit is in the {place} place?
2. Careful, that is a value. We only need the one digit in the {place} place.
3. That is bigger than one digit. Which single digit is in the {place} place?
4. We want just the digit, not its value. What digit is in the {place} place?
5. Say only the digit, not its value. Which digit is in the {place} place? ‡

**Value (the value ask's result step)**

`step.invite` H0, key `invite.value`
1. So the digit is {digit}. What is its value in the {place} place?
2. Now think about the value. What is the value of that {digit}?
3. That {digit} is in the {place} place. What is its value?
4. What is the value of the {digit} in the {place} place? ‡
5. The digit is {digit}. How much is it worth in the {place} place? ‡

`step.point` H1, key `point.times`
1. One {unit} is {perOne}. The digit is {digit}, so think of {digit} {place}.
2. Each {unit} is worth {perOne}. How many {place} do we have? {digit}.
3. Remember, 1 {unit} is {perOne}. We have {digit} {place}.
4. Think of {digit} {place}. Each one is worth {perOne}. ‡
5. The {place} place counts in {perOne}s. We have {digit} of them. ‡

`step.operation` H2, key `operation.times` (board: the sentence `{digit} × {perOne} = ?`)
1. What is {digit} × {perOne}?
2. Multiply {digit} × {perOne}. What do you get?
3. Let's multiply {digit} × {perOne}.
4. What do you get for {digit} × {perOne}?
5. Can you work out {digit} × {perOne}?

`check.not_yet`, targeted, key `fix.value` (the child said the bare digit, again, for a value)
1. That is the digit. Now we want its value. What is {digit} {place} worth?
2. That is the digit. Next, the value in the {place} place. What is it?
3. The digit is {digit}. The question asks for the value of that digit. What is it?
4. That is the digit. Its value depends on its place. What is the value of that {digit}? ‡
5. Now say the value, not just the digit. What is the value of the {digit} in the {place} place? ‡

**Compare (steps `read-digit` for the first and the second place, then `bigger`, then the result)**

`step.invite` for `bigger`, key `invite.bigger`
1. So we have {a} and {b}. Which digit is bigger?
2. Which is bigger, {a} or {b}? ‡
3. Compare the two digits. Which is bigger, {a} or {b}? ‡
4. Think about {a} and {b}. Which one is bigger? ‡
5. {a} or {b}: which digit is bigger? ‡

`step.point` H1, key `point.bigger`
1. Count up from 0: 0, 1, 2 and so on. Which do we reach later, {a} or {b}? ‡
2. Think of counting up. Which one comes later, {a} or {b}? ‡
3. Let's count up from 0 and listen for {a} and {b}. Which one comes later? ‡
4. The digit that comes later when we count up is the bigger one. Which is it, {a} or {b}? ‡
5. Picture the digits 0 to 9 in a row. Which is farther along, {a} or {b}? ‡

`step.operation` H2, key `operation.bigger` (board: the sentence `{a} ? {b}`)
1. Look at {a} ? {b}. Which digit is farther along when we count up?
2. Let's compare {a} ? {b}. Which digit is bigger?
3. Say the bigger digit: {a} or {b}? ‡
4. Which digit is bigger? Tell me, {a} or {b}. ‡
5. Between {a} and {b}, which digit is bigger? ‡

`step.show` H3 for `bigger` (a work step, not the final): "{hi} is bigger than {lo}."

`step.invite` for the result, key `invite.claim` (the pair "true or false", or "yes or no", comes from the stored choices)
1. The statement says the {pa} digit is bigger than the {pb} digit. Is that {pair}?
2. Is it {pair}? The {pa} digit is bigger than the {pb} digit. ‡
3. Let's check the statement. The {pa} digit is bigger than the {pb} digit. {Pair}? ‡
4. So the {pa} digit is bigger than the {pb} digit. Is that {pair}? ‡
5. Think about the statement and tell me: {pair}? ‡

`step.point` H1, key `point.claim`
1. The {pa} digit is {a}. The {pb} digit is {b}. The statement says {a} is bigger than {b}. ‡
2. {a} is in the {pa} place. {b} is in the {pb} place. Compare the two digits. ‡
3. Compare {a} from the {pa} place with {b} from the {pb} place. ‡
4. The statement is about {a} and {b}. Which one is bigger? ‡
5. Check the digits: {a} in the {pa} place, {b} in the {pb} place. ‡

`step.operation` H2, key `operation.claim` (board: the sentence `{a} ? {b}`)
1. Which is bigger, {a} or {b}? Then tell me if the statement is {pair}.
2. Look at {a} ? {b}. Which digit is bigger? Then say {pair}.
3. First say which is bigger, {a} or {b}. Then say {pair} for the statement. ‡
4. Pick the bigger digit, {a} or {b}. Then tell me: {pair}? ‡
5. Which digit is bigger? Use that to say {pair}. ‡

When the two digits are equal there is no `bigger` step, and `{lo}`, `{hi}` and `operation.bigger` are not used; the result lines do the work and `answer.compare` says "4 is the same as 4".

**Build a decimal (the build ask's result step, `parts` chart)**

`step.invite` H0, key `invite.build`
1. What is {wp} and {tp} as a decimal?
2. Let's write {wp} and {tp} as a decimal.
3. How would you say {wp} and {tp} as a decimal? ‡
4. {wp} and {tp}. What decimal is that? ‡
5. Can you make a decimal from {wp} and {tp}? ‡

`step.point` H1, key `point.build` (board: colour the ones band and the tenths band)
1. Ones place: {wp}. Tenths place: {tp}. The decimal point comes between.
2. Wholes go in the ones place, and tenths go in the tenths place. The decimal point sits between them. ‡
3. Put the wholes first, then the decimal point, then the tenths.
4. The decimal point separates the wholes from the tenths. ‡
5. Start with the wholes, then the point, then the tenths. ‡

`step.operation` H2, key `operation.build` (board: `put` the ones digit)
1. I wrote {w} in the ones place. The decimal point comes next. What goes in the tenths place?
2. The {w} is in the ones place now. Then the point. What goes in the tenths place?
3. {w} is written in the ones place. After the point comes the tenths place. What goes there?
4. Start with {w} in the ones place, then the decimal point. What comes after it? ‡
5. The ones place has {w}. Next is the point, and then the tenths. What digit goes there? ‡

**Right answers (line id `answer.right`; board: `put` the child's checked answer, in the same turn)**

`answer.digit`
1. Yes! The digit in the {place} place of {number} is {answer}.
2. That's right. {answer} is in the {place} place.
3. You got it! The {place} digit is {answer}.
4. Yes, {answer}. That's the digit in the {place} place. ‡
5. Exactly! {number} has {answer} in the {place} place. ‡

`answer.value`
1. Yes! {digit} {place} is {answer}.
2. That's right. The value of that {digit} is {answer}.
3. You got it! {digit} × {perOne} = {answer}.
4. Yes, {answer}. {digit} {place} is worth {answer}. ‡
5. Exactly! The {digit} in the {place} place has a value of {answer}. ‡

`answer.compare` (`{cmp}` is one sentence from code: "8 is bigger than 2", "2 is smaller than 7", "4 is the same as 4"; `{tf}` is the child's own right word, the true/false pair or the yes/no pair)
1. Yes, it's {tf}. {cmp}.
2. That's right. It's {tf}, because {cmp}.
3. You got it! It's {tf}. {cmp}.
4. Yes, {tf}. {cmp}. ‡
5. Exactly! The statement is {tf}. {cmp}. ‡

`answer.build`
1. Yes! {wp} and {tp} is {answer}.
2. That's right. {wp} and {tp} make {answer}.
3. You got it! As a decimal, that is {answer}.
4. Yes, {answer}. The point sits between the wholes and the tenths. ‡
5. Exactly! {answer} is {wp} and {tp}. ‡

`write.answer` is the shared line ("Please write {answer} on your paper.").

### 4.4 The last step never gets an H3, and rule 3

`accept_answer` only when the right answer is in the child's own words. A confirm never says an answer the child did not say. There is no `give_answer` path. After a second wrong answer on the result step, the existing `finalMisses` rule today gives the answer through `answer.parts` and `answer.give`; for place value that is the parent lane's call (section 8). Recommended: use the easier example. If it was not shown, Maya does the example step by step and returns to the question (`MODEL_EXAMPLE`, as when a child cannot start). If it was shown, Maya closes with the honest unsolved outcome (assistance `worked_example`) and `close.together`-style wording, never the answer.

### 4.5 The easier example

`easierExample` is code-made, same ask and shape, a smaller number, never the question's own digits:

- digit and value: at most 3 digits, the asked place capped at the hundreds (`min(k, 2)`); digits from a fixed table of three rows with no zero, `[8,4,7]`, `[6,3,9]`, `[2,5,8]`, the first row with no digit equal to the question's digit.
- compare: the two places mapped, in order, to two of the hundreds, tens and ones, from the same table.
- build: `(w', t')` from `[(2,7), (4,3), (6,1)]`, the first with `w' ≠ w` and `t' ≠ t`.

The example must be teachable (session.ts:420) and the same shape; it runs through `example.intro`, `example.step` and `example.result` with the steps' `stepText`. Its chart id is `example`.

### 4.6 One turn, written out (value ask, synthetic)

Child's question: "What is the value of the digit in the ten thousands place of 53172?"

1. Maya: "Hi, I'm Maya, an AI helper. Let's do page 4, number 2: the value of the ten thousands digit of 53,172." (the fixed opening). Board: none yet.
2. Maya (`chart.open` 1): "I drew a place-value chart for 53,172." Board: `place_chart`.
3. Child: "um I don't know". Maya (`invite.place` 2): "Which digit is in the ten thousands place?"
4. Child: "5". The turn is one number, the step's digit, so the step is credited. Maya (`check.right_step`): "Yes! 5 ten thousands." then (`invite.value` 4): "What is the value of the 5 in the ten thousands place?"
5. Child: "5000". Wrong. Maya (`check.not_yet`): "Not quite. Let's look at this answer." Then at H1 (`point.times` 1): "One ten thousand is 10,000. The digit is 5, so think of 5 ten thousands." Board: colour the ten thousands band.
6. Child: "fifty thousand". Right. Maya (`answer.value` 1): "Yes! 5 ten thousands is 50,000." Board: `put` 50000 in the value row, the sentence `5 × 10,000 = 50,000`, the answer row. Then `write.answer`.

## 5. Reading the child's spoken and typed answers

### 5.1 The rule

The reader is an allow-list over the whole turn, as `stepTurnHeard` is for columns. `wholeTurn(text)` trims the turn, drops one leading "so", "okay", "um" or "oh" and one final full stop or "!"; a turn with a question mark or a new line has no body and gives no credit. The body must equal one template of the step or the result, with the number slots read by `plainNumber` (numerals, commas, spaces as thousands separators, and spoken numbers such as "fifty thousand" and "forty-four"). Any other word, a second sentence, another number, a hedge or a negation fits no template. Anything else is not credited.

A spoken form code cannot read for sure, or a turn the speech-to-text marked uncertain, gets a confirm ("Did you say 50,000?", `confirm.heard`) and credit only through the child's own "yes" (`stepAsked`, `heardAsked`). The confirm says the number the child (maybe) said, never the answer.

### 5.2 Templates per step

Digits are the numerals 0 to 9 or the words zero to nine. `{P}` is the asked place's own name, singular or plural ("ten thousand", "ten thousands").

| Step | Accepted whole turns (body, lower case) |
|---|---|
| `read-digit`, and the digit ask's result | `{d}`, `it's {d}`, `it is {d}`, `i got {d}`, `the digit is {d}`, `{d} is the digit`, `{d} {P}` ("5 ten thousands"; only this step's own place name) |
| `bigger` | `{d}`, `it's {d}`, `{d} is bigger`, `the {d}` (one of the two digits) |
| value result | `{V}`, `it's {V}`, `i got {V}`, `{V} is the value`, `the value is {V}`, `{d} times {pv} is {V}`, `{d} × {pv} = {V}`, `{d} {P} is {V}` |
| build result | `{x}`, `it's {x}`, `{w} point {t}`, `{w} and {t} tenths` read as the value 5.8 (see 5.3) |
| compare result | the pair's words, from A4's word-answer reader (section 6) |

Rules inside the templates:

- A digit answer with a place word credits only when the place word is the step's own place (`5 ten thousands` for the ten thousands). A different place word ("5 thousands") is a wrong answer with the cause `place-shift`, not a credit.
- A turn with the digit and the value in it ("5 and the value is 50,000") fits no template and is not credited; Maya asks the step again.
- For the value ask, the bare digit is the `read-digit` step; the value alone, with no digit step done, is the final answer in the child's own words: the final answer is accepted when right, even if the digit step was never said (as a right final answer is accepted today).
- A bare homophone ("for", "to", "won", "ate" for 4, 2, 1, 8) is never read as a digit. It is a hearing problem: Maya confirms ("Did you say 4?") and the child's yes credits it.
- Sound-alike pairs for the confirm (`confirm.which`): 15 and 50 in any place (fifty thousand and fifteen thousand), 13 and 30, 14 and 40, and so on, the pairs `confirm.which` already builds for numbers, extended with the values of the place. A zero is only "zero" or "0"; "nothing" and "none" are not read (they get `check.thinking`, then the invite again).
- An ordinal ("the fifth one") and "5 ten thousand" in a value turn where the place word is wrong are unreadable and are confirmed, not guessed.

### 5.3 Decimals

`numbers.ts` reads "point eight five", "5.8", and "five point eight". A build turn is credited when its one number, read this way, equals the key (5.8 and 5.80 are one value). "five and eight tenths" is a form code does not read today (`CHANGES` includes `tenths`), so it is unreadable, and Maya confirms. The child's "58" or "8.5" are wrong answers (causes below).

### 5.4 Wrong answers, by code, with their causes

Code makes the set per ask, each with the step where it happens and a cause from `MISCONCEPTIONS`:

| Ask | Wrong value | Cause | What Maya does |
|---|---|---|---|
| digit | a neighbour's digit (the place to the left or right) | `place-shift` | `check.not_yet`, then H1 `point.place` |
| digit | the place's value (30,000) | `N2` | `fix.digit` |
| value | the bare digit | `N2` | step credit if the digit step is open, else `fix.value` |
| value | one zero too many or too few (500,000, 5,000) | `place-shift` | `check.not_yet`, then H1 `point.times` |
| value | a neighbour's digit times this place | `place-shift` | `check.not_yet`, then H1 `point.place` |
| compare | the opposite word | `digit-compare` | `check.not_yet`, then H1 `point.claim` |
| build | `58`, `8.5`, `5.08` | `N2` | `check.not_yet`, then H1 `point.build` |

`rightForPlaceValue(pkg, value)` is the one check of a right answer (the package's answer and accepted forms; number equality for 50000, 50,000, 5.80). The gate judges with the same function.

## 6. Where it plugs in

All positions are on `6de7e777`. The new logic is in new files; shared files get the hooks listed.

### 6.1 New files

| File | Holds |
|---|---|
| `src/lib/maya/place-value.ts` | `placeValueOf` (section 2), the evaluator, the object types, the wrong-answer sets, `rightForPlaceValue`, the easier example, the step list |
| `src/lib/maya/place-value-turns.ts` | the readers of section 5: `placeTurnHeard`, `placeConfirmable`, the template lists |
| `src/lib/maya/place-value-lines.ts` | the template keys of section 4.3, `placeValueLines(pkg)` (the same shape as `packageLines`), `placeBoardOffers(s, act, view, spoken)` |
| `src/lib/question-package-place-value.ts` | the `place-value` rule table entry: compute, step maker, `operationText` |
| `src/lib/board/place-chart.ts` | the representation (built; this branch) |
| `src/lib/maya-teaching/place-value.ts` | `placeValueTeachingPackage(raw)`: the adapter entry, called from A1's `teachingPackage` when `raw.operation === null` |
| tests: `place-value.test.ts`, `place-value-turns.test.ts`, `place-value-lines.test.ts`, `board/place-chart.test.ts` (built) |  |

### 6.2 Hooks in shared files

`session.ts`
- line 85, `TEACHABLE_KINDS`: add `"place-value"`.
- lines 485 to 491, `teachableOf`: unchanged. The adapter hands it a package with an operation, so the "no operation" hold stays for any question the adapter does not derive.
- line 573, `stepAnswers`: cases for `read-digit` and `bigger`.
- line 2045, `stepTurnHeard`: a first line `if (isPlaceValue(pkg)) return placeTurnHeard(s, step, value)`; today it returns false for any step but `add-column`.
- line 2117, `stepConfirmable` and 2130 `stepSaidUnheard`: the same dispatch to `placeConfirmable`.
- line 2446, `createsTarget`, and line 3016: add `"place_chart"` to the lists `["columns","write","model"]`.
- `boardOffersFor` (about line 2975): when the package is a place-value package, return `placeBoardOffers(...)` for the chart offers.
- `boardProblem` (about line 3080) and `BOARD_NUMBERS` (about line 3041): add the `number` key, so the chart's number is checked as the problem's own number.
- `openSteps` and `lineOffers`: unchanged (they read `workSteps` and `packageLines`).

`lines.ts`
- `LINE_IDS`: add `"chart.open"`; `LINES_VERSION` 14.
- `TEMPLATES`: the keys of section 4.3.
- top of `packageLines` (line 788): `if (pkg.operation.kind === "place-value") return placeValueLines(pkg)`.
- `whereOf` (line 163 region), `equationOf`, `showOf`: cases for the two new step kinds, or in `place-value-lines.ts`.
- `spokenOffer` (line 963): the extra visual words.

`fractions.ts`
- `TAUGHT_STEP_KINDS` (line 19): add `read-digit` and `bigger`.
- `readOptionsFor` (line 38): `known` also holds the object's digits and values.

`question-package.ts`
- `Operation` (line 145): the `place-value` kind. `WorkedStep` (line 175): the two kinds. `QUESTION_PACKAGE_VERSION` and `STEPS_VERSIONS` unchanged (adapter packages are never stored).

`question-package-math.ts`: `KindRules` entry (line 339) from the new file; `stepText` (line 517) cases. `workbook-book.ts` (lines 642, 757) and `workbook-generator-items.ts` (line 83) need the kind named in an exclusion list so they stay exhaustive: no behaviour change; a regression test proves `operationProblem`, `withWorkbookMayaOperation` and `attachWorkbookMayaOperations` outputs are unchanged on a fixed set. `maya-call-note.ts` (line 152): two `case`s.

Board (this branch, already done and tested): `board/types.ts` (the command, `ChartPlace`, a wider `column` on two targets), `board/parse.ts` (the `place_chart` parse, `chartPlace`, a put value limit of 24 characters for the sentence), `board/scene.ts` (registered), `board/columns.ts` and `board/division.ts` (their place lookups take the wider type; a decimal place is still not one of theirs).

### 6.3 The measured cost of typing it as an operation kind

Adding `{ kind: "place-value" }` to `Operation` and compiling shows exactly 4 required edits in 3 files: `question-package-math.ts:339` (the rule table), `workbook-book.ts:642` and `:757`, `workbook-generator-items.ts:83`. Adding the two `WorkedStep` kinds shows 2 edits: `question-package-math.ts:517` and `maya-call-note.ts:152`. That is the whole surface. The alternative (a place-value package type beside `OperationPackage`) touches no generator file, but `session.ts` reads `s.package` as an `OperationPackage` in about 190 places, so it would be a large edit of the file the four wave A PRs share. Recommended: the operation kind.

### 6.4 What the gates must learn

- `boardVisible` and the early-answer check read the new command: the chart's `number` is the question's number, not the answer. The build command carries no number.
- `answer_too_early` (digit ask): the digit is on the chart from the first batch, as it is printed in the question. The gate must treat the chart's own digits as the question's number, and a circle or a stripe as drawing nothing. A `put` of the answer (value row, answer row) is allowed only in the turn the answer is accepted.
- `math_not_from_code`: a board sentence (`put` equation) must equal a board text of a line said that turn, as a `write` note must today.
- `hint_skipped` and the no-H3 rule: the final step has no H3, so the gate fails an H3 on it.

## 7. Build plan for B1

### 7.1 PR split

All PRs open against `site/maya-wave-a`.

- **B0, the board (optional, independent).** This branch's board commits: `place-chart.ts`, its test, the hooks in `types.ts`, `parse.ts`, `scene.ts`, `columns.ts`, `division.ts`. It merges anywhere, and nothing else needs to wait for it. Skip it if B1a carries it.
- **B1a, digit and value (92 questions: 49 + 43).**
  Files: `place-value.ts`, `place-value-turns.ts` (digit and value templates, zero path, wrong answers), `place-value-lines.ts` (chart.open, digit, value, fix, answer lines), `question-package-place-value.ts`, `maya-teaching/place-value.ts`, the hooks of 6.2 (digit and value parts), `lines.ts`, `fractions.ts`, `session.ts`, the 6 shared-file edits of 6.3. Includes the evaluator and all four agreements for every ask (so compare and build are already derived, but not yet in `TEACHABLE_KINDS`' step set).
- **B1b, compare and build (22 questions: 20 + 2), after A4.** Compare needs A4's word-answer reader (true/false/yes/no, "maybe true", "true and false", "not true"), which owns the controller rules for a bare yes. B1b adds `bigger`, the compare lines, the build lines, the `parts` chart, the decimal reader. Rebase on A4 before opening.
- **The 3 "sum of two values" (#1.7, #2.7, #3.7) stay held in B1.** They are two value asks and one join step; designing them (steps `value-a`, `value-b`, a `combine` result, lines) adds a third set of lines for 3 of 582 questions. Report the 3 ids as held.

After B1a and B1b the R2 count goes from 249 to 249 + 92 + 22 = 363, with 3 place-value questions still held, if the held set from the other lanes does not overlap (check with `coverage-offline.ts`, `ADAPTER=1`).

### 7.2 Gate cases (`src/lib/maya-gate/`, scripted child, free, no model)

New fixtures `G` (digit), `H` (value), `I` (compare), `J` (build), made by `placeValueTeachingPackage` from synthetic stored packages that have the same template shapes, so the gate also exercises the adapter. New scripted children (ids PV01 to PV14):

| Id | Child | Must show |
|---|---|---|
| PV01 | digit, says the right digit alone | accepted with no hint, `answer.digit`, chart batches, answer put in the turn it is accepted |
| PV02 | digit, says the left neighbour, then the right digit | `check.not_yet`, H1 `point.place`, stripe batch, then accepted; `place-shift` recorded |
| PV03 | digit, says the value (50,000) | `fix.digit`; no step credit |
| PV04 | value, digit then value | `read-digit` credited, `invite.value`, accepted; equation put only after |
| PV05 | value, one zero too few | H1 `point.times`, then accepted |
| PV06 | value, says only the digit twice | `fix.value` on the second |
| PV07 | zero answer (digit and value) | `check.right_step.zero`, no early 0 on the board |
| PV08 | digit, "4 ten thousands" with the right place, then with the wrong place | credit, then wrong answer |
| PV09 | digit, bare "for" | confirm, never credit; the child's yes credits |
| PV10 | the child asks to see it on a final step | refused H3; `hint_skipped` stays clean |
| PV11 | compare, true | accepted (needs A4) |
| PV12 | compare, equal digits, false | no `bigger` step; `4 is the same as 4` (needs A4) |
| PV13 | build, "five point eight", and "58" | accepted; wrong answer with `point.build` (needs the decimal reader) |
| PV14 | cannot start | easier example, same shape, own chart id `example`, then the question |

Hard-failure sabotage tests (`gate-seeded.test.ts` style): a sabotaged controller that says the digit at H1, that writes the value before the child, that gives an H3 on the final step, and one that reads a homophone as a digit; each must fail the gate with the code `answer_too_early`, `hint_skipped` or `unchecked_output`.

### 7.3 Practice cases (`src/lib/maya-practice/cases.ts`)

Model-driven children, free to define; the paid run is the parent's, once per wave. `npm run maya:practice -- --fake` is the free check.

- P-PV1 hesitant child on a digit ask: counts the places aloud, gets it at H1.
- P-PV2 value ask with zero trouble: says 5,000 for 50,000 (place-shift), recovers at H1.
- P-PV3 zero placeholder: the answer is 0; the child says "nothing", then "zero".
- P-PV4 compare with the claim reversed in the child's head (says "false" because the bigger digit is on the right) (needs A4).
- P-PV5 tenths versus hundredths: "5.08" for 5 wholes and 8 tenths, then fixed at H1 (needs B1b).
The rule for every case: Maya never says the answer or its digit before the child.

### 7.4 Unit tests

- `place-value.test.ts`: every ask and template shape; the 21-shape `derived` case (printed number is not the slot); the four agreements failing one at a time (tampered text, tampered expression, tampered key, unknown template id) each hold the question with a reason; the evaluator refuses every token outside the grammar and is the same as a reference evaluation on random inputs; the zero answers.
- `place-value-turns.test.ts`: the allow-list per step, turn by turn: each accepted form, each near miss that must not credit (`5 and 50,000`, `5 thousands`, a question mark, a hedge, a negation, "maybe 5"), the homophones, the comma and space separators.
- `place-value-lines.test.ts`: `allLineTexts` for each ask; every wording has the right slots; no banned word of D-202; each key has the right number of wordings; the ‡ wordings pass `spokenOffer`.
- A generator regression: `operationProblem` still refuses `add 10000 + 2000` by default, and `withWorkbookMayaOperation` / `attachWorkbookMayaOperations` outputs are unchanged on a fixed set.
- Board tests: built (8).

### 7.5 Risks

1. **The type surface.** An `Operation` kind touches 4 sites in 3 shared files. Mitigation: they are exclusions; a regression test pins the generator outputs.
2. **A4 dependency.** Compare shares the word-answer controller rules with A4. B1b must wait for it, or copy a reader that A4 then replaces. Wait.
3. **`derived` rewrites the number (21 of 117).** A derivation off the slot teaches the wrong number. The evaluator and the "derived `n` equals printed number" agreement stop it. Property tests carry the weight.
4. **Zero answers (8).** A hint that says "the place has a 0" would be the answer. Zero is explained only after the child says it.
5. **Single-step questions.** The digit and build asks have one step that is the answer, so the ladder has no H3. If Savar wants a "show me" for these, it can only be the chart's open sentence, never the digit.
6. **Speech-to-text on single digits.** "four" and "for", "two" and "to". Never credited from a homophone; confirm only.
7. **Number words in `numbers.ts`.** "ten thousands" and "hundred thousands" are not place words there (`PLACE` knows ones to thousands). The place-value reader strips only the asked place's own name, with an exact match, before it reads the rest. A wider change to `numbers.ts` is out of scope.
8. **Fit-to-content zoom and phones.** Fixed by the padded columns for width; names are small on a phone. A later layout change.
9. **The highlight band is a rectangle worked out to fit.** It depends on the board's highlight drawing (0.9 of the width, round caps). A test pins it (it fails if `annotations.ts` changes the rule). A real fix, an inset in `annotations.ts`, would change existing board tests.
10. **Voice-only calls.** Lines that name the chart need the extra words in `spokenOffer`; a voice call with no board uses the ‡ wordings and the board text of the line.
11. **Disk and merge order.** B1a edits `session.ts`, `lines.ts`, `fractions.ts` and `question-package.ts` like A1 to A4. The hooks are single lines in each, with the logic in new files, so conflicts should be a few lines. Merge order: A1 (owns the adapter index), then B1a, then A4, then B1b.

## 8. Open decisions for the parent lane

1. **Type**: a new operation kind (recommended; section 6.3), or a place-value package type beside the operation package.
2. **After two misses on the result step**: the existing `answer.give` path (it is the answer), or the example then an honest close (recommended, section 4.4). Rule 3 says no `give_answer`; the existing addition ladder still has it.
3. **The 3 sum questions** stay held in B1 (recommended), or become a third PR.
4. **B0** as its own PR, or carried by B1a.
5. **Words**: "statement" for the true/false sentence (A4 may say "claim"). One word, decided once.

## 9. What exists on this branch

- `src/lib/board/place-chart.ts` (the representation), `place-chart.test.ts` (8 tests), and the small hooks in `types.ts`, `parse.ts`, `scene.ts`, `columns.ts`, `division.ts`.
- `.design/research/maya-place-value-prototype/render.tsx` and `build.cjs`: the renderer for the screens.
- This document.

No Maya, session, lines, question-package or generator file is changed on this branch. Gate: the board tests (375) pass, `tsc` has no error in `src/lib/board`, `eslint src/lib/board` is clean. The full done gate (`npm test && npx eslint src && npm run build`) is the build PR's, not this design's.

## 10. B1a as built (2026-11-07)

B1a teaches the digit asks (49) and value asks (43). With A1's adapter and the one deriver line, R2 goes from 277 to 369 teachable. Compare, sum and build (25) stay held for B1b.

What changed from the design, by the parent lane's decisions and by what the build found:

- **A digit question never shows its digit.** Its chart is drawn with a blank digit row (`place_chart` with `blank: true`): the place names, no digits. H1 names the places from the right with no stripe. H2 stripes the asked column, on that blank chart. The child reads the digit from their own page; a checked `put` writes it after they say it. A value question shows its digits and may stripe at H1.
- **No given answer.** Two misses on the last step, or a digit step still stuck after H3, get the easier example, then an honest close (`close.later`, line `close.together`). `give_answer` is never offered for place value, in the closing minute either.
- **A zero is said only after the child says it.** Zero lines are answer lines. A zero digit's step has no H3: that H3 would say the value's answer.
- **The word "one".** Shared wordings that say "one" ("This one is …", "an easier one") read as the number 1. For a place-value question, every wording said before the answer that holds the answer as a number is left out, keeping its wording id. A test checks every pre-answer line over 300 synthetic questions.
- **A digit of 1 in a value question.** "1 ten thousand" is 10,000, the answer, so H1 and H2 never pair the 1 with its place's value (`point.times.one`, `operation.times.one`). The easier example never uses a place worth the answer.
- **The place names on a phone.** Names are 0.8 tall (rows below moved down). The test measures the letters at at least 11 px on a 390 px screen for 6 columns. A board page holds 6 columns; a 7-digit question gets no chart.
- **J06.** A question about a place ("Which one is the thousands place?") gets `where.place`, and a "why" on the value step ("Why do I multiply by 10,000?") gets `why.value` (both line `step.why`), before going on, from the model or code's fallback; neither raises the help level. An early digit in a whole-turn template is credited by #698's rules, acknowledged, and the help goes on to the value.
- **Review lessons (brief, "Lessons from review").** (1) The scope check holds each place-value question's own multiplications (`placeRelations`: the digit times its place, one place too large or too small, a neighbour's digit times the place), so "8 times 10,000 is 80,000." and "8 times 1000 is 8000." are this question's work, never another problem (gate PVS1 to PVS4). (2) Every first line on a step carries its framing: the digit lines say where the place is, counted from the right, and the value lines say what each of the place is worth (never for a 1, where that is the answer). A line that says Maya drew the chart, a stripe or a circle comes with that drawing, made by code, at any hint level (`placeAutoDraw`; gate PV15 to PV17 start with "I'm stuck."). (3) Maya's fixed workbook opening names a place-value question without its number ("Let's do page 26, number 12: the value of the hundred thousands digit."), so it fits the 25-word grade 3 turn; it was 31 words with the number. (4) Both J06 cases, by the model and by the fallback: PVJ1, PVJ1b; PVJ2, PVJ2b; PVJ3, PVJ3b.
- **The evaluator.** `src/lib/maya/place-value.ts` has its own small evaluator, tested against the generator's (`workbook-curriculum/expression.ts`) on random numbers. Agreement 4 uses code's own digit, so a fault in either evaluator still holds the question.
- **The package check now knows the kind.** `checkQuestionPackage` checks a `place-value` operation by default, as for every kind in the rule table. No stored package or generator output holds one: the generator's AI schema leaves it out (`MayaOnlyKind`), and a snapshot written on the base commit shows the generator's output unchanged. When A1's Maya-only limits land, the kind could move behind them.
