# Independent maintenance and recovery review

SPEC: FAIL

STANDARDS: PASS

VERDICT: REJECT the bounded backend candidate. Four confirmed specification failures require fixes.

## Frozen source

- Computer: `Savars-MacBook-Pro-5.local`, verified with `hostname`.
- Review model: Unify Codex `gpt-6.1-sol`, high reasoning effort.
- Prepared checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-b62d245e`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-b62d245e`.
- Verified branch: `site/workbook-scan-receipts-475`.
- Exact candidate: `4a847c83d89a5ee2f229c38693e027ebabe08ef8`.
- Scheduler comparison: `git diff 5e4dd0c778cf42f9f8ecd3b3289ddf2541f9b000...HEAD`.
- Earlier root integration comparison: `git diff d4af3d62d5fba25ba3b39441d9cc719b2bf06604 HEAD --` with the specified recovery, parent progress, delivery route and delivery helper paths.

The first checkout command verified the branch, empty short status and exact HEAD. Both fixed points resolved. No checkout, branch, delegate or top-level thread was created. The PC limit was supplied by the task. This reviewer did not make a new PC connection attempt.

The review used the task's specification, actual project `AGENTS.md`, shared delegate brief, code-review skill and Unica evidence-review skill. The explicit no-delegation instruction controlled the skill procedure. The review read the maintenance handoff, progress documentation, prior adapter review and relevant clock handoff. It traced the actual receipt and episode SQL as integration context. Earlier approvals were not treated as proof of the new callers.

Falsifiers were stated before checks: scope before bounds, no later work after failed reads or stops, current test permission before SQL admission, explicit parent projection fields, and a confirmed delivery response despite recovery failure.

## Confirmed findings

### 1. P1 - The delivery callback bypasses the test-only release and can write another family's clock

Location: `src/lib/workbook-scan-recovery-server.ts:16-20`. Caller: `src/app/api/admin/workbooks/[id]/delivery/route.ts:37`.

The route always schedules `refreshWorkbookScanClock` after confirmation or correction. The helper checks only the workbook UUID and service configuration. It does not check the progress release, configured parent IDs or current test marker. `workbookIds: [workbookId]` scopes reconciliation only. The subsequent `requests(1)` uses the global request RPC. Its result can belong to another workbook and family.

Concrete input and evidence:

- With `WORKBOOK_SCAN_PROGRESS_ENABLED=off`, reminders off and an empty parent list, calling the public helper for workbook `...0001` opened one service client, reconciled `...0001` and called the global request reader with limit 1. The expected no-call check failed.
- With test-only progress and explicit parent `...0111`, the fake clock store returned a current request for foreign workbook `...0099`. The helper called `record` for `...0099`, audit 3, with the computed backstop `2026-11-05T13:00:00.000Z`. The expected no-foreign-write check failed.
- The actual global SQL reader has no test-parent filter. The actual calendar write can create a backstop HOLD or trigger claim after recording the deadline. SQL's current-identity guard does not enforce this application's test-only release.

Smallest fix: apply the same validated release and live test-parent checks to the delivery recovery hook before new service work. Authorize the delivered book's owner. Use the scoped selected-book request reader. Recheck permission before its writes. Do not use the global request queue from this callback.

Proof limit: the public helper and its real recovery coordinator ran with injected clock-store replies. SQL consequences were traced in source. No hosted write or real-family action ran. This finding concerns the new application callback; it does not request a change to the previously approved receipt hooks.

### 2. P1 - The final test-marker check occurs before four asynchronous admission reads

Location: `src/lib/workbook-scan-maintenance-server.ts:61`. Binding context: `src/lib/workbook-scan-reminder-store.ts:183-185`.

The server checks `allowed(handle.parentId)` before it calls `store.admit`. That adapter first awaits `current(handle, "reserved")`. `current` reads the message, attempt, email log and links. Only then does it call SQL admission. There is no new test-marker check after these reads. The SQL admission function does not read `test_accounts`.

