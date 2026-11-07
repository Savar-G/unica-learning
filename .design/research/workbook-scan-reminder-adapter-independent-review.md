# Independent bounded reminder review

SPEC: PASS

STANDARDS: PASS

VERDICT: APPROVE the bounded calendar, email, sender and typed-adapter slice only.

No confirmed in-scope failure was found. No product fix is required by this review.

## Fixed source and authority

- Computer: `Savars-MacBook-Pro-5.local`.
- Prepared path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-b62d245e`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-b62d245e`.
- Verified branch: `site/workbook-scan-receipts-475`.
- Candidate: `5e4dd0c778cf42f9f8ecd3b3289ddf2541f9b000`.
- Fixed comparison: `git diff f8df3f665f8839995c5668718be36464065fdba4...HEAD`.
- Review model: Unify Codex `gpt-6.1-sol`, high reasoning effort.

The first command read the branch, short status and HEAD in the required checkout. HEAD matched. The initial short status was empty. The review used this frozen shared checkout. It did not use the implementation child's old prepared checkout. It created no checkout and started no delegate. The PC was unavailable, as supplied in the task.

The task's written requirements defined the bounded specification. The review read the applicable project instructions, code-review skill, Unica evidence-review skill, shared delegate brief, reminder handoffs and hosted schema report. It read the actual public helpers and SQL reply bodies. The supplied scope excludes the scheduler, UI, final hosted positive checks, full gate and publication.

## Falsifiers

The review would fail if any of these inputs permitted an incorrect calendar, current handle, copy write or provider start:

- A foreign or changed delivery, activity, workbook revision or family clock context.
- An absent, duplicated, partial, non-advancing or oversized recovery or sibling set.
- A truncated link read with a larger exact count.
- A changed parent, message, attempt token, attempt number, log, child set or unsubscribe hash.
- A stale, malformed or lost claim/admission response.
- Cancellation that releases an attempt after admission starts.
- Concurrent calls that share a message object or bypass the one provider queue.

These falsifiers were stated before the focused checks. No source mutation was used as a control.

## SPEC evidence

| Requirement | Source and result | Proof limit |
| --- | --- | --- |
| Durable acceptance is separate from marking | `workbook-scan-reminder-calendar.ts:38-58` uses accepted receipts and progress events through the public core. It does not read marking completion. | Existing receipt admission and marking internals were context. |
| Four local days and exact saved context | Calendar lines 43-61 bind the effective delivery audit, saved zone mode, workbook identity and anchor. They use the database observation time and canonical helpers. | No hosted runtime parity check ran. |
| Native delivery mode remains native | Fresh adapter-to-calendar probes produced `2026-11-03T14:30:00.000Z` for the Edmonton override and `2026-11-03T15:30:00.000Z` for native mode, from the same October 30 delivery. | Synthetic saved records; actual shared helper execution. |
| Canonical family fallback after work | Fresh probes checked parent zone, postal mapping, oldest-child province and Pacific fallback after a later accepted receipt. They checked the outgoing exact raw context. | The database chooses the oldest child. This review did not recreate hosted family history. |
| Typed and bounded adapter | `workbook-scan-reminder-store.ts:32-126` checks context, explicit null activity, safe audit numbers, keyset order, 1..100 bounds and complete array shapes before mapping. Malformed input does not become an empty set. | Synthetic replies through the actual Supabase client. |
| Complete current handle | Store lines 138-164 bind message, attempt, log, hash, child IDs and all active links. The link query asks for an exact count. A valid 100-link control passed. The same 100 rows with count 101 failed and made no admission RPC. | No live PostgREST row-cap or permission probe ran. |
| One queue and valid last admission | `workbook-scan-reminder-send.ts:66-118` uses one shared paced transport. Admission runs inside it before the provider. Existing tests cover slow admission and sequential requests. Fresh typed-adapter probes ran concurrent same-parent, other-parent and ordinary sends immediately after factory creation. | Provider and database replies were synthetic. |
| Lost admission and cancellation | Sender lines 96-116 and 161-188 preserve the admission-attempted state. Lost or malformed admission sends nothing and is not released. Only a cancelled reservation before admission can use explicit release. | SQL state transitions were read, not executed in a new database. |
| Copy and outcome identity | Sender lines 158-176 stage the outcome until after copy. Store lines 198-219 use the exact admitted handle and guarded finish/release RPCs. `saveEmailCopy` uses `copyRow`; the fresh concurrent test checked each parent/log target and hidden tokens. Existing SQL copy triggers retain family/child deletion fences. | No real email copy, provider event or deletion ran. |
| SQL retains final authority | The actual SQL claim, admission, finish and release functions recheck the complete due set, fresh database time, calendar revisions, token and state. No decision clock enters their RPC arguments. Sent/unknown attempts have no automatic retry. Only explicit refusal permits the bounded SQL path. | Prior SQL concurrency evidence remains separate from these local adapter checks. |
| Existing email behavior | The only `reminders.ts` change adds `scan_inactivity` to `LogKind`. All 42 existing assessment-reminder tests passed. The four reminder kinds, shared transport, seven-day first-charge reminder path and immediate paid Restart implementation are unchanged in the fixed diff. | Live Stripe reminder configuration and paid Restart were not exercised. |

