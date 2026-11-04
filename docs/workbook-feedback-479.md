# Workbook feedback #479

The branch implements the print layout, book text, shared day schedule and reusable checks. Issue #480 owns item writing and the final U4 sample. Do not merge until Savar approves the sample and the example bank.

## Shared schedule

Import `dayDifficulty(level, day)` from `src/lib/workbook-plan.ts`.

The signature is stable. Levels are integers 1 to 30. Days are integers 1 to 10. Invalid inputs throw.

The result has:

- `numberRange: { min: number; max: number }`
- `rangeFraction: number`, applied within the skill's own range
- `helpLevel: "pictures" | "new-ideas-only" | "none"`
- `difficulty: 1 | 2 | 3`
- `storyShare: number`
- `maxMinutes: number`, always 30

The printed plan time target is also capped at 30 minutes for every level.

For U4, the daily maxima are 8, 9, 10, 12, 13, 14, 15, 17, 19 and 20. Days 1 to 3 use pictures. Days 4 to 7 use pictures only for new ideas. Days 8 to 10 have no picture support. Only fixed references named by a benchmark skill, typed coin givens on money skills and clock components on time skills keep their taught value. Wording never decides whether a number is a coin reference. Operands, answers and totals always use the daily bound. Fraction components follow the daily bound. Permission to teach fractions or decimals does not exempt other quantities.

## Typed coin givens for #480

`Item.givens?: CoinGiven[]` is additive. Old packages remain readable. Import `coinGiven`, `CoinGiven`, `CoinGivenSource` and `CoinName` from `@/lib/question-package`.

Code or an approved question type sets `SlotPlace.givens` when it calls `buildQuestion`. The builder copies these declarations into `item.givens`. It ignores a `givens` field in raw AI output. Do not forward AI metadata into the trusted builder argument.

```ts
const givens = [coinGiven("dime", { kind: "text", index: 0 })];
const built = buildQuestion(raw, { ...place, givens });
// raw.text: "How many nickels make a dime (10¢)? Explain."
// Stored item.givens:
// [{ kind: "coin", coin: "dime", value: 10, unit: "¢", source: { kind: "text", index: 0 } }]
```

The factory supplies the fixed value and unit. The coin names are `penny`, `nickel`, `dime`, `quarter`, `loonie` and `toonie`. The package checker verifies the declaration and the selected printed value and currency. Both `scheduledItemProblem` and `rangeProblem` use the typed givens. Neither check exempts an amount just because its value matches a denomination.

`source.index` is the zero-based index returned by `readNumbers` for that text. It counts numeric readings, not words. Select it after the final wording is set. A region label uses `{ kind: "region-label", region: "reason", index: 0 }`. For example, a quarter given can mark the `25¢` in the label `25¢ coins`. The Figure type has no coin picture yet.

A source can name only question text or a region label. It cannot name an operand, an answer, a choice answer or a computed total. A declaration exempts only its selected occurrence. Another 10¢ amount beside a declared dime stays bounded. Missing locations, wrong denominations, wrong currencies, duplicate declarations and unknown source kinds fail closed. Without a typed given, all money text uses the normal daily bound, including text that says `coins`.

## Checks for the #480 writer

`src/lib/workbook-feedback-check.ts` exports:

- `instructionProblem(text)`: refuses missing instructions, internal unit labels and rejected wording.
- `feedbackItemProblem(package)`: refuses tracing after Kindergarten, object drawing used only to count, abstract likelihood drawing and a likelihood response other than circle-the-word. The renderer calls this check.
- `scheduledItemProblem(package, curriculum, day, place)`: checks the feedback rules, picture support and every applicable quantity across all item formats. This includes operands, results, comparison values, sequence values, counts, regions and figures. Unknown formats, unreadable packages, number forms and missing skills fail closed. The writer must call it before accepting a question.
- `estimatedDayMinutes(questions, panels)`: includes reading time, worked examples, response type and algebra work. This is a planning estimate. It is not a measured child completion time.
- `dayTimeProblem(questions, panels)`: refuses an estimated day above 30 minutes. The whole-book pass must call it.

