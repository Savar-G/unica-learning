# Remaining author changes

Audit: 7,321 templates, 30 seeds each. **218,441 fills pass; 1,189 fail across 41 templates.** Every decimal range has a value on its declared or inferred grid. No check exhausts the 100-attempt limit. Source files are unchanged.

Template numbers below are 1-based positions in each step's `templates` array.

- **K11-coin-attributes, steps 1-3, all templates:** resolve the page budget. Step pages total 3; the skill allows 2. Savar must decide which source value changes. Import stays blocked.
- **7.13-sale-price, step 3, templates 1-4; 7.13-total-cost, steps 1-3, templates 1-4:** `numbers.price.min` is 20 but `values` includes 10. Remove 10 or revise the minimum to the intended scope. These are four real domain conflicts, affecting 16 templates.
- **8.6-graph-relation, step 2, templates 1 and 4:** sample `c` in its intended positive gap-count range. Calculate `y` after the final `c` assignment. Currently `y = g * c` runs before `c = c % 6 + 1`; the replacement can produce 5 or 6 outside `x = [-3, 4]` and leaves `y` based on the old value. This fails 19 of the 60 seeded trials.
- **6.4-divisibility, step 2, templates 1-4:** replace `sum(int(c) for c in str(n))`. Generator expressions remain unsupported. Since `n` is 100-9,999, use `n % 10 + (n // 10) % 10 + (n // 100) % 10 + (n // 1000) % 10` for the digit sum. Keep each template's existing divisibility test. No new helper is needed.
- **4.13-name-polygons, steps 1-3, templates 1-4:** replace dictionary lookups with conditional expressions over the same side-count/name pairs. Dictionaries remain unsupported.
- **7.4-decimal-to-fraction, steps 1-3, templates 1-2:** replace Fraction property reads such as `fr.numerator` and `fr.denominator` with `str(fr)`. The existing Fraction display is reduced. Attribute access remains unsupported.
- **4.1-multiples, step 3, template 1:** replace `[:t]` with conditional expressions selecting explicit lists for each allowed `t`. Slices remain unsupported.
- **Import-only rule, 332 slot entries:** move each inline slot range into the step's `numbers` object and refer to that key from `slots`. The filler can sample inline ranges, but the requested import rule rejects them. Every skill, step, template, and slot is listed under `importProblems` in [the full report](template-audit.json).