Concrete input and evidence: the independent test used the actual Supabase client and production maintenance factory. Its fake HTTP transport removed the parent's test marker when the links read returned. The earlier marker read had succeeded. The trace then showed `admit_workbook_scan_reminder`, one fake provider start to `owned-qa@example.invalid`, and result `reminders: { sent: 1 }`. The assertion that SQL admission must not start failed. The marker was removed before the SQL call, not after committed admission.

Smallest fix: put the application release callback after `current` succeeds and directly before the admission RPC. For example, add a pre-admission callback to the typed store. Keep it inside the existing paced queue. Preserve the rule that a request already admitted by SQL proceeds without a later cancellation check.

Proof limit: the interleaving used fake HTTP and a fake provider. No real email or hosted concurrency test ran. This does not claim that an application read and a later SQL transaction are atomic. It identifies four avoidable asynchronous reads between the documented final marker check and admission.

### 3. P2 - A failed clock-phase permission read does not stop maintenance

Location: `src/lib/workbook-scan-maintenance.ts:86-98`.

The scoped `record` wrapper awaits `deps.allowed`. A database read error there throws. `recoverWorkbookScanClocks` catches every error from `store.record` at `src/lib/workbook-scan-clock.ts:74-77` and converts it to `write-failed`. Maintenance then enters inactivity and reminder phases. This violates the specified whole-turn stop on a failed read.

Concrete input and evidence: the actual maintenance factory ran through a real Supabase client with fake HTTP. The first two test-marker reads succeeded. The third read, immediately before the clock write, returned HTTP 400 with `synthetic_read_failure`. Later reads succeeded. The run resolved with:

```json
{"selectedBooks":1,"clocks":{"write-failed":1},"calendars":{"none":1},"reminders":{"sent":1},"outOfTime":false,"moreMayRemain":false}
```

The trace included a later due read, claim, SQL admission and one fake provider start. The expected whole-turn rejection failed. A positive control with all reads successful recorded the clock and sent once.

Smallest fix: give maintenance a fail-fast clock recovery path. A failed rollout read must escape the tolerant recovery catch. Check the fatal state before another record or later phase. Do not change lost-write handling into an unsafe retry.

Proof limit: the failure was a synthetic database response. This proves continuation through the public integration path. It does not prove a hosted outage or an unauthorized recipient.

### 4. P2 - Synchronous callback registration failure changes a committed delivery to HTTP 503

Location: `src/app/api/admin/workbooks/[id]/delivery/route.ts:37`.

`after(...)` is inside the same `try` as the committed delivery operation. The recovery callback catches its own errors, but cannot catch an error from registering that callback. The route's outer catch then returns `{status:"refused",reason:"unavailable"}` with HTTP 503.

Concrete input and evidence: the public POST test returned a confirmed result from `confirmDelivery`. Its `after` adapter used the installed Next.js `AfterContext` with no `waitUntil`. This produced Next's real synchronous E91 error. The route returned HTTP 503 after one successful confirmation. The expected HTTP 200 check failed. The installed `after-context.js:89-92` explicitly throws synchronously in this case. Its constructor also records an `onClose` failure for a synchronous error at registration.

Smallest fix: catch callback registration failure separately after a confirmed delivery result. Keep the confirmed response and the durable clock request. Log a fixed diagnostic without private data. Let scheduled recovery handle the request.

Proof limit: the route's authorization and delivery seams were synthetic. The registration error came from the actual installed Next implementation. No deployed Vercel scheduling failure is claimed.

## Remaining reviewed contracts

