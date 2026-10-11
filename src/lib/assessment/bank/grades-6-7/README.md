# Grades 6-7 bank

Ticket #76 implements the grade 6-7 band from spec #54. The bank includes BC levels 5-8. Each province's tag controls the level used by the session. Each stage contains 21 questions. Each complete route contains 42 questions and exactly 10 required work questions.

The bank uses `TaggedTemplate` and `bank/kit.ts`. Tests use the public assessment interface. `helpers.ts` supplies speech for the displayed choices through the public `say` field. The question speech does not include the choices. Negative answers use choices because the number pad has no minus key. Figures are described in words. No figure is made from glyphs.

## Sources and limits

The local content source is `.design/research/online-assessment/bc-math-curriculum-map.md`. Its BC standards use the official content sequence. Standards and tags are content placements, not proof of a child's mastery.

- BC: https://curriculum.gov.bc.ca/curriculum/mathematics/5/core through https://curriculum.gov.bc.ca/curriculum/mathematics/8/core . BC fraction operations and theoretical two-event probability use grade 8. Two templates retain their original `g67-7-` IDs after correction to BC grade 8: `count-outcomes` and `dice-sum`.
- Ontario circle circumference, diameter and area use grade 7 E2.3-E2.5: https://www.dcp.edu.gov.on.ca/en/curriculum/elementary-mathematics/grades/g7-math/strand-e/e2 . The map places whole-number percent in grade 5 and unlike-denominator fraction addition in grade 6.
- Alberta: https://www.alberta.ca/curriculum-mathematics . The current grade 5 summary includes writing and evaluating algebraic expressions. Grade 7 remains a conservative tag for the abstract substitution and decreasing general-term templates from BC grade 6. The exact new K-6 placement for triangle, parallelogram and trapezoid area remains uncertain; use grade 7. The older WNCP K-6 sequence is not current proof for Alberta.
- Saskatchewan: https://curriculum.gov.sk.ca/CurriculumOutcomeContent?id=150 . P6.3 includes expressions and equations with variables. The exact indicators for abstract substitution and decreasing general-term expressions remain uncertain; use grade 7.
- Manitoba: https://www.edu.gov.mb.ca/k12/framework/english/math/math_gr6.html . 6.PR.3 includes equations with letter variables. The exact placement for abstract substitution and decreasing general-term expressions remains uncertain; use grade 7.

Other non-BC tags follow the map's cross-province comparison and the conservative WNCP sequence described in `index.ts`. They have not all been verified against individual current outcomes. Level 8 templates use grade 8 for all five provinces where earlier teaching is uncertain. These tags can exclude content taught earlier in another province. The checker must preserve these uncertainties as review flags. A green structural test does not establish curriculum validity.

The hundredths-only addition template has AB and MB grade 4 tags. The supplied current Alberta notes place decimal addition in grade 4. Manitoba 4.N.11 explicitly includes addition and subtraction to hundredths: https://www.edu.gov.mb.ca/k12/framework/english/math/math_gr4.html . The BC tag remains grade 5. A province tag can be earlier than the BC levels 5-8 covered by this bank. Province routes use that tag and can exclude the template from a grade 6 down form. The public route tests still require 42 questions and 10 suitable required-work questions after this correction. The Alberta page was not available for a new detailed outcome read during this correction; its supplied source-note limitation remains.

## Verification

The public-interface tests check 400 seeds per template, 100 speech samples per template, known worked examples, and 60 session seeds for each grade and province. Route checks require suitable work questions, exact required-work counts, all four reported areas, and 42 distinct visible questions. The offline checker is a separate required gate. Use its documented Codex provider after ticket #75 merges. Product AI stays off.
