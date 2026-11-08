# Approved merge integration

Savar approved PR661 and PR662, including their screens and wording. Savar also asked to enable the dashboard and family marking and add an Admin tab for all parent dashboard views.

PR661 merged as `96620ed4`. The root merged current main into `site/pd-plan-controls` without a conflict. The candidate includes PR659, PR660, PR663, PR637 and S4. The normal hosted type generator produced no diff after the generated-type merge. Pause/Restart implementation and the reviewed no-plan correction did not change.

Integrated full check on `Savars-MacBook-Pro-5.local`: 16,540 passed, one optional skip, 438 files, exit zero in 266.19 seconds with four workers. Full source ESLint and production build exited zero. See [full test log](merge-full-tests.log). No further source change was needed.

The production runtime audit found the dashboard, scan and marking environment switches unset. The database had zero enabled marking price rows; both model rows were unverified and disabled. No plan-control operation was pending. `markingAccess` currently supports `test-only`, not a family-release value. Parent correction, page history, provider verification and image-access acceptance remain unfinished family-marking requirements. The new production release request does not supply those technical results.

Dashboard activation also needs the documented Stripe test-mode acceptance checks for the newly added controls. Savar authorized the root to retrieve a test key with Aside. No live Stripe write or paid model call is authorized for verification. No runtime flag changed during this merge integration. The Admin state explorer will use the existing parent components and synthetic states behind admin authorization.
