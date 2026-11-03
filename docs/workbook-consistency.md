# Workbook item policy (#480)

New run frames save `itemPolicy: "approved-v1"`. A saved legacy frame keeps
its earlier policy. The outline fingerprint includes the selected contracts,
capacity, routing and example banks. A changed outline stops a resume.

## Two generation paths

The code chooses the path for each skill. AI output cannot choose it.

- Skills in `workbook-approved-skills.json` use fixed item contracts. Code
  writes their drills and worked examples. These items make no writer or
  solve-model request. AI writes only the story or explanation text.
- Skills without a code builder keep the existing writer. They retain its
  skill rules, format checks, independent solve checks and bounded rewrites.
  The current daily range and picture checks also apply. This path stays
  available until the imported step templates supply approved builders.
- A failed contract for a covered skill cannot switch itself to the existing
  writer. The saved question records its path for recovery and editing.

The current hand-built list has 65 skill IDs. U4 is the only level whose own
and fluency skills are fully covered. Personal review skills are routed
individually. `workbookBuilderCoverage()` reports all 30 levels. The report is
in `workbook-builder-coverage.md` and each fake review index.

## Fixed items and edits

Code fixes the skill, format, operation, numbers and help for a contract. The
story must print exactly its code-picked numbers, including repeated values.
A changed field or numeric multiset fails before package construction.
A separate solve model reads AI story text against the computed answer.
Parent-checked tasks remain marked as such.

Doubles use equal addends. Near-doubles differ by 1. Benchmarks use their
fixed reference values. Decimal place-value items use their taught places.
Each retained builder has a public test. The existing writer covers other
skills; this is not a claim that all skills have code builders.

Each saved question retains its contract or existing-path marker. An edit
keeps the saved path. Contract edits retain their operands, type and examples.
Code drills make no writer request. Old approved questions without a saved
contract require a new run. A current existing-path question remains editable.

Coin givens come only from trusted `SlotPlace.givens`, made with `coinGiven`.
AI output cannot add or widen that list. Operands, answers, totals and
undeclared matching amounts remain bounded. The hand-built list has no money
builder; money skills use the existing writer with these checks.

## Capacity and text budgets

The planner takes the template capacity before writing. It reserves Friday 5
and the teaching blocks. Contract stories carry `textBudget`: lines, characters
per line and total characters. Code selects a compact candidate within that
budget before the physical capacity check. Writer output must meet it too.
The real renderer still checks actual line wrapping and overflow.

Fully covered pages are measured with their code-picked items before a writer
call. Optional review and drills give up room first. The last practice drill
stays. The run frame saves the capacity and exact contracts. Generation,
layout, recovery and coverage use this budget. Existing-path pages keep their
bounded fit rewrite. Required teaching cards stay protected.

Missing or failed planned items fail the book check. Friday 5 needs five sound
questions. An empty day page fails. The sample command returns a nonzero exit
when a book cannot be generated. A completed fake book can still fail technical
checks; its index reports that result separately from the approval hold.

## Whole-book check

The strict checks apply to the items whose builders exist. A story or event
frame can occur once in a book. Changed names, objects or quantities do not
hide a repeat. One type can fill at most half a page with three or more
questions, rounded up, and half of the book's non-warm-up items. A code drill
can recur up to three times. Warm-up facts can recur for fluency.

The U4 Challenge has two hard stories each day. Each reaches the day's upper
number limit and needs more operation steps than practice. Days 8 to 10 use
three changes. Each problem now gets about half the page for work. Challenges
without this builder keep the existing checked path. An explanation with a
contract refers to the first story on its own page.

The book checks estimated time below 30 minutes. Fixed multiplication and
division facts need not grow beyond their taught range. A weak page gets at
most one code repair. It must keep its slots and item count and still fit.
A worse repair is refused. The book pass adds no provider calls.

## Review evidence and limits

`workbook-review-run.test.ts` runs the complete fake U4 review command through
real Chromium templates and fullness checks. It requires 40 day pages, a
44-page PDF, no failed questions or pages, no omissions, and a passing quality
result. The test does not use a fit seam that always returns success.

The fake indexes report the failed rate, omissions, measured vertical use,
estimated day time, builder coverage and provider calls. The technical gate
requires less than 5 percent failed items, no unresolved quality or render
problems, and at least 80 percent measured use on every day page. Fake books
always keep the approval hold. No child was timed.

The example candidates are listed in `workbook-example-bank-480.md`. Savar
must approve the bank and the next authorised subscription sample before merge.
No real sample is authorised for these fixes. Cedric's final step data and
Savar's later layout decisions are the next integration stage.
