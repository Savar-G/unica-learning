# Adaptive assessment bank calibration

Issue #1179. New BC-scored attempts use the revised Kindergarten through Grade 9 pool. The difficulty mix and typed-answer rules also apply to new attempts scored against Alberta, Saskatchewan, Manitoba and Ontario. The BC content corrections follow the repository's BC skill map. The original provincial grade tags still apply elsewhere.

## Changes checked against the bank

- **Kindergarten to Grade 2.** The Kindergarten change and balance standards call for concrete materials. The text-only missing-part and balance forms repeated Grade 1 asks, so the new BC pool keeps the existing object-based forms. The ship-on-a-dime question tested prior exposure to coin artwork. The turned-square glyph could render as a rhombus. Both leave the pool. Grade 1 keeps one of its three two-clue ordering puzzles. It limits coin totals to 20 in their stated units and gains direct addition and subtraction within ten. Grade 2 gains addition without regrouping, limits the three-addends task to single digits, and starts the text ruler at zero. The inverse unit-size comparison stays in Grade 1 under the explicitly mapped skill `1.7-unit-size`.
- **Grades 3 and 4.** The Grade 3 fraction-of-a-set task stays under `3.2`. It now shares at most 12 objects into two or four equal groups. The coin toss compares two outcomes without conditioning on a streak. The far-term table story and tile-area item leave Grade 3, where their original forms required extrapolation or multiplication past the grade's scope. Grade 4 gets an equal-place decimal comparison without the old one-decimal answer cue, aligned decimal addition, a next-figure pattern, and a small-fact balance equation. Money notation now counts under number and operations. Grade 4's harder multi-digit multiplication and division remain in the mapped year-end scope, with hard ratings for new BC tests.
- **Grades 5 and 6.** Three direct expressions use explicit operation signs and plain wording in place of ten Grade 5 substitution variants. The two-operation table rule moves to BC Grade 6 under `6.9`. Grade 5's exact two-digit divisor and Grade 6's whole-number like-terms equation stay because `5.6-divide-2-digit` and `6.10-combine-like-terms` explicitly name those skills. The duplicated round-up remainder story, large addition, 10,000-more and rectangle-area prompts leave the new BC pool in one band. Grade 6 also keeps one form for each verified decimal division, mixed-to-improper, triangle classification and area duplicate. The two same-area prompts differ: one asks for a choice of the longer perimeter from given sides, and the other asks for a computed perimeter from a missing side. Both remain.
- **Grades 7 to 9.** BC Grade 7's two equations with negative integer solutions move to `8.8`. Negative input in a linear relation remains in Grade 7 under `7.5-evaluate-relation`. Grade 7 retains cylinder volume from a given base area. Grade 8 keeps the radius-and-height task. Ontario retains its separate Grade 7 filing. Grade 7 gains a direct fraction-to-decimal question, Grade 8 gains like-denominator subtraction, and Grade 9 gains a simple negative-base power. Grade 9 keeps its linear-relation questions and drops the repeated constant-step extrapolation task. Diameter from a supplied circumference already has an exact whole-number key.

