# Root verification

Source implementation cc44fa7a4c79d902ddb58b511527e564621a5bb7, branch site/parent-workbook-access, app-created checkout /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-bda8c699 on Savars-MacBook-Pro-5.local. Root added only evidence and the hosted rollback probe after this runtime pin.

## Hosted access

Applied workbook_parent_files_no_pdf at 20261106175907 and workbook_answers_after_delivery at 20261106185307 in project cdjobwsyzndtltzfpyqa. The hosted ledger, pg_policies and delivery composite foreign keys match the intended restrictive rules. No table, privileged function or broad grant was added.

The actual Storage probe passed normal Auth download and signing checks. True PNG access remained available. PDFs and mismatched filename/MIME pairs failed both requests. Service printing remained available. Actual authenticated SQL roles also checked Admin metadata access with a rolled-back temporary membership. See storage-policy.md and the durable storage-probe.json.

supabase/tests/workbook_answers_hosted.sql reached ANSWER_DELIVERY_HOSTED_PROBE_OK. It uses the real Admin delivery and correction RPCs, effective authenticated/anon/service roles, a future latest-correction fault and a removed receipt. Before delivery the old shipped-book ownership test is true but answer reads return zero. A matching delivery exposes the stored answer. A foreign family gets zero. Admin and service reads stay available. The latest future correction and a removed receipt each deny answers. All fixtures and the temporary Admin membership roll back; the probe verifies that the owned rows no longer exist. No real constraint was removed.

Normal Supabase Auth plus actual PostgREST also passed: 200/eight question rows for the owned delivered sample, 200/zero for the owned pending sample and 200/zero for the foreign sample. All samples use frozen hand-written test packages. This is not a first-customer-book audit.

Root ran npm run db:types successfully after each policy migration. The only generated delta was the separately pending S8 saved-command signature. These policies add no public type signature. Root restored the exact prior generated snapshot, with no manual type edit. S8's generated types remain in PR682 and will arrive with that dependency.

The security advisor returned the existing no-policy, callable-definer and password-protection categories. This task adds no table, function or Auth configuration, and changes none of those reported entities. It does not claim to resolve unrelated advisor notices. Guidance: https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Browser

T3's shared browser passed normal password sign-in to the owned test parent. Workbooks shows the delivered key link and no Print a page again or PDF control. The real link opens all eight stored answers without requiring marks. Pending, wrong-child and foreign key addresses each show the 404 with zero answers. The old PDF API returns 410 without a redirect. At CSS width 390, all eight answers remain in the DOM and there is no horizontal overflow.

The real PIN and desk-open endpoints passed for the owned fixture. The unconfirmed child's desk shows its awaiting-delivery message, Leave and the Maya notice. A parent key address redirects back to the open desk. After a valid PIN exit, the delivered child's page 2/question 1 loads its stored question and crop. This uses synthetic one-pixel page files and does not prove print or camera quality. No chat, voice or model request was made.

T3 screenshot capture timed out twice on one step. Aside provided the visual fallback. Its first full-page phone capture repeated part of the view, so it was discarded. The final answer images are viewport captures at 1280 x 900 and 390 x 844; the DOM has one main heading and eight answers. The desktop Workbooks image is 1440 x 900. The phone image shows the first viewport; remaining answers scroll. These CSS-size checks are not physical-device acceptance. Source screenshots: workbooks-desktop.png, answers-desktop.png and answers-phone.png.

The browser checks used only owned synthetic fixture writes. Each cleanup returned zero owned parents, children, workbooks, files and Admin roles. Temporary passwords and the browser login files were removed. Both T3 and Aside test tabs closed, the Aside REPL exited, and the owned development server stopped. Other browser tabs and processes were left unchanged.

Existing voice and minutes controls were observed in the unchanged dashboard and Desk. The dashboard cleanup remains in this controller's later first-ship scope; the Maya controller accepted the Desk cleanup in its own scope. This answer-key change makes no voice feature or model change.

## Complete gate status

401 affected tests, twelve local SQL cases, source lint and normal build passed on the implementation. Root lint and build also passed. The child's first full suite stopped at its 300-second wrapper, so it is excluded. Root's four-worker suite passed 16,861 tests and one optional skip but failed the unchanged U4 real Chromium fit test at its 120-second limit. The isolated file repeated that timeout with 81 other tests passed. These are failures, not complete-suite passes.

