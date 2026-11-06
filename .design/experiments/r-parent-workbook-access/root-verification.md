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
