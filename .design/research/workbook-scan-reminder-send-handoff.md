# Workbook scan reminder send coordinator, #475

HANDOFF_READY

The pure send coordinator is complete. Production integration and release remain held.

## Source

- Computer: `Savars-MacBook-Pro-5.local`.
- Prepared path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e67ea708`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-e67ea708`.
- Branch: `t3/workbook-scan-reminder-send`.
- Initial clean HEAD: `550fdcf1619c0e515e8ac33e2a65869d8c937af7`.
- Exact required base: `2d7fd5daeb11f931f74314f51a806814b15d0a39`.
- Exact implementation HEAD: `e4167d585a455c47a59a12a944f22ad7d2de724e`.
- The next commit adds only this handoff. The final task reply gives that commit's exact SHA.
- Actual model: Unify Codex `gpt-6.1-sol`, high reasoning effort.
- Required legacy trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. This trailer does not identify the actual model.

The initial branch, status, HEAD and hostname checks ran first. HEAD was an ancestor of the required candidate. The authorized fast-forward passed. Only the T3-prepared isolated checkout changed. No checkout was created. No child ran. The task supplied the PC's verified unreachable state. No remote dispatch was attempted.

Only these new files belong to this task:

- `src/lib/workbook-scan-reminder-send.ts`.
- `src/lib/workbook-scan-reminder-send.test.ts`.
- This handoff.

## Public interface

```ts
createWorkbookScanReminderSender({
  store: ScanReminderSendStore,
  transport: MailTransport,
  gapMs: number,
}): {
  transport: MailTransport;
  send(input: ScanReminderSendInput): Promise<ScanReminderSendOutcome>;
}
```

Create exactly one sender per scheduler run. Supply the raw `resendTransport()` adapter, with no queue or other wait around its request. Give the returned `transport` to existing ordinary reminder callers. Send scan reminders through `send`. Do not create a sender per parent. The module has no default provider, recipient lookup, template, calendar policy, scheduler or feature flag.

`ScanReminderSendInput` contains `parentId`, the complete due `episodeIds`, `unsubscribeHash`, an existing `EmailMessage`, and an optional `AbortSignal`. The caller owns recipient lookup and correspondence between the message's unsubscribe token and its hash. The coordinator copies the message, sender, headers and claim fields before its first await. Each invocation gets a different frozen message object. The handle binds the parent, message, attempt token, email log, attempt number, episode set, child IDs and hash.

The send result is the existing `DeliveryOutcome`, or `{status:"not_sent", reason:string, released:boolean}`. A denied or uncertain admission returns `not_sent`. It does not become a provider refusal. `released` means this coordinator confirmed its explicit release. SQL admission's `not-due` response already releases its reservation, so that response has `released:false` here.

The compact store interface is:

```ts
claim(input: ScanReminderClaimInput): Promise<unknown>;
admit(handle: ScanReminderHandle): Promise<unknown>;
current(handle: ScanReminderHandle, state: "reserved" | "admitted"): Promise<boolean>;
keepCopy(handle: ScanReminderHandle, copy: EmailCopy): Promise<void>;
finish(handle: ScanReminderHandle, outcome: SendResult): Promise<unknown>;
release(handle: ScanReminderHandle): Promise<unknown>;
```

Map the SQL replies to camel case. Each store method must finish its own transaction before it resolves. No transaction may span pacing, another store method or the provider request.

| Method | Root adapter contract |
| --- | --- |
| `claim` | Call `claim_workbook_scan_reminder` with parent, complete episode set and hash. Success is `{status:"claimed", messageId, attemptToken, emailLogId, attempt, episodeIds, childIds}`. Other recognized statuses are `busy`, `set-changed`, `refresh-required`, `unsubscribed`, `unavailable`. |
| `admit` | Call `admit_workbook_scan_reminder` with message and attempt token. Success is `{status:"admitted", messageId, attemptToken, emailLogId, episodeIds}`. The coordinator checks all returned dispatch identities and the full set. Other recognized statuses are `busy`, `stale`, `unavailable`, `not-due`. |
| `current` | Return exactly `true` only for this parent/message/attempt/email-log binding in the requested current state. Check the attempt number too. Missing, stale or unavailable state gives no permission to write. |
| `keepCopy` | Bind the existing `saveEmailCopy`/`copyRow` adapter to `handle.parentId` and `{emailLogId:handle.emailLogId}`. Preserve token hiding, provider linkage and existing deletion guards. Do not finish the outcome here. |
| `finish` | Call `finish_workbook_scan_reminder` with message, token, outcome status, and provider ID only for `sent`. SQL must check the current token and admitted state again. No retry on an uncertain response. |
| `release` | Call `release_workbook_scan_reminder` with message and token. Return its `{status:"released"}` or `{status:"stale"}` reply. SQL must check the current reserved state again. |

## Send sequence

The coordinator uses the existing public `sendEmailOnce`, `SendLedger`, `EmailMessage`, `EmailCopy`, `MailTransport` and `pacedTransport`. Its ledger is an adapter of the SQL contract. It does not create another durable send ledger.

