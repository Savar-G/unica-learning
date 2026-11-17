# Workbook content audit, 2026-11-16

## Scope and evidence

This is an intermediate content-lane repair against `32c54d097998d3166e830719ea0fe4bce488e823` for PR1128. It changes shared generator templates, never a saved draft or PDF. No book is approved by this audit.

Read the complete serialized question texts, item-region keys and source-family inventory in three local drafts: the U19 retained run, the earlier U10 retained run, and the latest U10 run. They contain 507, 639 and 631 question records respectively, spanning 112, 117 and 115 non-generic template IDs. Reviewed the producing source text and answer expressions, the house additions, page instructions and available teaching panels. Family inputs and generated artifacts remain outside Git. These are content inspections, not independently executed solve or render checks.

The initial worktree was at `5760a48b`. After permission to choose the workaround, it was fast-forwarded to the pinned commit, before the subsequent instruction prohibited branch changes. No other checkout was created or edited. Delivery is a unified patch whose before-files are from the pinned commit.

## Repairs in this patch

- All U19 house divisibility stories now use explicit strict bounds, units and questions. Spot-the-error practice also states strict bounds. Numeric answers, ranges and checks stay unchanged.
- Both bell stories identify each bell's interval and unit. The seconds story asks for the second future coincidence, explicitly excluding now. The minutes story asks for a reading on the timer, preserving the start offset. Common-multiple questions specify positive multiples and the requested operation.
- Three angle-size Challenge forms explain sides and openings and identify A and B in words. They require no diagram. Every composite-turn question states the common direction. Word-answer options and computed keys remain explicit.
- The U19 prime-card sum story duplicated the bare prime-sum task. It now asks for the difference between the larger and smaller primes. Its code-owned key changes from `p + q` to `p - q`; its values guarantee `p > q`. No writer-owned answer changes. The independent key regression changes with this task.
- U10 house estimates name the counted objects, explicitly describe removing cards from boxes, and state how to use the sensible estimate across classes, shelves or books. Short picture books replace generic storybooks, because a 280-page storybook can also be sensible.
- U10 pattern stories state the completed additions. Removed compressed level rewrites that dropped referents or instructions, including the decreasing-pattern and hundreds-value shorthand. U4 source forms again retain full counting and choice instructions. The picture-dependent part/whole rewrite remains, now as a complete verbal task. The U4 likelihood Challenge now asks about a possible red pick rather than declaring the cube red and then asking its likelihood.
- Wording-history records retain retired changes as `retired-level-wording`. The history test checks that retired rewrites are absent and active rewrites still match their sources and destinations. A character-shortening assertion is superseded by the explicit clarity requirement. Sampling, answer, range, uniqueness, missing-contract and physical-fit guards are unchanged.

Five new public-interface cases cover future bell timing, timer offsets, self-contained angle descriptions and choices, common turn direction, the distinct prime-difference task, and estimate assumptions. Existing seeded independent answer checks remain. Tests were authored but not run in this lane.

## Required repairs outside this patch

