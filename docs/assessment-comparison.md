# Assessment comparison

Issue #101 implements decision #94 option A for spec #54. The report compares children in the same school grade who took this test. It does not compare all children in that grade.

## Source and exclusions

The report job reads completed assessments on the server. It uses each child's latest completed test across grades. It then filters to the report's grade. It excludes tests for which `helpLikely(placement.flags)` is true. It excludes `example.com` and `resend.dev` email domains, including their subdomains.

The server variable `ASSESSMENT_COMPARISON_EXCLUDED_EMAILS` holds a comma-separated list of named test account emails. It defaults to an empty list. No authoritative named list was found in the project source or documents. The owner must supply any real-domain test account names. This change does not invent names or change hosted variables.

The source uses ascending assessment IDs and requests up to 500 rows per page. It continues from the last returned ID until an empty page. A smaller response cap cannot end the scan early. The scan uses one completion cutoff and checks the final row count against the first exact count. An error or count mismatch stops report creation. The scan has a 20-second total timeout. It is not a database transaction. Deletion during a scan can require a retry. Existing schema columns and relationships suffice; no migration is required.

Only the summary enters the stored report. Cohort identities, emails and placements stay on the server. No comparison data goes to analytics.

## Ranking assumptions for owner review

- Sort by working level first. Within a level, sort by the exact share of questions right at that level. Do not round the shares before comparison.
- If the estimated working level has no questions, sort it below a measured share at the same level. Two such estimates tie. Do not invent an accuracy value.
- Use the midpoint of equal results: `100 * (number below + number equal / 2) / n`. The subject counts in `n` and in equal results.
- Below 100 eligible children, show the grade scale only. At 100-399, show the lower quarter below 25%, middle half from 25% to below 75%, or upper quarter from 75%. Use the unrounded midpoint to select the band.
- At 400 or more, show the midpoint rounded to the nearest whole percentile. Values of 0 and 100 can result from rounding.
- If completion times match, use the greater assessment ID as the latest test. An excluded or replaced subject has no cohort comparison.

The report uses the words "lower quarter", "middle half" and "upper quarter". The line gives the measured child count and says "children who took this test". The note explains latest tests, exclusions and ties.

## Stored report behavior

The account report, read-only admin report and email use the same stored model and the same comparison wording. A retry keeps the stored snapshot. It does not recalculate a past report against a later cohort.

Old reports contain only a stage and a raw count. They have no measured band or percentile. They continue to show only the grade scale. The alert does not label their old count as an eligible cohort. No report backfill is part of this ticket.

## Verification limits

The tests use public assessment functions and a synthetic Supabase transport. Browser evidence uses labeled local fixtures. No live account, assessment, email or payment is created. The live SQL schema probe was denied with `MCP error -32600: You do not have permission to perform this action`. No alternate path was used for that query. Hosted schema and production cohort behavior remain unverified.