`canonical` returns a JSON value. The recorded-calendar check correctly compares `JSON.stringify(canonical(...))`. A delivery zone string enables the shared overrides. `{zone, override:false}` preserves native rules. The review checked both contracts against their source.

## STANDARDS evidence

No confirmed documented-standard breach or actionable code smell was found in scope. Tests use public module interfaces. The adapter uses the generated database types and the three `NullArgs` entries. It adds no query type override. Family-time resolution stays in the canonical helper. The email uses shared brand/footer helpers and protected parent routes. It contains no child or page identifiers or unsupported performance claim.

The review read the actual SQL file as context. Its SHA256 is `87d7a889400388993403c47f3e2272523c6ccf7b945c9b6c82a010bbebca0b2a`, matching the hosted report. The hosted report records migration application and official type generation. Its zero-row checks do not establish positive admission or row filtering. The older SQL implementation handoff describes its earlier local state; the later hosted report records the subsequent application.

## Fresh checks

All Vitest runs used `--maxWorkers=1`. The final run selected only these seven files. Its JSON assertion results gave this full distribution:

| File | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `email-delivery.test.ts` | 30 | 0 | 0 |
| `reminders.test.ts` | 42 | 0 | 0 |
| `workbook-scan-reminder-calendar.test.ts` | 18 | 0 | 0 |
| `workbook-scan-reminder-email.test.ts` | 14 | 0 | 0 |
| `workbook-scan-reminder-send.test.ts` | 49 | 0 | 0 |
| `workbook-scan-reminder-store.test.ts` | 59 | 0 | 0 |
| Temporary independent public-interface probes | 19 | 0 | 0 |
| Total | 231 | 0 | 0 |

The temporary probes covered a complete 100-child/episode handle, hidden 101st link, partial claim/admission sets, immediate concurrent factory use with the actual typed adapter, missing recovery/due sets, six invalid recovery bounds, delivery override/native divergence and four canonical family-context cases. They used injected fetch responses and a fake provider. They used no service connection. The temporary probe source SHA256 was `1418aeedd9af0e29277765207d2d702fb421abd5496e8ec7a38e1d6e933ace07`. The file was removed after the checks.

Scoped ESLint passed with exit 0 for the eight calendar/email/sender/store source and test files, `database.ts` and `reminders.ts`. A TypeScript program used this checkout's compiler options, selected those ten files plus the temporary probe file, disabled incremental output and emitted no files. It returned zero diagnostics and exit 0.

The initial six-suite run independently reproduced 212 passing tests. The root's supplied disabled-message-token control log records 1 failed, 9 passed and 49 skipped tests. That is inherited negative-control evidence. This reviewer did not repeat that source mutation or claim a base-red run.

## Limits and cleanup

No full suite, build, browser, Chromium, dev server, service, hosted query, provider call, email, install, customer write, family switch, paid action, data deletion, admin run page, commit, push, PR or comment ran.

The public production scheduler does not yet call these modules at this candidate. Root retains scheduler/recipient/token correspondence, UI, hosted positive checks, real email and unsubscribe validation, combined full gate and publication. This approval establishes no whole-475, customer, marking, email, print, transport activation or release acceptance.

All owned check processes stopped. The temporary probe was removed. The tracked bytes and Git index remain unchanged. The only retained file is this review report.

Initial and final tracked-file aggregate SHA256: `b6576dca09b12118ac65cf4bf6c440c2d5f4c220ba380112a8cf76d9ef73e136`.

Initial and final index SHA256: `bf04291eddc10ccf4125fc53f0fce7b7743186d97af2deb7e226494e350fd7de`.

Final SHA: `5e4dd0c778cf42f9f8ecd3b3289ddf2541f9b000`.

HANDOFF_DONE
