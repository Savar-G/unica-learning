# Workbook question gate set

The set has 108 unchanged questions: 36 fake U16, 60 real U16 from first-customer-u16-20261106 and 12 real U16 from codex-sol-high-u16-20261105. Both U4 samples had no eligible questions. The real source folders each had fewer than 100 eligible questions, so the set keeps all of them. The changed set has 30 reading-level and 30 multiple-answer copies. These edits are synthetic and do not establish performance on production questions. The 30 multiple-answer copies use one repeated instruction. The reading-level labels have not been independently checked. The same set selects and evaluates each threshold, so the rates are not held-out estimates.

The eligible samples contain 0 picture questions and 0 interest questions. Picture and interest gates are off with unset thresholds until suitable real sample questions exist.

A threshold passes when it catches at least 90% of changed copies and flags at most 5% of unchanged questions. The script searches thresholds from 0.00 to 1.00 in steps of 0.01, maximises catches under the false-flag limit, then minimises false flags. Reading flags at or above the threshold. Other gates flag below their P(yes) threshold.

| Model | Gate | Catch rate | False-flag rate | Threshold | On or off |
|---|---|---:|---:|---:|---|
| typesafe/jev-1.14 | reading_level | 26/30 (86.7%) | 0/108 (0.0%) | 0.02 | off |
| typesafe/jev-1.14 | one_right_answer | 30/30 (100.0%) | 0/108 (0.0%) | 0.03 | on |
| google/gemini-decision-1 | reading_level | 28/30 (93.3%) | 3/108 (2.8%) | 0.05 | on |
| google/gemini-decision-1 | one_right_answer | 30/30 (100.0%) | 0/108 (0.0%) | 0.08 | on |
| typesafe/jev-1.14 | picture_matches | unmeasured (0) | unmeasured (0) | unset | off |
| typesafe/jev-1.14 | uses_interest | unmeasured (0) | unmeasured (0) | unset | off |
| google/gemini-decision-1 | picture_matches | unmeasured (0) | unmeasured (0) | unset | off |
| google/gemini-decision-1 | uses_interest | unmeasured (0) | unmeasured (0) | unset | off |

Known spend: USD 0.006541. Unpriced attempts: 0. Maximum spend including unpriced attempts: USD 0.006541.
