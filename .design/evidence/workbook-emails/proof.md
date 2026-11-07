# Parent workbook emails: proof and release limits

Date: 2026-11-06. Machine: Savar's MacBook Pro (4).

## Scope

Issue #676 adds Workbook ready, Hand delivery and Courier controls to each printed admin workbook. Issue #681 adds the approved parent instructions. The welcome addition follows merged PR #678, main `641013291249331ad593cd7f11ae3010261ff729`. D294 and D295 are reserved for this work. D293 is not changed.

The approved words are in the two [#681 comments](https://github.com/Savar-G/unica-learning/issues/681#issuecomment-6692148719), [including the final contact line and welcome addition](https://github.com/Savar-G/unica-learning/issues/681#issuecomment-6692204855). Every generated text is collected in `docs/workbook-email-copy.md`.

## Hosted database

Migration `workbook_ready_emails`, version `20261106182253`, was applied to `cdjobwsyzndtltzfpyqa` and found in `list_migrations`. Database types were regenerated with `npm run db:types`.

Both `supabase/tests/workbook_emails.sql` and `supabase/tests/workbook_ready_emails.sql` passed on the hosted database. They use synthetic rows and roll back all data. They cover service-only claims, duplicate keys, definite refusal retries, uncertain sends, active earlier-stage sends, expired claims, stale outcomes, tracking validation, stored copies, parent access and deletion. The new probe also checks that claims leave the saved card and plan unchanged. These are sequential database probes. They do not prove a two-session database race. Local server tests make concurrent calls against an in-memory claim fixture.

No provider email, real signup, card change or billing action was made. Existing family write fences and role grants remain.

## Local public-interface tests

Targeted tests cover the approved text and HTML, fixed production links, no Maya step for younger or invalid grades, the stored child grade and family scope, persisted message copies, send generations and retry behavior. Component tests drive preview, ready, hand delivery, courier validation, a lost response and existing dispatch records. Tests do not call paid models or providers.

## Aside browser

The real `WorkbookEmails` component was bundled into a temporary local fixture with the existing base, warm and admin CSS. Its fetch seam records synthetic requests in memory and cannot send email. It was served with `npm run dev`.

- Ready and Hand delivery open previews before any request. The dispatch uses the stored workbook number.
- Empty courier fields keep Preview disabled. The optional HTTPS tracking link remains available and appears in the preview.
- An uncertain provider result disables all send actions and offers a status reload.
- At 390 pixels, the courier fixture had a 375-pixel document width. Every email action measured 44 pixels high. No horizontal overflow was present.
- The generated Grade 3 free-month HTML contains Schedule, Scan, Parent home, Feedback and Plan links at the approved production addresses.
- The generated Grade 2 free-month HTML contains no Maya setup step or Parent home link. It retains Schedule, Scan, Feedback, Plan and billing instructions.
- The welcome HTML retains the preparation-time paragraph and founders' signature. It includes the approved no-action paragraph and a clickable Feedback link.
- The Grade 2 and Grade 3 email documents each measured 375 pixels inside a 390-pixel viewport. `free-month-grade3-phone.png` shows the generated email.

All temporary public files and browser tabs were removed. These checks prove local rendering and interaction with synthetic data. They do not prove hosted admin sign-in, provider delivery or email-client rendering.

## Review correction

Independent Codex Sol review of `3a188483ee04c7cd2b9bf041a369051662a19d57` found one P2 recovery defect: a busy response left a local hold after another admin's send received a definite refusal. The initial review verdict was FAIL. The builder corrected the hold so only a refreshed failed record can permit that retry. Old failed snapshots, active sends, uncertain outcomes and confirmed sends remain held.

The two new public component tests failed before the fix and passed afterward. All 80 tests in the eight targeted files then passed. Aside also checked Ready and Dispatch through the actual component with a synthetic busy response followed by refreshed failed data. Both permitted another preview and request. No provider send was made. The approved email-copy document has no changes from this correction. The correction was checked by the builder; no second independent review was requested for this small fix.

## Release remains blocked

FEEDBACK680_EVIDENCE_ACCEPTED

The #680 owner supplied live Feedback evidence for PR #687, merged as `9d3e0d3dffaa0d750b3ded3c58ecbe809c37e3e3`. The builder read the report at `/Users/savargupta/unica-workbook-samples/parent-dashboard-remaining-20261106/pd687-live-feedback-evidence.md` and confirmed its `LIVE_FEEDBACK680_READY` marker. The report binds canonical production to that merge. It records actual no-child/no-workbook parent access, sign-in return, submission, Admin access checks, parent REST reads with zero visible rows, Desk GET/POST refusal and fixture cleanup. All-stage coverage combines the route invariant and local stage matrix with the actual live pre-child case. The Desk browser check used a synthetic lock cookie; it does not prove a complete live child/PIN session. This is supplied release evidence, not a new hosted check by the email builder.

SCHEDULE679_EVIDENCE_ACCEPTED

The #679 owner supplied live Schedule evidence for PR #691, merged as `356e6f40fc12552fbdedb717a8607f498832f09a`. The builder read `/Users/savargupta/unica-workbook-samples/parent-dashboard-remaining-20261106/pd691-live-schedule-evidence.md` and confirmed `LIVE_SCHEDULE679_READY`. The report binds the canonical production deployment to that merge and records actual sign-in return, two-child scope against each stored page-2 row, remembered selection on the plain route, phone labels, waiting state, foreign and sibling-book refusal, the Desk lock and cleanup. Non-test families remain refused with release switches off. The actual prepared R1/PDF comparison remains separate from synthetic live contracts; it grants no customer print or receipt approval. No optional product or child query is required.

EXPLAIN675_MERGE_CONFIRMED

PR #693 merged as `d4af3d62d5fba25ba3b39441d9cc719b2bf06604`. The builder read `pd693-merge-handoff.md` in the same evidence directory and confirmed `PR693_MERGED_NON_PRINT_WINDOW_RELEASED`. This integration preserves `ef1613271311403c61bf5914dbf8966932a91771` and its six comparison-fixture additions. The merge notice does not establish canonical production promotion or live explanation-route verification. Those checks remain with the #675 owner and must arrive before release.

Feedback and Schedule evidence conditions are satisfied, and #675 is merged. Release remains blocked until the pending #675 production verification arrives, required checks pass on the final head, and a fresh independent Sol high review passes with no open finding. No family release switches change in this work. No customer email or print action is authorized by these evidence records.
