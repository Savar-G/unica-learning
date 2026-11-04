# Approved author data changes

The original is preserved byte for byte in `step-progressions-k9.original.json`. The corrected file is `step-progressions-k9.json`. Template numbers are 1-based. A template value of `all` means that the change is to the shared step domain. This record also exists as structured patches in `author-changes.json`.

Savar approved the following budget adjustment: `K11-coin-attributes.pages` 2 -> 3, `U3.skillPages` 125 -> 126, Kindergarten `skillPages` 360 -> 361. Workbooks remain 8 for Kindergarten and 120 in total. The three expected old values are checked by the importer before the adjustment is applied.

| Skill | Step | Template | Field | Before | After | Why |
|---|---:|---|---|---|---|---|
| K11-coin-attributes | all | all | skill.pages | `2` | `3` | Savar accepted the author's three step pages. |
| U3 | all | all | level.skillPages | `125` | `126` | Include the one added skill page in its level. |
| Kindergarten | all | all | grade.skillPages | `360` | `361` | Include the same page in the grade budget. Workbook counts remain 8 and 120 overall. |
| 3.1-place-value-1000 | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-place-value-1000 | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-place-value-1000 | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-place-value-1000 | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-place-value-1000 | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-place-value-1000 | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-place-value-1000 | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-place-value-1000 | 3 | 4 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-place-value-1000 | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-place-value-1000 | 4 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-compare-order-1000 | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-compare-order-1000 | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-compare-order-1000 | 4 | all | numbers.template_pos | `null` | `{"min":0,"max":2}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-compare-order-1000 | 4 | 1 | slots.pos | `{"min":0,"max":2}` | `"template_pos"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-compare-order-1000 | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-compare-order-1000 | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-count-1000 | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-count-1000 | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-count-1000 | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-count-1000 | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-count-1000 | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-count-1000 | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-count-1000 | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-count-1000 | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-count-1000 | 5 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-count-1000 | 5 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-estimate-quantity | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-estimate-quantity | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-estimate-quantity | 1 | 4 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-estimate-quantity | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-estimate-quantity | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-estimate-quantity | 2 | 4 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-estimate-quantity | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.1-estimate-quantity | 3 | 1 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-estimate-quantity | 3 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-estimate-quantity | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-estimate-quantity | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.1-estimate-quantity | 3 | 6 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-add-within-1000 | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-add-within-1000 | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-add-within-1000 | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-add-within-1000 | 4 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 4 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 5 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-add-within-1000 | 5 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 5 | 4 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 6 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-add-within-1000 | 6 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 6 | 4 | slots.g | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-add-within-1000 | 6 | 4 | slots.h | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-subtract-within-1000 | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-subtract-within-1000 | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-subtract-within-1000 | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-subtract-within-1000 | 4 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 4 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 5 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-subtract-within-1000 | 5 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 5 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 5 | 5 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 6 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-subtract-within-1000 | 6 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-subtract-within-1000 | 6 | 4 | slots.g | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-word-problems-1000 | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-word-problems-1000 | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-word-problems-1000 | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-word-problems-1000 | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-word-problems-1000 | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-word-problems-1000 | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-word-problems-1000 | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-word-problems-1000 | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.3-word-problems-1000 | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.3-word-problems-1000 | 4 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-recall-addition-20 | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.4-recall-addition-20 | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-recall-addition-20 | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-recall-addition-20 | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.4-recall-addition-20 | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-recall-addition-20 | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-recall-addition-20 | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.4-recall-addition-20 | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-recall-addition-20 | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-subtraction-facts-20 | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.4-subtraction-facts-20 | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-subtraction-facts-20 | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-subtraction-facts-20 | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.4-subtraction-facts-20 | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-subtraction-facts-20 | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-subtraction-facts-20 | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.4-subtraction-facts-20 | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-subtraction-facts-20 | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.4-subtraction-facts-20 | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.4-subtraction-facts-20 | 4 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-increasing-pattern | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-increasing-pattern | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-increasing-pattern | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-increasing-pattern | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-increasing-pattern | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-increasing-pattern | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-increasing-pattern | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-increasing-pattern | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-increasing-pattern | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-increasing-pattern | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-decreasing-pattern | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-decreasing-pattern | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-decreasing-pattern | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-decreasing-pattern | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-decreasing-pattern | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-decreasing-pattern | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-decreasing-pattern | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-decreasing-pattern | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-decreasing-pattern | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-growth-amount | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-growth-amount | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-growth-amount | 2 | all | numbers.template_f | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-growth-amount | 2 | 1 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-growth-amount | 2 | 2 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-growth-amount | 2 | 3 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-growth-amount | 2 | 4 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-growth-amount | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-growth-amount | 2 | 6 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-growth-amount | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.6-growth-amount | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.6-growth-amount | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.13-simulated-likelihood | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.13-simulated-likelihood | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.13-independent-trials | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.13-independent-trials | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.13-independent-trials | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.13-independent-trials | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.13-independent-trials | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.13-independent-trials | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-groups | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-equal-groups | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-groups | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-groups | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-equal-groups | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-groups | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-equal-groups | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-groups | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-groups | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-equal-groups | 4 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-groups | 4 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-groups | 5 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-equal-groups | 5 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-sharing | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-equal-sharing | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-sharing | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-sharing | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-equal-sharing | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-sharing | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-sharing | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-equal-sharing | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-equal-sharing | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-grouping-division | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-grouping-division | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-grouping-division | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-grouping-division | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-grouping-division | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-grouping-division | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-grouping-division | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-grouping-division | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-relate-multiply-divide | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-relate-multiply-divide | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-relate-multiply-divide | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-relate-multiply-divide | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.5-relate-multiply-divide | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.5-relate-multiply-divide | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-unknown-result-change | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-unknown-result-change | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-unknown-result-change | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-unknown-result-change | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-unknown-result-change | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-unknown-result-change | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-unknown-result-change | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-unknown-result-change | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-unknown-result-change | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-unknown-start | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-unknown-start | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-unknown-start | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-unknown-start | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-unknown-start | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-unknown-start | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-unknown-start | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-unknown-start | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-balance-equations | 1 | 1 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 1 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 1 | 4 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 1 | 6 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-balance-equations | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-balance-equations | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-balance-equations | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 4 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-balance-equations | 5 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-balance-equations | 5 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-write-equation | 1 | all | numbers.template_f | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-write-equation | 1 | 1 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-write-equation | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-write-equation | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-write-equation | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.8-write-equation | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.8-write-equation | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.7-describe-rule | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.7-describe-rule | 1 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.7-describe-rule | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.7-describe-rule | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.7-describe-rule | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.7-describe-rule | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.7-use-rule | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.7-use-rule | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.7-use-rule | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.7-use-rule | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.7-use-rule | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.7-use-rule | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-read-bar-graph | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-read-bar-graph | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-read-bar-graph | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-read-bar-graph | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-read-bar-graph | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-read-bar-graph | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-read-bar-graph | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-read-bar-graph | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-read-bar-graph | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-read-bar-graph | 5 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-read-bar-graph | 5 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-tally | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-tally | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-tally | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-tally | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-tally | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-tally | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-tally | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-choose-display | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-choose-display | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-choose-display | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.12-choose-display | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.12-choose-display | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-coins-bills-100 | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.14-coins-bills-100 | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-coins-bills-100 | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.14-coins-bills-100 | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-coins-bills-100 | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-coins-bills-100 | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.14-coins-bills-100 | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-coins-bills-100 | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-coins-bills-100 | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.14-coins-bills-100 | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-coins-bills-100 | 4 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-make-amount-ways | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.14-make-amount-ways | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-make-amount-ways | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.14-make-amount-ways | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-make-amount-ways | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.14-make-amount-ways | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-make-amount-ways | 3 | 4 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-make-amount-ways | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-earning-payment | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.14-earning-payment | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-earning-payment | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.14-earning-payment | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.14-earning-payment | 4 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-equal-parts | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-equal-parts | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-equal-parts | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-equal-parts | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-equal-parts | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-equal-parts | 3 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-name-fraction-region | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-name-fraction-region | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-name-fraction-region | 1 | 5 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-name-fraction-region | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-name-fraction-region | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-name-fraction-region | 2 | 5 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-name-fraction-region | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-name-fraction-region | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-name-fraction-region | 3 | 5 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-name-fraction-region | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-name-fraction-region | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-name-fraction-region | 4 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-of-set | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-of-set | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-of-set | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-of-set | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-of-set | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-of-set | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-of-set | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-of-set | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-of-set | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-of-set | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-of-set | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-number-line | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-number-line | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-number-line | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-number-line | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-number-line | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-number-line | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-number-line | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-whole | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-whole | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-whole | 1 | 5 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-whole | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-whole | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-whole | 2 | 5 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.2-fraction-whole | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.2-fraction-whole | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-metric-units | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-metric-units | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-metric-units | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-metric-units | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-metric-units | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-metric-units | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-metric-units | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-metric-units | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-metric-units | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-metric-units | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-metric-units | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-convert-m-cm | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-convert-m-cm | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-convert-m-cm | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 4 | all | numbers.template_f | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-convert-m-cm | 4 | 1 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 4 | 2 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 4 | 4 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-convert-m-cm | 4 | 5 | slots.f | `{"min":0,"max":1}` | `"template_f"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-area-square-units | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-area-square-units | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-area-square-units | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-area-square-units | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-area-square-units | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-area-square-units | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-area-square-units | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-area-square-units | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-perimeter-concept | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-perimeter-concept | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-perimeter-concept | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-perimeter-concept | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-perimeter-concept | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-perimeter-concept | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.9-perimeter-concept | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.9-perimeter-concept | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-time-units | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.10-time-units | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-time-units | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.10-time-units | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-time-units | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-time-units | 2 | 5 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-time-units | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.10-time-units | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-convert-time | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.10-convert-time | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-convert-time | 1 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-convert-time | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.10-convert-time | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-convert-time | 2 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-convert-time | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.10-convert-time | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-convert-time | 3 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-convert-time | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.10-convert-time | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.10-convert-time | 4 | 5 | slots.f | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-faces-edges-vertices | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-faces-edges-vertices | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-faces-edges-vertices | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-faces-edges-vertices | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-faces-edges-vertices | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-faces-edges-vertices | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-name-3d | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-name-3d | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-name-3d | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-name-3d | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-name-3d | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-name-3d | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-name-3d | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-name-3d | 4 | 1 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-nets | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-nets | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-nets | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-nets | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 3.11-nets | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 3.11-nets | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 4.1-multiples | 3 | 1 | answer | `"str([f, 2 * f, 3 * f, 4 * f, 5 * f, 6 * f][:t])"` | `"str([f, 2 * f, 3 * f, 4 * f] if t == 4 else ([f, 2 * f, 3 * f, 4 * f, 5 * f] if t == 5 else [f, 2 * f, 3 * f, 4 * f, 5 * f, 6 * f]))"` | The declared t range is 4-6. Select the same list explicitly instead of slicing. |
| 4.13-name-polygons | 1 | 1 | answer | `"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n]"` | `"'triangle' if n == 3 else 'quadrilateral' if n == 4 else 'pentagon' if n == 5 else 'hexagon' if n == 6 else 'heptagon' if n == 7 else 'octagon' if n == 8 else 'nonagon' if n == 9 else 'decagon'"` | Replace dictionary lookup with the same side/name pairs as conditional expressions. |
| 4.13-name-polygons | 1 | 2 | answer | `"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n]"` | `"'triangle' if n == 3 else 'quadrilateral' if n == 4 else 'pentagon' if n == 5 else 'hexagon' if n == 6 else 'heptagon' if n == 7 else 'octagon' if n == 8 else 'nonagon' if n == 9 else 'decagon'"` | Replace dictionary lookup with the same side/name pairs as conditional expressions. |
| 4.13-name-polygons | 1 | 4 | answer | `"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n]"` | `"'triangle' if n == 3 else 'quadrilateral' if n == 4 else 'pentagon' if n == 5 else 'hexagon' if n == 6 else 'heptagon' if n == 7 else 'octagon' if n == 8 else 'nonagon' if n == 9 else 'decagon'"` | Replace dictionary lookup with the same side/name pairs as conditional expressions. |
| 4.13-name-polygons | 1 | 3 | derived | `{"word":"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n] if flip == 0 else {3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[3 + (n - 2) % 8]"}` | `{"label_sides":"n if flip == 0 else 3 + (n - 2) % 8","word":"'triangle' if label_sides == 3 else 'quadrilateral' if label_sides == 4 else 'pentagon' if label_sides == 5 else 'hexagon' if label_sides == 6 else 'heptagon' if label_sides == 7 else 'octagon' if label_sides == 8 else 'nonagon' if label_sides == 9 else 'decagon'"}` | Preserve the true label and the same cyclic wrong label. Use a named intermediate to stay below the expression cap. |
| 4.13-name-polygons | 2 | 1 | answer | `"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n]"` | `"'triangle' if n == 3 else 'quadrilateral' if n == 4 else 'pentagon' if n == 5 else 'hexagon' if n == 6 else 'heptagon' if n == 7 else 'octagon' if n == 8 else 'nonagon' if n == 9 else 'decagon'"` | Replace dictionary lookup with the same side/name pairs as conditional expressions. |
| 4.13-name-polygons | 2 | 2 | answer | `"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n]"` | `"'triangle' if n == 3 else 'quadrilateral' if n == 4 else 'pentagon' if n == 5 else 'hexagon' if n == 6 else 'heptagon' if n == 7 else 'octagon' if n == 8 else 'nonagon' if n == 9 else 'decagon'"` | Replace dictionary lookup with the same side/name pairs as conditional expressions. |
| 4.13-name-polygons | 2 | 4 | answer | `"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n]"` | `"'triangle' if n == 3 else 'quadrilateral' if n == 4 else 'pentagon' if n == 5 else 'hexagon' if n == 6 else 'heptagon' if n == 7 else 'octagon' if n == 8 else 'nonagon' if n == 9 else 'decagon'"` | Replace dictionary lookup with the same side/name pairs as conditional expressions. |
| 4.13-name-polygons | 2 | 3 | derived | `{"word":"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n] if flip == 0 else {3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[3 + (n - 2) % 8]"}` | `{"label_sides":"n if flip == 0 else 3 + (n - 2) % 8","word":"'triangle' if label_sides == 3 else 'quadrilateral' if label_sides == 4 else 'pentagon' if label_sides == 5 else 'hexagon' if label_sides == 6 else 'heptagon' if label_sides == 7 else 'octagon' if label_sides == 8 else 'nonagon' if label_sides == 9 else 'decagon'"}` | Preserve the true label and the same cyclic wrong label. Use a named intermediate to stay below the expression cap. |
| 4.13-name-polygons | 3 | 1 | answer | `"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n]"` | `"'triangle' if n == 3 else 'quadrilateral' if n == 4 else 'pentagon' if n == 5 else 'hexagon' if n == 6 else 'heptagon' if n == 7 else 'octagon' if n == 8 else 'nonagon' if n == 9 else 'decagon'"` | Replace dictionary lookup with the same side/name pairs as conditional expressions. |
| 4.13-name-polygons | 3 | 2 | answer | `"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n]"` | `"'triangle' if n == 3 else 'quadrilateral' if n == 4 else 'pentagon' if n == 5 else 'hexagon' if n == 6 else 'heptagon' if n == 7 else 'octagon' if n == 8 else 'nonagon' if n == 9 else 'decagon'"` | Replace dictionary lookup with the same side/name pairs as conditional expressions. |
| 4.13-name-polygons | 3 | 4 | answer | `"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n]"` | `"'triangle' if n == 3 else 'quadrilateral' if n == 4 else 'pentagon' if n == 5 else 'hexagon' if n == 6 else 'heptagon' if n == 7 else 'octagon' if n == 8 else 'nonagon' if n == 9 else 'decagon'"` | Replace dictionary lookup with the same side/name pairs as conditional expressions. |
| 4.13-name-polygons | 3 | 3 | derived | `{"word":"{3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[n] if flip == 0 else {3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon'}[3 + (n - 2) % 8]"}` | `{"label_sides":"n if flip == 0 else 3 + (n - 2) % 8","word":"'triangle' if label_sides == 3 else 'quadrilateral' if label_sides == 4 else 'pentagon' if label_sides == 5 else 'hexagon' if label_sides == 6 else 'heptagon' if label_sides == 7 else 'octagon' if label_sides == 8 else 'nonagon' if label_sides == 9 else 'decagon'"}` | Preserve the true label and the same cyclic wrong label. Use a named intermediate to stay below the expression cap. |
| 6.4-prime-composite | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.4-prime-composite | 1 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.4-divisibility | 2 | 1 | derived | `null` | `{"digit_sum":"n % 10 + (n // 10) % 10 + (n // 100) % 10 + (n // 1000) % 10"}` | The declared n range is 100-9999. Four explicit digit terms replace the unsupported generator expression. |
| 6.4-divisibility | 2 | 1 | answer | `"'yes' if sum(int(c) for c in str(n)) % 3 == 0 else 'no'"` | `"'yes' if digit_sum % 3 == 0 else 'no'"` | Use the exact same digit sum and retain the original divisibility conditions. |
| 6.4-divisibility | 2 | 2 | derived | `null` | `{"digit_sum":"n % 10 + (n // 10) % 10 + (n // 100) % 10 + (n // 1000) % 10"}` | The declared n range is 100-9999. Four explicit digit terms replace the unsupported generator expression. |
| 6.4-divisibility | 2 | 2 | answer | `"sum(int(c) for c in str(n))"` | `"digit_sum"` | Use the exact same digit sum and retain the original divisibility conditions. |
| 6.4-divisibility | 2 | 3 | derived | `null` | `{"digit_sum":"n % 10 + (n // 10) % 10 + (n // 100) % 10 + (n // 1000) % 10"}` | The declared n range is 100-9999. Four explicit digit terms replace the unsupported generator expression. |
| 6.4-divisibility | 2 | 3 | answer | `"'yes' if sum(int(c) for c in str(n)) % 9 == 0 else 'no'"` | `"'yes' if digit_sum % 9 == 0 else 'no'"` | Use the exact same digit sum and retain the original divisibility conditions. |
| 6.4-divisibility | 2 | 4 | derived | `null` | `{"digit_sum":"n % 10 + (n // 10) % 10 + (n // 100) % 10 + (n // 1000) % 10"}` | The declared n range is 100-9999. Four explicit digit terms replace the unsupported generator expression. |
| 6.4-divisibility | 2 | 4 | answer | `"'yes' if sum(int(c) for c in str(n)) % 3 == 0 and sum(int(c) for c in str(n)) % 9 != 0 else 'no'"` | `"'yes' if digit_sum % 3 == 0 and digit_sum % 9 != 0 else 'no'"` | Use the exact same digit sum and retain the original divisibility conditions. |
| 6.4-factors | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.4-factors | 1 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.4-factors | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.4-factors | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.4-lcm | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.4-lcm | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.13-classify-angles | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.13-classify-angles | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.13-classify-angles | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.13-classify-angles | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.13-measure-angles | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.13-measure-angles | 1 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.11-complex-perimeter | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.11-complex-perimeter | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.11-complex-perimeter | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.11-complex-perimeter | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.11-complex-perimeter | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.11-complex-perimeter | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.18-theoretical | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.18-theoretical | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.18-experimental | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.18-experimental | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.18-compare | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.18-compare | 1 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.18-compare | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.18-compare | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.5-improper-to-mixed | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.5-improper-to-mixed | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.5-mixed-to-improper | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.5-mixed-to-improper | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.5-compare-order | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.5-compare-order | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.8-multiply-decimal | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.8-multiply-decimal | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.8-divide-decimal | 3 | all | numbers.template_m | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.8-divide-decimal | 3 | 4 | slots.m | `{"min":0,"max":1}` | `"template_m"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-preserve-equality | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-preserve-equality | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-preserve-equality | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-preserve-equality | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-solve-one-step | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-solve-one-step | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-solve-one-step | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-solve-one-step | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-solve-one-step | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-solve-one-step | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-solve-one-step | 5 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-solve-one-step | 5 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-combine-like-terms | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-combine-like-terms | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-combine-like-terms | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-combine-like-terms | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-write-equation | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-write-equation | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-write-equation | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-write-equation | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-write-equation | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-write-equation | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.10-write-equation | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.10-write-equation | 4 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.12-triangle-area | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.12-triangle-area | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.12-triangle-area | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"decimal_places"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.12-parallelogram-area | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.12-parallelogram-area | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.12-parallelogram-area | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"decimal_places"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.12-trapezoid-area | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.12-trapezoid-area | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.12-trapezoid-area | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"decimal_places"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.12-missing-dimension | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.12-missing-dimension | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.15-classify-by-sides | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.15-classify-by-sides | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.15-classify-by-sides | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.15-classify-by-sides | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.15-classify-by-sides | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.15-classify-by-sides | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.15-classify-by-angles | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.15-classify-by-angles | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.15-classify-by-angles | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.15-classify-by-angles | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.16-plot-points | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.16-plot-points | 1 | 2 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.16-plot-points | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.16-plot-points | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.16-translate-point | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.16-translate-point | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.16-combine-transformations | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.16-combine-transformations | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.16-combine-transformations | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.16-combine-transformations | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.16-combine-transformations | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.16-combine-transformations | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.6-write-ratio | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.6-write-ratio | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.6-write-ratio | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.6-write-ratio | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.6-equivalent-ratios | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.6-equivalent-ratios | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.6-equivalent-ratios | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.6-equivalent-ratios | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.6-ratio-to-fraction | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.6-ratio-to-fraction | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.6-ratio-to-fraction | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.6-ratio-to-fraction | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-percent-meaning | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-percent-meaning | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-percent-meaning | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-percent-meaning | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-percent-of | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-percent-of | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-percent-of | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-percent-of | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-percent-of | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-percent-of | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-discount | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-discount | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-discount | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-discount | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-missing-whole | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-missing-whole | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-missing-whole | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-missing-whole | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.7-missing-whole | 4 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.7-missing-whole | 4 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.19-saving-plan | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.19-saving-plan | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.19-consumer-choice | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.19-consumer-choice | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.9-evaluate-rule | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.9-evaluate-rule | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.9-find-rule | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.9-find-rule | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.9-find-rule | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.9-find-rule | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.9-graph-relation | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.9-graph-relation | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.9-graph-relation | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.9-graph-relation | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.9-write-expression | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.9-write-expression | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.9-write-expression | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.9-write-expression | 2 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.9-write-expression | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.9-write-expression | 3 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.14-volume-cubes | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.14-volume-cubes | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.14-volume-cubes | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.14-volume-cubes | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.14-volume-prism | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"decimal_places"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.14-capacity-units | 2 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.14-capacity-units | 2 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.14-capacity-units | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.14-capacity-units | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.17-read-line-graph | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.17-read-line-graph | 1 | 4 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.17-read-line-graph | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.17-read-line-graph | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.17-make-line-graph | 1 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.17-make-line-graph | 1 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 6.17-make-line-graph | 3 | all | numbers.template_flip | `null` | `{"min":0,"max":1}` | Give the inline slot range a named domain without changing its bounds. |
| 6.17-make-line-graph | 3 | 3 | slots.flip | `{"min":0,"max":1}` | `"template_flip"` | Use the identical named numbers domain; preserve the slot name, distribution, meaning, and difficulty. |
| 7.4-decimal-to-fraction | 1 | 1 | answer | `"str(fr.numerator) + '/' + str(fr.denominator)"` | `"str(fr)"` | The exact Fraction already displays in lowest terms. No attribute access is needed. |
| 7.4-decimal-to-fraction | 1 | 2 | answer | `"str(fr.numerator) + '/' + str(fr.denominator)"` | `"str(fr)"` | The exact Fraction already displays in lowest terms. No attribute access is needed. |
| 7.4-decimal-to-fraction | 2 | 1 | answer | `"str(fr.numerator) + '/' + str(fr.denominator)"` | `"str(fr)"` | The exact Fraction already displays in lowest terms. No attribute access is needed. |
| 7.4-decimal-to-fraction | 2 | 2 | answer | `"str(fr.numerator) + '/' + str(fr.denominator)"` | `"str(fr)"` | The exact Fraction already displays in lowest terms. No attribute access is needed. |
| 7.4-decimal-to-fraction | 3 | 1 | answer | `"str(fr.numerator) + '/' + str(fr.denominator)"` | `"str(fr)"` | The exact Fraction already displays in lowest terms. No attribute access is needed. |
| 7.4-decimal-to-fraction | 3 | 2 | answer | `"str(fr.numerator) + '/' + str(fr.denominator)"` | `"str(fr)"` | The exact Fraction already displays in lowest terms. No attribute access is needed. |
| 7.13-sale-price | 3 | all | numbers.price.values | `[10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200]` | `[20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200]` | Prices start at 20 in this step; remove the out-of-range value 10. Applies to templates 1-4. |
| 7.13-total-cost | 1 | all | numbers.price.values | `[10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200]` | `[20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200]` | Prices start at 20 in this step; remove the out-of-range value 10. Applies to templates 1-4. |
| 7.13-total-cost | 2 | all | numbers.price.values | `[10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200]` | `[20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200]` | Prices start at 20 in this step; remove the out-of-range value 10. Applies to templates 1-4. |
| 7.13-total-cost | 3 | all | numbers.price.values | `[10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200]` | `[20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200]` | Prices start at 20 in this step; remove the out-of-range value 10. Applies to templates 1-4. |
| 8.6-graph-relation | 2 | 1 | derived | `{"y":"g * c","c":"c % 6 + 1"}` | `{"y":"g * c"}` | Keep the sampled c unchanged inside x = [-3, 4]. Derive y from that final c; preserve the existing shown-value rule. |
| 8.6-graph-relation | 2 | 1 | check | `null` | `"c >= 1 and y <= 30"` | Keep positive gaps for the existing wording and keep y in the step range [-30, 30]. |
| 8.6-graph-relation | 2 | 4 | derived | `{"y":"g * c","c":"c % 6 + 1","shown":"(c) if flip == 0 else (c + 1)"}` | `{"y":"g * c","shown":"(c) if flip == 0 else (c + 1)"}` | Keep the sampled c unchanged inside x = [-3, 4]. Derive y from that final c; preserve the existing shown-value rule. |
| 8.6-graph-relation | 2 | 4 | check | `null` | `"c >= 1 and y <= 30"` | Keep positive gaps for the existing wording and keep y in the step range [-30, 30]. |
