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
call. The shared page budget protects the required teaching blocks and item minimums.
The capacity pass adds an item from the same step when the measured page needs
more content, up to its limit. A candidate that overflows is removed before
writing. The run frame saves the capacity and exact contracts. Generation,
layout, recovery and coverage use this budget. Existing-path pages keep their
bounded fit rewrite and the same page budget. Required teaching cards stay protected.

Missing or failed planned items fail the book check. Friday 5 needs five sound
questions. An empty day page fails. The sample command returns a nonzero exit
when a book cannot be generated. A completed fake book can still fail technical
checks; its index reports that result separately from the approval hold.

## Whole-book check

The strict checks apply to the items whose builders exist. A story or event
frame can occur once in a book. Changed names, objects or quantities do not
hide a repeat. One type can fill at most half a page with three or more
questions, rounded up, and half of the book's non-warm-up items. An identical code drill cannot recur. Warm-up facts can recur for fluency.
A page-specific explanation is a different task because it refers to that
page's first story.

The U4 Challenge has at least three hard stories each day. Each reaches the day's upper
number limit and needs more operation steps than practice. Days 8 to 10 use
three changes. Each story has its own work area. The work areas share the available room. Challenges
without this builder keep the existing checked path. An explanation with a
contract refers to the first story on its own page.

The book checks estimated time below 30 minutes. Fixed multiplication and
division facts need not grow beyond their taught range. A weak page gets at
most one code repair. It must keep its slots and item count and still fit.
A worse repair is refused. A code replacement must also be absent from the
rest of the book. The repair retains checked panel packages and teaching blocks.
An empty required example panel fails coverage. The book pass adds no provider calls.

## Review evidence and limits

`workbook-review-run.test.ts` runs the complete fake U4 review command through
real Chromium templates and fullness checks. It requires 40 day pages, a
44-page PDF, no failed questions or pages, no omissions, and a passing quality
result. The test does not use a fit seam that always returns success.

The fake indexes report the failed rate, omissions, the union of occupied
vertical intervals, unoccupied gap sizes, extra practice pages,
estimated day time, builder coverage and provider calls. The technical gate
requires less than 5 percent failed items and no unresolved quality or render
problems. The measured layout requires at least 85 percent occupied space,
or a completed item budget with bounded even spacing and no large bottom gap.
Fake books always keep the approval hold. No child was timed.

The example candidates are listed in `workbook-example-bank-480.md`. Savar
must approve the bank and the next authorised subscription sample before merge.
No real sample is authorised for these fixes. The layout changes below are
included. The imported step templates remain assigned to the next agent.

## Page rules adopted from Cedric's brief

The new measured layout keeps the 32 px gutter, a header of at most 150 px,
answer boxes of at least 48 px (56 px in Kindergarten), 36 px answer lines,
and work areas of at least 120 / 140 / 160 px by level band. Printed frames
use 40 px cells. Required item counts share the template budget. Spare binding
pages contain practice from skills already used in the book.

`pageSpace` merges occupied intervals. A gap never increases the reported
occupied fraction. The capacity pass adds items before it adds spacing.
At the maximum that fits, even spacing can use up to 48 px extra per gap.
The spacing check rejects a gap above 60 px and rejects a bottom gap above
15% of the question area. A lower occupied fraction at the page maximum is
reported as such in the sample index.

Likelihood uses never / sometimes / always. Drawing tasks fail from U4 up.
Colouring a printed row or frame remains permitted. Every question number
has a period. The cover uses a checked plain title and one learning sentence.
The new rules apply to the measured layout. Saved legacy pages retain their
layout limits, with the updated question numbers and cover copy.

The curriculum-step importer is merged from `origin/main` at `5f078f5`.
The generator retains the existing 155-step path. The next agent must use
`bcStepProgressions()` and its approved templates and ranges, move through the
skeleton's skills and steps, and remove the fixed second topic. These are not
claims established by the current hand-built U4 pipeline.
