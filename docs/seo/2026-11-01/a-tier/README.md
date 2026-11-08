# A-tier SEO work, November 1, 2026

Use free tools and existing accounts. No purchase, subscription, outreach, submission or link exchange was made. No new backlink or traffic increase is claimed.

## Completed work and limits

| Article tactic | Result | Remaining dependency |
|---|---|---|
| Roundup inclusion | Five relevant editorial candidates checked. Specific additions and drafts are in `editorial-drafts.md`. | Authorization to contact each publisher, then editorial acceptance. |
| Reclaim links and mentions | The earlier same-day Search Console Links report showed two links to the home page. The home page still returns 200. A fresh exact-brand search found the existing Unify partner post, which already links to Unica. Other results included unrelated brands. | No broken earned target or additional unlinked mention was established. The Search Console report is a sample. |
| Competitor link opportunities | Read lists that already cite Math Mammoth, Math-U-See, Teaching Textbooks and other programs. The drafts propose a distinct Canadian online assessment, with its account and geographic limits. | Publisher choice. No paid placement or reciprocal link offer. |
| Broken resources | Confirmed the obsolete Teaching Textbooks URL returns 404 on two GET requests. Verified its current official placement page returns 200 and contains placement guidance. Also found the OFTP Canadian Test Centre website label points to EQAO. | Send the factual repair to the editors. Do not replace another publisher's program test with Unica. |
| Original statistics | Rechecked the guide's 13 BC centre URLs and one outside-BC comparison. Published a dated source dataset, method, CSV, JSON, PNG and SVG on the existing cost-guide URL. | This is a convenience sample of published fees. It is not a market census, a survey of quotes or learning-outcome research. |
| Journalist requests | Searched current education and parenting requests with date filters, then corrected off-target results with web search. Read the Sourcee education page. No suitable, verified open request was found in this bounded search. | A relevant request with a current deadline and a source role we can truthfully fill. No account or paid alert service was created. |
| Graphics for publishers | Published our own reusable fee chart with source credit and downloads. | A custom graphic for another site requires an accepted topic. The article advises agreement before production. No acceptance is claimed. |
| Videos for publishers | Prepared the existing assessment page and sample report as demonstration destinations. | A publisher must accept a specific demonstration before recording. No speculative video was made. |
| Free tools | The quote calculator already shipped in #411. Verified it remains available without an account. The free assessment page and sample report remain the relevant additional resources. | Editorial distribution and later performance measurement. No paid tool was added. |
| Link exchanges | No network joined and no exchange offered. Use editorial relevance instead. | None. [Google's link-spam policy](https://developers.google.com/search/docs/essentials/spam-policies#link-spam) includes excessive exchanges and automated link creation. |

## Research artifacts

- `source-observations.json`: live extracted fee blocks from the 14 official centre pages. A direct shell request to Marpole returned 403. That response was not price evidence. Keenable live fetch returned the fee content.
- `link-checks.json`: ten GET checks, including redirects, response sizes and failures. A DNS failure for the old PARCC host is unverified availability, not a confirmed 404. The old Math-U-See and Singapore Math URLs redirect to working resources. The Texas diagnostic page returned 200.
- `editorial-routes.json`: a second check of the broken URL, the working replacement, and contact routes extracted from the actual candidate pages. A Kuraplan shell request returned 429; its article content was read through Keenable live fetch. Rate limiting does not establish a dead page.
- `editorial-drafts.md`: five candidate-specific drafts, one partner correction, and exact proposed additions. They remain unsent.
- `verification.md`: local and browser checks. Hosted proof is added after merge.

## Rebuild the publication

The source is `src/content/data/bc-centre-fees-2026-11-01.json`. The guide's table and first 14 citations read this file. The chart excludes the `online-outside-bc` row. Keep unlisted materials fees as null, not zero.

```sh
node scripts/build-fee-data.mjs
node scripts/build-fee-data.mjs --check
uv run scripts/plot-fee-data.py
npx vitest run src/content/data/bc-centre-fees.test.ts
```

Python dependencies run in an isolated uv environment. No service account, API key or paid plan is needed. Inspect the rendered chart after a rebuild. Confirm each plotted range against the source row. Do not change a historical file's check date without reading its sources again.

Public destinations:

- [Data, method and chart](https://unicalearning.com/resources/kumon-cost-bc#data-method)
- [CSV](https://unicalearning.com/resources/data/bc-centre-fees-2026-11-01.csv)
- [JSON](https://unicalearning.com/resources/data/bc-centre-fees-2026-11-01.json)
- [PNG](https://unicalearning.com/resources/data/bc-centre-fees-2026-11-01.png)
- [SVG](https://unicalearning.com/resources/data/bc-centre-fees-2026-11-01.svg)

## Measurement

Keep the November 1 Search Console exports as the baseline. After four weeks, compare equal 28-day windows for the edited guide and free resources. Record editorial messages and placements separately if contact is later authorized. A sent message is not a placement. A placement is not proof of a ranking or sales change. Do not add child data to analytics.
