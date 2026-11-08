VERDICT APPROVE
A_TIER_REVIEW_DONE

# A-tier SEO review

Review date: November 1, 2026.
Worktree: /Users/savargupta/Github/pagewise-landing-page/.claude/worktrees/seo-editorial-resources
Branch: site/seo-editorial-resources
Base and current HEAD: ddc5d826cfe1bb7e66e0a40f34a5a2b8c8f0b17a

The candidate is the uncommitted change set, including the untracked files. HEAD alone does not identify this candidate. The input hashes below identify the reviewed files.

## Findings

No findings. Severity counts: blocker 0; should 0; nit 0. No S finding IDs are assigned because no defect met the requested threshold.

SPEC: PASS. The change adds the dated dataset, method and reusable chart to the existing guide. It adds one resource-hub link and five specific, unsent editorial additions.

STANDARDS: PASS for the bounded change. The guide uses the existing article components. Competitor facts stay in the resource guide. The new text states the source dates and sample limits. It makes no learning-outcome, editorial-acceptance or ranking claim.

## Scope and rejection conditions

I read AGENTS.md, the diff from the specified base, git status, every untracked file in scope, DESIGN.md and the surrounding article components. The 18 input files below exclude this report. I inspected the PNG and all five supplied browser screenshots with view_image.

Before checks, I set these rejection conditions:

- A tuition or fee value differs from the official-page evidence.
- The outside-BC row affects a BC count or chart range.
- A missing fee becomes zero.
- A citation points to another centre, or a download differs from the source.
- A new public claim exceeds its source, date or sample.
- A draft omits a material product restriction or claims a secured link.
- A required download or new control fails its intended use.

Only this report was written. No source, publication, customer record, account or deployment was changed.

## Fresh data checks

I independently compared all 14 source rows with the saved fee observations. I also fetched all 14 official URLs with Keenable live fetch. All tuition ranges, enrolment amounts and listed or missing materials fees agreed.

| Centre | Monthly tuition per subject | Materials | Citation |
|---|---:|---:|---:|
| Vancouver - Marpole | 230-260 | 30 | 1 |
| Vancouver - First Avenue | 210 | 30 | 2 |
| Vancouver - Cedar Cottage | 190-220 | 30 | 3 |
| Vancouver - Killarney | 180-220 | 30 | 4 |
| Burnaby - Highgate | 190-200 | 30 | 5 |
| Burnaby - Burnaby Heights | 185-200 | Not listed | 6 |
| New Westminster - Queensborough Landing | 190 | 30 | 7 |
| North Vancouver - Capilano Mall | 200-220 | 30 | 8 |
| Richmond - Steveston | 200-225 | 30 | 9 |
| Surrey - Fraser Heights | 180-200 | 20 | 10 |
| Coquitlam - Westwood | 190 | 30 | 11 |
| Langley - Willoughby Town Centre | 195-220 | 30 | 12 |
| Victoria - Oak Bay | 200 | 30 | 13 |
| Canada Virtual, excluded from BC statistics | 150 | Not listed | 14 |

These are dollar figures from the linked Canadian centre pages. Each row lists an enrolment fee of 80. The method does not claim that every page explicitly labels its currency as CAD. Richmond omits the dollar sign from tuition. Highgate has an extra trailing dollar sign. The source preserves both published strings. The table normalizes their display without changing the numbers.

The machine-filtered BC set contains 13 rows. Its tuition limits are 180 and 260. Its materials distribution is 11 at 30, one at 20 and one null. The separate online set contains one row. Across all 14 rows, two materials fees are null. CSV represents these as empty cells. The rendered table says "Not listed".

Evidence paths: src/content/data/bc-centre-fees-2026-11-01.json; docs/seo/2026-11-01/a-tier/source-observations.json; src/content/resources/kumon-cost-bc.tsx:56, :90, :98 and :102.

The live fetch batch first returned a 10-requests-per-second limit for four URLs. All four succeeded on retry. These responses were not fee evidence. One fresh Richmond extraction used "Registration Fee" where the saved extraction used "Enrollment Fee". The amount remained 80. Accepting either heading corrected the review parser; it did not require a product change.

## Fresh public-interface checks

I ran node scripts/build-fee-data.mjs --check. It reported: "Checked 2 downloads from 14 source rows."

An independent CSV parser compared every field in all 14 exported rows with the source. Public JSON also matched the source. The CSV contains 2,023 bytes and 14 data rows.

