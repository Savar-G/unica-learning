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

For U4, the daily maxima are 8, 9, 10, 12, 13, 14, 15, 17, 19 and 20. Days 1 to 3 use pictures. Days 4 to 7 use pictures only for new ideas. Days 8 to 10 have no picture support. Fixed curriculum values, such as a benchmark of 10 or a fraction denominator, keep their taught value. Increase task complexity and remove help for those skills.

## Checks for the #480 writer

`src/lib/workbook-feedback-check.ts` exports:

- `instructionProblem(text)`: refuses missing instructions, internal unit labels and rejected wording.
- `feedbackItemProblem(package)`: refuses tracing after Kindergarten, object drawing used only to count, abstract likelihood drawing and a likelihood response other than circle-the-word. The renderer calls this check.
- `scheduledItemProblem(package, curriculum, day, place)`: checks the feedback rules, picture support and the scalar number bound. The writer must call it before accepting a question.
- `estimatedDayMinutes(questions, panels)`: includes reading time, worked examples, response type and algebra work. This is a planning estimate. It is not a measured child completion time.
- `dayTimeProblem(questions, panels)`: refuses an estimated day above 30 minutes. The whole-book pass must call it.

`src/lib/workbook-template.ts` exports `pageFullness(page, measured)` and `fullnessProblem(page, measured)`. The target is 80 percent of the usable height, including teaching panels and writing space. Missing measurements fail closed. The whole-book pass must use this check when it chooses whether to add questions or increase writing space. Overflow remains a separate strict render check.

The current slot limits reserve room for the larger writing areas. The generator still records every planned omission. A Unit B page with a new example and a spot-the-error card has no spare practice block at U1 to U9. Review pages keep two mixed-set items. Packed six-page days keep two retrieval items beside their challenge cards.

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
| Likelihood, colouring and mathematical drawing | `feedbackItemProblem`; #480 supplies the approved item types |
| At least 80 percent page use; under 30 minutes | Public fullness and day-time checks with negative tests; #480 applies the whole-book checks |
| U26 smaller easier example | Public package-check tests for same-shape expressions with smaller literals |

The existing number-word, printed-number, order-instruction, story-person and duplicate checks remain in force. Issue #480 owns changes to their item prompts and approved types, including the old page 59 order and page 64 likelihood drawing failures.

## Review-only sample selection

The sample script accepts `--days 1,3,5,8,10`. It filters only review plans. Real workbooks retain all 10 days. The selection gives 40 practice pages, plus the cover, plan and binding blanks, for 44 PDF pages. It refuses a day selection with second or test books. Its public-interface test checks that the original plan stays unchanged.

No subscription sample was generated on this branch. Only the fake U4 layout run was made. No real family, shipment or print order was changed.

## U26 limits

The checker now accepts an easier algebra example with the same operation order, the same number of steps and smaller literals. It still rejects an expression with `^` and an equation with the unknown written more than once. Supporting powers or general linear equations needs a separate checker change with worked-step tests. The #480 writer can use supported forms in its approved types without extending the checker.