| Subsystem | What the check proved | What it only passed through or did not prove |
| --- | --- | --- |
| Scheduler selection | The production delivery query scopes configured parents before its exact count and bound. Clock requests scope selected books before their count and bound. Missing counts, overflow and identity errors throw. | The release failures above remain. No live PostgREST cap probe ran. |
| Broad test-book sweep | The calendar SQL checks the current effective audit, delivery, zone and override under its book guard. A conflicting stored calendar is retained. Inactivity identity and due admission remain database-owned. | SQL was read as context. No new SQL or hosted proof ran. The unscoped callback remains finding 1. |
| Parent projection | The endpoint uses the live scan session and canonical reader. The reader checks family, child, shipped book, manifest, revision and delivery again. The endpoint rechecks the session. Its output lists day/page/status/deadline fields explicitly. | No browser, signed-in hosted session or application-role proof ran. |
| Receipt and clock policy | The focused tests retain accepted receipts after photo expiry and recheck. Full printed Day 7 and the separate 21-local-day HOLD/backstop remain distinct. No book generation or plan advance was added. | Existing receipt SQL approval is inherited. No printing, customer or queue action ran. |
| Calendar policy | The context carries database observation time. The calculator uses the shared family-time helper and exact saved activity/delivery context. | No hosted local-day boundary or clock deployment check ran. |
| Email and queue | The cron passes one factory transport to all old and new send paths. Existing sender tests cover pacing, slow admission, immediate use, loss, malformed replies and unknown retention. The email now uses `scanPageUrl` and `/account/scan`. The server uses `newToken`'s token and hash together. | Finding 2 remains. No provider or unsubscribe request ran. |
| Cancellation | The fresh abort test stopped before SQL admission and started no provider when fake database fetch enforced the production client's abort signal. | A first fake without database abort handling was not binding. It is not reported as a product defect. Committed admission remains a distinct point. |
| Cron dry and configuration | The dry test made no maintenance call. The existing global email-configuration prerequisite remains before scan recovery. Thus missing email configuration also delays recovery; durable receipts and requests remain. | No configured live environment is claimed. This documented existing prerequisite is not a new finding. |
| Copy and unsubscribe | Source retains `saveEmailCopy`, token hiding and deletion guards. `scan_inactivity` maps to ordinary reminder unsubscribe. That path inserts an email eligibility row only. RFC8058 links remain compatible. | No positive hosted copy, deletion, token or unsubscribe proof ran. |

No separate documented-standard breach or actionable code smell was confirmed. The new scheduler slice changes neither `database.types.ts` nor `database.ts` from its approved base. No new query type bypass was found. The SQL schema is unchanged by this slice.

The corrected fixtures now supply `number: 2`, matching the book. The new public-interface wrong-number test uses `number: 3`, preserves one accepted scan and refuses that delivery. It passed in the fresh run. The supplied `475-delivery-number-control.log` and `.exit` show that disabling the actual shared guard made the missing-delivery assertion fail, exit 1. That is inherited negative-control evidence. This reviewer did not mutate source. The runtime delivery-store SHA256 remained `63af48ea751b965cf45e070034efaadd7d3ab466e71106863d3efea7ed3c8dfc`.

## Commands and actual exits

The fresh baseline command was:

```sh
node_modules/.bin/vitest run src/lib/workbook-scan-progress.test.ts src/lib/workbook-scan-clock.test.ts src/lib/workbook-scan-clock-store.test.ts src/lib/workbook-scan-progress-reader.test.ts src/lib/workbook-scan-progress-store.test.ts src/lib/workbook-scan-recovery.test.ts src/lib/workbook-scan-recovery-server.test.ts src/lib/workbook-scan-reminder-calendar.test.ts src/lib/workbook-scan-reminder-email.test.ts src/lib/workbook-scan-reminder-send.test.ts src/lib/workbook-scan-reminder-store.test.ts src/lib/workbook-scan-maintenance.test.ts src/lib/workbook-scan-maintenance-server.test.ts src/lib/reminders.test.ts src/lib/email-delivery.test.ts src/app/api/reminders/route.test.ts src/app/api/account/scans/progress/route.test.ts src/lib/workbook-delivery-progress-route.test.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/475-maintenance-review-baseline.json
```

Exit 0. Machine-filtered JSON assertion counts: 439 passed, 0 failed, 0 skipped, 18 files. This is the fresh selection's count. The supplied 440-check result is not substituted for it.

The final independent failure command was:

