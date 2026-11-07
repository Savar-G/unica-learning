# Independent R2 maintenance SPEC and STANDARDS recheck

SPEC: PASS

STANDARDS: PASS

VERDICT: VERIFIED for the bounded F1-F4 backend repair. No new confirmed finding remains in this scope.

## Fixed source and scope

- Computer: `Savars-MacBook-Pro-5.local`, verified at start and after checks.
- Runtime model: Codex `gpt-6.1-sol`, high reasoning effort. The task assigned the Unify account. No delegate or substitute model was used.
- Checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-b62d245e`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-b62d245e`.
- Verified branch: `site/workbook-scan-receipts-475`.
- Required and final candidate: `da2020cda65058af37e08e2cc3d311d5cfdf8a41`.
- Rejected fixed base: `4a847c83d89a5ee2f229c38693e027ebabe08ef8`.
- Comparison: `git diff 4a847c83d89a5ee2f229c38693e027ebabe08ef8..HEAD`.
- Commit: `da2020cd Fence scan recovery and final reminder admission during failures`.

The first command verified the computer, physical path, branch, empty short status and candidate. No checkout was created, changed, switched or updated. The PC's unavailable state came from the task. This reviewer did not repeat that connection check.

The review read the applicable AGENTS.md, shared agent brief, code-review and Unica evidence-review procedures, preserved independent rejection, R2 handoff and progress contract. It traced the route, recovery helper, maintenance core and factory, typed stores, sender, shared queue, cron caller, receipt/clock SQL, episode/admission SQL, canonical progress core, parent reader, projection and relevant tests. The installed Next after guide and actual AfterContext source supplied the framework contract. No unrelated product was audited. The explicit no-delegation and focused-check limits controlled the general procedures.

Before checks, the stated falsifiers were: OFF creates a service client; the callback reads a global queue or writes a foreign calendar; marker removal during identity reads reaches admission; a permission-read failure permits later work; or synchronous after registration changes confirmed delivery to 503. The review also checked retained unknown results and committed SQL admission as distinct cases.

## F1-F4 results

| Prior finding | Source binding | Fresh evidence and result |
| --- | --- | --- |
| F1 P1: delivery callback ignored release and owner scope | `src/lib/workbook-scan-recovery-server.ts:16`, `:25`, `:33`, `:36`, `:40`, `:42`; scoped reader at `src/lib/workbook-scan-clock-store.ts:39` | CLOSED. Invalid/OFF release returns before adminClient. The book must match the requested ID, shipped status and configured owner. Current test permission precedes reconciliation and calendar write. The selected-book reader scopes before its count and bound, rejects foreign replies and never calls the global reader. Independent probes removed permission before reconciliation and before record. Neither write started. A foreign reply made no calendar write; its matching control recorded once. Recovery/client errors resolve without changing the committed response. |
| F2 P1: final marker read preceded asynchronous handle reads | `src/lib/workbook-scan-reminder-store.ts:185`; production callback binding at `src/lib/workbook-scan-maintenance-server.ts:66` | CLOSED. `current(handle, reserved)` completes before beforeAdmit. The callback is directly before the admission RPC. Four independent delayed-response probes removed permission while each of message, attempt, log and links was pending. All completed without SQL admission, provider start or release. A concurrent ordinary-send probe verified immediate factory use and showed that the handle reads waited in the shared queue. Removal during that wait blocked scan admission. A separate probe changed permission in the committed admission response and still dispatched once, as required. |
| F3 P2: tolerant recovery hid a permission-read failure | `src/lib/workbook-scan-maintenance.ts:74`, `:90`, `:99`, `:111`; factory failure state at `src/lib/workbook-scan-maintenance-server.ts:55`, `:62`, `:72`, `:98` | CLOSED. The scheduler records a fatal clock error before the tolerant core consumes it. Later wrapped store operations stop, and the scheduler throws before later phases. Fresh tests cover the original third permission-read failure with a pending clock, a matching successful control and a lost clock write before a second record. An independent last-permission failure used a database that failed once and then returned a valid marker. The same factory still rejected its second run without any new request. A lost committed admission response caused no provider call, release or second admission. Unknown results retain their existing safe meaning. |
| F4 P2: synchronous after registration returned 503 after confirmation | `src/app/api/admin/workbooks/[id]/delivery/route.ts:37` | CLOSED. Registration has its own catch after confirmation. A fixed diagnostic is logged and the confirmed response remains 200. Candidate public POST tests exercise confirmation with installed Next E91 and E1376. Independent public POST tests exercise correction with both actual error codes and verify 200 plus private/no-store. Auth, origin, absent book, zone, malformed input, invalid workbook ID, invalid action and refusal guards remain. |

