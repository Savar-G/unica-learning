# Maya coverage, Wave C: the "other-topic" group (C3)

Builder C3, 2026-11-07. Scope: the 34 questions of the customer's saved book (draft 90559915, revision 2) in group
`other-topic` of the coverage report. Every one is stored with no operation, from a step template with stored slot
values. This note gives the smallest checked teaching path for each, what this PR builds, and what waits on other work.
The table lists ids only: no printed text or number from the book is copied here, in the code or in the tests (the
tests use synthetic packages with the same template shapes).

## Result

- **All 34 are derived** from stored data with the three agreements of the Wave A brief (rule 3): the printed text by a
  closed form, code's own computation equal to the answer key, and the stored template (answer, check and derived
  expressions, exactly) whose slot values are the printed numbers.
- **5 are teachable now** with kinds Maya already teaches: the 4 die counts (divide) and the 1 symmetry sum (add). R2
  count with these derivers as the adapter: 249 to 254.
- **1 more (perimeter) is teachable when A2 lands**: its package is an `evaluate` and checks. It is held today because
  `evaluate` is not in `TEACHABLE_KINDS` and because Maya has no lines for its `operate` steps.
- **28 have a checked reading** (`readTopicQuestion`) and wait on teaching paths: A4's claim path (true/false and word
  answers), A2's evaluate steps, a small compare path, and a time path.
- None needs a change to the printed book or a stored package. None is left underivable.

## Paths

### Teachable now: an operation Maya teaches, plus code's topic sentence

The math of these questions is one operation Maya teaches, once a code fact names its numbers. The new part is one or
two code-written sentences that say why (`src/lib/maya/topic-frame.ts`), said with the question line, the first
question and the fixed workbook opening, and with the easier example's intro:

- Die count (`4.17-predict-outcome#3.2:story`): "From 1 to 8, odd and even take turns. So half are odd."
  Then `8 ÷ 2`. Code counts the kind one number at a time and checks the count against the key and the division. The
  template must be exactly `s // 2` with the check `s % 2 == 0`. The easier example is a smaller die (1 to 4 or 1 to 6)
  none of whose numbers is the question's answer, so the example never says it (the controller refuses that).
- Lines of symmetry (`4.15-line-symmetry#3.5:bare`): code's fact table (square 4, rectangle that is not a square 2,
  isosceles triangle 1, scalene triangle 0, regular hexagon 6, regular pentagon 5) gives `4 + 0`. A count from code's
  table is code-computed. The template's lists must be code's table in code's order, and its slots `i`, `j` the printed
  shapes. The easier example is another pair from the table with a smaller sum.
- The framed example intro is its own turn (as for a 25-word grade): with the topic sentence, the intro and the first
  example step together pass 45 words. Every framed line fits a 25-word turn (tested for the longest shape names).

### Waits on A2: evaluate

- Perimeter (`4.14-perimeter#3.1:bare`): `2 × (l + w)` as an `evaluate`, with the sentence "A rectangle has 2 lengths
  and 2 widths. Add one length and one width. Then double it." Built and hooked. The session holds it for two reasons
  until A2's evaluate teaching lands: `evaluate` is not in `TEACHABLE_KINDS`, and Maya has no lines for its `operate`
  steps. No change is needed here then.

### Waits on A4: the claim path (22 true/false, 3 word answers)

`readTopicQuestion` (`src/lib/maya-teaching/topic-claims.ts`) gives, for each, the work code does and the two things
compared, so A4's claim deriver can build its package from it:

- Scale (8), money (2), minute hand (1): a claimed amount against code's `evaluate` (`mark + m × interval`,
  `bills × 20 + quarters × 0.25`, `number × 5 + marks`). Needs A2's `operate` steps for the work and A4's compare step.
  Money needs decimal `operate` steps (0.75), which A2 must confirm it covers.
- Marbles (2): red against `add` of the other colours. Area true/false (1): two `multiply`, the products compared. Both
  need two amounts compared, one of them not computed (marbles) or both computed (area): a compare step after the work,
  not a single operation's result against a printed claim. A4's claim step may cover it if it compares two values.