```sh
node_modules/.bin/vitest run src/lib/zz-475-independent-maintenance-probe.test.ts src/lib/zz-475-independent-delivery-probe.test.ts src/lib/zz-475-independent-recovery-probe.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=/tmp/475-maintenance-review-probes.json
```

Exit 1. Machine-filtered JSON assertion counts: 5 failed, 2 passed, 0 skipped, 3 files. Two failures establish the two parts of finding 1. One failure establishes each other finding. The positive clock/send control and database-bound cancellation control passed. Each test used synthetic inputs. The initial two-probe run had 2 failures and 1 pass, exit 1. The expanded control before database abort enforcement had 4 failures and 1 pass, exit 1. The corrected two-file control had 3 failures and 2 passes, exit 1. Only the final binding results above support the findings.

The final probe log is `/tmp/475-maintenance-review-probes.log`. The baseline log is `/tmp/475-maintenance-review-baseline.log`. Temporary probe sources were removed after use.

Scoped ESLint command:

```sh
node_modules/.bin/eslint src/lib/workbook-scan-maintenance.ts src/lib/workbook-scan-maintenance.test.ts src/lib/workbook-scan-maintenance-server.ts src/lib/workbook-scan-maintenance-server.test.ts src/lib/workbook-scan-clock-store.ts src/lib/workbook-scan-clock-store.test.ts src/lib/workbook-scan-recovery.ts src/lib/workbook-scan-recovery.test.ts src/lib/workbook-scan-recovery-server.ts src/lib/workbook-scan-recovery-server.test.ts src/app/api/reminders/route.ts src/app/api/reminders/route.test.ts src/app/api/account/scans/progress/route.ts src/app/api/account/scans/progress/route.test.ts 'src/app/api/admin/workbooks/[id]/delivery/route.ts' src/lib/workbook-delivery.ts src/lib/workbook-delivery-progress-route.test.ts src/lib/workbook-scan-progress-store.test.ts src/lib/workbook-scan-reminder-email.ts src/lib/workbook-scan-reminder-email.test.ts
```

Exit 0. Log: `/tmp/475-maintenance-review-eslint.log`.

A `node -` script loaded the installed TypeScript compiler and `tsconfig.json`. It selected the same 20 files as ESLint, plus `next-env.d.ts` and `.next/types/routes.d.ts`. It set `incremental:false` and `noEmit:true`. It filtered diagnostics to the selected files and global errors. Result: `SCOPED_FILES 20 DIAGNOSTICS 0`, exit 0. Log: `/tmp/475-maintenance-review-types.log`. This was a scoped check, not a build or a whole-project type gate.

`git diff --check`, `git diff --exit-code` and `git diff --cached --exit-code` returned 0. Initial and final index SHA256: `f37a04131b357c8de27bf7dc96c25d7d11c2134970b8f434171d021e15bfd300`. Initial and final generated-type SHA256: `3ee5e26b88bf40e20c1d9ca1352e5e02df7ea3089a75101e17388cbe90ac5edd`.

## Limits and final state

No product edits, source mutation controls, commits, installs, full suite, build, browser, Chromium, dev server, service connection, hosted call, provider call, real email, paid inference, GitHub action, customer write, family switch, deletion or print action ran. No new schema or generated-type edit was made. No configured live rollout is claimed.

Root retains hosted positive lifecycle/role/transport/unsubscribe proof, Schedule/design/UI approval, the full gate, main integration and publication. Real-parent email and next-book queues remain off. Customer R2 and all 14 comment closures remain held.

All owned test, lint and type-check processes stopped. All temporary in-checkout probes were removed. Tracked source bytes and the Git index remain unchanged. This report is the only retained untracked checkout file.

Final computer: `Savars-MacBook-Pro-5.local`.
Final verified branch: `site/workbook-scan-receipts-475`.
Final SHA: `4a847c83d89a5ee2f229c38693e027ebabe08ef8`.

SPEC: FAIL - four confirmed failures.

STANDARDS: PASS - no separate confirmed standards finding.

VERDICT: REJECT the bounded backend candidate. This is not whole-475 or release approval.

HANDOFF_DONE