No new finding has the concrete unsafe result needed for a report. No separate documented-standard violation or actionable code smell was confirmed. The changed tests use public interfaces. No shared query type was removed and no query type bypass was added. This repair adds no schema change.

The application marker read and the later SQL transaction are separate operations. This review does not claim that they are atomic. The fixed requirement is the last application gate after avoidable asynchronous identity reads. SQL owns committed admission. A later marker change cannot recall that admission.

The approved receipt hooks remain context. Their durable scan facts, Day 7 claim, separate 21-local-day backstop and zero-scan HOLD were not changed or redefined.

## Fresh commands and results

All commands ran in the fixed physical checkout. No full suite or build ran.

Focused public-interface cluster:

```sh
node_modules/.bin/vitest run src/lib/workbook-scan-progress.test.ts src/lib/workbook-scan-clock.test.ts src/lib/workbook-scan-clock-store.test.ts src/lib/workbook-scan-progress-reader.test.ts src/lib/workbook-scan-progress-store.test.ts src/lib/workbook-scan-recovery.test.ts src/lib/workbook-scan-recovery-server.test.ts src/lib/workbook-scan-reminder-calendar.test.ts src/lib/workbook-scan-reminder-email.test.ts src/lib/workbook-scan-reminder-send.test.ts src/lib/workbook-scan-reminder-store.test.ts src/lib/workbook-scan-maintenance.test.ts src/lib/workbook-scan-maintenance-server.test.ts src/lib/reminders.test.ts src/lib/email-delivery.test.ts src/app/api/reminders/route.test.ts src/app/api/account/scans/progress/route.test.ts src/lib/workbook-delivery-progress-route.test.ts src/lib/workbook-delivery.test.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/475-r2-independent-focused.json
```

Exit 0. JSON assertion count: 462 passed, 0 failed, 0 skipped, 19 files. This is the exact fresh selection. It does not substitute the supplied 461 count. Log: `/tmp/475-r2-independent-focused.log`.

Independent probes:

```sh
node_modules/.bin/vitest run src/lib/zz-475-r2-independent-interleaving.test.ts src/lib/zz-475-r2-independent-recovery.test.ts src/lib/zz-475-r2-independent-route.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=/tmp/475-r2-independent-probes-final.json
```

Exit 0. JSON assertion count: 16 passed, 0 failed, 0 skipped, 3 files. Log: `/tmp/475-r2-independent-probes-final.log`. The HTTP tests use the actual Supabase client with synthetic fetch responses. Provider operations use fakes. Temporary probe sources were copied to `/tmp/zz-475-r2-independent-*.test.ts` and removed from the checkout.

An earlier queue probe timed out because its fixture waited for a queued handle read while it held the preceding provider response. That fixture did not represent progress through the serial queue. The corrected probe waits for the reservation, proves no handle read starts while the first provider is held, then releases that provider before waiting for the handle response. The initial run had 7 passes and 1 timeout, exit 1. Its log is `/tmp/475-r2-independent-interleaving.log`. It is not a product finding. The corrected run passed 15 probes. The final run added the original third-read failure and passed 16 probes.

Scoped ESLint:

```sh
node_modules/.bin/eslint src/lib/workbook-scan-recovery-server.ts src/lib/workbook-scan-recovery-server.test.ts src/lib/workbook-scan-maintenance.ts src/lib/workbook-scan-maintenance.test.ts src/lib/workbook-scan-maintenance-server.ts src/lib/workbook-scan-maintenance-server.test.ts src/lib/workbook-scan-reminder-store.ts 'src/app/api/admin/workbooks/[id]/delivery/route.ts' src/lib/workbook-delivery-progress-route.test.ts
```

Exit 0. Log: `/tmp/475-r2-independent-eslint.log`.

