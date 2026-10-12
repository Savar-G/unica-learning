# Grades 6-7 bank

Ticket #76 implements the grade 6-7 band from spec #54. The bank includes BC levels 5-8. Each province's tag controls the level used by the session. Each stage contains 21 questions. Each complete route contains 42 questions and exactly 10 required work questions.

The bank uses `TaggedTemplate` and `bank/kit.ts`. Tests use the public assessment interface. `helpers.ts` supplies speech for the displayed choices through the public `say` field. The question speech does not include the choices. Negative answers use choices because the number pad has no minus key. Figures are described in words. No figure is made from glyphs.

## Sources and limits

The local content source is `.design/research/online-assessment/bc-math-curriculum-map.md`. Its BC standards use the official content sequence. Standards and tags are content placements, not proof of a child's mastery.

- BC: https://curriculum.gov.bc.ca/curriculum/mathematics/5/core through https://curriculum.gov.bc.ca/curriculum/mathematics/8/core . BC fraction operations and theoretical two-event probability use grade 8. Two templates retain their original `g67-7-` IDs after correction to BC grade 8: `count-outcomes` and `dice-sum`. The arithmetic-only `g67-8-expression-story` retains its ID after correction to BC grade 6, standard 6.3 and the number report area. It does not require algebra. The Ontario whole-number `combine-expression` task uses grade 5; the other tags remain later where the exact outcome is uncertain.
- Ontario circle circumference, diameter and area use grade 7 E2.3-E2.5: https://www.dcp.edu.gov.on.ca/en/curriculum/elementary-mathematics/grades/g7-math/strand-e/e2 . The map places whole-number percent in grade 5 and unlike-denominator fraction addition in grade 6.
- Alberta: grades K-6 use the current program (https://curriculum.learnalberta.ca/curriculum/en/gfc/MAT, outcome ids such as MAT5-OI2-GQ1-LO1-KO2-SP). Grades 7-8 use the 2016 K-9 program of studies, which is still current for grades 7-9 (the 7-9 renewal is a draft). The older WNCP K-6 sequence is not current proof for Alberta.
- Saskatchewan: https://curriculum.gov.sk.ca/CurriculumOutcomeContent?id=145 to 152 (grades 1-8).
- Manitoba: https://www.edu.gov.mb.ca/k12/framework/english/math/math_gr1.html to math_gr8.html.

## Acceptance tags (#75, #76)

The acceptance work for #75 and #76 checked every checker fail and every review flag against these current official sources, saved and hashed on 2026-10-11. A tag is the earliest grade whose outcome explicitly covers the whole task: the skill, the number range and the notation. Where an earlier outcome covers only part of the task, the later tag stays. Where no outcome names the task after a recorded search, the tag stays and the flag is marked unverified. The comment beside each changed tag cites its outcome, the public tests pin the changed tags ("primary-source corrections"), and `scripts/template-check/triage.md` lists every flag with its disposition and quote. Many tags moved earlier than the first conservative WNCP-based tags, mostly for Alberta, whose current K-6 program teaches equations, substitution, ratio, percent and coordinates before BC grade 7. One result: the Alberta level 7 pool is smaller, so Alberta grade 7 siblings share more templates than in other provinces.

A green structural test does not establish curriculum validity. The checker review flags remain separate from structural test results.

The hundredths-only addition template has AB and MB grade 4 tags. The supplied current Alberta notes place decimal addition in grade 4. Manitoba 4.N.11 explicitly includes addition and subtraction to hundredths: https://www.edu.gov.mb.ca/k12/framework/english/math/math_gr4.html . The BC tag remains grade 5. A province tag can be earlier than the BC levels 5-8 covered by this bank. Province routes use that tag and can exclude the template from a grade 6 down form. The public route tests still require 42 questions and 10 suitable required-work questions after this correction. The Alberta page was not available for a new detailed outcome read during this correction; its supplied source-note limitation remains.

The integrated source also uses Ontario grade 2 for simple missing addition/subtraction quantities and equivalent balances within 100. Ontario grade 4 covers constant-step pattern extension, elapsed time, rectangle area and missing dimensions, and first-quadrant points and translations. Ontario grade 5 covers evaluation of whole-number expressions and one-step equations within 100. Sources and printed-page locations are in `scripts/template-check/curriculum-notes.md`, taken from the official 2020 curriculum, January 2021 edition. Saskatchewan N4.7 supports the simple fraction/decimal conversions; Manitoba grade 4 supports those relationships and rectangle area. Saskatchewan SS3.5 supports polygon perimeter with every side supplied. Manitoba 3.SS.5 explicitly includes perimeter of regular and irregular shapes: https://www.edu.gov.mb.ca/k12/framework/english/math/math_gr3.html . The L-shaped problem gives every side length and uses grade 3 in Alberta, Saskatchewan, Manitoba and Ontario (ON3 E2.1, perimeter of polygons).

## Verification

The public-interface tests check 400 seeds per template, 100 speech samples per template, known worked examples, and 60 session seeds for each grade and province. Route checks require suitable work questions, exact required-work counts, all four reported areas, and 42 distinct visible questions. The offline checker is a separate required gate. Use its documented Codex provider. Review flags and failures remain separate from structural test results. Product AI stays off.
