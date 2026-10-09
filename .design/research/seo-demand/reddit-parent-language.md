# Parent language research - status: INCOMPLETE (Reddit not reachable)

Date: 2026-10-09. Scope after coordinator change: British Columbia only.

## What failed (verified)
- reddit.com JSON endpoints (www and old): HTTP 403 block page for curl with a research User-Agent.
- arctic-shift mirror: HTTP 522.
- pullpush.io mirror: returned a few results for one unfiltered query, then HTTP 429 with the message "does not provide free scraping resources for agents". I stopped. I did not work around it.
- WebSearch (extended) returned zero Reddit threads for three BC/Canada queries.
- Result: ZERO verbatim parent quotes, ZERO thread counts, ZERO comment counts. Nothing below is Reddit-sourced. Do not rank pages from this file by demand.

## BC-sourced facts (official/ministry or BC school sources, via WebSearch snippets; not parent speech)
- FSA is a Grade 4 and 7 assessment, marked by teachers on the provincial proficiency scale; levels Emerging / On Track / Extending; not on transcripts, meant to be formative. Sources: https://www.sd83.bc.ca/fsa-information , https://www2.gov.bc.ca/assets/gov/education/administration/kindergarten-to-grade-12/assessment/fsa_description_and_specs.pdf
- K-9 report cards use Emerging / Developing / Proficient / Extending, not letter grades. Sources: https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/reporting/K-12-student-reporting-one-pager-for-parents-and-caregivers.pdf , https://bcparent.ca/report-cards-are-coming-and-they-look-different/
- A third-party tutoring-franchise blog says Abbotsford 2024-25 literacy and numeracy rates fell among Grade 4 and 7 students (vendor source, unverified): https://bestbrains.com/ca-en/abbotsford/article/what-does-bc-fsa-test-actually-measure
- Implication (my inference, not parent data): "what does Emerging / Developing mean on my child's report card" and "FSA results what do they mean" are plausible BC-specific query themes. Validate with a keyword tool before building.

## Price points (NOT BC; no BC price found)
- Kumon: Ontario CBC (older) ~CAD 50 registration + CAD 100-150/subject/month: https://www.cbc.ca/news/canada/toronto/ontario-math-curriculum-private-services-1.4445472
- Kumon US 2026: USD 150-200/subject/month plus fees: https://www.cuemath.com/blog/kumon-cost/ , https://tutors.com/costs/kumon-cost
- Mathnasium US estimates: USD 250-450/month: https://tutors.com/costs/mathnasium-cost
- Oxford Learning, Toronto area: CAD 385-420/month for 2 h/week (from search summary of the CBC piece, not read in full).
- Tutor hourly, Canada generic: CAD 15-100/h (Superprof, vendor): https://www.superprof.ca/blog/maths-tutor-prices/
- Pagewise at CAD 59/month is far below every figure above; but confirm BC franchise prices by calling or reading Vancouver/Surrey centre sites.

## Complaints about learning centres (vendor blogs, not parents; US-leaning)
- Kumon: repetitive, same sheet repeated, drills speed over concept. Sources: https://www.monstermath.app/blog/kumon-alternatives-7-better-options , https://brighterly.com/blog/kumon-alternatives/ . These are competitors' marketing; treat as hypotheses.

## Search-style phrases (hypotheses, unvalidated)
- "Kumon alternatives" / "Kumon alternative Canada"
- "is Kumon worth it"
- "how much does a math tutor cost in Vancouver"
- "what does emerging mean on BC report card"
- "FSA grade 4 results what do they mean"
- "grade 3 math workbook BC curriculum"

## To finish the task
1. A human or authenticated tool must pull Reddit: r/BCparents, r/vancouver, r/britishcolumbia, r/surrey, r/burnaby, r/VictoriaBC, r/kelowna, r/Coquitlam, r/richmondbc. Options: Reddit OAuth app credentials, or a logged-in browser session (Aside) with the user present.
2. Or accept proxy sources: Google Autocomplete / People Also Ask and a keyword tool (Ahrefs, Semrush, GSC) for real volumes.