The generator then reported its concurrent strict print work and later sent PRINT_IDLE after its owned Node and Chrome processes exited. Root started a complete npm test -- --maxWorkers=2 run with the existing assertions and timeouts. Its result is pending. See the durable root-full-two-workers.log. Independent source reviews and the final complete gate remain required before a PR can merge. No family flag changed and no paid AI call was needed for this feature.

Durable service and browser records are under /Users/savargupta/unica-workbook-samples/parent-workbook-access-20261106. This report distinguishes those root checks from the worker's local proof.

## Final candidate gate

The final runtime source is f0e2129cb8624c59b9502e39dfdc03954c90a41a. It includes actual main de9404ee, including the minimal generator fix and S8 history. The final repair changes only the answer projection and its tests. Generator, template, renderer, print-engine and print-contract files match main. The later evidence commit changes only this evidence directory.

The final two-worker suite failed one unchanged Chromium cancellation timing assertion: 16,915 tests passed, one failed and one optional skip. Cancellation waited 30,304 ms against a 1,000 ms comparison. The same unchanged test passed in isolation, exit 0 in 2.33 seconds. These are separate results; the isolated pass does not replace a full gate.

Root then ran npm test -- --maxWorkers=1 with no browser override or timeout change. All 463 files passed: 16,916 tests passed, one optional skip, zero failed, exit 0 in 881.83 seconds. Source lint and the normal production build also exited 0 on this runtime source. See final-full-tests.log, final-lint.log and final-build.log. The machine used Node v22.23.1. CHROMIUM_PATH, CHROME_PATH, PUPPETEER_EXECUTABLE_PATH and NODE_OPTIONS were unset.

The original Standards review approved bf1a18ce: 360 tests, 18 independent public-interface controls and 17 distinct SQL cases passed. It did not establish the final full gate. The final independent S1 and narrow Standards recheck approved f0e2129c: 42 focused tests and 215 distinct synthetic controls passed. The latter set contains 187 positive keys and 28 safe unavailable results. It covers both Challenge layouts and incomplete or conflicting saved positions. See independent-standards.md and independent-spec-final.md. Prior rejected reviews remain recorded in the durable task folder and answer-order-repair.md; they were not counted as passes.

The safe unavailable state limits keys for ambiguous legacy mixed-row questions whose saved facts cannot establish part order. Normal legacy single-row, sequence, ordering and Mixed set cases remain readable without a new print revision. No stored book was rendered again. The final pure projection repair adds no hosted write or provider request. The earlier hosted and browser proof above remains separate supplied evidence for access and presentation, not a pixel or customer-book proof for the new synthetic layout controls.

No family switch changed. The customer print-changing freeze remains. Non-print merges require normal coordination and must pause only during a generator RUN_ACTIVE interval. The current product-review page and Savar's family-release approval remain later work.

## Final integration with merged first-book marking

Root verified actual main cfab8191 from PR685 and integrated it without a conflict as 9b30dda230e2d1414049009f476edf437173f93a. The next coordinated non-print merge position is PR686. The customer Prepare run is terminal, so its active-run merge hold is released. The print-changing freeze remains.

The full combined gate passed on 9b30dda2: 463 files, 17,020 tests passed, one optional skip, zero failed, exit 0 in 1,008.37 seconds with maxWorkers=1. Source lint and the normal production build exited 0. The combined independent review approved that source: 290 focused tests, 41 separate public-interface controls and 17 local SQL cases passed. These counts describe separate proof sets and must not be added as independent coverage. See pr685-integration.md, pr685-independent-review.md and pr685-checks/.

Independent source comparison found the approved answer-key runtime and incoming marking runtime unchanged by integration. The local SQL probe ran the restrictive answer policy and two-ways review trigger together. It proved local policy interaction, not hosted recognition, concurrent sessions or a new browser result. Earlier hosted and browser checks remain supplied evidence. No customer book, print source, provider setting, migration, delivery email or family switch changed. The final evidence commit changes only this directory. The updated published PR head still requires its own remote CI before merge and production verification afterward.
