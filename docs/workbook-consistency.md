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
for each requested type and grade band.

## Whole-book check

The final pass reads actual questions. It checks repeated questions, larger
numbers across days, answer-format variety and estimated day time below 30
minutes. A code drill can recur up to 3 times across a book. The same page cannot
repeat it. Warm-up facts can recur for practice.

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