1. **Teaching panel, parent lane.** Latest U10 page 60 prints `bookcase 300, shelf 30. Which has more?` followed by the answer. It omits books, the relation between bookcase and shelf, and any estimation method. Its warning about 3,000 books supplies a conclusion without a basis. This is the reported failed panel, not an acceptable replacement for teaching. The same page also has a generic addition Spot the error item; parent should verify that its step matches the intended estimate practice. Keep the worked-method guard strict. The earlier U10 page 60 teaches distance to anchors instead of sensible real-world estimates; latest pages 61, 64, 77 and 80 also use distance-to-anchor fallbacks. Those formulas are arithmetically correct but do not explain why a classroom, shelf or bookcase estimate is sensible. Generic addition/subtraction error panels recur on pages 62 and 78. Verify teaching and error-panel step ownership throughout the book, not only the single failed page.
2. **Estimate truth conditions, curriculum source.** `3.1-estimate-quantity` steps 1 and 2, template 3 mark `2 groups of about 100 is about 203` false and similarly reject `2 groups of about 25 is about 55`. `2.2-benchmarks-25-50-100` step 3 template 3 and `2.4-estimate-100` step 3 templates 2–4 have the same unstated approximation convention. Nearby estimates can reasonably be described as “about” the exact estimate. State the calculation convention, such as using the given group estimate for every group or rounding each operand to the nearest ten, then compare the resulting estimate. Do not alter a key merely to fit wording. These are raw source templates, not house additions; fixing them requires source-data edits and regenerating `bc.ts`, which this lane does not own. The latest U10 draft makes the ambiguity concrete; this remains unresolved.
3. **Angle source descriptions.** `6.13-classify-angles` step 1 template 4 still draws “long arms” and “narrow opening” from derived source strings. Explain sides and compare the opening to a square corner. Object-only laptop, pencil and book examples also depend on assumed openings; explicit descriptions would remove those assumptions. The repaired house Challenge forms supply those descriptions. Source metadata, Watch out text and source-derived practice need coordinated authoring/import, not a silent `bc.ts` edit. In particular, “wider than a square corner means obtuse” needs an upper bound of less than a straight angle; wider angles can be reflex. The trading Watch out in both U10 runs gives a final total of 532 without stating all of the quantities that produce it. Neither house wording edits nor a waived method guard can supply missing teaching inputs.
4. **Probability comparison, lower-level source.** `2.11-compare-likelihood` step 2 template 4 lists a bag's red and blue counts but asks only “Red is ...”. Say that one marble is picked without looking and compare red with blue. Its A/B/C key is code-computed from the two counts and should remain so.
5. **Instruction/response mismatch, builder/layout.** U19 `5.4-fraction-to-decimal` step 2 template 1 says “Circle the greater” but its stored item region is a write-answer box with a fraction or decimal key, not two printed circle choices. Align the instruction and region contract. A wording-only house edit cannot fix that region mismatch.
6. **Repeated tasks, selection owner.** The U19 draft contains five exact repeated non-generic question texts across separate pages: LCM step 1 missing multipliers at pages 17/43 and 25/41, prime-factor questions at 22/31, acute-angle counts at 29/43, and LCM step 2 at 41/46. They may be intended spaced practice, but exact repetition should be distinguished from a fresh variant. More seriously, page 8's bare and story prime-sum tasks use the same three card values and answer; this patch replaces the duplicate story task. The earlier U10 draft has no exact non-generic text repeats. Review task identity across different wording as well as exact strings after integration.
7. **Daily learning pages, parent/planner.** The latest requirement is at least eight learning pages per day for every child and level. The retained U19 draft has six-page days; this audit does not approve that schedule. No planner or title files were changed here.

## Optional polish

- Some stories omit the noun in their final question, such as “How many does each friend get?” The noun is recoverable from the preceding sentence, but repeating it would help.
- Very large packs of books and individual children's large harvest quantities are mathematically clear but less plausible contexts. Change the source context with the same operations and values if desired.
- Choice regions sometimes repeat “the” in one label and omit it in another. Consistent labels would read better. This does not change the selected answer.
- U19 review ordering prompts say “Order from least”. “Write the numbers from least to greatest” would be clearer.

## Progression and layout handoff

The U10 sequence still moves from place values to grouping estimates, growing patterns, zero placeholders, hundreds estimates, larger pattern jumps, trading, sensible estimates and decreasing patterns. U19 retains prime/composite classification, divisibility, multiples and angle classification. Range and computed-key guards remain binding. Numeric multi-operation forms and three distinct hard forms per selected step remain present; qualitative angle forms keep three distinct reasoning tasks. A full generated book is still needed to prove selection and teaching continuity after the longer wording.

Representative long forms for the layout lane are the second-future-bell story, the angle A/B comparison with both descriptions, the three sensible-estimate Challenge forms, and the greatest-score divisibility story. Let these wrap and measure their full text. Do not truncate them or turn them back into fragments. Do not relax overflow, missing-contract, timing, review-practice or custom-setting checks to admit them. Removing older U4 shortening also needs U4 fit review.

## Validation handed to parent

No Vitest, sample generation, Chromium, build, full gate or paid call ran in this lane. Read-only inspection and `git diff --check` ran. Parent should serialize verification, with at most two Vitest workers globally:

```sh
npx vitest run src/lib/workbook-curriculum/house-templates.test.ts src/lib/workbook-curriculum/v2.test.ts src/lib/workbook-curriculum/u4-floor.test.ts src/lib/workbook-curriculum/u16-selection.test.ts --maxWorkers=2
```

After the layout and parent changes are integrated, use the existing fast-loop commands with new output directories and `--diff` against the prior retained samples. Include full U10 and U19 books as well as the required full seeded U4/U16 checks; examine every changed question and teaching panel. This lane has not prescribed a family-input command or copied family inputs into Git. Run exactly the one final subscription-only U4/U16 replay pair for the combined round, then the combined full gate once:

```sh
npm test -- --maxWorkers=2
npx eslint src
npm run build
```

The smaller worker limit and deferred runs follow the explicit lane coordination. They are not evidence that the checks pass.

## Complete producing-family inventory

Every non-generic template ID in the serialized drafts is represented below. Cell values are template number and format. Generic warm-up arithmetic was also read but has no template ID. This inventory contains no family inputs.

