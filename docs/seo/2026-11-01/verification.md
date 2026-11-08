# Verification

## Rejection conditions

Reject the change if a calculation is wrong, fees repeat per week, invalid inputs produce a total, a new page lacks a canonical URL, a public page is blocked from indexing, an internal destination fails, or the changed layout overflows a phone screen.

## Observed results

- Tests: 177 files, 9,096 tests passed, including the six new calculator cases. The focused calculator and report-view check passed 64 tests after the corrections below.
- Source lint: `npx eslint src` passed.
- Production build: passed with `NEXT_PUBLIC_ALLOW_INDEX=true` and the production canonical origin. Both new routes are static.
- Aside, development server: inspected pricing, assessment information and the calculator. New pages used the existing site shell and text styles.
- Aside, production build: fetched the complete local sitemap and all 30 listed pages. Every page returned 200, had one H1, a canonical URL and no noindex directive. The saved crawl records status and response length for every page.
- Aside, phone width 390 px: pricing, assessment and calculator had no horizontal page overflow. Calculator controls measured 299 px wide. Tab moved from the hourly-rate input to the weekly-hours input, with a visible focus outline.
- Calculator in the browser: CAD 39.99 × 1.25 hours × 3 weeks + CAD 25.50 produced CAD 175.46. An empty rate and a negative rate showed the input message. A zero rate retained the CAD 25.50 fee.
- Assessment action: opened `/start`, then the existing signed-in account page. No account, assessment, payment or email was created.
- The official FSA samples page was opened in Aside. Its English Grade 4 and Grade 7 sections supplied all six new sample, booklet and solution destinations.

## Review corrections

- S1: Both new pages now state the current BC-curriculum plan restriction and the waitlist option for other curricula. The assessment remains open across Canada. This matches `OPEN_CURRICULA`, the report next step and the published terms.
- S2: The report description now states that number-fact speed appears from Grade 5. This matches `factsView` and its existing tests.
- S3: A regression test first failed at the product assertion for the fractional-cent rate `60.005`. The calculator now rejects fractional-cent rates and fees. It also enforces the field's quarter-hour step. Valid cent inputs remain accepted. Aside showed the invalid-input message for `60.005`, `25.505` and `0.3` hours. The valid example still returned CAD 175.46.
- Captured all three changed surfaces at 375, 768 and 1440 px. All nine checks had one H1 and no horizontal page overflow. Inspected the viewport captures. No new layout defect was shown.
- With reduced motion emulated, the browser reported the preference as active. The calculator still updated. Tab visited its four fields in order, then the comparison and pricing links. Each field had a visible focus shadow; both links had a solid focus outline.
- With reduced motion active, Tab reached every content link and the assessment action on each new page, then continued into the footer. All sampled links had a solid focus outline. This checks the changed content; it is not a complete WCAG audit of the shared site.

## Evidence limits

- The local crawl proves served HTML, titles, canonical URLs and index directives. It does not prove Google indexing or ranking.
- Browser checks prove the new information and calculator states. They do not retest assessment scoring, email delivery or payments.
- A first calculator DOM check selected the H2 anchor instead of its containing section. It found no input elements. The corrected check selected `section[aria-labelledby="calculator"]` and verified all four controls and live results.
- Aside full-page captures repeated the viewport. Use the viewport captures for visual review. Do not use those full-page captures as layout evidence.
- Production deployment and Google recrawling require separate checks after merge.

## Local evidence locations

- Browser files: `/Users/savargupta/.aside/u/0/sessions/2026-11-01_TP9iwHjySlNcKapy/artifacts/`
- Use `calculator-mobile.png`, `pricing-mobile-viewport.png`, `assessment-mobile-viewport.png` and `crawl.json`.
- Corrected views: `{pricing,assessment,calculator}-{375,768,1440}-fixed.png`, `calculator-reduced-motion.png`, `layout-fixed.json`, `keyboard-fixed.json` and `pages-keyboard-reduced-fixed.json`.
- Command logs: `/tmp/unica-seo-tests.log`, `/tmp/unica-seo-eslint.log`, `/tmp/unica-seo-build.log`.
