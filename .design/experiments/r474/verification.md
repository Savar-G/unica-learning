# S11a verification

Base: `63d52fad99928a2a1ab170ab1dcbed97303fdb39`. The manifest records the exact code/schema file fingerprint and file list. Model and prompt versions do not apply. There are no AI calls. No upload or marking limits change in this slice.

| Subsystem | Failure that would disprove the claim | Observed result and limit |
| --- | --- | --- |
| Hosted delivery action/store | Duplicate receipt/audit, changed actor/time on retry, or different results after reload | Eight concurrent HTTP requests returned one receipt. A fresh authenticated store read and HTTP retry returned the original receipt. One audit entry. Synthetic data only. |
| Book 2 and local deadlines | Book 2 uses book 1's time, changes book 1, or loses local minutes through a clock change | Distinct persisted receipts. Four/21-day anchors preserve 09:37 in Toronto through the seasonal change. Public unit tests also cover the Vancouver override, a postal exception, a repeated clock hour, and a clock gap. These are initial anchors, not reminder eligibility or dispatch. |
| Refusals and database boundary | A parent/anonymous user confirms, foreign identity succeeds, invalid/future/unshipped input persists, or a direct browser write succeeds | HTTP and direct-RPC denials passed. Owner/admin read succeeds; another family reads none. Anonymous table access and browser inserts/updates/deletes fail. Service updates fail the immutability trigger. The database also refuses mismatched instant/local-time input. |
| Separate billing action | Missing or wrong first-book receipt reaches Stripe, or the existing billing Boolean stops being required | Route tests use a fake provider. Missing/foreign/book-2 receipts make zero Stripe initialization/start calls. A valid book-1 receipt still requires the separate confirmation and passes the original customer/price/delivery parameters. No live subscription was started. Receipt confirmation has no billing or AI operation. |
| Family deletion and retention | A frozen family receives a receipt, or the actual worker leaves receipts/audit rows | Retry after freeze is refused. The real hosted retention worker deletes the synthetic Auth user, receipts, and audit rows. No new image storage exists. Existing retention eligibility rules remain unchanged; this slice adds no test-activity read or copy data. |
| Admin UI | The input or saved receipt fails at laptop/tablet/phone, cannot reload, or causes page overflow | Aside u0 submitted the actual form, then reloaded the saved receipt. Missing and confirmed states captured at 1440x1000, 768x1024, 390x844. Document width equals viewport width in both states. Existing audit tables scroll inside their container. Builder visual review only; Savar approval is pending. |
| Full gate | A test, source lint, type check, or production compile fails | `npm test`: 272 files, 12,404 tests passed, exit 0. `npx eslint src`: exit 0. `npm run build`: exit 0. These checks do not prove a deployed UI or live Stripe behavior. |

The first full run exposed one old billing fixture without a first-book receipt. That fixture now includes the required receipt. The final full run passed. Early browser harness attempts failed on unsupported cookie-context access and an out-of-session screenshot path. They are setup failures, not product failures. The final screenshots use Aside's allowed session directory and were then copied here.

The additive migration was applied to `cdjobwsyzndtltzfpyqa`. `list_migrations` includes hosted version `20261102223909`, name `workbook_delivery_receipts`. A probe confirmed RLS is enabled. `npm run db:types` generated the 83-line table/RPC addition. Live HTTP/RPC tests exercised the hosted schema, grants, policies, and family freeze. No real family row was changed.

Reproduce with a test-only local `.env.local`, a local Next server, and the existing worker key saved privately at `/tmp/r474-worker-key.json`:

1. `npm run dev -- --port 3474`
2. `node scripts/workbook-delivery-hosted.mjs prepare`
3. `node scripts/workbook-delivery-hosted.mjs check`
4. Check the marked test family's workbook through Aside u0. Capture missing and confirmed states. Do not use real family rows.
5. `node scripts/workbook-delivery-hosted.mjs delete`

The script keeps synthetic account credentials under `/tmp`. Do not commit them. The worker key has the same privileges as the deployed family retention job. The evidence files contain no key or session token.

#475 supplies accepted-scan progress, Day 7 re-evaluation after delivery, reminder episodes and send-once claims. This PR supplies the durable per-workbook prerequisite and public reader/deadline interfaces. It does not implement that dependent slice. Existing S1 image-access/expiry tests were not repeated because this slice adds no images, image routes, jobs, or bucket.

Keep #474 open until Savar approves the appearance. Do not merge this PR without that approval.
