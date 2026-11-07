# #475 typed reminder adapter

ADAPTER_IMPLEMENTED_REVIEW_PENDING

Machine: Savars-MacBook-Pro-5.local. Branch: site/workbook-scan-receipts-475. Base:8af9fd37ba345b652d0d96eec645e020df91aff1. Actual model: Unify Codex gpt-6.1-sol high.

The separate implementation task stopped cleanly at a wrong prepared base550fdcf1, without edits. Root implemented this slice in the existing owned475 checkout.

## Public interfaces

- listWorkbookScanRecoveryBooks(db,kind,limit,after=null): typed bounded keyset rows for unseeded/due/inactivity/reminder-due. An invalid, duplicate, oversized or non-advancing answer throws.
- workbookScanInactivityStore(db): context/propose for the existing pure calendar module. It preserves the database observation time, explicit null activity, raw family clock context and delivery override policy. It computes no time arithmetic. Recorded answers must match the saved identity, context and canonical deadline.
- readWorkbookScanReminderDue(db,parentId): complete ready episode/child sets, refresh-required, unavailable or unsubscribed. A missing set is not an empty set.
- workbookScanReminderSendStore(db): claim/admit/current/copy/finish/release for the existing send coordinator. current reads the exact parent/message/attempt/log/link state and rejects missing exact counts, changed tokens, foreign children or incomplete sets. Existing saveEmailCopy retains token hiding and database child/family fences. SQL retains the final token/state checks.
- LogKind now admits the already-hosted scan_inactivity kind. The four assessment reminder kinds and timing rules are unchanged.

## Checks and limits

The falsifiers were substituted or missing scope, changed attempt tokens, incomplete sibling sets and a lost admission response allowing dispatch or release.

- Six focused suites passed212tests, exit0: adapter, calendar, email template, send coordinator, email-delivery and assessment reminders.
- One disabled-message-token negative control exited1:1failed,9passed,49skipped. The binding false assertion became true. The complete source was restored byte-for-byte; SHA2567d3b9343c5ef2a2edc056851741ad7f123dd1e93e13515be2236c278141b7bd5 at restoration.
- Initial expanded calendar reply check caught an object-reference comparison error. It now compares canonical JSON text. The valid recorded path and four substituted recorded paths pass.
- Scoped TypeScript initially caught two narrowing errors and an incomplete EmailCopy fixture. Corrected scoped check exited0 with no diagnostics.
- Scoped ESLint exited0. Whitespace check passed.
- Context/recovery tests prove real Supabase-client request serialization and rejected synthetic responses. They do not prove hosted PostgREST permissions or real family history.
- Send/copy tests prove synthetic admission/outcome binding, token hiding, no send/release after a lost admission answer, and immediate public-factory use. They do not send an email or prove provider delivery.
- Concurrent context reads prove independent per-book mapping. Database concurrency remains covered by the separate prior local SQL fixture; no new hosted concurrency proof is claimed.

Evidence logs are under /Users/savargupta/unica-workbook-samples/overnight-20261107/475-store-*. No full suite, build, browser, provider, email or customer operation ran. All owned check processes stopped.

Root retains independent Sol review, scheduler integration, hosted positive proof, parent UI coordination, combined full gate and publication. Real-parent reminder delivery and real next-book queues remain off. CustomerR2, all14comment closures and printing remain held.
