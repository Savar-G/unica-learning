# #1214 Methods and words before they are used

Synthetic books only (fake AI, fake child, real page-fit check). No family data.

## What changed (U10 and U19 only)

- A "Use 2 ways" question picks its two methods from the kind of question, never from words such as "times". No fitting pair means no Use 2 ways question: probability stories, times-table facts, a product with no round factor, sums under 20. A missing factor (`$17 × ? = $578`) is a division: divide / count up in groups.
- The first Use 2 ways question of each method pair gets a short worked example above it (code-written, never the question's own numbers). The first question that uses a word the book has not taught (angles, prime, factor, multiple, GCF/LCM, perimeter, ...) gets a "Words to know" strip.
- The book check fails any question that uses a method pair or a word no earlier block showed (`src/lib/workbook-taught.ts`). The strips are planned with the page, so the capacity stage fits fewer practice questions to make room for them.
- Other levels print what they printed before.

## Screenshots (synthetic U10, day 2 page 4)

| | Before (main) | After |
|---|---|---|
| 1. First Use 2 ways question | `01-use-2-ways-first-use-before.png`: Method 1 and Method 2 named with nothing shown (here the labels are even empty) | `01-use-2-ways-first-use-after.png`: a worked example of both methods above question 9 |
| 2. Spinner story | `02-spinner-before.png`: "split a number into parts / use a fact you know, then the zeros" | No pair, so the slot is never a Use 2 ways question (unit test) |
| 3. Missing factor | `03-missing-factor-before.png`: the multiplication pair on a division | `03-missing-factor-after.png`: divide / count up in groups (strip omitted in this illustration) |
| 4. A word before it is taught | Challenge printed "straight or reflex" before the step | `04-words-to-know-strip-after.png`: an illustration of the strip on a page with room |

## Violation counts

A violation is a Use 2 ways question that names methods no earlier page shows (before: all of them, since no book ever showed one), or a registered word used before it is taught.

| Level | Use 2 ways questions | Violations before | Strips printed after | Violations after | Book check |
|---|---|---|---|---|---|
| U10 | 6 | 6 (2 method pairs, 0 words) | 2 | 0 | ready, 84 pages, 639 questions (rebased on main with #1228, #1229, #1230 and #1232) |
| U19 | not measured | not measured | not measured | not measured | see below |
| U4 (report only, out of scope) | 6 | 6 | 0 | 6 (unchanged) | ready |
| U16 (report only, out of scope) | 7 | 7 | 0 | 7 (unchanged) | ready, same as main |

U19: the fake U19 book cannot be generated on main either (deterministic capacity error at page 8: "its last complete grid does not fit"), with and without this change, so there is no U19 count. U19 is covered by unit tests: a Challenge before the straight/reflex step is flagged and accepted after its worked example; a spinner question has no pair; planning covers methods only, so a words strip with no room is reported on its page, never a capacity error.

## Cases from the ticket

| Printed case | Before | After |
|---|---|---|
| Pattern jump ("How much is added each time?") | split a number into parts / use a fact, then the zeros (the word "each" picked the multiplication pair) | subtract the first number from the second / count on from the first number to the second, with a worked example before first use |
| `$17 × ? = $578` | split a number into parts / use a fact, then the zeros | divide / count up in groups |
| Spinner "How far off is the prediction" | split a number into parts / use a fact, then the zeros | no Use 2 ways question |
| `56 ÷ 7` | share in groups / use a times fact | no Use 2 ways question (a times-table fact) |
| "straight or reflex" before its step | no definition anywhere earlier | "Words to know" strip above the first use |

## Checks

Unit tests: `workbook-two-ways`, `workbook-intro-examples`, `workbook-taught` (the taught-ledger book check, planning, replacement of a planned strip), plus the workbook quality, template, book, page, step-items and story-routing suites. Full test suite (929 files), eslint, typecheck and the repo guard are clean. `next build` was not run locally (this worktree links another checkout's node_modules, which Turbopack refuses); CI runs it.