- Same denominator (8): "5/6 > 3/6" has no operation. The smallest path is a compare step only ("The denominators are the
  same, so compare the numerators: 5 is more than 3"). It needs a session path with no operation, which Maya does not
  have: build it as A4's claim compare with a zero-step work, or as its own small module after A4 lands.
- Area compare (2) and die compare (1) are word answers ("7 by 6", "even"): the same compare, then the answer is the
  printed words of the bigger one. The pair of words comes from code (`words` in the reading), as controller rule 4
  asks. They need A4's word-answer handling.

### Waits on a time path (3)

`4.12-read-analog#3.2` and `#3.5`: "What time is 40 minutes after 9:00?" is `time-add`, which the package computes, with
`count-on` steps (to the next hour, then the rest). Maya has no lines for `count-on` and no reader for a spoken time
("nine forty", "7:03"). The package's clock with no period is the 24-hour clock ("09:40"); the book prints a 12-hour
time with no period, so the reading writes the result as the book does and checks it against the key. A time path
needs: lines for `count-on` (5 to 8 wordings, Savar's approval), step answers as minutes, a spoken-time reader in
`numbers.ts`, and the answer check on the book's form. `quantity-add` is not used by this group.

## Shared-file hooks

- `src/lib/maya/lines.ts`: three template keys (`question.framed`, `assess.framed`, `example.framed`) and their use in
  `packageLines` when `topicFrame` gives a sentence. The fixed workbook opening (`workbookOpening`) never carries it:
  with it the opening passes a 25-word turn (review of #731); the question and assess lines say it next. Every other question's lines are unchanged
  (tested).
- `src/lib/maya/session.ts`: one condition in `rawOffersFor`, `example_step`: a framed intro is its own turn.
- No change to `question-package.ts`, `fractions.ts`, the generator or `checkQuestionPackage`. The derivers need no
  wider limits. They return the package without `operationSource`: A1's adapter marks it.

## Integration with A1

Each deriver has A1's `Deriver` shape (`(printed) => QuestionPackage | null`). After A1 lands, add to `DERIVERS` in
`src/lib/maya-teaching/index.ts`: `deriveDieCount`, `deriveSymmetry`, `derivePerimeter`. They refuse any package whose
template id is not theirs, so the order does not matter.

## Gate and practice

- Gate (`src/lib/maya-gate`, fixtures `DIE` and `SHAPES`, synthetic): OT1 cannot start (framed example), OT2 and OT5 the
  answer in the child's own words (one confirm, then accepted, no re-teaching: J06), OT3 "why divide by 2?" answered
  with the topic sentence, OT4 a wrong sum guided.
- Practice (`src/lib/maya-practice/cases.ts`): OT4 and OT5 on `SHAPES` (6 + 5 = 11). A die count has a one-digit answer,
  which a practice case cannot keep behind a stage, so the gate covers it.

## The 34 questions

| # | Id (draft 90559915) | Page.Q | Template | Topic | Smallest checked path | Depends on | State in this PR |
|---|---|---|---|---|---|---|---|
| 1 | `d1p3s1.5` | 5.5 | `4.16-many-to-one#3.4:true-false` | scale | evaluate `mark + m × interval`, then compare with the claim | A2, A4 | derived (reading) |
| 2 | `d1p3s1.6` | 5.6 | `4.16-many-to-one#3.4:true-false` | scale | evaluate `mark + m × interval`, then compare with the claim | A2, A4 | derived (reading) |
| 3 | `d1p3s1.7` | 5.7 | `4.18-money-notation#3.3:true-false` | money | evaluate `bills × 20 + quarters × 0.25`, then compare with the claim | A2 (decimal `operate`), A4 | derived (reading) |
| 4 | `d1p4s1.7` | 6.7 | `4.14-perimeter#3.1:bare` | perimeter | evaluate `2 × (l + w)` + topic sentence | A2 (`operate` steps) | derived; held until A2 (`evaluate` not in `TEACHABLE_KINDS`, no `operate` lines) |
| 5 | `d1p6s1.7` | 8.7 | `4.18-money-notation#3.3:true-false` | money | evaluate `bills × 20 + quarters × 0.25`, then compare with the claim | A2 (decimal `operate`), A4 | derived (reading) |
| 6 | `d1p7s1.2` | 9.2 | `3.9-area-square-units#4.1:compare` | area-compare | two multiplies, then name the bigger as printed | A4 word answers + compare path | derived (reading) |
| 7 | `d1p7s3.1` | 9.5 | `4.3-same-denominator#3.4:true-false` | same-denominator | compare the numerators (no operation) | A4 + new compare path | derived (reading) |
| 8 | `d1p7s3.2` | 9.6 | `4.12-read-analog#3.5:bare` | time | `time-add` (count-on steps) | new time path (count-on lines, spoken-time reader) | derived (reading) |
| 9 | `d1p7s3.3` | 9.7 | `4.3-same-denominator#3.4:true-false` | same-denominator | compare the numerators (no operation) | A4 + new compare path | derived (reading) |
| 10 | `d1p7s3.4` | 9.8 | `4.12-read-analog#3.2:bare` | time | `time-add` (count-on steps) | new time path (count-on lines, spoken-time reader) | derived (reading) |
| 11 | `d2p3s1.5` | 13.5 | `4.17-predict-outcome#3.2:story` | die | divide `last ÷ 2` + topic sentence | none | teachable now |
| 12 | `d2p3s1.7` | 13.7 | `4.17-predict-outcome#3.2:story` | die | divide `last ÷ 2` + topic sentence | none | teachable now |
| 13 | `d2p6s1.5` | 16.5 | `4.16-many-to-one#3.4:true-false` | scale | evaluate `mark + m × interval`, then compare with the claim | A2, A4 | derived (reading) |
| 14 | `d2p6s1.7` | 16.7 | `4.17-predict-outcome#3.2:story` | die | divide `last ÷ 2` + topic sentence | none | teachable now |
| 15 | `d2p7s3.2` | 17.6 | `4.3-same-denominator#3.4:true-false` | same-denominator | compare the numerators (no operation) | A4 + new compare path | derived (reading) |
| 16 | `d2p7s3.3` | 17.7 | `4.3-same-denominator#3.4:true-false` | same-denominator | compare the numerators (no operation) | A4 + new compare path | derived (reading) |
| 17 | `d3p3s1.5` | 21.5 | `4.16-many-to-one#3.4:true-false` | scale | evaluate `mark + m × interval`, then compare with the claim | A2, A4 | derived (reading) |
| 18 | `d3p3s1.6` | 21.6 | `4.17-predict-outcome#3.4:compare` | die-compare | code counts each outcome on 1 to 6, then names the likelier | A4 word answers + compare path | derived (reading) |
| 19 | `d3p3s1.7` | 21.7 | `4.16-many-to-one#3.4:true-false` | scale | evaluate `mark + m × interval`, then compare with the claim | A2, A4 | derived (reading) |
| 20 | `d3p4s1.5` | 22.5 | `4.12-read-analog#3.2:bare` | time | `time-add` (count-on steps) | new time path (count-on lines, spoken-time reader) | derived (reading) |
| 21 | `d3p4s1.7` | 22.7 | `4.3-same-denominator#3.4:true-false` | same-denominator | compare the numerators (no operation) | A4 + new compare path | derived (reading) |
| 22 | `d3p4s1.8` | 22.8 | `4.3-same-denominator#3.4:true-false` | same-denominator | compare the numerators (no operation) | A4 + new compare path | derived (reading) |
| 23 | `d3p6s1.5` | 24.5 | `4.3-same-denominator#3.4:true-false` | same-denominator | compare the numerators (no operation) | A4 + new compare path | derived (reading) |
| 24 | `d3p6s1.6` | 24.6 | `4.3-same-denominator#3.4:true-false` | same-denominator | compare the numerators (no operation) | A4 + new compare path | derived (reading) |
| 25 | `d3p7s1.4` | 25.4 | `3.9-area-square-units#4.1:compare` | area-compare | two multiplies, then name the bigger as printed | A4 word answers + compare path | derived (reading) |
| 26 | `d4p3s1.7` | 29.7 | `4.17-predict-outcome#3.3:true-false` | marbles | add the other colours, then compare red with the sum | A4 + compare path | derived (reading) |
| 27 | `d4p6s1.7` | 32.7 | `4.17-predict-outcome#3.3:true-false` | marbles | add the other colours, then compare red with the sum | A4 + compare path | derived (reading) |
| 28 | `d5p4s1.7` | 38.7 | `4.16-many-to-one#3.4:true-false` | scale | evaluate `mark + m × interval`, then compare with the claim | A2, A4 | derived (reading) |
| 29 | `d5p6s1.5` | 40.5 | `4.17-predict-outcome#3.2:story` | die | divide `last ÷ 2` + topic sentence | none | teachable now |
| 30 | `d6p4s1.7` | 46.7 | `4.16-many-to-one#3.4:true-false` | scale | evaluate `mark + m × interval`, then compare with the claim | A2, A4 | derived (reading) |
| 31 | `d7p6s1.8` | 56.8 | `4.12-read-analog#3.4:true-false` | minute-hand | evaluate `number × 5 + marks`, then compare with the claim | A2, A4 | derived (reading) |
| 32 | `d9p7s1.6` | 73.6 | `3.9-area-square-units#4.3:true-false` | area | two multiplies, then compare the products | A4 + compare path | derived (reading) |
| 33 | `d10p2s1.3` | 76.3 | `4.15-line-symmetry#3.5:bare` | symmetry | add from code's symmetry table + topic sentence | none | teachable now |
| 34 | `d10p6s1.5` | 80.5 | `4.16-many-to-one#3.4:true-false` | scale | evaluate `mark + m × interval`, then compare with the claim | A2, A4 | derived (reading) |
