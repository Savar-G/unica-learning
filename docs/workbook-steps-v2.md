# Workbook step progressions v2

Issue: [#505](https://github.com/Savar-G/unica-learning/issues/505). PR base: `site/workbook-consistency` at `85578a5b4c4ed3b3fc7bc45e3aeaf8e810ffb40f`. This branch includes that commit. The final fetch found no newer base.

All 11 matched comparison rows pass. Each pair uses the same generator bundle, consistency base, sample profile and seed. The result does not mean that every book is ready: the full U10 book still has five page fit failures. The full U26 book still has one failed question, eight page fit failures and nine room omissions. Each count is equal to or lower than its v1 control. No failure is hidden.

## Active data and corrections

The active file keeps 1,623 steps and all 7,999 v2 template positions. Every step has an easy and a hard template. Zero template positions are omitted. The raw v2 original is byte-identical to the supplied file. Its SHA-256 is `8a67431f88f3c44db703b7f8468f81e2163d94c8bcd74282c3066f5892540da5`. The raw and patched v1 files remain under clear names in `data/curriculum/`.

The [change record](../data/curriculum/author-changes.md) and [JSON record](../data/curriculum/author-changes.json) contain 276 field changes across 123 step/template groups. These include rejected interim rewrites and their corrections. Every entry has the previous value, new value and reason. The public test replays the record against raw v2 and requires an exact active-file match.

- Replace the packed lowest-terms tuples with separate numerator, denominator and expansion ranges. The accepted pools remain exactly 333 easier triples and 177 hard triples. Every values list stays within 256 entries.
- Remove the unused 581-entry sales-tax cents list and its unused index list. All six templates already use separate named inputs and derived prices and taxes. No template used the removed lists.
- Repair all 44 reported fill failures. Use supported derived expressions for mixed-form ordering, option letters, exponent expansions, money and area keys. Preserve each template's intent, format and difficulty.
- Repair nine additional templates that exceeded the stored question limit of 24 derived assignments. Remove unused assignments or inline short expressions. Do not raise evaluator input limits.
- Keep whole area keys such as `33 m²`. Sample valid right-triangle legs and derive the hypotenuse. Keep the side maximum of 41 and the original hard walk calculation. V1's invalid independently sampled triangle sides are not restored.
- Shorten U10 estimate and pattern prompts, the U14 hard multiplication story, U26 root and triangle prompts and the U26 rate comparison. Keep the quantities, answers, formats and difficulty. Give the U14 benchmark pizza comparison explicit answer letters, so the public item builder can check it.
- Repair the three U4 hard picture stories with text descriptions first. The descriptions fill, but reduce measured page fullness. The final active file therefore retains the v1 hard template in those three steps for book quality, as listed below.

The active audit exits 0: 7,999 templates, 239,970 fills passed, zero failed fills and zero import problems. `INPUT_LIMITS` are unchanged. The local fix receipt is `/tmp/cedric-v2/fixed-by-us.md`. No output was written to `flags-for-cedric.md`.

## Every active v1 quality fallback

There are 18 affected steps. The table lists every changed template position. Other v2 content in these steps remains unless the row says the whole step uses v1. No fallback exists solely because a template failed to fill.

| Skill | Step | Template positions | Content retained and reason |
| --- | --- | --- | --- |
| `1.1-subitize-to-10` | 1, 2, 3 | 5 in each | V1 hard counting claims and subtraction story. Filled text-only v2 stories reduced U4 mean fullness from 81.9172% to 81.0021%. Retaining only steps 2 and 3 still gave 81.9046%. All three pass together and retain nine hard Challenge cards. |
| `3.1-estimate-quantity` | 2 | Whole step; actual differences at 4, 6 | V1 sampling and hard explanation. V2 reduced U10 minimum fullness from 50.64% to 49.18%. |
| `3.1-place-value-1000` | 1 | 4 | V1 medium choice. V2 reduced selected-day U10 mean fullness from 72.2534% to 71.9931%. Keep the harder v2 arithmetic template. |
| `4.3-same-numerator` | 2 | 1, 3, 4 | V1 denominator sampling and validity checks. V2 reduced U14 minimum fullness from 47.0% to 45.7%. Keep the v2 questions and hard ordering key. |
| `4.4-add-within-10000` | 5 | 2, 3, 5 | V1 content and difficulty order. Part of the U16 fullness correction. |
| `4.4-subtract-within-10000` | 5 | 1-5 | V1 content and derived values. Part of the U16 fullness correction. |
| `4.9-table-pattern` | 3 | 2, 5 | V1 story and hard explanation. Part of the U16 fullness correction. |
| `5.1-place-value-million` | 1, 2, 3 | 4, 5 in each | V1 hard comparison. Keep a distinct medium v2 comparison at position 5. All five positions remain in each step. |
| `5.9-multiply-tens` | 1 | 1-5 | V1 validity checks and hard true/false content. Part of the U16 fullness correction. |
| `5.9-multiply-tens` | 2 | 2, 5 | V1 validity check and hard true/false content. Part of the U16 fullness correction. |
| `5.9-distributive` | 2 | 1-5 | V1 content and checks. The full v2 U16 book lost review questions on Day 6. |
| `5.10-pattern-rule` | 1 | 1, 2, 4 | V1 content and derived fields. The full v2 U16 book lost warm-up questions on Day 7. |
| `8.1-identify-perfect` | 3 | 1 | V1 number sampling. V2 lost U26 review questions. |
| `8.2-cube-root` | 3 | 3, 4 | V1 root-choice key and cube surface-area story. These two U26 step fallbacks restore mean fullness and pass both selected-day and full-book comparisons. |

The ten U16 steps are tested together. The final selected-day mean is 72.375%, against v1 at 72.354%. The full-book mean is 74.032%, against v1 at 73.857%. Minimum fullness and all omission, failure and variety checks pass. An earlier v1 triangle fallback was removed after a shorter version of the original v2 walk question passed. It remains in the chronological change record, but it is not active.

## Generator behavior

The Challenge selects the hardest printable set before it prefers numeric answers. Medium numeric questions cannot displace hard reasoning. Challenge fills use the upper part of the allowed range. The final real U4 and U16 samples each contain nine hard Challenge cards. The harder-row preferences remain in place. A hard-only sum cannot add a two-method block that consumes the required practice space. Final-review retries retain the existing hardest-fitting rule after attempt 256. This fixes the failure found by the full test suite without changing the earlier selection order.

Story fallback searches the latest earlier step of the same skill, then earlier skills. It never selects a later step. Rate stories can retain unit-bearing keys. The generator keeps the existing explanation after the first Number stories question. The confirmed new-idea minima remain two at U4-U9, three at U10-U18 and two at U19-U30.

The generator prefers the minority true/false answer on a page. It retains a valid question when the other truth value is unavailable. The detailed report gives each page's true/false counts. The stricter sentence-frame cap already exists on the merged base. It passes for every comparison level: at most one per page and two per day. The stem maximum remains two per page. The report includes the complete distributions and every variety warning.

The public item path supports bounded numeric and fraction ordering keys, money and units. It checks derived final wording for missing pictures and reversed numerals. Purchase stories use suitable goods. Place-value construction does not become a two-method arithmetic task. The daily time estimate includes existing-writer questions.

Three Challenge cards share the available review-page width. Older extra-practice answer areas retain 88 pixels of writing height. Place grids with more than four digits use the full row. The actual U16 lost-place-grid probe failed with 6 pixels of overflow before the layout correction and passed with the same restored question after it.

Mixed set recovery can put a checked whole-number operation into its planned person and object context. It requires the exact operation question and does not replace preserved text or a different number. The public probe retained `142 + 1389`, key `1531`, and the planned Mia/books context. A real independent subscription solve agreed. The strict page render passed.

`operation-swap` is added. `less-than-order` and `prediction-exact` remain for the 155 built-in steps.

## Matched comparison

Seed: `00000000-0000-4000-8000-000000000016`. Runtime generator head: `5d92422ce6583af107ee93d714ab3b9948e4bfe7`. All pairs use bundle SHA-256 `f6cd66f4b4d6bfede34d0810f9b67ea31d69d5ef320c430290bc56be7e08d39a`. The v2 runs use the final active data file directly. All v1 runs use the preserved patched v1 file. Later commits contain this report only.

The `npm run workbook:fast` loop runs the actual strict fit checks. Final image runs use `--diff` against the matching v1 folder. Real runs use `--replay` against the v1 real folder, with API keys removed and `--subscription-only`. All runs use `--no-store`. No live family rows are written. No full real book is generated. The v1 check-only controls exit 1 because they retain the recorded quality defects. The image-generating v2 CLI exits 0 even when a book has quality issues. The comparison therefore reads every quality count and measured page; it does not treat that exit code as book acceptance.

Each run manifest records code head, base, bundle hash, data hash, seed and arguments. [Machine report](workbook-steps-v2-comparison.json). The table uses v1 → v2. Fullness is measured occupied page area. Room omissions and later losses are separate. Time-budget trims remove optional questions above the page minimum to keep the day within 30 minutes. These counts increase in full U10 (70 to 73), U14 (50 to 52) and U16 (50 to 55). They also increase in the selected U14 and U16 samples. The table shows them separately from required-question and room omissions. All page minimums remain satisfied.

| Run / level | Failed % | Room omissions / later losses | Time-budget trims | Fullness min / mean % | Estimated minutes per day | Template questions / all questions; unique templates | Frame max page / day; stem max page | Hard Challenge cards / all cards | Worse metrics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fake selected U4 | 0.00 → 0.00 | 0/0 → 0/0 | 1 → 0 | 40.69/81.92 → 49.86/82.55 | 1:28.5, 5:28.2, 10:28.1 → 1:28.2, 5:27.9, 10:28.5 | 195/200; 53 → 191/200; 53 | 1/2; 2 → 1/2; 2 | 9/9 → 9/9 | none |
| Fake selected U10 | 0.51 → 0.00 | 0/0 → 0/0 | 25 → 24 | 50.64/72.25 → 50.64/72.54 | 1:28.2, 5:30, 10:29 → 1:28.1, 5:29.9, 10:29.8 | 159/195; 50 → 161/196; 52 | 1/2; 2 → 1/2; 2 | 8/8 → 9/9 | none |
| Fake selected U14 | 0.00 → 0.00 | 0/0 → 0/0 | 14 → 16 | 47.69/70.61 → 50.64/71.31 | 1:27.9, 5:28.6, 10:28.5 → 1:27.9, 5:28.4, 10:28.5 | 165/206; 49 → 163/204; 48 | 1/2; 2 → 1/2; 2 | 9/9 → 9/9 | none |
| Fake selected U16 | 0.00 → 0.00 | 0/0 → 0/0 | 16 → 17 | 50.64/72.35 → 50.64/72.38 | 1:28.1, 5:28.5, 10:28.4 → 1:28, 5:28.5, 10:28.4 | 160/197; 54 → 159/196; 54 | 1/2; 2 → 1/2; 2 | 9/9 → 9/9 | none |
| Fake selected U26 | 1.10 → 0.00 | 4/0 → 4/0 | 0 → 0 | 61.52/81.44 → 61.52/82.46 | 1:21.2, 5:23.7, 10:20.7 → 1:21.5, 5:24.1, 10:20.7 | 136/182; 39 → 138/182; 43 | 1/2; 2 → 1/2; 2 | 6/6 → 8/8 | none |
| Fake full U10 | 0.88 → 0.00 | 0/0 → 0/0 | 70 → 73 | 38.20/72.37 → 38.20/72.67 | 1:28.2, 2:28.4, 3:28.5, 4:28.4, 5:29.8, 6:28.5, 7:28.3, 8:28.5, 9:28.6, 10:29.1 → 1:28.1, 2:28.5, 3:28.2, 4:28.3, 5:29.8, 6:28.3, 7:28.4, 8:28.5, 9:28.3, 10:29.7 | 420/570; 66 → 423/567; 68 | 1/2; 2 → 1/2; 2 | 25/25 → 30/30 | none |
| Fake full U14 | 0.00 → 0.00 | 0/0 → 0/0 | 50 → 52 | 47.01/72.52 → 47.89/73.76 | 1:28, 2:28.3, 3:28.2, 4:28.2, 5:28.5, 6:28.2, 7:28.1, 8:28.1, 9:28.2, 10:28.5 → 1:27.9, 2:28.1, 3:28.2, 4:28.2, 5:28.6, 6:28.2, 7:28.4, 8:28.3, 9:28.5, 10:28.4 | 445/611; 64 → 442/609; 66 | 1/2; 2 → 1/2; 2 | 29/30 → 30/30 | none |
| Fake full U16 | 0.00 → 0.00 | 0/0 → 0/0 | 50 → 55 | 50.14/73.86 → 50.14/74.03 | 1:28.1, 2:27.9, 3:28.1, 4:28.2, 5:28.6, 6:28.1, 7:28.4, 8:28.1, 9:28.2, 10:28.5 → 1:28, 2:27.8, 3:28, 4:28.2, 5:28.5, 6:28.1, 7:28.3, 8:28, 9:28.1, 10:28.5 | 429/583; 64 → 425/578; 65 | 1/2; 2 → 1/2; 2 | 30/30 → 30/30 | none |
| Fake full U26 | 1.78 → 0.22 | 9/0 → 9/0 | 0 → 0 | 61.52/81.31 → 61.52/82.80 | 1:21.2, 2:23, 3:24, 4:21.5, 5:24, 6:21.2, 7:22.7, 8:21.5, 9:18.7, 10:21 → 1:21.5, 2:23, 3:23.3, 4:21.7, 5:24.2, 6:20.7, 7:22.7, 8:21.8, 9:19, 10:21.2 | 285/449; 57 → 292/449; 58 | 1/2; 2 → 1/2; 2 | 20/20 → 27/27 | none |
| Real selected U4 | 0.00 → 0.00 | 0/0 → 0/0 | 1 → 0 | 40.69/81.92 → 49.86/82.55 | 1:28.8, 5:28.4, 10:28.2 → 1:28.2, 5:27.9, 10:28.5 | 195/200; 53 → 191/200; 53 | 1/2; 2 → 1/2; 2 | 9/9 → 9/9 | none |
| Real selected U16 | 0.00 → 0.00 | 0/0 → 0/0 | 16 → 17 | 50.64/72.35 → 50.64/72.38 | 1:28.2, 5:28.4, 10:28.2 → 1:28, 5:28.4, 10:28.2 | 160/197; 54 → 159/196; 54 | 1/2; 2 → 1/2; 2 | 9/9 → 9/9 | none |

## Sample and diff paths

- Fake selected U4: v1 `/tmp/ui-review/v1-final3-selected`; v2 `/tmp/ui-review/v2-final3-selected`; page diff `/tmp/ui-review/v2-final3-selected/U4-diff.md`.
- Fake selected U10: v1 `/tmp/ui-review/v1-final3-selected`; v2 `/tmp/ui-review/v2-final3-selected`; page diff `/tmp/ui-review/v2-final3-selected/U10-diff.md`.
- Fake selected U14: v1 `/tmp/ui-review/v1-final3-selected`; v2 `/tmp/ui-review/v2-final3-selected`; page diff `/tmp/ui-review/v2-final3-selected/U14-diff.md`.
- Fake selected U16: v1 `/tmp/ui-review/v1-final3-selected`; v2 `/tmp/ui-review/v2-final3-selected`; page diff `/tmp/ui-review/v2-final3-selected/U16-diff.md`.
- Fake selected U26: v1 `/tmp/ui-review/v1-final3-selected`; v2 `/tmp/ui-review/v2-final3-selected`; page diff `/tmp/ui-review/v2-final3-selected/U26-diff.md`.
- Fake full U10: v1 `/tmp/ui-review/v1-final3-full`; v2 `/tmp/ui-review/v2-final3-full`; page diff `/tmp/ui-review/v2-final3-full/U10-diff.md`.
- Fake full U14: v1 `/tmp/ui-review/v1-final3-full`; v2 `/tmp/ui-review/v2-final3-full`; page diff `/tmp/ui-review/v2-final3-full/U14-diff.md`.
- Fake full U16: v1 `/tmp/ui-review/v1-final3-full`; v2 `/tmp/ui-review/v2-final3-full`; page diff `/tmp/ui-review/v2-final3-full/U16-diff.md`.
- Fake full U26: v1 `/tmp/ui-review/v1-final3-full`; v2 `/tmp/ui-review/v2-final3-full`; page diff `/tmp/ui-review/v2-final3-full/U26-diff.md`.
- Real selected U4: v1 `/tmp/ui-review/v1-final3-real-u4`; v2 `/tmp/ui-review/v2-final3-real-u4`; page diff `/tmp/ui-review/v2-final3-real-u4/U4-diff.md`.
- Real selected U16: v1 `/tmp/ui-review/v1-final3-real-u16`; v2 `/tmp/ui-review/v2-final3-real-u16`; page diff `/tmp/ui-review/v2-final3-real-u16/U16-diff.md`.

The final real U4 run made eight subscription requests and zero API calls. It had four independent solves, one initial disagreement resolved by the existing repair path, and zero late or failed solve calls. U16 reused 49 recorded requests and made ten subscription requests, with zero API calls. Its 47 independent solves had zero disagreements and zero late or failed calls. The exact-request cache did not match U4's changed requests, so U4 had no replay hits.

I inspected all 112 final real pages. I inspected all 28 U4 pages and all 28 U16 pages in the prior sample. I compared every final page record with those inspected samples. I inspected the seven changed pages directly. The other 49 records match exactly. The v1 control records match all 56 inspected control pages exactly. No clipped text, covered answer boxes or missing work areas were visible. The receipt is `/tmp/ui-review/v2-evidence/visual-review.md`.

## Separate proof and limits

- Data admission and fill: the full active audit proves that every template fills for 30 seeds. It does not prove all books are ready.
- Repaired mathematics: an independent Python reference checks 59 repaired templates at 30 seeds each. All 1,770 cases match. Receipt: `/tmp/ui-review/v2-evidence/rewrite-reference.json`.
- Answer formats: public probes print `$84.00` and `34 m²`. The first independent real area solve omitted the unit. After the instruction correction, both repeated real solves agreed. Both the failure and corrected results remain in `/tmp/v2-answer-real-solve.log` and `/tmp/v2-answer-real-solve-r2.log`. Images and keys are in `/tmp/ui-review/v2-answer-formats`.
- Actual hardness: 30 seeds each keep the U26 square-root input side in 12-15, the cube edge in 4-5 and U16 hard place-value numbers in 82551-99767. Every selected template is hard. Receipt: `/tmp/ui-review/v2-evidence/upper-hardness.json`. The detailed table below lists the actual printed numbers for every Challenge card.
- Physical rendering: fake and real runs use strict Chromium rendering and measured pages. This is local rendering evidence. It does not prove hosted workbook delivery.
- Failed trials remain under `/tmp/ui-review/`. These include U4 hard-picture and fullness losses, U10 time and fullness losses, U14 unsupported hard benchmark answers, U16 fullness and lost-place-grid cases, and U26 room losses. The final report does not replace or delete those failures.

## Required gates

The first full test run found a late final-review retry defect. Its failing assertion remains in `/tmp/workbook-v2-pre-retry-test-failure.log`. The corrected public regression passes.

| Check | Exit | Result |
| --- | --- | --- |
| Plain `npm test` | 0 | 293 Test Files passed; 12,811 tests passed; 107.82 seconds |
| `npx eslint src` | 0 | No errors |
| `npm run build` | 0 | Production build and TypeScript check passed |
| Active curriculum audit | 0 | 239,970 passed fills; zero failed fills; zero import problems |

Logs: `/tmp/workbook-v2-final-test.log`, `/tmp/workbook-v2-final-eslint.log`, `/tmp/workbook-v2-final-build.log`, `/tmp/v2-audit-final.log`. The full test runtime is below the ten-minute CI limit. No slow test was added. The public v2 data and answer-contract file has 15 tests and takes about 0.3 seconds of test execution in the focused run.

## Detailed level results


### Fake selected U4

V1: `/tmp/ui-review/v1-final3-selected`. V2: `/tmp/ui-review/v2-final3-selected`.

v1: day progression averages Day 1 = 40021; Day 5 = 40082; Day 10 = 40083. Source counts {"template":195,"handBuilt":5,"existing":0,"total":200}. Time-budget trims above the page minimum: 1. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 3: 1/2; 4: 1/0; 5: 1/1; 6: 1/1; 8: 1/2; 9: 2/2; 11: 2/1; 13: 1/0; 14: 1/1; 16: 3/2; 17: 1/0; 18: 1/0; 19: 1/2; 20: 0/1; 21: 1/1; 22: 1/2; 24: 1/1; 25: 1/2.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 14; 10: hard, 10; 10: hard, 10; 18: hard, 10; 18: hard, 20; 18: hard, 10; 26: hard, 10; 26: hard, 19; 26: hard, 10.

v2: day progression averages Day 1 = 40021; Day 5 = 40082; Day 10 = 40083. Source counts {"template":191,"handBuilt":9,"existing":0,"total":200}. Time-budget trims above the page minimum: 0. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 3: 1/1; 4: 1/0; 5: 1/1; 6: 1/2; 8: 2/2; 9: 0/1; 11: 2/3; 12: 0/1; 13: 2/1; 14: 2/1; 16: 2/2; 17: 2/1; 18: 1/0; 19: 1/2; 20: 0/1; 21: 1/1; 22: 2/1; 24: 2/0; 25: 2/2.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 14; 10: hard, 10; 10: hard, 10; 18: hard, 10; 18: hard, 20; 18: hard, 7; 26: hard, 10; 26: hard, 19; 26: hard, 18.


### Fake selected U10

V1: `/tmp/ui-review/v1-final3-selected`. V2: `/tmp/ui-review/v2-final3-selected`.

v1: day progression averages Day 1 = 100021; Day 5 = 100082; Day 10 = 100083. Source counts {"template":159,"handBuilt":6,"existing":5,"total":170}. Time-budget trims above the page minimum: 25. Fit failures: 9. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 1/0; 5: 0/1; 6: 2/1; 8: 1/1; 12: 0/1; 13: 2/1; 14: 1/1; 16: 1/0; 17: 2/1; 20: 0/1; 21: 1/1; 22: 1/0; 24: 1/1; 25: 2/2; 26: 0/1.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 977; 10: hard, 89; 10: hard, 98; 18: hard, 900; 18: hard, 70; 18: hard, 62; 26: hard, 2997; 26: hard, 900.

Remaining issues: page 26, coverage: the page prints 2 practice questions; a challenge page needs 3; page 26, coverage: required planned slot 1.2 (challenge) is missing or failed; page 11, time: Day 5 is estimated at 30.0 minutes; keep it below 30; page 12, time: Day 5 is estimated at 30.0 minutes; keep it below 30; page 13, time: Day 5 is estimated at 30.0 minutes; keep it below 30; page 14, time: Day 5 is estimated at 30.0 minutes; keep it below 30; page 15, time: Day 5 is estimated at 30.0 minutes; keep it below 30; page 16, time: Day 5 is estimated at 30.0 minutes; keep it below 30; page 17, time: Day 5 is estimated at 30.0 minutes; keep it below 30; page 18, time: Day 5 is estimated at 30.0 minutes; keep it below 30; page 26, challenge: Day 10's Challenge must use the day's top number and require more reasoning steps than practice.

v2: day progression averages Day 1 = 100021; Day 5 = 100082; Day 10 = 100083. Source counts {"template":161,"handBuilt":6,"existing":5,"total":172}. Time-budget trims above the page minimum: 24. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 0/1; 5: 1/1; 6: 2/1; 8: 1/0; 12: 0/1; 13: 1/2; 14: 2/1; 16: 1/0; 17: 1/1; 21: 0/1; 22: 1/1; 24: 1/2; 25: 1/1.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 977; 10: hard, 97; 10: hard, 100; 18: hard, 900; 18: hard, 909; 18: hard, 989; 26: hard, 2700; 26: hard, 700; 26: hard, 800.


### Fake selected U14

V1: `/tmp/ui-review/v1-final3-selected`. V2: `/tmp/ui-review/v2-final3-selected`.

v1: day progression averages Day 1 = 140021; Day 5 = 140082; Day 10 = 140083. Source counts {"template":165,"handBuilt":6,"existing":7,"total":178}. Time-budget trims above the page minimum: 14. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 0/1; 5: 2/2; 6: 1/2; 8: 0/1; 9: 1/0; 12: 0/1; 13: 2/2; 14: 4/4; 16: 2/2; 17: 2/2; 20: 1/1; 21: 2/2; 22: 3/3; 24: 2/1; 25: 2/2.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 99; 10: hard, 6; 10: hard, 8530; 18: hard, 12; 18: hard, 6300; 18: hard, 3; 26: hard, 12; 26: hard, 6597; 26: hard, 4.

v2: day progression averages Day 1 = 140021; Day 5 = 140082; Day 10 = 140083. Source counts {"template":163,"handBuilt":6,"existing":7,"total":176}. Time-budget trims above the page minimum: 16. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 0/1; 5: 1/2; 6: 1/2; 8: 2/1; 9: 1/0; 12: 0/1; 13: 2/2; 14: 3/4; 16: 2/2; 17: 2/2; 20: 1/1; 21: 2/2; 22: 2/1; 24: 2/1; 25: 2/2.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 97; 10: hard, 10000; 10: hard, 35; 18: hard, 12; 18: hard, 5589; 18: hard, 42; 26: hard, 12; 26: hard, 5419; 26: hard, 44.


### Fake selected U16

V1: `/tmp/ui-review/v1-final3-selected`. V2: `/tmp/ui-review/v2-final3-selected`.

v1: day progression averages Day 1 = 160021; Day 5 = 160162; Day 10 = 160163. Source counts {"template":160,"handBuilt":5,"existing":5,"total":170}. Time-budget trims above the page minimum: 16. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 5: 1/1; 6: 2/2; 8: 2/1; 10: 1/0; 12: 0/1; 13: 2/1; 14: 1/2; 16: 1/2; 17: 1/1; 18: 0/1; 20: 1/1; 21: 1/0; 22: 0/1; 24: 1/1; 25: 1/1; 26: 1/0.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 95862; 10: hard, 7288; 10: hard, 5706; 18: hard, 60080; 18: hard, 6300; 18: hard, 8045; 26: hard, 8000; 26: hard, 6597; 26: hard, 2409.

v2: day progression averages Day 1 = 160021; Day 5 = 160162; Day 10 = 160163. Source counts {"template":159,"handBuilt":5,"existing":5,"total":169}. Time-budget trims above the page minimum: 17. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 1/0; 5: 2/2; 6: 1/2; 8: 0/1; 10: 1/0; 12: 0/1; 13: 1/2; 14: 1/2; 16: 1/2; 17: 1/1; 18: 0/1; 20: 1/1; 21: 1/0; 22: 0/1; 24: 1/1; 25: 1/1.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 95862; 10: hard, 10000; 10: hard, 6208; 18: hard, 60080; 18: hard, 10000; 18: hard, 4321; 26: hard, 80; 26: hard, 10000; 26: hard, 3803.


### Fake selected U26

V1: `/tmp/ui-review/v1-final3-selected`. V2: `/tmp/ui-review/v2-final3-selected`.

v1: day progression averages Day 1 = 260021; Day 5 = 260042; Day 10 = 260043. Source counts {"template":136,"handBuilt":3,"existing":5,"total":144}. Time-budget trims above the page minimum: 0. Fit failures: 5. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 1/0; 7: 0/1; 8: 0/1; 10: 3/0; 11: 1/1; 13: 2/1; 14: 1/1; 16: 0/1; 17: 0/1; 19: 0/1; 20: 0/1.

Challenge values (page: difficulty, largest printed or key number): 8: hard, 224; 8: hard, 744; 14: hard, 1000; 14: hard, 887; 20: hard, 384; 20: hard, 958.

Remaining issues: page 5, coverage: the page prints 4 practice questions; a practice page needs 6; page 5, coverage: the page lost planned questions; page 8, coverage: required planned slot 3.3 (challenge) is missing or failed; page 14, coverage: required planned slot 3.3 (challenge) is missing or failed; page 17, coverage: the page prints 5 practice questions; a practice page needs 6; page 17, coverage: the page lost planned questions; page 20, coverage: the page lost planned questions; page 8, challenge: Day 1's Challenge must use the day's top number and require more reasoning steps than practice; page 14, challenge: Day 5's Challenge must use the day's top number and require more reasoning steps than practice.

v2: day progression averages Day 1 = 260021; Day 5 = 260042; Day 10 = 260043. Source counts {"template":138,"handBuilt":3,"existing":5,"total":146}. Time-budget trims above the page minimum: 0. Fit failures: 3. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 1/0; 7: 0/1; 8: 0/1; 10: 3/0; 11: 1/1; 13: 2/1; 14: 1/1; 16: 1/0; 17: 0/1; 19: 0/1; 20: 0/1.

Challenge values (page: difficulty, largest printed or key number): 8: hard, 173; 8: hard, 8348; 8: hard, 8432; 14: hard, 1000; 14: hard, 9568; 14: hard, 5769; 20: hard, 384; 20: hard, 4832.

Remaining issues: page 5, coverage: the page prints 4 practice questions; a practice page needs 6; page 5, coverage: the page lost planned questions; page 17, coverage: the page prints 5 practice questions; a practice page needs 6; page 17, coverage: the page lost planned questions; page 20, coverage: the page lost planned questions.


### Fake full U10

V1: `/tmp/ui-review/v1-final3-full`. V2: `/tmp/ui-review/v2-final3-full`.

v1: day progression averages Day 1 = 100021; Day 2 = 100081; Day 3 = 100201; Day 4 = 100022; Day 5 = 100082; Day 6 = 100202; Day 7 = 100023; Day 8 = 100083; Day 9 = 100221; Day 10 = 100083. Source counts {"template":420,"handBuilt":20,"existing":32,"total":472}. Time-budget trims above the page minimum: 70. Fit failures: 8. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 1/0; 5: 0/1; 6: 2/1; 8: 1/1; 12: 0/1; 13: 1/1; 14: 1/2; 16: 1/1; 17: 1/0; 20: 0/1; 21: 1/0; 22: 2/3; 24: 1/0; 25: 1/0; 29: 1/0; 30: 2/1; 32: 1/0; 36: 1/1; 37: 2/2; 38: 1/2; 40: 1/0; 41: 0/1; 44: 1/0; 45: 0/1; 46: 1/1; 48: 0/1; 52: 0/1; 53: 1/2; 54: 1/1; 56: 1/1; 60: 0/1; 61: 1/0; 62: 0/2; 64: 2/1; 66: 0/1; 68: 0/1; 69: 1/1; 70: 3/2; 72: 1/1; 76: 1/0; 77: 1/1; 78: 1/1; 80: 1/0; 81: 1/2; 82: 0/1.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 977; 10: hard, 89; 10: hard, 98; 18: hard, 250; 18: hard, 998; 18: hard, 88; 26: hard, 78; 26: hard, 974; 34: hard, 908; 34: hard, 100; 34: hard, 80; 42: hard, 700; 42: hard, 906; 42: hard, 62; 50: hard, 445; 50: hard, 800; 58: hard, 890; 58: hard, 700; 58: hard, 902; 66: hard, 2727; 66: hard, 800; 74: hard, 98; 74: hard, 900; 82: hard, 2909; 82: hard, 900.

Remaining issues: page 26, coverage: the page prints 2 practice questions; a challenge page needs 3; page 26, coverage: required planned slot 1.2 (challenge) is missing or failed; page 50, coverage: the page prints 2 practice questions; a challenge page needs 3; page 50, coverage: required planned slot 1.2 (challenge) is missing or failed; page 66, coverage: the page prints 2 practice questions; a challenge page needs 3; page 66, coverage: required planned slot 1.2 (challenge) is missing or failed; page 74, coverage: the page prints 2 practice questions; a challenge page needs 3; page 74, coverage: required planned slot 1.2 (challenge) is missing or failed; page 82, coverage: the page prints 2 practice questions; a challenge page needs 3; page 82, coverage: required planned slot 1.2 (challenge) is missing or failed; page 59, repeat: question 10 repeats pages 43 (limit 1); page 67, repeat: question 10 repeats pages 3 (limit 1); page 26, challenge: Day 3's Challenge must use the day's top number and require more reasoning steps than practice; page 50, challenge: Day 6's Challenge must use the day's top number and require more reasoning steps than practice; page 58, challenge: Day 7's Challenge question 2 is no harder than that day's practice of its step; page 66, challenge: Day 8's Challenge must use the day's top number and require more reasoning steps than practice; page 74, challenge: Day 9's Challenge must use the day's top number and require more reasoning steps than practice; page 82, challenge: Day 10's Challenge must use the day's top number and require more reasoning steps than practice.

v2: day progression averages Day 1 = 100021; Day 2 = 100081; Day 3 = 100201; Day 4 = 100022; Day 5 = 100082; Day 6 = 100202; Day 7 = 100023; Day 8 = 100083; Day 9 = 100221; Day 10 = 100083. Source counts {"template":423,"handBuilt":20,"existing":32,"total":475}. Time-budget trims above the page minimum: 73. Fit failures: 5. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 0/1; 5: 1/1; 6: 2/1; 8: 1/0; 12: 0/1; 13: 1/1; 14: 1/1; 16: 1/1; 17: 1/0; 20: 0/1; 21: 1/1; 22: 2/3; 24: 1/0; 29: 1/0; 30: 2/1; 32: 1/0; 36: 1/1; 37: 1/2; 38: 1/1; 40: 0/1; 41: 1/2; 44: 1/0; 45: 2/1; 48: 0/1; 52: 0/1; 53: 1/2; 54: 1/1; 56: 1/1; 60: 1/0; 61: 0/1; 62: 1/2; 64: 1/1; 68: 0/1; 69: 1/1; 70: 1/2; 72: 1/1; 76: 0/1; 77: 1/1; 78: 1/1; 80: 3/2; 81: 1/1.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 977; 10: hard, 97; 10: hard, 100; 18: hard, 225; 18: hard, 978; 18: hard, 100; 26: hard, 78; 26: hard, 989; 26: hard, 250; 34: hard, 903; 34: hard, 993; 34: hard, 250; 42: hard, 700; 42: hard, 901; 42: hard, 998; 50: hard, 480; 50: hard, 900; 50: hard, 908; 58: hard, 890; 58: hard, 800; 58: hard, 906; 66: hard, 2800; 66: hard, 660; 66: hard, 606; 74: hard, 93; 74: hard, 800; 74: hard, 810; 82: hard, 3000; 82: hard, 900; 82: hard, 860.

Remaining issues: page 19, repeat: question 13 repeats pages 3 (limit 1); page 35, repeat: question 9 repeats pages 24 (limit 1); page 59, repeat: question 9 repeats pages 43 (limit 1); page 67, repeat: question 10 repeats pages 3, 19 (limit 1); page 58, challenge: Day 7's Challenge question 2 is no harder than that day's practice of its step.


### Fake full U14

V1: `/tmp/ui-review/v1-final3-full`. V2: `/tmp/ui-review/v2-final3-full`.

v1: day progression averages Day 1 = 140021; Day 2 = 140081; Day 3 = 140101; Day 4 = 140022; Day 5 = 140082; Day 6 = 140102; Day 7 = 140023; Day 8 = 140083; Day 9 = 140121; Day 10 = 140083. Source counts {"template":445,"handBuilt":22,"existing":43,"total":510}. Time-budget trims above the page minimum: 50. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 0/1; 5: 2/2; 6: 1/2; 8: 0/1; 9: 1/0; 12: 1/0; 13: 2/1; 14: 3/3; 16: 1/2; 20: 1/0; 21: 2/1; 22: 4/3; 24: 1/2; 28: 1/0; 29: 2/1; 30: 2/1; 32: 2/1; 33: 1/0; 36: 0/1; 37: 2/2; 38: 2/3; 40: 1/2; 41: 2/2; 44: 0/1; 45: 2/2; 46: 3/3; 48: 1/2; 52: 0/1; 53: 2/1; 54: 1/2; 56: 2/1; 57: 1/1; 60: 0/1; 61: 2/2; 62: 2/3; 64: 2/2; 68: 1/0; 69: 2/2; 70: 2/3; 72: 1/2; 76: 1/1; 77: 1/2; 78: 3/2; 80: 2/2; 81: 3/2.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 99; 10: hard, 7288; 10: hard, 59; 18: hard, 8; 18: hard, 6300; 18: hard, 61; 26: hard, 7; 26: hard, 6597; 26: hard, 51; 34: hard, 315; 34: hard, 6051; 34: hard, 4; 42: hard, 12; 42: hard, 6314; 42: hard, 4; 50: hard, 11; 50: hard, 6289; 50: hard, 4; 58: hard, 774; 58: hard, 6; 58: hard, 8836; 66: hard, 12; 66: hard, 6499; 66: hard, 3; 74: medium, 7; 74: hard, 3; 74: hard, 7171; 82: hard, 12; 82: hard, 6440; 82: hard, 4.

v2: day progression averages Day 1 = 140021; Day 2 = 140081; Day 3 = 140101; Day 4 = 140022; Day 5 = 140082; Day 6 = 140102; Day 7 = 140023; Day 8 = 140083; Day 9 = 140121; Day 10 = 140083. Source counts {"template":442,"handBuilt":22,"existing":43,"total":507}. Time-budget trims above the page minimum: 52. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 0/1; 5: 1/2; 6: 1/2; 8: 2/1; 9: 1/0; 12: 1/0; 13: 2/1; 14: 3/2; 16: 1/2; 20: 1/0; 21: 2/2; 22: 3/4; 24: 1/2; 28: 1/0; 29: 2/1; 30: 2/1; 32: 2/1; 33: 1/0; 36: 0/1; 37: 2/2; 38: 3/4; 40: 1/2; 41: 2/2; 44: 0/1; 45: 2/2; 46: 4/4; 48: 1/2; 52: 0/1; 53: 2/1; 54: 1/1; 56: 2/1; 57: 1/1; 60: 0/1; 61: 2/2; 62: 2/3; 64: 2/2; 68: 1/0; 69: 1/2; 70: 2/3; 72: 1/2; 76: 1/1; 77: 1/2; 78: 2/2; 80: 2/1; 81: 3/2.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 97; 10: hard, 10000; 10: hard, 42; 18: hard, 8; 18: hard, 5589; 18: hard, 43; 26: hard, 7; 26: hard, 5419; 26: hard, 30; 34: hard, 323; 34: hard, 10000; 34: hard, 26; 42: hard, 12; 42: hard, 6070; 42: hard, 52; 50: hard, 11; 50: hard, 4487; 50: hard, 30; 58: hard, 861; 58: hard, 10000; 58: hard, 42; 66: hard, 12; 66: hard, 4957; 66: hard, 42; 74: hard, 12; 74: hard, 10000; 74: hard, 33; 82: hard, 12; 82: hard, 5737; 82: hard, 51.


### Fake full U16

V1: `/tmp/ui-review/v1-final3-full`. V2: `/tmp/ui-review/v2-final3-full`.

v1: day progression averages Day 1 = 160021; Day 2 = 160161; Day 3 = 160181; Day 4 = 160022; Day 5 = 160162; Day 6 = 160182; Day 7 = 160201; Day 8 = 160023; Day 9 = 160163; Day 10 = 160163. Source counts {"template":429,"handBuilt":22,"existing":30,"total":481}. Time-budget trims above the page minimum: 50. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 5: 1/1; 6: 2/2; 8: 2/1; 10: 1/0; 12: 0/1; 13: 1/1; 14: 1/1; 16: 0/1; 18: 0/1; 20: 0/1; 21: 2/1; 22: 1/1; 24: 2/1; 26: 1/0; 28: 0/1; 29: 2/1; 30: 1/2; 32: 1/1; 34: 0/1; 36: 1/0; 37: 0/1; 38: 1/1; 40: 1/1; 41: 1/1; 42: 1/0; 44: 0/1; 45: 1/1; 46: 1/1; 48: 1/1; 50: 0/1; 53: 0/1; 54: 0/1; 56: 0/1; 58: 0/1; 60: 0/1; 61: 1/2; 62: 2/2; 64: 1/0; 66: 1/0; 68: 1/0; 69: 0/1; 70: 1/0; 72: 0/1; 73: 0/1; 74: 0/1; 76: 0/1; 77: 1/1; 78: 1/1; 80: 1/1; 81: 1/1; 82: 0/1.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 95862; 10: hard, 7288; 10: hard, 5706; 18: hard, 6759; 18: hard, 6300; 18: hard, 8045; 26: hard, 6273; 26: hard, 6597; 26: hard, 2409; 34: hard, 968222; 34: hard, 6051; 34: hard, 6307; 42: hard, 69600; 42: hard, 6314; 42: hard, 7094; 50: hard, 9020; 50: hard, 6289; 50: hard, 7903; 58: hard, 69; 58: hard, 6838; 58: hard, 5087; 66: hard, 971104; 66: hard, 6499; 66: hard, 7206; 74: hard, 7050; 74: hard, 6164; 74: hard, 5505; 82: hard, 8080; 82: hard, 6440; 82: hard, 3304.

v2: day progression averages Day 1 = 160021; Day 2 = 160161; Day 3 = 160181; Day 4 = 160022; Day 5 = 160162; Day 6 = 160182; Day 7 = 160201; Day 8 = 160023; Day 9 = 160163; Day 10 = 160163. Source counts {"template":425,"handBuilt":23,"existing":29,"total":477}. Time-budget trims above the page minimum: 55. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 1/0; 5: 2/2; 6: 1/2; 8: 0/1; 10: 1/0; 12: 0/1; 13: 1/1; 14: 1/1; 16: 1/1; 18: 0/1; 20: 0/1; 21: 2/1; 22: 1/1; 24: 2/1; 28: 0/1; 29: 2/1; 30: 2/2; 32: 1/2; 34: 0/1; 36: 1/0; 37: 0/1; 38: 1/1; 40: 1/1; 41: 1/1; 42: 1/0; 44: 0/1; 45: 1/1; 46: 1/1; 48: 1/1; 50: 0/1; 53: 0/1; 54: 1/1; 56: 0/1; 58: 0/1; 60: 1/0; 61: 1/2; 62: 2/2; 64: 1/1; 66: 1/0; 68: 1/0; 69: 0/1; 70: 1/0; 72: 0/1; 73: 0/1; 76: 0/1; 77: 1/1; 78: 1/1; 80: 1/1; 81: 1/1.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 95862; 10: hard, 10000; 10: hard, 6208; 18: hard, 6759; 18: hard, 10000; 18: hard, 6982; 26: hard, 5790; 26: hard, 10000; 26: hard, 5957; 34: hard, 968222; 34: hard, 10000; 34: hard, 4447; 42: hard, 69600; 42: hard, 10000; 42: hard, 4290; 50: hard, 9020; 50: hard, 10000; 50: hard, 3445; 58: hard, 69; 58: hard, 10000; 58: hard, 4245; 66: hard, 971104; 66: hard, 10000; 66: hard, 4356; 74: hard, 80; 74: hard, 10000; 74: hard, 4138; 82: hard, 80; 82: hard, 10000; 82: hard, 4030.


### Fake full U26

V1: `/tmp/ui-review/v1-final3-full`. V2: `/tmp/ui-review/v2-final3-full`.

v1: day progression averages Day 1 = 260021; Day 2 = 260041; Day 3 = 260081; Day 4 = 260022; Day 5 = 260042; Day 6 = 260082; Day 7 = 260023; Day 8 = 260061; Day 9 = 260043; Day 10 = 260043. Source counts {"template":285,"handBuilt":10,"existing":26,"total":321}. Time-budget trims above the page minimum: 0. Fit failures: 15. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 1/0; 7: 0/1; 8: 0/1; 10: 0/1; 13: 1/0; 14: 0/1; 16: 1/1; 17: 1/1; 19: 1/1; 22: 1/1; 23: 0/1; 25: 3/1; 28: 1/2; 29: 2/1; 31: 3/1; 32: 1/1; 37: 0/1; 38: 1/0; 40: 0/2; 41: 0/2; 43: 1/2; 46: 0/2; 47: 1/1; 49: 1/2; 53: 0/1; 55: 1/1; 58: 1/2; 59: 1/0; 61: 1/1; 62: 1/0.

Challenge values (page: difficulty, largest printed or key number): 8: hard, 224; 8: hard, 744; 14: hard, 124; 14: hard, 887; 20: hard, 41; 20: hard, 175; 26: hard, 361; 26: hard, 156; 32: hard, 1000; 32: hard, 105.9; 38: hard, 265; 38: hard, 106.2; 44: hard, 4; 44: hard, 167; 50: hard, 109; 50: hard, 172; 56: hard, 294; 56: hard, 684; 62: hard, 486; 62: hard, 555.

Remaining issues: page 5, coverage: the page prints 4 practice questions; a practice page needs 6; page 5, coverage: the page lost planned questions; page 8, coverage: required planned slot 3.3 (challenge) is missing or failed; page 11, coverage: the page prints 4 practice questions; a practice page needs 6; page 11, coverage: the page lost planned questions; page 14, coverage: required planned slot 3.3 (challenge) is missing or failed; page 20, coverage: required planned slot 3.3 (challenge) is missing or failed; page 26, coverage: required planned slot 3.3 (challenge) is missing or failed; page 32, coverage: required planned slot 3.3 (challenge) is missing or failed; page 35, coverage: the page prints 4 practice questions; a practice page needs 6; page 35, coverage: the page lost planned questions; page 38, coverage: required planned slot 3.3 (challenge) is missing or failed; page 44, coverage: required planned slot 3.3 (challenge) is missing or failed; page 50, coverage: required planned slot 3.3 (challenge) is missing or failed; page 56, coverage: the page prints 2 practice questions; a remember-these-mixed-set page needs 3; page 56, coverage: the page lost planned questions; page 58, progress: Show what you know question 5 uses small numbers for its step; this page asks each step's hardest; page 59, coverage: the page prints 5 practice questions; a practice page needs 6; page 59, coverage: the page lost planned questions; page 62, coverage: the page lost planned questions; page 8, challenge: Day 1's Challenge must use the day's top number and require more reasoning steps than practice; page 14, challenge: Day 2's Challenge must use the day's top number and require more reasoning steps than practice; page 20, challenge: Day 3's Challenge must use the day's top number and require more reasoning steps than practice; page 26, challenge: Day 4's Challenge must use the day's top number and require more reasoning steps than practice; page 32, challenge: Day 5's Challenge must use the day's top number and require more reasoning steps than practice; page 38, challenge: Day 6's Challenge must use the day's top number and require more reasoning steps than practice; page 44, challenge: Day 7's Challenge must use the day's top number and require more reasoning steps than practice; page 50, challenge: Day 8's Challenge must use the day's top number and require more reasoning steps than practice.

v2: day progression averages Day 1 = 260021; Day 2 = 260041; Day 3 = 260081; Day 4 = 260022; Day 5 = 260042; Day 6 = 260082; Day 7 = 260023; Day 8 = 260061; Day 9 = 260043; Day 10 = 260043. Source counts {"template":292,"handBuilt":10,"existing":26,"total":328}. Time-budget trims above the page minimum: 0. Fit failures: 8. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 1/0; 7: 0/1; 8: 0/1; 10: 0/1; 13: 1/0; 14: 0/1; 16: 1/1; 17: 0/1; 19: 1/1; 22: 1/1; 23: 0/1; 25: 2/1; 28: 1/2; 29: 1/1; 31: 2/1; 32: 1/1; 37: 0/1; 40: 0/2; 41: 0/2; 43: 1/1; 46: 0/2; 47: 1/1; 49: 1/1; 53: 1/0; 54: 1/0; 55: 1/1; 58: 1/0; 59: 1/0; 60: 1/0; 61: 2/0; 62: 1/0.

Challenge values (page: difficulty, largest printed or key number): 8: hard, 173; 8: hard, 8348; 8: hard, 8432; 14: hard, 69; 14: hard, 9568; 14: hard, 5769; 20: hard, 41; 20: hard, 4832; 20: hard, 1128; 26: hard, 400; 26: hard, 6358; 26: hard, 7781; 32: hard, 1000; 32: hard, 8176; 32: hard, 1345; 38: hard, 1202; 38: hard, 6494; 44: hard, 169; 44: hard, 8478; 44: hard, 6652; 50: hard, 109; 50: hard, 1227; 50: hard, 202; 56: hard, 294; 56: hard, 3432; 62: hard, 486; 62: hard, 7016.

Remaining issues: page 5, coverage: the page prints 4 practice questions; a practice page needs 6; page 5, coverage: the page lost planned questions; page 11, coverage: the page prints 4 practice questions; a practice page needs 6; page 11, coverage: the page lost planned questions; page 35, coverage: the page prints 4 practice questions; a practice page needs 6; page 35, coverage: the page lost planned questions; page 38, coverage: required planned slot 3.1 (challenge) is missing or failed; page 56, coverage: the page prints 2 practice questions; a remember-these-mixed-set page needs 3; page 56, coverage: the page lost planned questions; page 58, progress: Show what you know question 2 uses small numbers for its step; this page asks each step's hardest; page 58, progress: Show what you know question 5 uses small numbers for its step; this page asks each step's hardest; page 59, coverage: the page prints 5 practice questions; a practice page needs 6; page 59, coverage: the page lost planned questions; page 62, coverage: the page lost planned questions; page 38, challenge: Day 6's Challenge question 4 must use the hardest step reached that day, never an easier step than practice; page 38, challenge: Day 6's Challenge question 5 must use the hardest step reached that day, never an easier step than practice; page 38, challenge: Day 6's Challenge must use the day's top number and require more reasoning steps than practice.


### Real selected U4

V1: `/tmp/ui-review/v1-final3-real-u4`. V2: `/tmp/ui-review/v2-final3-real-u4`.

v1: day progression averages Day 1 = 40021; Day 5 = 40082; Day 10 = 40083. Source counts {"template":195,"handBuilt":5,"existing":0,"total":200}. Time-budget trims above the page minimum: 1. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 3: 1/2; 4: 1/0; 5: 1/1; 6: 1/1; 8: 1/2; 9: 2/2; 11: 2/1; 13: 1/0; 14: 1/1; 16: 3/2; 17: 1/0; 18: 1/0; 19: 1/2; 20: 0/1; 21: 1/1; 22: 1/2; 24: 1/1; 25: 1/2.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 14; 10: hard, 10; 10: hard, 10; 18: hard, 10; 18: hard, 20; 18: hard, 10; 26: hard, 10; 26: hard, 19; 26: hard, 10.

v2: day progression averages Day 1 = 40021; Day 5 = 40082; Day 10 = 40083. Source counts {"template":191,"handBuilt":9,"existing":0,"total":200}. Time-budget trims above the page minimum: 0. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 3: 1/1; 4: 1/0; 5: 1/1; 6: 1/2; 8: 2/2; 9: 0/1; 11: 2/3; 12: 0/1; 13: 2/1; 14: 2/1; 16: 2/2; 17: 2/1; 18: 1/0; 19: 1/2; 20: 0/1; 21: 1/1; 22: 2/1; 24: 2/0; 25: 2/2.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 14; 10: hard, 10; 10: hard, 10; 18: hard, 10; 18: hard, 20; 18: hard, 7; 26: hard, 10; 26: hard, 19; 26: hard, 18.


### Real selected U16

V1: `/tmp/ui-review/v1-final3-real-u16`. V2: `/tmp/ui-review/v2-final3-real-u16`.

v1: day progression averages Day 1 = 160021; Day 5 = 160162; Day 10 = 160163. Source counts {"template":160,"handBuilt":5,"existing":5,"total":170}. Time-budget trims above the page minimum: 16. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 5: 1/1; 6: 2/2; 8: 2/1; 10: 1/0; 12: 0/1; 13: 2/1; 14: 1/2; 16: 1/2; 17: 1/1; 18: 0/1; 20: 1/1; 21: 1/0; 22: 0/1; 24: 1/1; 25: 1/1; 26: 1/0.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 95862; 10: hard, 7288; 10: hard, 5706; 18: hard, 60080; 18: hard, 6300; 18: hard, 8045; 26: hard, 8000; 26: hard, 6597; 26: hard, 2409.

v2: day progression averages Day 1 = 160021; Day 5 = 160162; Day 10 = 160163. Source counts {"template":159,"handBuilt":5,"existing":5,"total":169}. Time-budget trims above the page minimum: 17. Fit failures: 0. Render errors: 0. Variety issues: 0.

True/false pages (page: true/false): 4: 1/0; 5: 2/2; 6: 1/2; 8: 0/1; 10: 1/0; 12: 0/1; 13: 1/2; 14: 1/2; 16: 1/2; 17: 1/1; 18: 0/1; 20: 1/1; 21: 1/0; 22: 0/1; 24: 1/1; 25: 1/1.

Challenge values (page: difficulty, largest printed or key number): 10: hard, 95862; 10: hard, 10000; 10: hard, 6208; 18: hard, 60080; 18: hard, 10000; 18: hard, 4321; 26: hard, 80; 26: hard, 10000; 26: hard, 3803.
