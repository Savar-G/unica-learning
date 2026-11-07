# Schedule verification

Machine: Savars-MacBook-Pro-5.local. Checkout: `site/parent-schedule`. Source checked: `c3ad24e38e87170cf8e35187053c6e20e1b9b8e3`, including actual PR689 through `8b89949e`.

## Code and complete checks

- The independent Sol review found one P2: the phone Admin preview removed its field-label attributes. Root permitted only the inert `data-label` attribute. Four new cases failed on the prior source. All 247 focused tests passed after the repair. The independent Sol recheck approved `c3ad24e3` with no open finding and confirmed hostile markup stays blocked.
- The serial full suite passed 480 files and 17,191 tests, with one optional skip. Command: `npm test -- --maxWorkers=1`. Exit 0; 934.03 seconds. Source ESLint and `npm run build` also exited 0. No test or timeout was weakened.
- The shell uses one bounded book-existence read per child. Draft, question and receipt reads run only for the selected Schedule page. The full print check uses the approved exact saved revision, PDF identity, manifest, contracts, QR tokens and question geometry. It does not use the current template or render a book.

## Hosted store and local browser

- The hosted schema has immutable accepted receipts, an accepted-only constraint, family/child write fences and cascade ownership keys. Direct authenticated receipt reads are Admin-only. Schedule reads through an authorized server client with exact family, child, book, print revision and canonical page scope. It writes no receipts. Missing historical records are unknown, never zero scans.
- Actual hosted read-adapter checks used two owned synthetic families, four children and three frozen books. Both owned schedules returned ready and their exact stored rows. A child without a book returned waiting. A foreign child and an owned child's sibling book were refused. The ordinary parent's direct draft read returned zero rows. No receipt, file or actual customer record was written by this fixture.
- The local production build returned HTTP 200 for both owned schedules and the no-book waiting state. Foreign child, sibling book and ordinary-parent Admin requests returned 404. Signed-out Schedule returned 307 to `/sign-in?next=%2Faccount%2Fschedule`. A matching Desk lock returned 307 to `/tutor`. Status, response sizes and timings are in `http-access-proof.json`; these timings are observations, not performance claims.
- Aside verified both children on desktop and phone. The child switch kept Schedule. A plain Schedule address reopened the remembered child. At 390 pixels, all four phone field labels were visible and no horizontal overflow appeared. The no-book Schedule tab stayed hidden while the direct route showed a useful message.
- The authenticated Admin preview kept its `allow-same-origin` sandbox, ten rows, the selected child's content and all four computed phone labels at a 390-pixel frame width. Controls remained disabled. These preview counts are synthetic, not receipt admission proof.
- A fresh browser password sign-in against the local production build returned automatically to `/account/schedule` and showed Leah. Auth returned 200 and no captured browser error occurred. An earlier reused development-session attempt stayed on Saving; that attempt is not counted as a pass. The production-build repeat supplies the successful return evidence. No common Auth source changed.
- Eight PNG screenshots are included. All have verified PNG headers and durable copies outside the temporary Aside session. Browser tabs and servers were closed. Synthetic cleanup confirmed zero remaining parents, children, books, drafts, audits and Admin roles.

## Printed schedule and limits

The prepared first-book revision's ten stored rows match the versioned Schedule projection. Visual inspection of its existing PDF page 2 confirms the rows, ranges and global daily time of about 25 minutes. That prepared draft has no selected public approved book. This read-only comparison does not approve printing or prove the parent route for that customer. The hosted browser fixture used synthetic contracts and did not prove real PDF or image bytes.

The receipt owner's positive hosted admission and full #475 release proof remain separate. Current-main integration, required remote checks, live production verification and the full dashboard UI approval remain pending. No family switch, provider call, print source, receipt writer or reminder changed.
