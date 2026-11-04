# PR 508 after the consistency merge

The matched U4 and U16 fake comparisons pass on consistency base `24751f162fca3facf010d1ef8153c7573af5d8cb`. No compared failure, omission, render, fullness or variety measure is worse than v1. The local merge is `04174cea530a4f1cf9cddd3de6d008aba8dec0fb`. The [earlier report](workbook-steps-v2.md) records the comparison before this merge. The [new machine report](workbook-steps-v2-merged-comparison.json) records this round.

## Corrections

- The template conflict resolution keeps `side3`, `older-extra`, Challenge `nowork` and `stretch`. The three-column Challenge rules, 88 px older extra-practice answer boxes, compact cards without work areas and maximum-capacity row expansion all remain. No further template edit was needed.
- A worked example of `7 = 1 + 7` or `7 = 3 + 5` now shows the right-hand calculation. A template without a supported method cannot become a worked example. Sequence examples keep their existing step method. Likelihood panels keep their explicit word definitions. The book check is unchanged.
- The U4 CLI failure was reproduced with seed `67126ea6-8ac8-4065-8036-5ae4da161812`. Capacity measured a question with Sam. Output replaced Sam with Raj. The narrower name removed a wrapped line, so page 13 fell to 82.51% fullness. Capacity now uses the final name for questions and examples. Both retained failing seeds, that seed and `97247351-b001-45dd-b35a-7e4e099f2022`, passed after this correction. The public CLI test now uses the first failing seed.
- The independent solver receives a number-only format flag for a numeric answer box. It receives no key value. This removes the conflict between numeric measurement keys and the blanket unit instruction. Keys with units still require their units. The strict answer comparison is unchanged. Public tests cover the 14-metre walk, a 25-square-metre parallelogram, money, unit-bearing area answers and rejection of a wrong unit scale.
- `9.2-power-parts` step 2, template 3 now requires `b ** e != e ** b`. This excludes the two correct options 4² and 2⁴. Eighty seeded fills check that exactly one displayed expression has the repeated product's value.

The active audit passed all 7,999 templates and 239,970 fills. There are zero failed fills and zero import problems. Every step keeps an easy and a hard template. All template positions remain. The raw v2 original is unchanged. The author-change files now contain 302 field changes. The local receipt is `/tmp/cedric-v2/fixed-by-us.md`.

## Additional U4 quality fallback

The first comparison on the new base failed the strict fullness comparison. V1 minimum/mean fullness was 63.0372%/85.1544%. V2 was 60.5730%/84.1313%. Failures, omissions, render errors and variety issues were zero in both. The first fallback trial restored the minimum but still had a lower mean, 84.9592%. That trial was not adopted.

The final group below restores minimum/mean fullness to 67.0487%/85.3161%. Exact previous values, new values and reasons are in [author-changes.md](../data/curriculum/author-changes.md) and [author-changes.json](../data/curriculum/author-changes.json).

| Step | Retained v1 content | Reason |
| --- | --- | --- |
| `K3-make-10` step 3 | The step's v1 content; changed templates 1, 4 and 5, plus its mistake list | Restore the review-page format choices and fullness. |
| `1.1-subitize-to-10` steps 1, 2 and 3 | Template 3, the medium story | Restore a usable medium story in place of the v2 picture prompt. The existing hard-template fallbacks remain. |
| `1.2-decompose-within-10` step 1 | Templates 1, 2 and 4 | Restore the missing-part, true/false and choice wording needed for the matched fullness result. Keep the v2 medium and hard stories. |

These extend three existing fallback steps and add two. There are now 20 steps with active v1 quality fallbacks. Nothing was left out because it failed to fill.

## Matched fake comparison

Both runs use seed `00000000-0000-4000-8000-000000000016`, days 1, 5 and 10, the same profile and generator bundle SHA-256 `83e37df5289dc0f5116c01c16fe0c031089810ddefbbabe1e52263215523e954`. The preserved patched v1 file is the control. The final active file is the candidate. The fast loop and final image runs use the public strict render check and `--no-store`.