| Skill and step | U19 retained | Earlier U10 | Latest U10 |
|---|---|---|---|
| 2.1-compare-order-100#3 | none | 1:compare, 2:compare, 3:true-false | 1:compare, 2:compare, 3:true-false |
| 2.1-count-to-100#3 | none | 4:true-false | 4:true-false |
| 2.1-place-value-tens-ones#3 | none | 3:true-false | 3:true-false |
| 2.11-compare-likelihood#2 | none | 4:choose | 4:choose |
| 2.12-count-mixed-coins#3 | none | 2:story | 2:story |
| 2.12-spend-save#2 | none | 1:story, 2:story | 1:story, 2:story |
| 2.2-benchmarks-25-50-100#3 | none | 3:true-false | none |
| 2.3-fact-strategies-20#4 | none | 1:bare, 2:missing, 3:story | 1:bare, 2:missing |
| 2.4-add-subtract-tens#3 | none | 1:missing, 2:missing, 4:true-false | 1:missing, 2:missing, 4:true-false |
| 2.4-add-tens-to-number#3 | none | 1:missing, 3:story | 1:missing, 3:story, 4:true-false |
| 2.4-add-up-difference#3 | none | 4:story | 4:story |
| 2.4-add-within-100#3 | none | 3:missing, 4:story | 3:missing, 4:story |
| 2.4-compare-problems-100#3 | none | 1:story, 2:story, 3:true-false, 4:missing | 1:story, 2:story, 3:true-false, 4:missing |
| 2.4-estimate-100#3 | none | 2:story, 3:true-false, 4:choose | 2:story, 3:true-false, 4:choose |
| 2.4-friendly-numbers#3 | none | 4:story | 4:story |
| 2.4-next-ten#3 | none | 2:story | 1:missing, 2:story |
| 2.4-ones-to-two-digit#4 | none | 1:bare, 3:missing | 1:bare, 3:missing |
| 2.4-split-tens-ones#4 | none | 3:missing, 4:story | 3:missing, 4:story |
| 2.4-subtract-within-100#4 | none | 1:bare, 2:true-false, 3:missing, 4:story | 1:bare, 3:missing, 4:story |
| 2.4-word-problems-100#4 | none | 1:story, 2:story, 3:true-false, 4:choose | 1:story, 2:story, 3:true-false, 4:choose |
| 2.5-increasing-pattern#3 | none | 2:story, 3:bare | 2:story, 3:bare |
| 3.1-compare-order-1000#1 | none | 1:bare, 3:true-false, 4:choose | 1:bare, 3:true-false, 4:choose |
| 3.1-count-1000#1 | none | 1:bare | none |
| 3.1-estimate-quantity#1 | none | 1:bare, 2:story, 3:true-false, 4:choose, 5:missing, 7:bare, 8:missing | 1:bare, 2:story, 3:true-false, 4:choose, 5:missing, 7:bare, 8:missing |
| 3.1-estimate-quantity#2 | none | 1:bare, 2:story, 3:true-false, 4:choose, 5:missing, 7:bare, 9:story | 1:bare, 2:story, 3:true-false, 4:choose, 5:missing, 7:bare, 9:story |
| 3.1-estimate-quantity#3 | none | 1:true-false, 2:choose, 3:story, 4:choose, 7:bare, 8:missing, 9:story | 1:true-false, 2:choose, 3:story, 4:choose, 7:bare, 8:missing, 9:story |
| 3.1-place-value-1000#1 | none | 1:bare, 2:story, 3:true-false, 4:choose, 5:bare, 7:bare, 9:story | 1:bare, 2:story, 3:true-false, 4:choose, 5:bare, 7:bare, 8:missing, 9:story |
| 3.1-place-value-1000#2 | none | 1:bare, 2:story, 4:choose, 5:bare, 7:bare, 8:missing, 9:story | 1:bare, 2:story, 4:choose, 5:bare, 7:bare, 8:missing, 9:story |
| 3.1-place-value-1000#3 | none | 1:bare, 2:story, 3:true-false, 4:choose, 5:missing, 7:bare, 9:story | 1:bare, 3:true-false, 4:choose, 5:missing, 7:bare, 9:story |
| 3.4-recall-addition-20#3 | none | 1:bare, 4:true-false | 1:bare, 2:missing |
| 3.4-subtraction-facts-20#4 | none | 1:missing, 2:missing, 4:true-false | 1:missing, 2:missing, 4:true-false |
| 3.6-decreasing-pattern#1 | none | 10:story, 1:bare, 2:story, 3:missing, 4:true-false, 7:choose, 8:bare, 9:missing | 10:story, 1:bare, 2:story, 3:missing, 4:true-false, 7:choose, 8:bare, 9:missing |
| 3.6-increasing-pattern#1 | none | 1:bare, 2:story, 3:missing, 4:true-false, 7:bare, 8:missing, 9:story | 1:bare, 2:story, 3:missing, 4:true-false, 7:bare, 8:missing, 9:story |
| 3.6-increasing-pattern#2 | none | 1:bare, 2:story, 3:missing, 4:true-false, 7:bare, 8:missing, 9:story | 1:bare, 2:story, 3:missing, 4:true-false, 7:bare, 8:missing, 9:story |
| 4.1-multiples#3 | 2:story | none | none |
| 4.8-division-facts#3 | 1:bare, 3:missing, 4:true-false | none | none |
| 4.8-multiplication-facts#3 | 1:bare | none | none |
| 5.1-place-value-million#4 | 1:bare, 3:compare | none | none |
| 5.11-evaluate-expression#2 | 1:bare, 2:story, 3:missing | none | none |
| 5.15-classify-prisms-pyramids#3 | 3:true-false | none | none |
| 5.15-count-parts#3 | 1:bare, 3:true-false | none | none |
| 5.15-quadrilaterals#2 | 1:true-false, 2:story | none | none |
| 5.16-translation#3 | 5:true-false | none | none |
| 5.18-experiment#3 | 3:story | none | none |
| 5.2-between-decimals#2 | 3:true-false | none | none |
| 5.2-decimal-place-value#2 | 3:missing, 4:bare | none | none |
| 5.2-thousandths#3 | 1:bare, 3:true-false | none | none |
| 5.4-compare-decimals#2 | 1:compare, 2:compare | none | none |
| 5.4-fraction-to-decimal#2 | 1:compare, 4:bare | none | none |
| 5.6-divide-2-digit#3 | 4:story | none | none |
| 5.6-multiply-2-digit#3 | 2:story | none | none |
| 5.7-add-thousandths#3 | 1:bare, 3:story | none | none |
| 5.7-subtract-thousandths#2 | 2:story, 3:missing | none | none |
| 5.8-extend-facts#2 | 3:story | none | none |
| 6.1-large-numbers#1 | 3:story | none | none |
| 6.1-place-value#1 | 1:bare, 2:missing | none | none |
| 6.13-classify-angles#1 | 1:story, 2:bare, 3:choose, 4:true-false, 5:true-false, 6:bare, 7:bare, 8:compare, 9:story | none | none |
| 6.13-classify-angles#2 | 1:story, 2:choose, 3:true-false, 5:true-false, 6:bare, 7:bare, 8:compare, 9:story | none | none |
| 6.18-compare#1 | 2:true-false | none | none |
| 6.18-experimental#1 | 3:missing | none | none |
| 6.2-fact-strategies#3 | 1:bare, 2:story, 3:missing | none | none |
| 6.4-divisibility#1 | 1:bare, 2:choose, 3:story, 5:bare, 6:bare, 7:missing, 8:story | none | none |
| 6.4-divisibility#2 | 1:bare, 2:missing, 3:story, 5:bare, 6:bare, 7:missing, 8:story | none | none |
| 6.4-divisibility#3 | 10:missing, 11:story, 1:bare, 2:bare, 3:story, 4:choose, 5:bare, 6:bare, 7:missing, 8:story, 9:bare | none | none |
| 6.4-lcm#1 | 10:missing, 11:story, 1:bare, 2:story, 3:choose, 5:bare, 6:missing, 7:true-false, 8:bare, 9:bare | none | none |
| 6.4-lcm#2 | 1:bare, 2:story, 3:choose, 4:missing, 5:bare, 6:missing | none | none |
| 6.4-prime-composite#1 | 1:bare, 2:compare, 3:missing, 5:bare, 6:missing, 7:story | none | none |
| 6.4-prime-composite#2 | 1:bare, 2:story, 3:missing, 4:choose, 5:bare, 6:missing, 7:story | none | none |

## Integration update and additional acceptance requirements

The source wording, explicit estimate conventions and guides, response instructions, template identity fixes and exact-step teaching admission have been integrated into the local candidate. Changed historical Watch out pairs remain withheld pending independent verification. The earlier retained books remain rejected; they are not evidence for the candidate.

The November 16 follow-up also requires a coherent sequence within every day. Teach and define a new idea before asking its first numbered question, then move from supported practice to independent work, application and a required Challenge. Repeated stems with different numbers do not establish this progression. Every one of the eight daily learning pages must contain required work. Keep custom review quotas, the chosen starting level, and all timing and print checks.

Plan rows must describe the day's activity instead of labelling almost every day Review. Five-skill check replaces the unexplained Friday 5 label, and Day 10 describes applying the book's learning. The warm-up instruction no longer says Do every question. Centering is verified from the printed pill and text-column positions, not by inspecting CSS alone. A local corrected plan page does not replace the stored admin PDF.

Combined full-book evidence, independent code review and a new family draft remain pending. No previous rejected draft has been approved or silently redrawn.
