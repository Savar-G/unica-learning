# Feedback root verification

Implementation base: 8491309de57f9e91c37c73699e7c9626fad17fd7. Implementation commit: d1aaed29dd1f8305661661c255a096b5e4405646. Computer: Savars-MacBook-Pro-5.local.

## Hosted schema

Applied parent_feedback as 20261106222843. The migration ledger includes the marking evaluation migration 20261106215033. Official npm run db:types completed with exit 0. It includes Feedback, marking evaluation and other already-applied schema declarations. No generated type was edited by hand. The database has RLS, the Admin-only read policy, service-only RPC grants, no direct insert grant for service or parents, and both write fences. The security advisor returned no Feedback finding. Existing service-only tables without parent policies retain their existing informational notices.

## Hosted public interfaces

Two owned synthetic Auth parents had no children or workbooks. The parent REST read returned HTTP 200 with zero rows. The Admin REST read returned HTTP 200 with three synthetic rows. Anon read returned 401. A parent direct write returned 403. Twenty simultaneous service RPC calls for a parent with one existing message returned saved=4 and rate_limited=16. Exact retry returned duplicate at the limit. Changed text under that request ID returned conflict.

A hosted rollback transaction checked foreign-child refusal, queued-child refusal, child cascade, queued-family refusal and family cascade. All passed. No rollback child remained. The subsequent real Auth cleanup removed both owned families and all their Feedback and Admin rows. Final counts: parents=0, feedback=0, admins=0. No customer rows were changed.

## Browser

Actual local routes used feedback-qa-20261106.localhost:3086. The dev server explicitly used that hostname, so the normal origin check remained intact. The first attempt used the default localhost server origin and correctly returned 403. That refused attempt was not counted as a successful save.

The actual form saved through the real route and hosted RPC. Success cleared the field. Empty text showed its refusal. A 5,500-character paste showed the too-long refusal and retained all characters. The actual Admin product filter returned only the one Workbook row. The normal parent saw a 404 with no Admin rows. A signed-out parent reached sign-in with next=/account/feedback, signed in through the real email/password form, and returned to Feedback. This parent had no children or workbooks.

A synthetic Desk lock cookie under the real parent session redirected the Feedback page to /tutor and returned 423 desk_open for direct POST. This proves the cookie gate, not a live child Desk session or a new end-to-end PIN flow. Restored-tab behavior is covered by existing local guard tests.

All twelve desktop/phone PNGs use actual local routes and synthetic data. Parent screenshots show the no-child state. The frame-link state preselects Workbook. Admin screenshots show real local /admin/feedback with synthetic hosted rows. The narrow Admin table scrolls horizontally. Screenshot dimensions: desktop 1280x889; phone 390x844. The browser uses CSS viewport sizes, not physical phone hardware. Screens were sent to the roadmap before any Feedback merge. Savar approved the screens with two corrections; see approved-ui-correction.md.

Both owned browser tabs were closed. The local QA server stopped. No provider notification, customer email, paid call, print action, price or family release switch changed.

## Checks and remaining limits

Implementation focused tests: 231 passed. Local PostgreSQL: 10 case groups passed, including twenty concurrent admissions and two-session deletion races. Root lint and production build exited 0 after official type generation. The first root serial suite found legacy navigation mock and snapshot failures. All affected page tests passed after the required link was added to their fixtures. A fresh full serial suite is running; see approved-ui-correction.md. Independent review, remote CI, PR and production route verification remain pending. Local tests and rollback proof do not prove scheduled execution or concurrent full hosted deletion-worker operation.
