# Workbook item policy (#480)

New job frames save `itemPolicy: "approved-v1"`. A frame without this field keeps
the earlier policy. The policy, fixed items and example bank enter the outline
fingerprint. A changed outline stops a resume before it can mix two plans.

## Item writing

- Code writes drills and worked examples. These items do not reach the writer
  or the solve model.
- The writer receives only story and explanation contracts. Code fixes the
  skill, format, operation, numbers and help. The writer can change only `text`.
- A story must print the exact multiset of given numbers. Changing a format or
  operation fails before the package builder runs. Number words and the normal
  plain-language checks still apply.
- A separate solve model reads each AI-written story from its printed words.
  Explanations, coloured drawings and likelihood circles need a parent check.
- `src/lib/workbook-approved-skills.json` is the exact list of supported skills.
  A skill absent from this file fails closed. This is not a claim of support for
  every BC skill. Adding a type requires its builder, examples and tests.
- Counting uses a printed row to colour or an empty ten-frame to fill.
  Likelihood uses a circle choice with `never`, `maybe`, `always`.

The example bank is `ITEM_EXAMPLES` in `src/lib/workbook-item-plan.ts`. It is a
review candidate. Savar must approve it. Each AI request includes the examples
for each requested type and grade band. The complete list is in
[`workbook-example-bank-480.md`](workbook-example-bank-480.md).

Each saved question keeps its item contract. An edit uses that contract, its
numbers and its examples. Code drills still make no writer request. A saved
approved question without a contract requires a new run. It cannot use the
earlier writer policy.

The list has 65 supported skill IDs. Each has a public builder test. Doubles
use equal addends. Near-doubles use addends that differ by 1. Benchmarks use
the taught reference values. Decimal place-value items use the taught places.
Six earlier mappings now fail closed. The bank document lists their limits.

The current approved list has no money builder. Coin-value skills fail closed.
The shared item builder accepts coin givens only through trusted
`SlotPlace.givens`, made with `coinGiven`. AI output has no `givens` field in
its schema. It cannot supply or widen that trusted list. The range checks
still bound operands, answers, totals and undeclared amounts.

## Capacity and required coverage

The planner takes the template capacity before it assigns items. It reserves
Friday 5 and required teaching blocks. The fit check measures code-picked
items before any writer call. It reduces optional review and drills first.
The run frame saves that capacity and its exact item contracts before the
outline fingerprint. Generation, layout, recovery and coverage use this budget.

Generation keeps every written question. An overflow fails the page after its
bounded shorter rewrite. It cannot remove a required block. Missing or failed
planned items fail the book check. Friday 5 must have five sound questions.

The cover title comes from the checked code list for all 30 levels. U4 uses
`Counting and adding to 20`. The cover also lists what the child will learn.

## Whole-book check

The final pass reads actual questions. It checks repeated questions, larger
numbers across days, answer-format variety and estimated day time below 30
minutes. A code drill can recur up to 3 times across a book. The same page cannot
repeat it. Warm-up facts can recur for practice.

One task type can fill at most half of a page with three or more questions,
rounded up. It can fill at most half of the book's non-warm-up questions.
Changed names, objects and quantities cannot hide a repeated story or event
frame. A likelihood page combines circle choices with numeric review.

The Challenge must use the day's upper number limit and require more reasoning
steps than practice. The supported count-on Challenge has two changes. Days
8 to 10 have three changes. A skill without an approved Challenge fails closed.
An explanation refers to the first story on its own page. It cannot add an
unrelated named person or numbers.

Each weak page gets at most one code repair in this pass. The page must still
fit. The repair must keep its slots and item count. A worse repair is refused.
Unresolved problems fail the page. The usual per-page failed-question and fit
rewrites stay bounded. The book pass adds no provider calls.

Page checkpoints keep the version before the final book check. A resumed run
applies the same code repairs to those checkpoints. It does not repeat an AI
call. The final draft holds the reviewed questions and quality result.

## Review sample score

The sample index reports the failed-question rate, dropped questions, vertical
page use, estimated minutes for each selected day, subscription calls and API
calls. Vertical use includes writing space. It is not the fraction of paper
covered by ink. An absent measurement stays unknown.

The technical gate requires less than 5% failed questions, no unresolved book or
render problems, and at least 80% measured vertical use on each day page. A fake
run always stays on hold. Passing these checks does not replace Savar's approval
of the sample and example bank. Time estimates need later checks with children.

Use `--subscription-only --no-store` for a local review with no API fallback and
no family, draft or storage writes. The normal sample provider options remain
available for other explicitly authorised runs.