Reference: [BC Mathematics curriculum](https://curriculum.gov.bc.ca/curriculum/mathematics) and the assessment's `src/lib/assessment/skill-map/`.

## Stored attempts and marking

`createAdaptiveSession` fills and shuffles the entire eligible pool once. `storedTest` saves each filled question, including its ID, prompt, answer and distractors, in `assessments.test`. Each block lock saves the next chosen questions into that same JSON, and `restoreSession` regrades responses against those saved questions. Older staged attempts already store all their forms.

The version 2 placement rules and lock contract continue to apply. The optional `bankCalibration` field selects the new block selector. It uses the difficulty estimates saved on the questions. Adaptive attempts without the field continue to use the original rotation and difficulty labels. Changed templates have new IDs; the original entries remain available to interpret historic evidence and show historic examples in the admin catalogue.

New numeric questions save their grading policy with the filled question. A single trailing decimal point on an otherwise valid whole number is accepted. Revised circle, cylinder and mean prompts permit the exact answer or the correctly rounded value to the nearest tenth or whole number. Their accepted alternatives are saved with the question, and the scorer matches those values. Legacy questions retain their original exact grading. The public question payload omits the numeric policy and answer key.

## Seeded BC results

120 invented attempts per school grade, with seeds `7919 × 1…120`. The response patterns get 6, 4 or 2 answers right in each part, rotating through the seeds. The table counts full six-question blocks in each phase. Inventory and mean opening mixes are in easy/medium/hard order. The baseline is the placement-rules branch at `b5c1a74`. Run `bun scripts/assessment-bank-mix.ts` to reproduce the new sample.

| School grade | Inventory before → after | Mean opening mix before → after | Opening at target before → after | Later grade checks at target before → after | Coverage at target before → after |
|---|---|---|---|---|---|
| K | 16/20/11 → 14/18/6 | 2.07/2.48/1.46 → 1.84/2.77/1.38 | 45 → 120 / 120 | 165 → 440 / 440 | 20 → 80 / 80 |
| 1 | 10/16/10 → 11/14/9 | 1.67/2.66/1.68 → 1.76/2.56/1.68 | 51 → 120 / 120 | 168 → 480 / 480 | 16 → 40 / 40 |
| 2 | 11/18/10 → 11/16/9 | 1.58/2.84/1.57 → 1.77/2.71/1.52 | 36 → 120 / 120 | 174 → 520 / 520 | 15 → 40 / 40 |
| 3 | 19/28/13 → 19/29/11 | 1.95/2.94/1.11 → 1.73/2.86/1.41 | 45 → 120 / 120 | 196 → 560 / 560 | 37 → 80 / 80 |
| 4 | 18/26/16 → 19/24/18 | 2.00/2.47/1.53 → 1.77/2.58/1.66 | 40 → 120 / 120 | 200 → 560 / 560 | 28 → 80 / 80 |
| 5 | 29/49/29 → 24/45/26 | 1.46/2.78/1.76 → 1.59/2.74/1.67 | 44 → 120 / 120 | 195 → 560 / 560 | 24 → 80 / 80 |
| 6 | 39/55/24 → 39/54/21 | 1.93/2.92/1.15 → 1.77/2.82/1.41 | 35 → 120 / 120 | 191 → 560 / 560 | 27 → 80 / 80 |
| 7 | 15/26/15 → 15/23/16 | 1.48/2.73/1.78 → 1.61/2.71/1.68 | 35 → 120 / 120 | 191 → 560 / 560 | 29 → 80 / 80 |
| 8 | 14/22/17 → 15/22/19 | 1.78/2.25/1.97 → 1.75/2.50/1.75 | 44 → 120 / 120 | 165 → 480 / 480 | 48 → 120 / 120 |
| 9 | 14/21/17 → 15/20/17 | 1.68/2.52/1.81 → 1.61/2.65/1.74 | 43 → 120 / 120 | 187 → 520 / 520 | 49 → 120 / 120 |

The target is one or two easy, two or three medium, and at most two hard. Every full BC block in this sample met it. Grades 3–5 each had 40 shorter coverage blocks in both runs because only the remaining strand evidence was needed. Short blocks use the closest available mix. The selector preserves the rotation's strand slots and the coverage block's required strands and nearest levels. If those slots lack the preferred ratings, it fills from eligible inventory and minimizes excess hard questions first. The regression suite exercises a six-item all-hard eligible pool. Difficulty ratings are estimates, and this run measures selection against those labels.

A three-seed spot check for each of the other tagged curricula found one full-block exception. Alberta Grade 7 at seed 15838 needed number, fractions and algebra coverage slots at Grade 7. Each slot had only one eligible hard item left at that level. The resulting coverage block had one easy, two medium and three hard questions.

## Pass 2 figures and hand arithmetic

Issue #1183. Pass 2 adds ten BC templates and introduces 19 replacements across the supported curricula, including the Ontario Grade 7 cylinder variant. The original and pass 1 IDs stay in the catalogue. Replacements inherit the eligible template's province tags. New coverage uses the BC skill map.

| Grade | Visual questions | Additional coverage |
|---|---|---|
| K–2 | A turned shape, corners on a shape, and a pencil aligned to a ruler | Grade 1 shape attributes |
| 3–4 | Fraction and decimal number lines, analog clock, and line symmetry | Addition facts to 20 and related division facts |
| 5–6 | A scaled double bar graph and a line graph | Scaling a known addition fact and reading a height from a graph |
| 7–8 | Coordinate grid, circle graph, circle and cylinder measurements, right triangles, and a cube net | Reading integer coordinates, finding a linear rule, and deciding if a net folds into a cube |
| 9 | A bar graph with an axis starting above zero | |

The circle and cylinder questions use 3.14 for π and smaller products. Each prompt accepts its exact key or the nearest tenth, computed in integer hundredths and saved with the question. The revised fraction-to-decimal question uses denominators that scale to 100. The diameter, right-triangle and percent-change questions use smaller values that suit working on paper.

The question renderer and admin timeline use the same figure component. Each SVG has a text alternative. The assessment keeps the steps that use the figure, such as comparing two bars or converting clock-hand positions. Stored attempts keep their original figure data, key, grading policy and block selector. The anonymous assessment copy keeps the new figure data through the same field allowlist as the old bars.

Invented-data phone, desktop and rounded-answer flow captures are in [the figure review round](../.design/experiments/r1183-assessment-figures/manifest.json).
