# Workbook fill and work-space evidence

Candidate base: `eed26e4539ba77dee4e5cbd3f6cb2ced3d9b5e13` (`origin/main` when this worktree started). Branch: `site/wb-fill-cells`. Seed: `17fc5da1-2442-488a-a450-611a471e73e6`. Local runs used Savars-MacBook-Pro-5. The linked PC had no registered repository checkout. All samples used fake AI, the public generator, and the strict Chromium print engine. No paid API calls or live family writes were made.

## Behaviour

- Warm-up pages contain ordinary facts. They contain no separate mental-math block.
- Each two-column section has complete rows. Capacity reserves required tasks before optional fill. Failed task exchanges restore both pages. Friday 5 and the five-item mini-test retain a full-width final row.
- Calculation work areas are white. They reserve 32, 64 or 96 CSS pixels, according to the calculation. A digit recall needs no calculation area. The work areas count toward occupied space. Every page with a work area retains the short work instruction and any circle instruction.
- Calculation space can lower the required count to six ordinary questions. Practice 2 can contain four ordinary questions when it also contains an error task and a two-method task. A new-idea calculation page can contain two practice questions beside its full example. Recall practice retains eight questions. Optional fill continues while physical fit, distinct tasks, difficulty rules and day time allow it. Challenge retains three cards.
- Review and Mixed set use the final eligible curriculum step. Their keys and template source must match the current curriculum. Own-step practice and teaching keep their planned steps. New-idea pages must retain their own-step practice. The placement and early-sign weak-unit rules are unchanged.

## Review difficulty findings

The real draft's count-on and whole-dollar money examples already named step 3. A step-number check alone could not correct them. The scale template was rewritten into count-on language. The final money missing-number template used only whole-dollar addition. Mixed set bypassed the curriculum templates and used its old operation-choice builder. Earlier-step review also remained possible for extend-facts.

The final scale template now gives three adjacent marks and requires interval inference. The money template requires a missing bill count from a decimal total with several denominations. The final bag templates compare one colour with all other colours combined. Small probability counts alone are not evidence of low difficulty. These changes add the missing reasoning within the existing number ranges. They also apply to the standard's own practice. The curriculum source changes and exact before/after fields are recorded in `data/curriculum/author-changes.md` and `author-changes.json`.

| Case | Before | After |
|---|---|---|
| Scale, 4.16 | Start at 30 and count on by 10s four times. You reach 80. | Marks are 78, 80, 82. Is four intervals above 80 equal to 88? Infer the interval of 2. Final sample p6 q10. |
| Money, 4.18 | Three $10 bills and four loonies make how many dollars? | Three $20 bills, three loonies, two quarters and some $10 bills total $93.50. Find the number of $10 bills. Answer: 3. Final sample p5 q6. |
| Probability, 4.17 | Compare 6 red with 9 blue marbles. | Compare red with blue and green together. The existing count range remains 1 to 12. Final sample p8 q8 uses 4 red, 9 blue and 3 green. |
| Extend-facts, 5.8 | Step 1: add 200 and 900 in a story. | Review is checked against this standard's final step. The final seeded sample does not select an extend-facts review item. Positive and below-floor controls cover it. |
| Mixed set, 4.4 | The original draft used 28 operation-choice items tagged 4.4. | The same slot now uses the standard's final step 5, for example 3,060 tickets plus 1,518 tickets. Final sample p9 q10. |

The final U16 book uses step 5 for all 21 selected 4.4 template questions, including 20 subtraction questions and one addition question. It uses step 3 for all selected 4.16, 4.17 and 4.18 questions. The original 28 Mixed set items were builder items, separate from its 20 step-5 subtraction questions.

## Negative controls on the baseline

The current checks were applied to the saved baseline drafts and to the original draft. The original draft has 41 grid pages with incomplete rows. Static checks reject 28 of Savar's 29 listed pages. A physical render with the original template rejects the remaining page, p41, because its last Friday question did not span the grid. The union rejects all 29 listed pages.

