# Fact review: BC resource guides (2026-10-09)

Scope: the 7 grade guides (`src/content/resources/bc-grade-{1..7}-math-and-reading.tsx`), `bc-proficiency-scale.tsx` and `bc-fsa-grade-4-and-7.tsx`, on branch `site/resources-review-bc` (from `origin/site/resources`).

Method: each source was read as raw text, not as a summary. Curriculum pages: `curl` of the server-rendered HTML, then the Big Ideas and Content lists with their elaborations were taken out with a script. Ministry PDFs: `pdftotext`. Every curriculum claim was compared with the list for its own grade. Every practice answer was worked by hand.

Verdicts: **correct** = the source supports the claim as written. **fixed** = the claim was wrong, too weak or wrongly attributed, and the text now matches the source. **removed** = invented detail taken out.

## Source key

| Key | URL |
|---|---|
| M1-M7 | https://curriculum.gov.bc.ca/curriculum/mathematics/1 (to /7) |
| E1-E7 | https://curriculum.gov.bc.ca/curriculum/english-language-arts/1 (to /7) |
| FSA | https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment |
| FSA-BRO | https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/assessment/fsa/en-foundation-skills-assessment-for-parents-and-caregivers.pdf |
| FSA-SPEC | https://www2.gov.bc.ca/assets/gov/education/administration/kindergarten-to-grade-12/assessment/fsa_description_and_specs.pdf |
| FSA-SPECP | https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment/specifications |
| FSA-SAMP | https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment/fsa-samples |
| REP-ONE | https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/reporting/K-12-student-reporting-one-pager-for-parents-and-caregivers.pdf |
| REP-EDU | https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/reporting/k-12-reporting-educator-summary-guide.pdf |
| REP-PRES | https://www2.gov.bc.ca/assets/gov/education/administration/kindergarten-to-grade-12/k-12-student-reporting-policy-presentation.pdf |
| REP-GUIDE | https://www2.gov.bc.ca/assets/download/A5CA90B9C45D40B4999109A7400A1A39 (Communicating Student Learning Guidelines, August 2023) |
| DESIGN | `DESIGN.md` "Source constraints" (allowed Unica facts) |

## Findings

