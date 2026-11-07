# #475 maintenance review repairs

MAINTENANCE_R2_IMPLEMENTED_RECHECK_PENDING

Machine: Savars-MacBook-Pro-5.local. Branch: site/workbook-scan-receipts-475. Rejected base:4a847c83d89a5ee2f229c38693e027ebabe08ef8. Actual implementation: Unify Codex gpt-6.1-sol high.

The independent maintenance report recorded SPECFAIL/STANDARDSPASS with four confirmed findings. Preserve that report. No source from the rejected candidate is claimed ready for release.

## Written finding list and repairs

1. P1 delivery recovery bypassed the test-only scope and drained a global clock request. The helper now validates the shared release before creating a service client, resolves the delivered book's owner, requires configured ownership and a current test marker, uses only selected-book requests and rechecks permission before writes. Public real-client tests cover off/invalid release, unlisted or non-test owners, foreign requests, removed markers, service failure and the successful saved-clock path.
2. P1 the last test-marker read preceded four asynchronous handle reads. workbookScanReminderSendStore now accepts beforeAdmit and invokes it only after current(handle,reserved) succeeds, directly before its admission RPC. The production factory supplies its test gate through that callback. A test removes the marker when the links read returns; no admission or provider call follows. This is the final application check, not a claim that an application read and a separate SQL transaction are atomic. Committed admission remains distinct.
3. P2 tolerant clock recovery hid a permission-read error and allowed later phases. Maintenance records a fatal clock error, prevents later database operations and rethrows after the reusable tolerant core returns. Permission failures also remain fatal for that server factory invocation if the sender consumes the thrown error while retaining uncertain admission. Tests cover the original third-read failure, successful control, lost clock writes, last admission permission-read failure and a second call after failure. No unknown send is released or automatically retried.
4. P2 after() registration failure changed a committed delivery response to503. Registration now has its own catch after confirmation. It logs one fixed diagnostic and returns the confirmed response. Tests use the installed Next AfterContext for both real missing-waitUntil and onClose registration errors.

## Binding controls and checks

Each changed runtime file was restored byte-for-byte after a prior-source control against4a847c83. All four controls exited1 at their intended assertions: F1fivefailed/10skipped; F2onefailed/21skipped; F3twofailed/17skipped; F4twofailed/5skipped. No control failure came from syntax or missing setup. Logs: /Users/savargupta/unica-workbook-samples/overnight-20261107/475-r2-F1-prior.log through475-r2-F4-prior.log.

The repaired focused cluster passed461tests/19files, exit0. Scoped ESLint exited0. Initial scoped TypeScript found an empty-array fixture inferred as never[]; an explicit typed batch record fixes that type only. Final scoped TypeScript returned0diagnostics and exited0. No assertion or runtime guard was weakened.

No full suite, build, browser, Chromium, hosted query/write, provider/email call, customer write, family switch, charge, plan start, deletion or print action ran. All public tests use synthetic data and real Supabase-client request seams. No customerR2, comment closure, print approval or release acceptance is implied. Root retains independent Sol recheck, hosted positive proof, Schedule design/approval, full gate, main integration and publication.
