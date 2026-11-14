# Referral branch integration

PR #946 initially targeted remote main db1c53cb64b67ffc790ff6496db72fdae340d15c. GitHub reported conflicts. The referral branch merged that remote main. The local main branch stayed at 5b09bcf91ea3328106e61d2d9c0aab6a147662d3.

Only two files had conflicts. Remote main changed the privacy update date. Referrals changed the terms update date. Both pages and both sitemap entries now retain 13 November 2026. The rendered-wording test checks that date for each page.

The referral core, provider adapter, store, existing Stripe start, parent card, program-choice input, Account settings card, Restart component and referral/webhook API source are unchanged from the reviewed and repaired referral candidate bf15e86eba9f0e7a76abbfb7b5b43d289bc9dda9.

Database types and checks were regenerated from the hosted schema after the merge. Official output also includes the currently hosted scan `clean_failure`, `deferrals` and attempt-limit definitions. No scan migration was added by the referral work. The generated files were not edited by hand.

Three focused files passed, 237 tests. They cover the rendered legal dates, registered state constraints and admin parent previews. The integrated full gate passed: 697 files, 21,113 tests, one skipped, ESLint and build. The complete log is `.design/evidence/referrals/final-gate.log`. The live Stripe event additions and deployed-key checks remain release prerequisites.