A fresh `node -` command loaded the installed TypeScript compiler and tsconfig.json. It took the nine changed source/test files from `git diff --name-only 4a847c83d89a5ee2f229c38693e027ebabe08ef8..HEAD -- src/`. It added existing Next declaration files, used noEmit:true and incremental:false, and retained diagnostics for those files plus global errors. Result: `SCOPED_FILES 9 DIAGNOSTICS 0`, exit 0. Log: `/tmp/475-r2-independent-types.log`. This is a scoped compiler check, not a whole-project gate.

## Prior-source controls

This reviewer inspected the supplied actual logs and exit files under `/Users/savargupta/unica-workbook-samples/overnight-20261107/475-r2-`. The logs show intended assertion failures, not missing setup or syntax errors:

| Control log | Result |
| --- | --- |
| `475-r2-F1-prior.log` and `.exit` | Exit 1. Five failures, ten skipped. OFF created a client, non-test permission allowed mutation, and a foreign request reached a write. |
| `475-r2-F2-prior.log` and `.exit` | Exit 1. One failure, 21 skipped. Removal during the links read returned sent instead of not_sent. |
| `475-r2-F3-prior.log` and `.exit` | Exit 1. Two failures, 17 skipped. Permission-read and uncertain-write paths resolved instead of rejecting. |
| `475-r2-F4-prior.log` and `.exit` | Exit 1. Two failures, five skipped. Both installed Next registration errors returned 503 instead of 200. |

These are supplied controls, checked against their written claims and the rejected-source diff. This reviewer did not repeat source mutations in the frozen checkout. The 16 independent probes are fresh candidate evidence, not new prior-source controls.

## What each subsystem proved

| Subsystem | Proven in this recheck | Passed through or still unproved |
| --- | --- | --- |
| Delivery recovery | OFF/invalid release makes no service client; configured test ownership and selected-book requests constrain the callback; failures preserve the response. | SQL was traced as context. No hosted calendar write or role probe ran. |
| Maintenance | Permission-read failure stops later work; the same failed factory performs no later requests; uncertain clock writes stop later records. | No hosted outage, transaction race or scheduler deployment proof. |
| Admission and queue | Delayed identity responses, immediate use, concurrent ordinary send, final marker check, committed admission and lost admission behavior passed with real-client fake HTTP. | The local fake models SQL outcomes. It does not establish hosted locking or provider delivery. The focused sender suite also covers pacing and slow admission. |
| Receipt, progress and calendar | The focused public-interface tests passed. Source retains accepted receipts independently of marking and photo expiry, full printed Day 7, exact delivery identity, shared family time and separate backstop/HOLD behavior. | No print, customer scan, hosted lifecycle or new SQL execution. |
| Parent projection | The focused endpoint/store tests passed. The endpoint keeps explicit public fields and a final live-session check. | No signed-in hosted role, browser or UI acceptance. |
| Cron and email | The focused cron, reminder and shared-delivery tests passed. Source retains the dry path, shared transport, token hiding, protected scan link and ordinary reminder unsubscribe scope. | No positive hosted transport, recipient, copy or unsubscribe proof. |

## Integrity and limits

All 3,970 tracked file bytes were hashed before probe creation and checked after cleanup. Zero changed. The initial and final index SHA256 is `c7a249dbfdabfe8536fe400c49e9a1bff229189c23d6b0d287ba2acd4ef335b1`.

`git diff --exit-code`, `git diff --cached --exit-code` and `git diff --check` each returned 0. The final status contains only this untracked report. All own test, lint and compiler processes stopped. No temporary in-checkout probes remain.

No product edit, commit, checkout operation, install, full suite, build, browser, Chromium, dev server, hosted/service/provider/email call, paid action, GitHub comment/PR/push/merge, customer write, family switch, deletion or print ran. No environment file or credential was read. No release flag was changed. Real-parent email remains OFF by the task's constraint; no live configuration verification is claimed.

Root retains positive hosted lifecycle/role/transport/unsubscribe proof, Schedule/design/UI approval, the final full gate, main integration and publication. Current main #695 and reader #696 were not imported. No customer R2, 14-comment closure, email, print, whole-475 or family-release acceptance is implied.

Final computer: `Savars-MacBook-Pro-5.local`.
Final verified branch: `site/workbook-scan-receipts-475`.
Final SHA: `da2020cda65058af37e08e2cc3d311d5cfdf8a41`.

SPEC: PASS
STANDARDS: PASS
VERDICT: VERIFIED for the bounded F1-F4 repair only.

HANDOFF_DONE