I parsed the exported SVG. I derived its numeric scale from its labelled ticks. All 13 plotted endpoint pairs, centre labels and printed range labels matched the BC source rows. Canada Virtual has no plotted row. The PNG header confirms 1920 by 1440 pixels. Visual inspection confirmed the same ranges and readable full-size labels.

I sent concurrent GET requests to the existing local production server:

| Path | HTTP status | Bytes |
|---|---:|---:|
| /resources | 200 | 48,539 |
| /resources/kumon-cost-bc | 200 | 102,064 |
| /sitemap.xml | 200 | 2,867 |
| /resources/data/bc-centre-fees-2026-11-01.csv | 200 | 2,023 |
| /resources/data/bc-centre-fees-2026-11-01.json | 200 | 5,144 |
| /resources/data/bc-centre-fees-2026-11-01.png | 200 | 171,877 |
| /resources/data/bc-centre-fees-2026-11-01.svg | 200 | 19,092 |

All four HTTP asset bodies equalled their worktree bytes. Their content types matched CSV, JSON, PNG and SVG.

I parsed the guide's returned HTML. All 14 rendered centre rows, tuition cells, materials cells and citation targets matched the dataset. Sources 1-14 map to the corresponding centre URLs and November 1 dates. Sources 15-21 retain October 9 dates. The guide has 21 source entries, four download controls and the data-method heading. The hub has exactly one link to that heading.

The guide's canonical is https://unicalearning.com/resources/kumon-cost-bc. The HTML has no noindex directive. Its JSON-LD parses. The matching sitemap entry has the November 1 update date. The comparison-table note preserves the older tutor-rate date.

This proves local rendering and export consistency. It does not prove hosted publication or indexing.

## Draft and tactic checks

I fetched the five candidate articles and compared their actual content with each proposed addition:

