# Referral branch integration

PR #946 initially targeted remote main db1c53cb64b67ffc790ff6496db72fdae340d15c. GitHub reported conflicts. The referral branch merged that remote main. The local main branch stayed at 5b09bcf91ea3328106e61d2d9c0aab6a147662d3.

Only two files had conflicts. Remote main changed the privacy update date. Referrals changed the terms update date. Both pages and both sitemap entries now retain 13 November 2026. The rendered-wording test checks that date for each page.

The referral core, provider adapter, store, existing Stripe start, parent card, program-choice input, Account settings card, Restart component and referral/webhook API source are unchanged from the reviewed and repaired referral candidate bf15e86eba9f0e7a76abbfb7b5b43d289bc9dda9.

Database types and checks were regenerated from the hosted schema after the merge. Official output also includes the currently hosted scan `clean_failure`, `deferrals` and attempt-limit definitions. No scan migration was added by the referral work. The generated files were not edited by hand.

Three focused files passed, 237 tests. They cover the rendered legal dates, registered state constraints and admin parent previews. The integrated full gate passed: 697 files, 21,113 tests, one skipped, ESLint and build. The complete log is `.design/evidence/referrals/final-gate.log`. At that handoff, live event additions and deployed-key checks were pending. The authorized configuration round below records the later work.

## Live configuration round

Savar then authorized live Stripe configuration through Aside. All 12 missing events were added to the existing endpoint. A fresh page load verified all 19 events, with the original seven retained. Stripe's current permission reference assigns Invoice Payments reads to `invoice_read`, which the configured site's Invoices Write permission covers. No key change was required. The sensitive deployed-key value was not revealed.

During this round, GitHub reported new conflicts with remote main a9ff3b15a4f80ead1b087dd0cb14def1690af3d5. The branch merged that remote main. The resolution keeps the pricing update date, keeps both scan and referral state registrations, and preserves the new hero decision as D-340. The referral decision moves to D-341 to keep its identifier unique. The referral core, Stripe adapter and parent input source are unchanged from the last validated candidate.

Official database types and checks were regenerated. The state-registration check passed 24 tests. The fresh full gate passed for this integration: 700 files, 21,167 tests, one skipped, ESLint and build. The complete log is `.design/evidence/referrals/final-gate.log`. Application production merge and deployment remain with Savar.

## Authorized merge round

Savar requested the production merge and task cleanup on 14 November 2026. Remote main had advanced to 0569b755e44f0a7502c1bc19f12949e53f8000c3 and caused new conflicts. The resolution retains both the referral recovery and scan-team email work in the reminders route, both the Teaching Assistant footnote and referral explanation in pricing, and the latest sitemap dates. The referral decision moves to D-344 because current main uses D-341 through D-343.

The plan-start email keeps the new onboarding guidance and the referral payment disclosure. The new upstream onboarding test still expected the old price sentence and prohibited referral text. It failed against this integration. Its assertion now checks the full referral disclosure and keeps the cancellation and guidance checks. All 46 email tests pass. The payment core, store, Stripe adapter and subscription start source did not change in this integration. Official database types and 664 checks were regenerated from the hosted schema.

The fresh full gate passed: 706 files, 21,434 tests, one skipped, ESLint and build. The complete latest log is `.design/evidence/referrals/final-gate.log`. This proves the integrated local checks. The unchanged provider and hosted proof from the earlier rounds keeps its stated limits.

Aside verified both pricing notes, the referral rules link and the visible referral explanation at 1440 px and 390 px. Neither viewport had horizontal overflow. The local page returned HTTP 200 with 189,286 bytes. Smooth scrolling was disabled for the hidden-pane check so the scroll completed. Owned tabs were closed. Evidence: `.design/evidence/referrals/merge-pricing-browser.json`.
