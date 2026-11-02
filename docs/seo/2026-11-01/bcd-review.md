VERDICT APPROVE for the reviewed source and documents.

SPEC: PASS within the supplied scope. STANDARDS: PASS within the supplied scope.
No blocking findings. Severity counts: P0 0, P1 0, P2 0. External operational claims remain subject to the proof limits below.

# SEO BCD review

Review date: November 1, 2026.
Worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/site-seo-measurement-20261101`.
Branch: `site/seo-measurement-20261101`.
HEAD and origin/main: `4690825f14ffbcde82907f27461a7d8b886a6587`.
Tracked diff SHA256: `fc6bc5037445b4df1cf27213b5ba9c5c5c64b1007a5434f44e2b8ce4d3b08213`.

The final check reproduced this hash with `git diff --abbrev=7`. During review, Git changed its default index abbreviations from seven to eight characters. This changed the default diff hash to `95ea49a5e367e950bc2b291648d4da052cdb848b66f11863e99a28f78c51136c`. The seven-character diff still matches the dispatch exactly. The reviewed content did not change.

The candidate is the working diff, not HEAD alone. The three additional reviewed documents have these SHA256 values:

| Document | SHA256 |
|---|---|
| `ai-baseline.md` | `ea0af50f9b8b30c3525e457f6c726ff9d52b1c29908a49493aa7c0e5c17f2480` |
| `bcd-measurement.md` | `a009cf75adaae14ccedb38dad284d384419d5ebecc7e607778eaae05e01f61af` |
| `bcd-social.md` | `06f03b440a22d421da540ef03784fc1d9ad22548c1027c3a13a527195549fbac` |

## Rejection conditions

Before checks, I required rejection for an unsupported claim, an incorrect offer limit, a meaningful regression, or a privacy breach. I checked for these specific failures: Canada-wide paid eligibility without the curriculum limit; delivery described as curriculum eligibility; an invented publisher or expert; a saved card or trial counted as payment; incorrect fee counts or sample claims; an AI observation described as a reliable ranking.

## Claim checks

| Area | Result and source |
|---|---|
| Paid offer and metadata | `src/lib/metadata.ts:13` separates the free assessment across Canada from the BC curriculum program. `src/lib/structured-data.ts:14` states the BC curriculum limit on the offer. The offer no longer has `eligibleRegion`. The price remains CAD 79.99 per month. The home and root description, Open Graph and Twitter fields use the corrected text. |
| Curriculum and delivery | `src/lib/signup.ts:41` opens only BC. A fresh call returned `reserved` for BC and `waitlist` for Ontario. `src/lib/report-view.ts:381` and the pricing and terms pages agree. The remaining Canada `areaServed` fields describe the service area. They do not say that Ontario curricula can buy the plan. The terms explicitly include delivery across Canada. Restricting delivery to BC would misstate those terms. |
| Publisher | `src/components/article.tsx:75` names Unica Learning as publisher and links to `/our-story`. The organization schema uses the same name and publisher ID. `src/components/story.tsx:32` and `:57` give the founder account and names. The change adds no reviewer, qualification, testimonial or learning result. |
| Privacy and measurement | `src/lib/analytics.ts` requires consent, drops events without consent, removes personal fields and query strings, and does not identify parents. The documented browser and consent limits are necessary. `src/lib/stripe.ts:66` uses setup mode; `:198` starts a trial. These operations do not prove collection of money. The revised tracking document requires a successful nonzero payment, refund checks and a known family link. The organic source is distinct from the paid sources. |
| Facebook research | All 14 dataset rows match the saved November 1 source observations for tuition, enrolment, materials and date. Filtering `market === "BC"` gives 13 rows, tuition from 180 to 260, and 13 enrolment fees of 80. Materials distribution: 11 at 30, one at 20, one unspecified. The outside-BC Canada Virtual row is excluded. The post states the sample limit and uses no competitor brand, outcome claim or endorsement. This follows `DESIGN.md:29` and `:37`. The tagged resource hub links to the fee guide and its data section. |
| AI baseline | `ai-baseline.md:3` records three single observations, an unspecified model, account conditions and the memory warning. It disclaims ranking and market-share conclusions. Lines 11, 19 and 27 disclose incomplete citation capture. Line 25 records the model's price answer without presenting it as verified research. Its 180-to-230 answer is therefore not a replacement for the 180-to-260 source range. |

## Fresh checks

- Metadata: an in-memory TypeScript check reproduced the five assertions in the added public-copy scenario. Candidate: 5 passed, 0 failed. Fixed base: 1 passed, 4 failed. This proves that the scenario detects the old metadata. It does not prove indexing or search presentation.
- Publisher: the generated article publisher reference matched the organization ID. Source inspection confirmed the visible label and target. This does not prove a rendered browser state.
- Eligibility: public calls confirmed BC reservation and Ontario waitlist behavior. This does not prove hosted checkout.
- Organic attribution: two immediate `keepVisit` calls on one in-memory tab produced one visit post. `adVisitRow` retained the exact Facebook source, social medium and campaign. This does not prove database storage or Facebook attribution.
- Fees: all 14 rows matched the saved source records. The BC count and full fee distributions above use the same filtered set. This does not independently recheck the provider pages live.

The first focused script expected three base failures. It observed four and stopped at that incorrect count assertion. I corrected the expected count to four and reran it successfully. This was a check error, not a product failure. No check file was written.

## Notes (non-blocking)

N1, P3, `docs/ad-tracking.md:56` and `:66`: the existing SQL examples still group broad tagged traffic without the exact paid source, medium and campaign filters required by the new warning at line 72. Reproduction: run either example after an organic visit. It returns an organic row as well. The source stays separate, so the result does not silently combine Facebook organic with Meta. Add explicit paid filters to an example intended for paid totals. This is a pre-existing example limitation, not a new counting regression.

N2, P3, `bcd-measurement.md:5`, `:9`, `bcd-social.md:7`, and `ai-baseline.md:3`: retain a saved funnel definition and dated evidence for the external observations. The supplied files contain no funnel configuration export, indexing receipt, Facebook post permalink, or complete chat transcript. Reproduction: inspect the reviewed documents and their links. Another reviewer cannot reconstruct those exact external states from them alone. This limits independent confirmation. It does not establish that the reported actions were false. Do not add parent or child identifiers to obtain that evidence.

## Supplied evidence and proof limits

The dispatch reports 9,102 passing tests. It reports build and source ESLint as running. It also reports browser checks at widths 375, 768 and 1440 without horizontal overflow and a publisher link to `/our-story`. I did not rerun the full gate or browser checks. Build and ESLint have no final result in the supplied evidence used here.

The saved PostHog funnel, its ordered steps, first-step paths, test filter and 30-day settings were not independently read from PostHog. Source supports the event names and privacy limits, not the saved configuration. Anonymous browser events cannot reliably exclude every test family or join a phone visit to a later laptop test. The document states those limits and claims no payment count.

Search Console states, indexing requests, Facebook publication, absence of a paid boost and the three chat observations remain reported observations. This review made no external service call, paid request, publication or deployment. It changed only this report. It does not prove current indexing, ranking, traffic, payments or sales.

SEO_BCD_REVIEW_DONE