Admission runs inside the one shared queue, after pacing. The coordinator awaits admission immediately before it calls the raw provider adapter. `SendOptions.mayStart` remains synchronous and is not used for the asynchronous RPC.

The existing paced queue records its start before asynchronous admission. A slow admission can therefore reduce the gap between actual provider requests. The coordinator checks the remaining gap from the previous actual provider call inside the same queue, before admission. A fake 250 ms admission and 100 ms gap produce provider starts at 250, 600 and 700 ms for two scan parents and one ordinary email. No extra queue is created. Provider requests remain sequential.

Admission is attempted once per binding. Busy, stale, refused, unavailable, malformed, mismatched, lost or throwing admission responses permit no external request. Once admission starts, cancellation cannot release that attempt. An admitted request proceeds without the caller's cancellation signal. The provider adapter retains its own request timeout. A request that has been admitted cannot be recalled.

The ledger stages provider outcomes. Its `keepCopy` phase checks the exact current admitted token, calls the copy adapter, checks the token again, then finishes the outcome. The finish runs even if copy storage fails while the token remains current. A token that becomes stale before copy or during copy receives no further write. A failed current-state read gives no write permission. A failed finish leaves the durable admission held.

A known cancellation before admission can release only its exact current reserved attempt. An admission `not-due` result needs no second release. Provider refusal allows no private retry. Only a later explicit send and SQL's full-set claim policy can authorize another attempt. Reserved, admitted, sent, unknown and uncertain-admission attempts have no timeout or takeover in this module.

## Checks

Falsifiers were stated before checks. A duplicate request, wrong parent binding, admission outside the queue, reduced provider gap, unsafe release, stale copy/finish write or lost finalization on copy failure fails the focused checks. A type mismatch or lint error fails the scoped source checks.

Dependencies came from the local locked cache with `npm ci --offline --ignore-scripts --no-audit --no-fund`. No package file changed. Final commands:

```sh
node_modules/.bin/vitest run src/lib/workbook-scan-reminder-send.test.ts src/lib/email-delivery.test.ts --maxWorkers=1
node_modules/.bin/eslint src/lib/workbook-scan-reminder-send.ts src/lib/workbook-scan-reminder-send.test.ts
node_modules/.bin/tsc -p <temporary-scoped-config> --pretty false
git diff --cached --check
```

All final commands passed. The scoped TypeScript config extended this checkout's `tsconfig.json`, selected only the two owned source files and their imports, disabled incremental output and cleared include globs. It did not run the project build or full type check.

The final JSON test report gave this complete distribution:

| File | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `workbook-scan-reminder-send.test.ts` | 49 | 0 | 0 |
| Existing `email-delivery.test.ts` | 30 | 0 | 0 |
| Total | 79 | 0 | 0 |

The binding negative control temporarily replaced the unique frozen message copy with the caller's shared message object. The targeted concurrent-parent test failed with `not_sent` and `refused` instead of two `sent` results. Restoring the copy made the same test pass. The final 79-test run used the restored source. No control mutation remains.

## Proof limits and retained work

- Queue: fake clocks prove shared cross-parent and ordinary-email spacing, sequential requests, slow-admission correction and cancellation during that correction. They pass through the existing public paced transport. They do not measure real provider timing.
- Binding: concurrent public calls prove same-parent claim exclusion, independent immutable message copies, frozen claim fields and no duplicate request from replay of a retained registered object. Claim uniqueness passes through a fake token-checked store. It does not prove hosted concurrency.
- Admission: fake responses prove no dispatch after changed scan/unsubscribe state, busy/stale/unavailable responses, malformed IDs/sets, store errors or a committed lost response. Scan, unsubscribe, eligibility, calendar and bounded refusal policy pass through the store seam. No SQL policy is implemented or re-proved here.
- Delivery: sent/refused/unknown and throwing providers pass through public `sendEmailOnce`. Copy failure still finishes every provider outcome. Token changes before/during copy suppress obsolete writes. Current/finish/release errors retain the claim. No SMTP, HTTP, model or real provider request ran.
- Ordinary email: the existing 30 fake email tests pass. Coordinator tests also check ordinary refusal, unknown, signal, synchronous time checks and options. Existing copy redaction, SQL mapping, recipient lookup, real unsubscribe and real delivery remain root work.

Root retains independent review, typed RPC/copy adapters, generated database types, scheduler integration, sender/recipient lookup, kind/unsubscribe integration, the full gate, hosted checks and publication. The migration is still unapplied by this task. The real-parent email gate remains OFF overnight. This module has no activation path.

Customer R2/14, review comments, printing, real-parent email, charges, plan starts and data deletion remain held. No existing source, SQL, type, route, UI, template, shared transport, generator, package, plan, curriculum, print source, instruction or skill changed. No browser, Chromium, render, full suite/build, hosted service, migration, model call, push, PR or merge ran.

All owned check processes exited. The temporary scoped config and JSON report were removed after their results were recorded. Ignored local npm dependencies remain in this prepared checkout. The implementation commit left a clean status before this handoff was added. The final reply reports the handoff commit and final clean status. Root can change `HANDOFF_READY` after it consumes the result.
