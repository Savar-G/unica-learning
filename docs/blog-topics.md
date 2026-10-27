# Blog topic queue

The weekly routine (`docs/blog-automation.md`) takes the first `todo` row from the top. Research behind this list:
`.design/research/blog-seo-2026-10-27.md` (Google autocomplete for Canada, SERP checks, BC school calendar) and
`.design/research/seo-demand/`. Autocomplete shows that parents search a phrase; it does not give volume.

## Rules

- One post per week (Sunday). Quality and real BC facts beat volume on a new site.
- Do not target the main query of an existing guide or post. Link to it instead. Guides: `/resources/bc-grade-1-math-and-reading`
  to `-7-`, `bc-proficiency-scale`, `bc-fsa-grade-4-and-7`, `tutor-cost-bc`, `kumon-cost-bc`, `is-kumon-worth-it`,
  `kumon-alternatives`, `kumon-vs-mathnasium`; also `/compare`.
- Competitor names follow D-074 and D-152 (cited facts from the provider's own pages, dated, no disparagement, no outcome claims).
- Prices change: re-check every price on the provider's page on the day you write. If a provider prints no price, say so.
- "Season" lists the months when the row may be picked (the month of the run or the next month must be in it). "any" means any month.
- Status values: `todo`, `done <date>` (with the post path), `skip (<reason>)`.

## Queue

| # | Status | Primary keyword (verbatim search) | Working title | Category | Season | Link to |
|---|---|---|---|---|---|---|
| 1 | done 2026-10-27 `/blog/mathnasium-cost-bc` | mathnasium cost canada | How much does Mathnasium cost in BC? | Comparing options | any | kumon-vs-mathnasium, tutor-cost-bc |
| 2 | done 2026-10-27 `/blog/sylvan-vs-kumon` | sylvan learning vs kumon | Sylvan vs Kumon in BC | Comparing options | any | kumon-cost-bc, kumon-alternatives |
| 3 | done 2026-10-27 `/blog/emerging-in-math-report-card` | what does emerging mean on report card | My child got "Emerging" in math: what to do before the next report card | School in BC | Oct, Nov, Dec, Jan, Feb, Mar, May, Jun | bc-proficiency-scale, grade guides |
| 4 | todo | is spirit of math worth it | Is Spirit of Math worth it? A guide for BC parents | Comparing options | any | kumon-alternatives, /compare |
| 5 | todo | oxford learning cost per month | Oxford Learning cost per month in BC | Comparing options | any | tutor-cost-bc, kumon-alternatives |
| 6 | todo | is mathnasium worth it | Is Mathnasium worth it? What to check first | Comparing options | any | /blog/mathnasium-cost-bc, kumon-vs-mathnasium |
| 7 | todo | does my child need a tutor | Does my child need a tutor, a learning centre or practice at home? | Math at home | any | bc-proficiency-scale, tutor-cost-bc, /compare |
| 8 | todo | sylvan learning cost per month | Sylvan Learning cost in BC: Surrey, Vancouver, Victoria | Comparing options | any | /blog/sylvan-vs-kumon, tutor-cost-bc |
| 9 | todo | is tutoring tax deductible canada | Is tutoring tax deductible in Canada? What counts for a math program | Comparing options | Dec, Jan, Feb, Mar, Apr | tutor-cost-bc, kumon-cost-bc |
| 10 | todo | grade 3 math workbook canada | Math workbooks for BC kids, grade by grade: how to choose one | Math at home | any | grade guides |
| 11 | todo | oxford learning vs kumon | Oxford Learning vs Kumon: how they differ and what each costs in BC | Comparing options | any | kumon-cost-bc, is-kumon-worth-it |
| 12 | todo | free math assessment to determine grade level | How to find out what grade level your child is working at in math | Math at home | any | bc-proficiency-scale, /sample-report |
| 13 | todo | sylvan learning vs mathnasium | Mathnasium vs Sylvan: math-only centre or full tutoring centre? | Comparing options | any | /blog/mathnasium-cost-bc, /blog/sylvan-vs-kumon |
| 14 | todo | mathnasium alternatives | Mathnasium alternatives in BC | Comparing options | any | kumon-alternatives, /compare |
| 15 | todo | how to help my child learn math facts | When should my child know their times tables? What BC expects | Math at home | Jan, Feb, Mar, Aug, Sep, Oct | bc-grade-3-, bc-grade-4- guides |
| 16 | todo | mathnasium vs private tutor | Mathnasium vs a private tutor in BC | Comparing options | any | tutor-cost-bc, /compare |
| 17 | todo | mathnasium vs spirit of math | Mathnasium vs Spirit of Math vs Kumon: which child each one suits | Comparing options | any | kumon-vs-mathnasium |
| 18 | todo | my child is struggling with 3rd grade math | My child is struggling with grade 3 math: where it breaks and what to do | Math at home | any | bc-grade-3-math-and-reading |
| 19 | todo | kid crying over math homework | My child cries over math homework: what to do tonight | Math at home | any | bc-proficiency-scale |
| 20 | todo | parent teacher conference questions | Parent-teacher conference: math questions for BC parents | School in BC | Sep, Oct, Nov, Jan, Feb | bc-proficiency-scale |
| 21 | todo | summer math for 3rd grade | Summer math in BC: keep skills up without a camp | Math at home | Apr, May, Jun, Jul | grade guides |
| 22 | todo | why is math taught differently now | Why is math taught differently now? A BC parent's guide | School in BC | any | grade guides |
| 23 | todo | is ixl math worth it | Is IXL worth it? IXL and the BC curriculum | Comparing options | any | /compare |
| 24 | todo | prodigy math membership | Is a Prodigy Math membership worth it? | Comparing options | any | /compare |
| 25 | todo | eye level vs kumon | Eye Level vs Kumon, and what Eye Level costs in Canada | Comparing options | any | kumon-alternatives |
| 26 | todo | jump math bc | JUMP Math vs Singapore Math for a BC child | Math at home | any | kumon-alternatives |
| 27 | todo | homeschool curriculum bc canada | Homeschool math in BC: what to use and how to follow the curriculum | Math at home | Jun, Jul, Aug, Sep | grade guides |
| 28 | todo | cuemath canada | Cuemath or Thinkster in Canada: online tutoring or practice on paper? | Comparing options | any | /compare |

Re-run row 3 (with a new slug and angle, for example the second or final report card) in each report card window.

## Finding new topics

When the queue has no `todo` row left, or a row is skipped:

1. Pull Google autocomplete for Canada for 5-10 seeds near the queue's best rows:
   `curl -s 'https://suggestqueries.google.com/complete/search?client=firefox&gl=ca&hl=en&q=<seed>'`.
   Seeds: a competitor name plus `cost`, `vs`, `worth it`, `alternatives`; a grade plus `math`; a parent problem ("my child", "how to help my child").
2. Search the best 3 phrases on the web. Keep a phrase only if the top results are small sites, forums or US pages
   (not dominated by gov.bc.ca, the brand's own pages or large publishers), and a BC or Canadian angle is missing.
3. Prefer a parent who would pay for a math program (cost, comparison, "is my child behind") over general curiosity.
4. Add the new row at the end of the queue, then use it.

After 6-8 weeks, check Google Search Console for `unicalearning.com` (when it is connected) and move rows that get
impressions to the top.
