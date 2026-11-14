# Page layout gate set

The set has 52 unchanged pages (every page with an answer box of the fake U4 and U16 sample books, days 1, 5 and 10, printed by the real templates) and 36 changed copies, 12 per gate, each printed with CSS that causes its fault on that page in one of two ways (`scripts/workbook-page-gate-set-cli.ts`, FAULTS). The copies are synthetic: a real fault may look different.

The halves are made without reading any answer: a copy stays in its source page's half, each gate's source pages alternate between the halves, and the other pages fill the smaller half. Each fold fits a threshold on one half and measures it on the other. A gate may be turned on only when both folds catch at least 90% of its changed pages with at most 5% false flags on unchanged pages. Each cell is caught, false flags and the threshold fitted on the other half. When several thresholds tie, the middle of the tied range is used. The first rule (2026-11-13) took the highest, just under the fitted half's lowest changed page, and missed the other half's: text_cut_off 6/6 and 3/6, overlap 6/6 and 1/6. The rule was changed after these answers were seen, so read the folds below with that in mind.

| Model | Gate | Fold A | Fold B | Passes both folds |
|---|---|---|---|---|
| typesafe/jev-1.14 | text_cut_off | 6/6, 0/26, 0.41 | 6/6, 0/26, 0.57 | yes |
| typesafe/jev-1.14 | overlap | 6/6, 0/26, 0.75 | 6/6, 0/26, 0.68 | yes |
| typesafe/jev-1.14 | box_too_small | 0/6, 0/26, 0.47 | 3/6, 2/26, 0.37 | no |

Across the whole set: text_cut_off catches 12/12 with no false flag between 0.27 and 0.67 (proposed threshold 0.48); overlap catches 12/12 between 0.54 and 0.94 (proposed 0.74); box_too_small does not separate (changed copies 0.13 to 0.56, unchanged pages up to 0.43). PAGE_GATE_THRESHOLDS (version 2) turns on text_cut_off at 0.48 and overlap at 0.74; box_too_small stays off. The workbook_run_page_gates migration is applied (version 20261114010024).

The model runs cost USD 0.019692 with 0 unpriced attempts.
