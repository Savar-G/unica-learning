# Workbook generator rounds

Use this guide to split a generator round into small PRs. Read the [shared agent brief](agents/delegate-brief.md) and follow the [fast loop](workbook-fast-loop.md).

## Three lanes

Each lane owns its listed files and their tests. Paths without a directory below are in `src/lib/`.

| Lane | Work | Files |
|---|---|---|
| Correctness | Answer keys, solve checks, item checks, repeat and task identity, story text | `workbook-solve-check.ts`, `workbook-task-identity.ts`, `workbook-code-story.ts`, `workbook-wording.ts`, `workbook-item-plan.ts`, `workbook-generator-items.ts` |
| Content | Step data and templates, difficulty, variety, Challenge, progression | `data/curriculum/`, `src/lib/workbook-curriculum/`, `workbook-step-items.ts`, `workbook-plan.ts` |
| Layout | Template and CSS, fit and fullness, spacing, labels and instructions, automatic layout checks | `workbook-template.ts`, `workbook-template-fixed.ts`, `workbook-template-fonts.ts`, `workbook-fit.ts`, `workbook-render.ts`; layout checks in `workbook-template.test.ts`, `workbook-template-chromium.test.ts` and `workbook-render.test.ts` |

Name one owner for `workbook-generator.ts` and one owner for `workbook-quality.ts` in the round's tickets before work starts. Each file has only one owner per round. Assign any other shared file before editing it.

## Sequence and lane PRs

Put work that touches the same code into one lane, or run it in order. Do the same when one lane depends on another. Wait for a required PR to merge before starting dependent work from main.

Each lane uses its own worktree from `origin/main`. Each lane follows the fast loop and opens a small PR for a scoped Codex review. Name the owned files, required PRs and acceptance checks in each ticket.

Use fake samples and only the affected tests during the inner loop. Run the full gate once before the push. Keep samples local. Never write live family rows or use paid APIs.

## Integration after the lane PRs merge

Use main with all lane PRs merged. Record the commit, seed, commands, output folders and exit codes.

1. Generate full seeded U4 and U16 books with `--fake --no-store --check-only`. Omit `--days` to cover all ten days. Set `WORKBOOK_SAMPLE_ID` to a fixed UUID so the run can be repeated.
2. Generate a real U16 sample with `--replay <last-real-sample>`. Use the subscription-only commands in the fast loop. Run the final real U4 and U16 pair for days 1,5,10 in parallel, once per round. If no real cache exists, create the first sample as the fast loop describes.
3. Run the automatic layout checks. Use strict fit and fullness checks on the generated books and the layout tests listed above. Check for overflow, missing content and physical page failures. Record failures and exit codes.
4. Check the sample against every item in Savar's page checklist below. Read `<label>-pages.md`, contact sheets and changed pages. Read the printed question text and answer keys. Record any gaps before sending the sample.
5. Send the sample and check results to Savar for review.

A passed fake run proves the selected local generation and print path. It does not prove real AI text or Savar's approval.

## Done bar

The checks must pass. The scoped Codex review must have no P0 or P1 findings. Savar must approve the sample for the level that matters. Put smaller findings in a follow-up PR. Savar controls the merge.

## Savar's page checklist

- Leave no empty space at the bottom of a page and no space with room for another question.
- Use even spacing. Keep section labels and work boxes clear of crowded content.
- Align question numbers and first lines across columns. Use the same number style everywhere.
- Say "circle" on every page with true/false questions or choices.
- Remove redundant prompts, such as "How did you work out..." beside "Show your work".
- Make side notes such as "Watch out" smaller and lighter.
- Use friendly, grammatical labels, such as "Now it's your turn" and "Mental math".
- Use natural titles, such as "Place value up to 100,000".
- Use commas for numbers of 1,000 and up, as required by D-230.
- Mix story kinds on a stories page.

## Story text is code-only

The AI must never edit printed story text. Code owns that text. A reworded story could keep a wrong answer key. See D-231 in the [decision log](../.design/decisions.md).