Values below are v1 to v2. Room omissions exclude optional time-budget trims. All required questions remain.

| Level | Failed % | Room omissions / later losses | Fit failures / render errors | Fullness min / mean % | Minutes, days 1 / 5 / 10 | Template questions / all questions; unique templates | Frame max page / day; stem max page | Hard Challenge cards | Worse measures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U4 | 0 to 0 | 0/0 to 0/0 | 0/0 to 0/0 | 63.04/85.15 to 67.05/85.32 | 28.4/28.1/28.1 to 27.9/28.2/27.6 | 199/202; 55 to 193/202; 53 | 1/2; 2 to 1/2; 2 | 9 to 9 | None |
| U16 | 0 to 0 | 0/0 to 0/0 | 0/0 to 0/0 | 52.04/77.17 to 52.04/77.67 | 28.2/28.8/28.4 to 28.1/28.8/28.4 | 157/200; 48 to 156/199; 50 | 1/2; 3 to 1/2; 3 | 9 to 9 | None |

Step progression is unchanged: U4 averages 40021, 40082 and 40083; U16 averages 160021, 160162 and 160163. The machine report retains the complete step coverage, truth-value distributions, Challenge ranges and input values. The stem summary includes the places that the generator exempts from its stem cap. U16's maximum of three is equal in both data versions.

Optional time-budget trims are zero in both U4 runs. U16 has five in v1 and six in v2. These remove optional questions above the required page minimum. The table shows the resulting question counts. Both versions keep every required question and stay below 30 minutes per day.

## Samples and visual checks

- V1 fake: `/tmp/ui-review/pr508-merged-v1-final`.
- V2 fake: `/tmp/ui-review/pr508-merged-v2-final`.
- Fake differences: `U4-diff.md` lists 22 changed pages. `U16-diff.md` lists 16. Both are in the v2 fake folder with the changed-page sheets and printed text dumps.
- Real U4 replay: `/tmp/ui-review/pr508-merged-real-u4`, from `/tmp/ui-review/v2-final3-real-u4`.
- Real U16 replay: `/tmp/ui-review/pr508-merged-real-u16`, from `/tmp/ui-review/v2-final3-real-u16`.
- The two real runs use the Claude subscription, with all API key variables removed and `--subscription-only`. Each selects days 1, 5 and 10. Neither generates a full real book.

The real U4 run reused two logical calls and made nine new subscription calls. All six independent solves agreed. The real U16 run reused four logical calls and made 60 new subscription calls. All 52 independent solves agreed. Both books have zero failed questions, fit failures, render errors, room omissions and quality issues. Each keeps nine hard Challenge questions. API calls are zero.

I read the printed text for both real books. I inspected both contact sheets and all rows of their changed-page sheets. I also inspected the U4 teaching, practice and Challenge pages and the U16 practice, story and Challenge pages at full size. These eight-page samples exercise the compact Challenge cards and row expansion. The retained `side3` and `older-extra` rules were checked in the merge source in this round.

The real runs are local generation and print checks. Savar controls sample approval and merge.

## Final gates

| Check | Exit | Result |
| --- | --- | --- |
| Plain `npm test` | 0 | `Test Files 302 passed (302)`; `Tests 13645 passed (13645)`; 136.65 seconds |
| `npx eslint src` | 0 | No errors |
| `npm run build` | 0 | Production build and TypeScript check pass |
| Active data audit | 0 | 7,999 templates; 239,970 passed fills; zero failures or import problems |

The first build found a missing environment-object type annotation in the new deterministic CLI test. The corrected build and lint checks passed. The full test run passed. The failure and corrected logs remain under `/tmp/pr508-followup-final-`.

The final fetch before the commit still found base `24751f16`. No newer base needed a merge. No tests were weakened, no input limit was raised, and no slow test was added.
