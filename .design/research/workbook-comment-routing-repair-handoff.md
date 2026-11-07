# Proof-page repair correction

COMMENT_ROUTING_REPAIR_REVIEW_READY

Previous complete candidate: `c03ae98743b266d8cd22fdb84f337ed6516fba9b`. That review failed two P2 checks. Its full gate was stopped with actual exit 143. It is not passed evidence. The original two migrations remain applied and unchanged. New migration `20261107045738_workbook_layout_repair_contracts.sql` is local and unapplied.

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

These are local and synthetic checks. The original hosted role/rollback proof and browser proof apply to the previous complete candidate. A fresh hosted repair probe is required after this migration is reviewed and applied. No new customer write, model call, rendering or browser action occurred for this correction. The current customer still requires a roadmap approval relay before R2 can be saved.

## Remaining work

Independent Sol recheck, hosted application and rollback proof, official type regeneration, complete final full gate, exact-head remote checks, and coordinated merge remain with the controller. Do not apply the migration or write customer data during review. Keep the existing pending approval and print holds.