| Candidate | Evidence and result |
|---|---|
| [Stress Free Math for Kids](https://stressfreemathforkids.com/members-only/free-elementary-math-placement-tests/) | The article lists publisher tests. A Canadian online addition fits the stated request. The draft does not call the working redirects broken. |
| [Hand In Hand Homeschool](https://handinhandhomeschool.com/teaching/math/math-placement-test/) | The Teaching Textbooks entry uses the obsolete URL. A fresh GET returned 404 with 32,553 bytes. The official replacement returned 200 with 35,817 bytes. The draft keeps the repair separate from the Unica addition. |
| [Ontario Federation of Teaching Parents](https://ontariohomeschool.org/testing/) | The Canadian Test Centre website label targets EQAO. Its email label targets the address listed for Wise Choice. The draft reports the mismatch and distinguishes Unica from standardized testing. |
| [Kuraplan](https://www.kuraplan.com/homeschool/placement-test) | The page has printable checks through Grade 6 and publisher placement guidance. The proposed online addition preserves the publisher-test restriction. The missing verified contact route is explicit. |
| [Every Homeschool](https://everyhomeschool.com/guides/placement-tests-2026) | The article has the stated Math table. The draft asks for an editorial decision. It does not offer payment, an exchange or placement in another publisher's program. |

Fresh GET checks also confirmed that the old Math-U-See URL reaches a 200 response with 102,219 bytes. The old Singapore Math URL reaches a 200 response with 378,359 bytes. Neither is a confirmed dead resource.

I checked product claims against src/app/(site)/math-assessment/page.tsx, src/app/(site)/pricing/page.tsx:22, :42 and :44, src/lib/assessment/grades.ts, src/app/(product)/start/page.tsx and src/lib/next-step-server.ts:54. The supported range is Kindergarten to Grade 9. The assessment requires a parent account and a laptop or tablet. It requires no card. Paid plans remain limited to the BC curriculum. Other curricula have the waitlist option. The partner correction states the current program name and links to current pricing terms.

The README and plan distinguish prepared drafts from messages sent, placements, indexing and traffic. The limits for all ten tactics are present. Link recovery has no established broken earned target. Journalist requests have no verified suitable open request. Custom publisher graphics and video still require an accepted topic. The owned chart does not claim publisher acceptance. The existing free calculator is credited to the earlier work. No exchange is proposed.

## Design gate: PASS

Independence: fresh reviewer. Route: direct review within the existing article system.

I inspected these supplied screenshots under /Users/savargupta/.aside/u/0/sessions/2026-11-01_FK5Kt3LVhzKPeBx5/tmp/:

- unica-a-tier-1440-method.png
- unica-a-tier-768-method.png
- unica-a-tier-375-method.png
- unica-a-tier-375-downloads-final.png
- unica-a-tier-375-chart.png

The method heading, paragraphs and links fit the shown widths. The tablet capture shows a visible keyboard outline on the JSON link. The phone captures show wrapped download labels, the chart, the full-size instruction and the reuse credit. The full-size chart separates labels, axis text and footer text.

The source uses native links, the existing Section and DataTable components, explicit image dimensions, image alternative text and an equivalent HTML table. Small phone chart labels have both a full-size link and the table alternative. No design blocker was found within this scope.

## Supplied checks and proof limits

The following results come from verification.md and the task brief. I did not rerun the full build or test suite:

- npm test: 178 files and 9,101 tests passed, including five data checks.
- npx eslint src: passed.
- Production-index build: passed with Next.js 16.3.8.
- Deliberate CSV drift: rejected, then restored.
- Aside dev and production checks: widths 375, 768 and 1440; actual CSV download; hub navigation; keyboard focus; calculator use.

The five tests check the fixed data and publication contract. They do not independently fetch live fees. The SVG coordinate check and live fee reads above add that separate evidence.

I freshly inspected the supplied images. I did not operate a browser or touch user tabs. Screenshot inspection is not a fresh keyboard interaction, screen-reader test, zoom test or device test. The supplied interaction results retain their stated proof limits.

No full-suite red run or new file-mutation experiment was performed. The supplied deliberate CSV failure is the available mutation evidence. Local HTTP success does not prove a hosted deployment, a new backlink, editorial acceptance, indexing, traffic or sales. Other unchanged article claims are outside this review.

## Reviewed input hashes

SHA-256 values identify the 18 reviewed input files. This report is excluded.

```text
933f93f234c19fa405f15ba01fdb3d59ca4f844689a4be293c9f8ed2246266e4  docs/seo/2026-11-01/a-tier/README.md
51cf45c19aca1ed7242c457d1b8015142eabb3e99f39eb322ee7a646947661c6  docs/seo/2026-11-01/a-tier/editorial-drafts.md
f44b1c61da8bd5683bea3e86e12b58a8be2eb6daee355d17b4c0be428fe28783  docs/seo/2026-11-01/a-tier/editorial-routes.json
9105bad5f58ef40b4b2df579f88d141a7089e41fc30dadecb4adc521bce8ed85  docs/seo/2026-11-01/a-tier/link-checks.json
26c5455586a1e1a5b5e0c4222f1e9d8d64fff61e4f2c7ec554b1857e6f241080  docs/seo/2026-11-01/a-tier/local-http-checks.json
49a9eae3a6b8214aa32975f9f685842f6a06f8ab2ec58bf0df52fc82e12ac3c7  docs/seo/2026-11-01/a-tier/source-observations.json
66eb94b9f5a1d6c6c17d84202f37ba637573ed4d968369f610e493668a975253  docs/seo/2026-11-01/a-tier/verification.md
ccfe164173c40e81019f2a01a869a3d1e3c86db2c2ffb7c0cca64c249017466a  docs/seo/2026-11-01/plan.md
c6bb935dea977b846c747ad0ca2347298701f8a587f1d29c6e0a6bd4882f1ec1  public/resources/data/bc-centre-fees-2026-11-01.csv
2dfa437df91ce5c9524a358bfaeb83cb049996dbc107d6d93d6e1da754722b57  public/resources/data/bc-centre-fees-2026-11-01.json
fc63ca4ea7e97cb34fd79a62e35c5511bad871edf714e356bcd8efc7476c7e87  public/resources/data/bc-centre-fees-2026-11-01.png
893faba2b7b411f5ed3c2fb02a6a50046c4095e8628a99440a1599709bb4a320  public/resources/data/bc-centre-fees-2026-11-01.svg
a4a8bba9f6de96ea0dc45d09ee7dc74bbcea7a8df3063856ba8aa8890074a734  scripts/build-fee-data.mjs
cb3b9e6c51b26ada5593eb9657add7644da641cad8dfed8d5e8b64451f21f05b  scripts/plot-fee-data.py
79c0741c604919f81c4fea76cd624644b0428cde2d69c988daa59dfaa97a3b21  src/app/(site)/resources/page.tsx
2dfa437df91ce5c9524a358bfaeb83cb049996dbc107d6d93d6e1da754722b57  src/content/data/bc-centre-fees-2026-11-01.json
ba01b429c8fdb5b37166f9b8d88fbb4e8aaad7a9e6497af345970539de6dcad2  src/content/data/bc-centre-fees.test.ts
066f542e7de5e9df17d8eda47e7b40af814eb7f35456bc62c957696c69edd278  src/content/resources/kumon-cost-bc.tsx
```