The original draft also produces 10 redundant warm-up failures, 79 missing work-instruction failures, 57 mastery-source or mastery-step failures, and 317 questions that need automatic calculation space absent from the original template. These are separate counts and can overlap on one page. The saved origin/main U16 baseline produces 40 grid-page failures, 10 warm-up failures, 68 missing instructions and 39 mastery failures. The U4 baseline produces 24 grid-page failures and 19 missing work instructions for existing work areas.

Physical original-template controls for p5, p32 and p41 fail for the empty cells, missing work space and missing instructions. The old stretched-page fixtures remain negative print controls. Public-interface tests reject forged mastery metadata, missing or undersized work areas, missing work instructions, incomplete rows, and a failed donor-page exchange. Positive controls accept complete rows and adequate work areas.

Local evidence:

- `~/unica-workbook-samples/fill-cells-baseline-proof.json`
- `~/unica-workbook-samples/fill-cells-physical-baseline.json`
- `src/lib/workbook-fill-cells.test.ts`
- `src/lib/workbook-layout-check-chromium.test.ts`

## Final fake books

Commands used the fixed seed above. The full commands omitted `--days`:

```sh
WORKBOOK_SAMPLE_ID=17fc5da1-2442-488a-a450-611a471e73e6 node scripts/workbook-samples.mjs --fake --no-store --levels U4 --concurrency 3 --diff ~/unica-workbook-samples/fill-base-u4 --out ~/unica-workbook-samples/fill-cells-review-u4
WORKBOOK_SAMPLE_ID=17fc5da1-2442-488a-a450-611a471e73e6 node scripts/workbook-samples.mjs --fake --no-store --levels U16 --persona first-customer --concurrency 3 --diff ~/unica-workbook-samples/fill-base-u16fc --out ~/unica-workbook-samples/fill-cells-review-u16
```

Both books have 84 pages and report `ready=true`. Both have zero failed questions, empty cells, fit failures, render problems and dropped questions. Every day is below 35 minutes. Challenge has three cards on all ten days. The main books have no repeat-check issues. U4 retains the existing D-226 exception on its two Extra practice pages: 16 repeated tasks, the same count as the baseline. U16 has no Extra practice repeats. The U16 book has 85 fake solve checks. No real-provider wording is established by these runs.

The final `npm run workbook:fast` commands selected U4 and U16 first-customer for days 1,5,10. The fast CLI rejects `--diff` with `--check-only`, so the full fake runs above provide the baseline diffs. The fast outputs are `fill-cells-review-fast-u4` and `fill-cells-review-fast-u16`. Their 28-page books contain 245 and 195 questions, respectively. Both are ready with no question, fit, render or omission failures.

I read the question text, page manifests and diff reports. I checked the contact sheets and readable sections of the changed-page sheets, including p3-p6, p31-p33, p51-p54 and p76-p81. Numbers print with commas. Circle instructions remain on choice pages. Work areas remain clear and question columns align. The new-idea pattern page retains pattern questions. Blank calculation areas are intended work space.

One smaller existing template issue remains for follow-up: a compact reminder can print an empty “What's going on” heading. It does not hide a question or work area. This round does not change Maya's operation adapter or model configuration.

## Counts and day estimates

Counts include every printed question, including the error and two-method questions. The notation is questions per page x number of pages.

## U4

565 -> 627 questions. Current quality ready=true; empty cells=0; missing work instructions=0.

| Page kind | Before | After |
|---|---|---|
| challenge | 3 x 10 | 3 x 10 |
| friday-5 | 12 x 1, 13 x 1 | 11 x 2 |
| new-idea | 4 x 1, 5 x 1, 6 x 7 | 5 x 9 |
| practice | 8 x 20 | 8 x 13, 10 x 5, 12 x 2 |
| practice-2 | 8 x 1, 9 x 9 | 9 x 5, 10 x 1, 11 x 1, 13 x 2, 15 x 1 |
| remember-these | 8 x 18, 13 x 1, 14 x 1 | 8 x 8, 10 x 7, 12 x 2, 14 x 2, 18 x 1 |
| show-what-you-know | 6 x 1 | 6 x 1 |
| word-problems | 3 x 7, 4 x 3 | 3 x 5, 4 x 5 |

