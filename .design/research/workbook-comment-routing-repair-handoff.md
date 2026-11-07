# Proof-page repair correction

COMMENT_ROUTING_REPAIR_REVIEW_ACCEPTED

Previous complete candidate: `c03ae98743b266d8cd22fdb84f337ed6516fba9b`. That review failed two P2 checks. Its full gate was stopped with actual exit 143. It is not passed evidence. The correction passed independent recheck at `126985d3`. The original two migrations remain applied and unchanged. The reviewed repair migration is now applied as `20261107051924_workbook_layout_repair_contracts.sql`; its body is unchanged from the reviewed local file.

## F1: A proof page needs a saved-content authority

The API's `layoutEditPlan` computes a small page-to-fingerprint map from the loaded saved snapshot. It ignores a map supplied by the browser. The map is stored in the reviewed service-only queue plan at its current revision. No question text is copied into this new map.

The worker validates each fresh or resumed replacement against the saved page identity, raw-content fingerprint and question numbers. It also rechecks marking regions. The old image can be a proof without any print contract or measured questions. It is not used as the authority for the replacement.

SQL finish checks the saved page's workbook, page, label, day, day-page and question identities. Its new fingerprint must equal the immutable reviewed map. The map is an authenticated server assertion, like the renderer's measured image and region data. PostgreSQL does not independently derive the TypeScript fingerprint or prove image pixels. The API computes it; the worker independently recomputes it from its loaded saved content; the SQL transaction binds it to the admitted revision and plan. Browser callers cannot supply the trusted map through the POST route. Direct service-role callers remain trusted internal callers.

## F2: Repair metadata must describe the accepted pages

SQL removes old render problems only for accepted replacement pages. It preserves an unchanged selected proof page and its error, so one failed replacement does not prevent another valid page from being saved. Partial and failed comment results stay open.

An old failed-fit flag is also derived metadata. A strict accepted replacement can set only its old failed-fit flag to `fits`. The transaction then recounts `counts.failedPages`. Unselected or failed replacements retain their fit flags. Questions, answers, plan, schedule data and QR identities are copied from saved content. No caller-supplied raw content can replace them. A question's failed mathematical check is not cleared.

## Local proof

- The old core failed the new proof-to-valid test with exit 1.
- Omitting only the new repair migration makes the same public SQL tests fail for retained resolved errors, proof repair and a failed selected page beside a valid repair. The harness exposes this counterfactual as `WORKBOOK_ROUTING_REPAIR_CONTROL=prior`.
- The corrected PostgreSQL run passed the existing 23 groups, concurrent admission and seven review regressions. The added cases check selected versus unselected errors, proof repair, retained failed selected pages and derived fit counts.
- The core, real POST route over fake HTTP, and approval module passed 45 focused tests in three suites. The API test supplies a forged browser fingerprint and checks that the queued plan instead holds the actual saved-content fingerprint.
- The final correction run passed 180 tests in ten affected suites, exit 0. TypeScript and scoped ESLint passed. No full gate ran on this correction.

These are local and synthetic checks. The browser proof applies to the unchanged interface from the previous complete candidate. After the independent recheck, the controller applied the migration and ran the revised hosted repair probe. It passed the proof-page repair, selected fit-metadata update, retained unselected schedule record, partial outcomes and role checks. It rolled back with zero remaining synthetic parents or Auth users. No customer write, model call, rendering or new browser action occurred for this correction. The current customer still requires a roadmap approval relay before R2 can be saved.

## Remaining work

The independent Sol recheck passed F1/F2 with no findings. Its report is `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-b32b6c97/.design/research/workbook-comment-routing-repair-independent-review.md`. The review's standalone TypeScript command failed because generated Next.js declarations were absent. It claims no TypeScript or full-gate pass. The controller's typegen and TypeScript check passed separately. After application, official type regeneration exited 0 and was byte-identical, SHA-256 `6963b7a7d31e8c9025eb8bb6f2b815266ef676e1ee48847a3d0d0ff94c29c6ae`.

Hosted verification at `2026-11-07T05:21:14.289739Z` found both deployed function bodies equal to the reviewed bodies, with service-only access. There were zero active runs or edit batches. The customer remained at revision 1 with 14 comments and zero complete comments.

The complete final full gate, exact-head remote checks, and coordinated merge remain with the controller. Keep the existing customer approval and print holds.
