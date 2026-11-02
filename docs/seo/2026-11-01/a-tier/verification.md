# A-tier verification

## Falsifiers

- A fee row that differs from its saved official-page observation disproves the price summary.
- An outside-BC row in the BC range or chart disproves the sample claim. A missing materials fee represented as zero is wrong.
- A public download that differs from the source disproves publication consistency. A deliberate CSV edit must make `--check` fail.
- A clipped download link, document overflow, absent image, unusable keyboard focus or failed download disproves the new section's usability.
- A non-200 page or asset, incorrect canonical, noindex directive, invalid JSON-LD or stale sitemap date disproves the local publication check.
- A 200 redirect disproves a dead-link claim. A 403, 429 or DNS error does not establish a 404.

## Fresh results

- `npm test`: 178 files and 9,101 tests passed. This includes five public data/export checks. These tests check the fixed sample, missing-fee handling, source URLs, export agreement and chart presence. They do not re-fetch provider prices or prove future prices.
- `npx eslint src`: passed with no output.
- `NEXT_PUBLIC_ALLOW_INDEX=true NEXT_PUBLIC_SITE_URL=https://unicalearning.com npm run build`: passed with Next.js 16.3.8. This checks TypeScript and static route generation. It does not prove a hosted deployment.
- `node scripts/build-fee-data.mjs --check`: passed for two downloads from 14 source rows. A deliberate added CSV row failed with `Public data differs from source`. The original bytes were restored in `finally`, and the check then passed.
- The PNG and SVG were rebuilt with Matplotlib. The 1920 by 1440 PNG was inspected. All 13 plotted centre ranges match the source rows. The initial plot had a footer overlap; the final plot separates the axis label and footer.
- Five draft messages passed the `write-as-me` linter at 72, 77, 90, 80 and 71 words. Their product claims were checked against the public assessment/pricing facts. No message was sent.

## Aside browser

Used account u0 with an owned task tab. No existing user tab was changed. Used `npm run dev -- --port 3020` for the initial browser gate, then the completed production build on the same port.

- Widths 375, 768 and 1440: the table, new method section and download links fit. Document scroll widths were 360, 753 and 1425 respectively. No document overflow was found.
- The chart loaded and kept its aspect ratio. Phone labels need the full-size link or the equivalent HTML table; this instruction is visible beside the chart. The full-size PNG download has the advertised dimensions.
- Clicking the resources-hub data link reached `/resources/kumon-cost-bc#data-method`.
- Clicking the CSV link produced `bc-centre-fees-2026-11-01.csv`, 2,023 bytes, with 14 data rows. Tab from the CSV link focused the JSON link with a visible solid outline.
- The section has a heading, native links, image alternative text and an equivalent table. Reduced-motion mode sets scroll behavior to auto. Instant scrolling was used for the final phone captures to avoid capturing an unfinished smooth scroll.
- The existing live quote calculator remained usable without sign-in. Its default inputs showed CAD 240 for 4 weeks.
- All task tabs were closed after inspection.

Screenshots in the Aside session directory `/Users/savargupta/.aside/u/0/sessions/2026-11-01_FK5Kt3LVhzKPeBx5/tmp/`:

- `unica-a-tier-1440-method.png`
- `unica-a-tier-768-method.png` (includes focused JSON link)
- `unica-a-tier-375-method.png`
- `unica-a-tier-375-downloads-final.png`
- `unica-a-tier-375-chart.png`

These are local review artifacts. They are not production screenshots or a screen-reader test.

## HTTP publication check

`local-http-checks.json` records the production build on the local server. The hub, guide, sitemap and four downloads all returned 200. The guide kept its own production canonical, had no noindex directive, retained 21 sources and emitted parseable JSON-LD. The sitemap's guide date is November 1, 2026. Both data downloads contain 14 rows. The public JSON equals the source JSON.

The first sitemap assertion assumed adjacent XML tags. It failed on formatting. The corrected check parses XML and checks the matching URL's date. That passed. This correction is test-driver evidence, not a product fix.

## Review and hosted proof

Independent review approved the change with no findings. SPEC, STANDARDS and the design gate passed. The reviewer freshly checked all 14 fee sources, all 13 plotted ranges, the published rows and citations, local HTTP assets, and the five editorial candidates. See `review.md` for the evidence and input hashes. This review-status paragraph is the only post-review input change.

Hosted checks will run after merge. Local checks do not prove backlinks, editorial acceptance, indexing, traffic or sales.