| # | Page | Claim | Verdict | Source |
|---|---|---|---|---|
| 1 | Grade 1 | "Grade 1 math is built around four big ideas" (it listed four) | fixed: five big ideas (number, computational fluency, patterning, geometry and measurement, data and probability) | M1 |
| 2 | Grade 1 | Numbers to 20; adding and subtracting to 20 | correct | M1 |
| 3 | Grade 1 | Number row: count on and back, skip-count by 2s and 5s, compare and order to 20, 10 and some more, ways to make 10 | correct | M1 |
| 4 | Grade 1 | Strategies: counting on, making 10, doubles; adding and subtracting are related | correct | M1 |
| 5 | Grade 1 | Equality and inequality written with = and ≠ | correct | M1 |
| 6 | Grade 1 | Repeating patterns; measuring with non-standard units (cubes, paper clips) | correct | M1 |
| 7 | Grade 1 | Position words "above and beside" | fixed: the elaboration says "up and down, in and out" | M1 |
| 8 | Grade 1 | "Simple graphs" (table and FAQ) | fixed: "concrete graphs" made with real objects | M1 |
| 9 | Grade 1 | Coins (nickel to toonie) and role-play buying and selling | correct | M1 |
| 10 | Grade 1 | "The BC curriculum groups Grade 1 math content into..." | fixed: the content list is flat; now "The Grade 1 math content list covers..." | M1 |
| 11 | Grade 1 | ELA: sounds in words, concepts of print, reading strategies, story elements, writing conventions, oral language | correct | E1 |
| 12 | Grade 1 | Tip: the curriculum asks for more than one strategy | correct | M1 |
| 13 | Grade 1 | 8 practice questions and answers | correct | M1 |
| 14 | Grade 1 | Unica mention | correct | DESIGN |
| 15 | Grade 2 | Five big ideas | correct | M2 |
| 16 | Grade 2 | Number row: skip-count 2s, 5s, 10s from any start; compare and order to 100; tens and ones; even and odd | correct | M2 |
| 17 | Grade 2 | Facts to 20 (making 10, doubles, adding on) and adding and subtracting to 100 (friendly numbers, multiples of 10, number lines, hundred charts) | correct | M2 |
| 18 | Grade 2 | Repeating (core) and increasing patterns 0-100; centimetres and metres; shapes by two attributes; 2D in 3D | correct | M2 |
| 19 | Grade 2 | Likelihood words; coins to 100 cents, wants and needs, spending and saving | correct | M2 |
| 20 | Grade 2 | "Same reading strategies as Grade 1, with more fluency and longer texts" | removed "longer texts" (not in source); kept the true part (identical strategy list) and added "read fluently at grade level" (competency) | E1, E2 |
| 21 | Grade 2 | "Text features: headings, a table of contents and diagrams in non-fiction" | fixed: those are listed as vocabulary about texts, not text features; text features are layout (bold, underline); "non-fiction" removed | E2 |
| 22 | Grade 2 | Intro and FAQ: "starts to use headings and other features of non-fiction books" | fixed to match row 21 | E2 |
| 23 | Grade 2 | Story parts, word families, compound sentences, considering audience, oral strategies | correct | E2 |
| 24 | Grade 2 | Multiplication is not in Grade 2; it starts in Grade 3 | correct (Grade 2 mentions only "multiples of 10") | M2, M3 |
| 25 | Grade 2 | 8 practice questions and answers | correct | M2 |
| 26 | Grade 2 | Unica mention "15 to 20 minutes a day" | fixed: added "5 days a week" and "follow the BC curriculum" so the line is not read as daily | DESIGN |
| 27 | Grade 3 | Five big ideas; numbers to 1000; fractions as numbers | correct | M3 |
| 28 | Grade 3 | Multiplication and division concepts; "Memorization of facts is not intended" | correct | M3 |
| 29 | Grade 3 | "Telling time is not expected at this level" | correct | M3 |
| 30 | Grade 3 | Most students recall addition facts to 20 by the end of Grade 3 | correct | M3 |
| 31 | Grade 3 | Standard units (cm, m, km, mL, L, g, kg); perimeter and area as concepts | correct | M3 |
| 32 | Grade 3 | 3D objects; bar graphs, pictographs; money to 100 dollars, ways to pay and earn | correct | M3 |
| 33 | Grade 3 | One-step equation n + 15 = 20; doubling as a pattern rule | correct | M3 |
| 34 | Grade 3 | Fluent reading with phrasing and attention to punctuation | correct (competency elaboration) | E3 |
| 35 | Grade 3 | Story elements (conflict, theme); text features (headings, diagrams, columns, sidebars); devices | correct | E3 |
| 36 | Grade 3 | Writing forms (letters, poems, multi-page stories, simple non-fiction) introduced as "The content list includes" | fixed: these come from the competencies; now "The content and competencies include" | E3 |
| 37 | Grade 3 | "Word roots and endings" under Conventions | fixed: "word roots, prefixes and suffixes" (competency) and "word families" (content) | E3 |
| 38 | Grade 3 | 8 practice questions and answers | correct | M3 |
| 39 | Grade 4 | Intro: "starts to multiply and divide with confidence" | removed "with confidence"; now states the standard (two- or three-digit by one-digit) | M4 |
| 40 | Grade 4 | "The BC curriculum lists the same five big ideas for each grade" | fixed: the five areas repeat, the big ideas change by grade | M1-M7 |
| 41 | Grade 4 | Math table: numbers to 10 000, decimals to hundredths, fractions with common denominators, multiply and divide, decimals, patterns, one-step equations, time (12- and 24-hour), polygons, perimeter, line symmetry, many-to-one graphs, probability, money to 100 dollars | correct | M4 |
| 42 | Grade 4 | Recall 2s, 5s and 10s by the end of Grade 4; memorization not intended | correct | M4 |
| 43 | Grade 4 | ELA list (forms and genres, literary elements and devices, reading strategies, information text features, paragraphs, tenses, punctuation, Canadian spelling, roots and affixes) | correct (content plus competencies, as the page says) | E4 |
| 44 | Grade 4 | FSA: Grades 4 and 7; window September 28 to November 6, 2026; online questions and a paper booklet | correct | FSA |
| 45 | Grade 4 | Individual report with proficiency levels and strength-based language | correct | FSA |
| 46 | Grade 4 | FSA levels and report-card effect not stated | fixed: added "Emerging, On Track and Extending" and "does not affect student marks or report cards" with the brochure as source 4 | FSA-BRO |
| 47 | Grade 4 | 8 practice questions and answers | correct | M4 |
| 48 | Grade 4 | Unica mention | correct | DESIGN |
| 49 | Grade 5 | "Lists five big ideas for each grade" | fixed (same wording as row 40) | M5 |
| 50 | Grade 5 | Intro: "Your child also meets area" (area is already a Grade 3 concept) | fixed: "measures the area of squares and rectangles" | M3, M5 |
| 51 | Grade 5 | Math table: numbers to 1 000 000, decimals to thousandths, equivalent fractions, multiply and divide to three digits with remainders, variables (4 + X = 15), area and perimeter, elapsed time, prisms and pyramids, single transformations, double bar graphs, probability as fractions, money to $1000 and budgets | correct | M5 |
| 52 | Grade 5 | "Many facts recalled by the end of the year"; memorization not intended | correct | M5 |
| 53 | Grade 5 | ELA list, with perspective/point of view new in Grade 5 | correct (not in E4) | E4, E5 |
| 54 | Grade 5 | No FSA in Grade 5 | correct | FSA |
| 55 | Grade 5 | 8 practice questions and answers | correct | M5 |
| 56 | Grade 6 | "Lists five big ideas for each grade" | fixed (same wording as row 40) | M6 |
| 57 | Grade 6 | Math table: thousandths to billions, factors and multiples, improper fractions and mixed numbers, ratios, whole-number percents and discounts, decimal multiply and divide (0.125 x 3, 7.2 ÷ 9), order of operations with brackets, one-step equations, area of triangles, parallelograms, trapezoids, angles, volume, triangles, Cartesian plane, line graphs, probability, budgeting | correct | M6 |
| 58 | Grade 6 | Mixed numbers, ratios and percents are new in Grade 6 | correct (absent from M5) | M5, M6 |
| 59 | Grade 6 | ELA list (persuasion, paragraph unity, run-ons, language varieties, presentation) | correct | E6 |
| 60 | Grade 6 | No FSA in Grade 6 | correct | FSA |
| 61 | Grade 6 | 8 practice questions and answers | correct | M6 |
| 62 | Grade 7 | "Lists five big ideas for each grade" | fixed (same wording as row 40) | M7 |
| 63 | Grade 7 | Math table: integers, decimals, relationships (1/2 = 0.5 = 50%), linear relations in four quadrants, two-step equations (3x + 4 = 16), circles, volume of prisms and cylinders, Cartesian coordinates, tessellations, circle graphs, two independent events, sales tax and tips | correct | M7 |
| 64 | Grade 7 | Integers are new in Grade 7 | correct (absent from M6) | M6, M7 |
| 65 | Grade 7 | ELA list (argument, mixed sentence types, language varieties) | correct | E7 |
| 66 | Grade 7 | FSA facts (grades, window, booklet, report) | correct | FSA |
| 67 | Grade 7 | FSA levels and report-card effect not stated | fixed: same addition as row 46 | FSA-BRO |
| 68 | Grade 7 | 8 practice questions and answers | correct | M7 |
| 69 | FSA | All Grade 4 and 7 students; literacy and numeracy; information for parents to ministry | correct | FSA |
| 70 | FSA | 2026-27 window September 28 to November 6, 2026; scoring deadline December 4, 2026 | correct | FSA |
| 71 | FSA | Three levels Emerging, On Track, Extending; overall score placed in one level; not on transcripts; formative use | correct | FSA-SPEC |
| 72 | FSA | "This is a different scale from the four-level proficiency scale on K-9 report cards" (FAQ and callout "Two scales, not one") | fixed: the brochure says teachers mark the FSA with the same provincial proficiency scale, with Developing and Proficient joined into "On Track"; callout is now "Same scale, three levels" | FSA-BRO |
| 73 | FSA | "The ministry pages we read do not say the FSA changes report card levels" | fixed: the brochure says the FSA "does not impact student marks or report cards" and is "not a high-stakes assessment" | FSA-BRO |
| 74 | FSA | FSA complements teacher assessment; one snapshot | correct | FSA-SPEC |
| 75 | FSA | Literacy reads texts and writes; numeracy solves real-life problems; links to the curriculum | correct | FSA-SPEC, FSA-SPECP |
| 76 | FSA | Teacher-led collaboration activity, two themes, choose one; booklet with 3 literacy and 3 numeracy written answers; online 30 + 30 + 2 self-reflection | correct | FSA-SPEC, FSA-SAMP |
| 77 | FSA | Grade 4 FSA reflects end of Grade 3; Grade 7 reflects end of Grade 6 | correct | FSA-SPECP |
| 78 | FSA | Student reports to schools usually by November | correct | FSA-SPEC |
| 79 | FSA | Sample page lists collaboration activity, online questions, printable questions, response booklet, possible solutions | correct | FSA-SAMP |
| 80 | FSA | Collaboration activity is relaxed and reduces anxiety | correct | FSA-SPEC |
| 81 | FSA | "The pages we read do not ask families to prepare in a special way" | fixed: the brochure says the child does not need to prepare, and that talking about it at home can help a nervous child | FSA-BRO |
| 82 | FSA | (new) Each part takes one hour or less and can be spread over days or weeks; booklet comes back with the report | fixed (added) | FSA-BRO, FSA |
| 83 | FSA | Ministry does not support ranking schools on FSA results | correct | FSA-SPEC |
| 84 | FSA | Unica mention, "not an FSA practice test" | correct | DESIGN |
| 85 | Proficiency | K-9 uses four levels; no letter grades on K-9 report cards | correct | REP-ONE |
| 86 | Proficiency | Proficient is the goal; Extending is not the standard for all | correct | REP-PRES |
| 87 | Proficiency | Grades 10-12 keep letter grades and percentages, for post-secondary entry | correct | REP-ONE, REP-EDU |
| 88 | Proficiency | All districts use the scale for K-9 | correct | REP-EDU |
| 89 | Proficiency | Emerging, Developing, Proficient meanings (not failing; growing consistency; consistently or most of the time; not perfect) | correct | REP-PRES, REP-ONE |
| 90 | Proficiency | Extending "does not need more work or work from a higher grade" | fixed: the source says "does not necessarily require" | REP-PRES |
| 91 | Proficiency | Handing in all work does not make a child Extending | correct | REP-PRES |
| 92 | Proficiency | Supports or an IEP do not mean automatic Emerging or Developing | correct | REP-EDU |
| 93 | Proficiency | IE means insufficient evidence and is temporary | correct; added that W and SG can appear in any grade | REP-PRES, REP-EDU |
| 94 | Proficiency | At least 5 communications: 2 informal, 2 written Learning Updates, 1 Summary of Learning | correct | REP-EDU |
| 95 | Proficiency | Summary of Learning is what parents know as the final report card | correct | REP-EDU |
| 96 | Proficiency | Written updates include a scale level per area, descriptive feedback, where to find self-reflection and goal setting, attendance | correct | REP-EDU, REP-PRES |
| 97 | Proficiency | Dates and format set locally; printed or digital | correct | REP-EDU |
| 98 | Proficiency | Letter grades and percentages set in the Provincial Letter Grades Order; graduation status update on the last report in 10-12 | correct | REP-PRES, REP-EDU |
| 99 | Proficiency | "The ministry documents we read give no official conversion" (stated as an absence, in key facts, FAQ and body) | fixed: now a positive statement. The guidelines give a percentage table only for 10-12 letter grades (for example B = 73-85), and for K-9 describe placement by professional judgment of recent evidence, saying averaging marks does not give an accurate picture | REP-GUIDE |
| 100 | Proficiency | (new) The FSA uses the same scale with Developing and Proficient joined into On Track | fixed (added for consistency with the FSA page) | FSA-BRO |
| 101 | Proficiency | Unica mention (15-20 minutes a day, 5 days a week) | correct | DESIGN |
| 102 | All 9 | meta.description is 155 characters or fewer and contains the main phrase | correct (134-155 characters) | n/a |
| 103 | All 9 | Every `<Cite n>` points to an existing source and every source is cited | correct after edits (no unused or out-of-range sources) | n/a |
| 104 | All 9 | No em-dash; 4-5 FAQs per page; related slugs exist | correct | n/a |

## Checks run

- `npx eslint src`: 0 errors (1 warning in `src/ds/blocks.tsx`, not in scope).
- `npm run build`: passes, all 14 resource paths prerendered.
- `PORT=3121 npm run dev`, then all 9 pages at 375 x 900 and 1440 x 900: HTTP 200, `scrollWidth == clientWidth` on all 18 views. Screenshots of Grade 4, the proficiency guide and the FSA guide at both widths look correct.

## For a human to decide

1. The FSA guide title says "how to prepare", but the ministry brochure says the child does not need to prepare. The body now says this. The title may want a softer word.
2. Three pages give general study advice with no source ("Ten minutes of fun beats thirty minutes of tears", "Short and regular beats long and rare", "Short, steady practice works better than one long session"). These are not claims about Unica, but they are claims about what works. Keep, soften, or source them.
3. Source REP-GUIDE is a gov.bc.ca download link with a hash ID. It works today, but it can change. No stable alternative URL was found.
4. Site-wide, not in these files: the cookie banner covers the key facts on first load at both widths, and the closing "See where your child is" panel stays faded in a headless browser (scroll animation).
