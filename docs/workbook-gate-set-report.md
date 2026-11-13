# Workbook question gate set

The set has 108 unchanged questions: 36 fake U16, 60 real U16 from first-customer-u16-20261106 and 12 real U16 from codex-sol-high-u16-20261105. Both U4 samples had no eligible questions. Each real source had fewer than 100 eligible questions, so the set keeps all of them. The changed set has 30 reading-level and 58 multiple-answer copies. The copies are synthetic. The multiple-answer copies are of 8 kinds (either-instruction, number-between, inequality, rounding-unstated, estimate, two-counts, two-units, two-unknowns): the first 30 use one repeated instruction ("either-instruction"); the other kinds were added for #858, so the gate is not measured on one pattern only. The reading-level labels have not had independent review.

The split uses the original questions only, without their labels or model answers. It groups identical printed questions, assigns groups in input order to alternate halves, and balances the halves by moving the last singleton if needed. Every copy stays with its original, and each added kind has two copies in each half. This assignment is reproducible, but was made after the copies were written; it is not a prospective sample.

For fold A, the script selects a threshold on half B and evaluates it on half A. Fold B swaps the halves. A threshold must catch at least 90% of changed copies and flag at most 5% of unchanged questions. A gate is on only when both held-out folds pass. Each cell lists catch rate, false-flag rate and the threshold selected on the other half. The mean is the average of the two held-out rates. Reading flags at or above its threshold. The other gates flag below their P(yes) threshold.

| Model | Gate | Fold A: catch, false flag, threshold | Fold B: catch, false flag, threshold | Mean: catch, false flag | State |
|---|---|---|---|---|---|
| typesafe/jev-1.14 | reading_level | 8/15 (53.3%), 0/54 (0.0%), 0.04 | 13/15 (86.7%), 0/54 (0.0%), 0.02 | 70.0%, 0.0% | off |
| typesafe/jev-1.14 | one_right_answer | 26/29 (89.7%), 0/54 (0.0%), 0.98 | 27/29 (93.1%), 2/54 (3.7%), 0.98 | 91.4%, 1.9% | off |
| google/gemini-decision-1 | reading_level | 14/15 (93.3%), 2/54 (3.7%), 0.05 | 13/15 (86.7%), 0/54 (0.0%), 0.06 | 90.0%, 1.9% | off |
| google/gemini-decision-1 | one_right_answer | 15/15 (100.0%), 0/54 (0.0%), 0.08 | 13/15 (86.7%), 0/54 (0.0%), 0.07 | 93.3%, 0.0% | off |
| typesafe/jev-1.14 | picture_matches | unmeasured (0) | unmeasured (0) | unmeasured | off |
| typesafe/jev-1.14 | uses_interest | unmeasured (0) | unmeasured (0) | unmeasured | off |
| google/gemini-decision-1 | picture_matches | unmeasured (0) | unmeasured (0) | unmeasured | off |
| google/gemini-decision-1 | uses_interest | unmeasured (0) | unmeasured (0) | unmeasured | off |

Multiple-answer copies caught by kind, each judged by its own fold's threshold:

| Model | Kind | Caught |
|---|---|---|
| typesafe/jev-1.14 | either-instruction | 30/30 |
| typesafe/jev-1.14 | number-between | 4/4 |
| typesafe/jev-1.14 | inequality | 4/4 |
| typesafe/jev-1.14 | rounding-unstated | 4/4 |
| typesafe/jev-1.14 | estimate | 4/4 |
| typesafe/jev-1.14 | two-counts | 0/4 |
| typesafe/jev-1.14 | two-units | 3/4 |
| typesafe/jev-1.14 | two-unknowns | 4/4 |
| google/gemini-decision-1 | either-instruction | 28/30 |

Not measured: google/gemini-decision-1 one_right_answer: 28 copies not asked. A model is measured only on the copies it answered; Gemini is not asked again (Savar, 2026-11-11).

The eligible samples contain 0 picture questions and 0 interest questions. Those gates remain off with unset thresholds. These small, templated samples do not establish performance on production questions.

The model runs cost USD 0.007015 in all, with 0 unpriced attempts.