`src/lib/workbook-template.ts` exports `pageFullness(page, measured)` and `fullnessProblem(page, measured)`. The target is 80 percent of the usable height, including teaching panels and writing space. Missing measurements fail closed. The whole-book pass must use this check when it chooses whether to add questions or increase writing space. Overflow remains a separate strict render check.

The current slot limits reserve room for the larger writing areas. The generator still records every planned omission. A Unit B page with a new example and a spot-the-error card has no spare practice block at U1 to U9. Review pages keep two mixed-set items. Packed six-page days keep two retrieval items beside their challenge cards.

Practice 2 reserves a separate row for each teaching card. A middle-level page with both cards keeps four drills. If a render still overflows, optional drills are removed first. The planned error card is never removed. A page that cannot fit the required card fails its fit check.

## Permanent evidence

| Feedback | Check or test |
| --- | --- |
| Cover title and three learning skills; removed parent and next-page lines | `workbook-feedback-check.test.ts`; measured cover check in `workbook-template-chromium.test.ts` |
| Browser scan wording; Maya help; previous-workbook correction text | Measured How it works paragraphs in `workbook-template-chromium.test.ts` |
| Name and Date only on each day's first page; larger gap | Every-day markup test and measured 18 px minimum gap |
| No adult guidance after Kindergarten | Every-plan header test and strict renderer check |
| Plain page instruction; no Watch, stretch or internal Unit B label | `instructionProblem`; strict measured instruction visibility and width check |
| Challenge title and Test yourself | Every-plan header test |
| Spot-the-error order, no Sam label, separate fix box | Template markup and rendered error-card test |
| Common grid, aligned card answers, larger boxes and work areas | Real Chromium layout tests across page types; strict answer/work minimum checks |
| Page topics | Code selects skill titles for plan rows; the page-title tests cover the title selection rules |
| No back My levels page | Generator and assembler tests; every-page markup test |
| Difficulty ramp and picture support | Schedule tests across all 30 levels; `scheduledItemProblem` |
| Daily bounds for all formats | `workbook-schedule-check.test.ts`: U14 addition and U4 comparison, places, order, missing sequence terms, picture counts, benchmark references, fraction components and unreadable data |
| Coin references versus money amounts | Public builder, package and schedule tests accept typed dime and quarter givens in parentheses and plural labels. The same text without structure is bounded. `10¢ + 0¢`, computed 10¢ and 25¢ totals, raw AI declarations and unscored story totals remain bounded. A given never exempts another occurrence of its value. |
| Complete error card retained; choice label printed once | `workbook-error-card.test.ts`: public generation and real render of a checked three-line U14 error; forced overflow and failed-page controls |
| Likelihood, colouring and mathematical drawing | `feedbackItemProblem`; #480 supplies the approved item types |
| At least 80 percent page use; under 30 minutes | Public fullness and day-time checks with negative tests; #480 applies the whole-book checks |
| U26 smaller easier example | Public package-check tests for same-shape expressions with smaller literals |

The existing number-word, printed-number, order-instruction, story-person and duplicate checks remain in force. Issue #480 owns changes to their item prompts and approved types, including the old page 59 order and page 64 likelihood drawing failures.

## Review-only sample selection

The sample script accepts `--days 1,3,5,8,10`. It filters only review plans. Real workbooks retain all 10 days. The selection gives 40 practice pages, plus the cover, plan and binding blanks, for 44 PDF pages. It refuses a day selection with second or test books. Its public-interface test checks that the original plan stays unchanged.

No subscription sample was generated on this branch. Only the fake U4 layout run was made. No real family, shipment or print order was changed.

## U26 limits

The checker now accepts an easier algebra example with the same operation order, the same number of steps and smaller literals. It still rejects an expression with `^` and an equation with the unknown written more than once. Supporting powers or general linear equations needs a separate checker change with worked-step tests. The #480 writer can use supported forms in its approved types without extending the checker.