| Day | Before minutes | After minutes |
|---|---:|---:|
| 1 | 24 | 29 |
| 2 | 25.5 | 32.2 |
| 3 | 26.5 | 30.9 |
| 4 | 24.3 | 25.4 |
| 5 | 26.6 | 28.1 |
| 6 | 26.5 | 28.4 |
| 7 | 24.7 | 26.3 |
| 8 | 27 | 29.2 |
| 9 | 21.7 | 23.4 |
| 10 | 27.7 | 29.7 |

## U16 first-customer

664 -> 604 questions. Current quality ready=true; empty cells=0; missing work instructions=0.

| Page kind | Before | After |
|---|---|---|
| challenge | 3 x 10 | 3 x 10 |
| friday-5 | 11 x 1, 12 x 1 | 9 x 2 |
| new-idea | 5 x 1, 6 x 8 | 3 x 1, 5 x 8 |
| practice | 8 x 4, 9 x 4, 10 x 12 | 6 x 2, 8 x 17, 10 x 1 |
| practice-2 | 9 x 1, 10 x 8, 17 x 1 | 6 x 1, 8 x 1, 9 x 1, 10 x 4, 11 x 1, 12 x 1, 13 x 1 |
| remember-these | 14 x 2 | 8 x 1, 10 x 1 |
| remember-these-mixed-set | 8 x 2, 9 x 6 | 8 x 2, 10 x 4, 12 x 1, 14 x 1 |
| show-what-you-know | 6 x 1 | 6 x 1 |
| warm-up | 13 x 10 | 12 x 10 |
| word-problems | 3 x 10 | 3 x 10 |

| Day | Before minutes | After minutes |
|---|---:|---:|
| 1 | 30.5 | 30.7 |
| 2 | 30.6 | 31.3 |
| 3 | 30.5 | 28.1 |
| 4 | 31 | 29.1 |
| 5 | 31.1 | 28.8 |
| 6 | 30.2 | 28.2 |
| 7 | 30.5 | 25.7 |
| 8 | 30.9 | 28.3 |
| 9 | 30.2 | 27.4 |
| 10 | 31.2 | 27.5 |

## Tests and limits

Plain `npm test` ran once: exit 1, 7 failed and 390 passed files (397 total), 9 failed and 15,614 passed tests, one skipped test, 281.52 seconds. The failures were regressions and intentional snapshot/data-journal changes, not timeouts. Each failed file was fixed or updated for the changed public behaviour. The subsequent nine-file run with one worker and `--testTimeout=180000` passed all 180 tests in 156.66 seconds. A further nine-file run covering the generator, formats, quality, template, Chromium template, step items, plans and U16 selection passed all 374 tests in 52.02 seconds. This is targeted rerun evidence, not a second full-suite pass.

The layout checks prove the selected local physical print path; they do not test a hosted print job. The selection tests prove the step, key and task rules with fake items; they do not test real AI wording. The Maya controls pass the printed packages through `createSession`; they do not test a model or voice call.

`npx eslint src` exited 0. `npm run build` exited 1 because Turbopack rejects the symlinked external `node_modules` path. A separate type check found three missing annotations in this change; these were fixed. The final type check has no workbook errors. It still exits 2 for nine unrelated image-module declarations in `scan-shot.tsx` and `sections.tsx`. The hosted Vercel build remains required.

The real U4/U16 subscription pair was not started. Savar reported that every Claude account was out of usage and explicitly prohibited further subscription calls. No API fallback was used. Existing real caches and artifacts were preserved. The requested real sample folder `~/unica-workbook-samples/fill-cells-real-u16` and its new contact sheet are unavailable. The fake U16 PDF and contact sheet are available under `fill-cells-review-u16`. The corrected real days 1,5,10 sample remains pending subscription access and Savar's review. Full customer regeneration remains on hold for his sample approval.

This change is ready for code review. It is not approved for merge or customer regeneration.
