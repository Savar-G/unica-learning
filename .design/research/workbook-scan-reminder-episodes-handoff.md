# Workbook scan reminder episodes, #475

HANDOFF_READY

The implementation is local. The migration is unapplied. This result does not complete #475 or permit release.

## Source and location

- Computer: `Savars-MacBook-Pro-5.local`.
- Prepared path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-76abd7eb`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-76abd7eb`.
- Branch: `site/workbook-scan-reminder-episodes-475-76abd7eb`.
- Initial clean HEAD: `550fdcf1619c0e515e8ac33e2a65869d8c937af7`.
- Exact required base: `597c04c1ebc0a6d5a160bef7ee7fba2da1ad1ac8`.
- Exact implementation HEAD: `5c3f945548af2a58edee5a9ab12810e12f2fdb06`.
- Implementation commits in order: `7237f129508437c7ab730497736c3aa5fa3a9933`, then `5c3f945548af2a58edee5a9ab12810e12f2fdb06`.
- The final task reply gives the documentation commit. That commit adds only this handoff.
- Actual model: Unify Codex `gpt-6.1-sol`, high reasoning effort, also called Unify Sol high.
- Required legacy trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. This trailer does not identify the actual model.

The clean check and ancestry check passed before the authorized fast-forward. Only this prepared checkout was updated. Only its branch was renamed. No checkout was created. No PC checkout or other controller was used. No subagent ran.

The supplied complete issue JSON was read as specification data. The current #628 rule controls the zero-scan case. Zero accepted scans at the saved 21-local-day deadline means HOLD and a request for scans. It permits no plan advance, repeat or next-book queue. The published full Day 7 set can qualify with earlier gaps.

The source review included the project instructions, delegate brief, all six existing #475 reports, pure progress and clock source/tests, typed clock and progress stores, delivery/correction code, family-time, reminder and email delivery/store/brand/Resend/copy code, stored plan/control state, deletion, and the relevant production SQL. No customer workbook, profile, revision or review comments were read.

## Owned files

Only these five new files belong to this task:

- `supabase/migrations/20261106230000_workbook_scan_reminder_episodes.sql`.
- `supabase/tests/workbook_scan_reminder_episodes.cjs`.
- `supabase/tests/workbook_scan_reminder_episodes_fixture.sql`.
- `supabase/tests/workbook_scan_reminder_episodes_empty.cjs`.
- This handoff.

The installed Supabase CLI `migration new --help` was read first. Its local `migration new workbook_scan_reminder_episodes` created prefix `20261106221551`. The empty file was renamed to the repository timestamp `20261106230000` so that it follows the required receipt migration's source prefix. No service command, login or update ran.

The already-applied receipt migration is unchanged. Its SHA-256 remains `d3156ac70bd3e301ef58ebfc92baf49697b3c270f28fbf45a769f03d3257b7ba`. Generated types, delivery/scan RPC bodies, existing runners, shared source, email transport, UI, billing, prices, family flags and print files are unchanged. No sibling source or current main was imported.

The new migration SHA-256 is `87d7a889400388993403c47f3e2272523c6ccf7b945c9b6c82a010bbebca0b2a`.

## Service RPC contracts

All eight public RPCs below return `jsonb`. Only `service_role` has EXECUTE. Browser roles, including an authenticated admin, cannot call them. All new functions have an empty search path. Internal helpers and trigger functions have no external EXECUTE grant. Store timestamps are PostgreSQL timestamp strings. Root must normalize instants with `Date.parse` or ISO conversion before text comparisons. Validate UUIDs, bounded arrays and safe audit integers at the typed boundary.

| Signature | Response |
| --- | --- |
| `list_workbook_scan_recovery_books(p_kind text, p_limit integer, p_after uuid default null)` | Array of `{workbook_id, parent_id, child_id, number, delivery_audit_id}` in ascending workbook UUID order. No duplicate book ID. `p_limit` must be 1..100. |
| `read_workbook_scan_inactivity_context(p_book uuid)` | `{status:"read", observed_at, identity}`. `identity` can be null. Missing parent or an excessive sibling set returns `{status:"unavailable"}`. |
| `propose_workbook_scan_inactivity(p_book uuid, p_delivery_audit bigint, p_activity uuid, p_anchor timestamptz, p_due timestamptz, p_context jsonb, p_clock_version text)` | `{status:"recorded", episode}` or status `stale`, `unavailable`, or `calendar-conflict`. Malformed calendars raise `invalid_scan_inactivity_calendar`. |
| `read_workbook_scan_reminder_due(p_parent uuid)` | `{status:"ready", episode_ids:uuid[], child_ids:uuid[]}`, `{status:"refresh-required", workbook_id}`, or status `unsubscribed` / `unavailable`. Arrays are sorted. Empty means no send. |
| `claim_workbook_scan_reminder(p_parent uuid, p_episodes uuid[], p_unsubscribe_hash text)` | `{status:"claimed", message_id, attempt_token, email_log_id, attempt, episode_ids, child_ids}`. Otherwise `set-changed`, `busy`, `refresh-required`, `unsubscribed`, or `unavailable`. IDs must be distinct, non-null and 1..100. The hash must be 64 lowercase hexadecimal characters. |
| `admit_workbook_scan_reminder(p_message uuid, p_attempt uuid)` | `{status:"admitted", message_id, attempt_token, email_log_id, episode_ids}` once only. Otherwise `busy`, `stale`, `unavailable`, or `{status:"not-due", reason}`. `not-due` has safely released the current unstarted reservation. |
| `release_workbook_scan_reminder(p_message uuid, p_attempt uuid)` | `{status:"released"}` or `{status:"stale"}`. It accepts only the current reserved attempt. It cannot release an admitted, sent or unknown attempt. |
| `finish_workbook_scan_reminder(p_message uuid, p_attempt uuid, p_outcome text, p_email_id text default null)` | `{status:"recorded"}` or `{status:"stale"}`. Outcome is `sent`, `refused`, or `unknown`. Sent needs a nonempty provider ID of at most 100 characters. Other outcomes require a null provider ID. |

`55000` can propagate from the existing family/child fence. Treat this as no permission to dispatch. A lock/store error or lost response is never proof of transport refusal. The typed caller must distinguish these errors from a returned status. No public RPC accepts a caller's decision clock.

`identity` contains `workbook_id`, `parent_id`, `child_id`, `number`, `printed_revision`, `delivery_audit_id`, `delivered_at`, `delivery_time_zone`, `delivery_zone_override`, `activity_receipt_id`, `activity_key`, `anchor_at`, `zone_mode`, and `clock_context`.

`clock_context` is the raw object `{version:1, timeZone, postal, oldestChild:{id,createdAt,province}|null}`. The oldest child follows database `created_at,id` order. SQL does not resolve its zone. A raw parent zone, postal, oldest-child identity/order or province change makes the old unsent canonical calendar stale. The service must call the real `familyZone` helper on this saved context. Its dated rules remain in `family-time.ts`.

Use `observed_at` as the shared projection's trusted `now`. It is read from the database after all locks, at the same observation as the saved identity. Root must load the admitted receipt/event identities and frozen book data through the real public reader. Root must use `scanInactivityCandidate`, verify its book and anchor against this identity, and supply its `dueAt`. Do not replace this with a copied calendar algorithm or a duration of 96 hours.

## Recovery sequence

The recovery selector has four modes:

1. `unseeded`: supported shipped/confirmed books whose current delivery/correction audit has no clock request. Reconcile each bounded batch through the existing `reconcile_workbook_scan_progress`. Completed books leave the list. This covers pre-migration deliveries and a current correction without a request.
2. `due`: the current audit's saved canonical backstop is at or before database time, with no winning claim and no zero-scan HOLD for that same audit. Use existing reconciliation. Its claim/HOLD removes the completed work. No SQL zone arithmetic or Node decision time is used.
3. `inactivity`: the latest confirmed unfinished book has no current episode calendar or its saved identity/context is stale. Propose its canonical calendar. A completed proposal leaves this backfill list. Consumed or exhausted episodes do not re-enter merely because a zone changed.
4. `reminder-due`: a current canonical episode is due at database time, has a known eligible program, has no reminder unsubscribe, and has no reserved/admitted/sent/unknown claim. A refused claim can qualify below its attempt cap. Group selected rows by parent, then use `read_workbook_scan_reminder_due` to obtain the full current sibling set before claim.

All modes use the existing private frozen-set validator and skip unsupported legacy contracts, frozen parents and child tombstones. They use stable UUID order. The optional `p_after` supports a finite keyset sweep and permits progress past a row whose state changes between selection and admission. Start a later sweep at null. Each call and result is bounded. Selectors are candidates, not claims. Recheck every write through its public RPC.

Unseeded clock requests still use the approved `list_workbook_scan_clock_requests`, `recoverWorkbookScanClocks`, typed clock store, and `record_workbook_scan_delivery_calendar`. The original clock/reconcile functions remain unchanged. Preserve their per-book fence isolation on `55000`. A failed transport call leaves durable work for recovery. Do not use a process-local offset as the backfill completion record.

## Episode and calendar policy

`workbook_scan_inactivity_episodes` has one row per `(workbook_id,activity_key)`. The activity key is the last qualifying receipt identity. A nil UUID denotes no qualifying work. Delivery correction, zone/context change, clock-version refresh and another scheduler run update this same episode. They do not create another send identity.

SQL revalidates the effective delivery audit, supported shipped printed revision, full required-page unfinished state, family/child fences and latest confirmed numbered book. A newer numbered confirmed book suppresses old reminders, including when the newer book is complete or unsupported. Old scans remain admitted by the unchanged scan path.

The qualifying anchor is the maximum of effective delivery and the first accepted scan of every eligible page plus genuine pending-resolution retake receipt times. The receipt's `accepted_at` supplies scan time. A delayed `admitted_at` never replaces it. Question-bearing Extra practice is eligible work. Covers, plan pages, back covers and empty padding are not. All required day sets remain frozen-manifest sets. A duplicate, refused photo or unchanged retake cannot move the anchor.

SQL truncates the anchor to milliseconds to match `Date.parse` and the approved helper. PostgreSQL microsecond receipts are valid. Delivery-only anchors use the receipt's saved delivery zone and override mode. A later qualifying scan uses the current resolved family zone. SQL implements neither timezone resolution nor timezone anniversary arithmetic.

Same delivery/anchor/context/clock-version input has one canonical deadline. A different deadline for that same identity returns `calendar-conflict`. An authorized delivery/context/version refresh changes `calendar_revision`. Admission checks the revision captured by its links. Root must identify the reviewed helper/runtime in `p_clock_version` and refresh explicit affected IDs when that reviewed implementation changes. The database does not infer application release versions.

## Message state and lock order

Each parent transaction takes the parent row `FOR NO KEY UPDATE` first. This conflicts with the existing `assert_family_writable` SHARE fence. It then acquires the latest confirmed book for each active child in sorted UUID order: book KEY SHARE before the existing `workbook-scan:<UUID>` advisory gate. More than 100 current sibling books fails closed. Historical books do not consume this bound.

The writing RPCs read fresh state and database time after these waits. No new helper takes photo, calibration, canonical item, child, plan or email-log row locks after the book gate. It reads those facts without a row lock. Existing delivery takes parent SHARE, child NO KEY UPDATE, then book UPDATE. Existing receipt/marking calls obtain the parent SHARE fence before publishing work. The existing unsubscribe insert also obtains parent SHARE through its unchanged family/copy-scope triggers. No new parent advisory gate or unsubscribe transport exists.

Claim computes the complete due sibling set under these locks. A supplied subset, foreign episode or changed set is refused. One transaction creates the parent `email_log` row, message, attempt and every included link. Concurrent schedulers cannot split the initially due set. The message ID is the delivery key. The attempt UUID binds admission and every outcome.

The admission point is the committed `admitted` message/attempt update, with every episode's consumption marker and dispatch count. Call it after transport pacing and immediately before the external request. Only the first successful response permits one dispatch. A replay returns busy. A lost admission response permits no dispatch retry. A scan, unsubscribe, context change, pause, delivery change or child deletion that wins first prevents admission. A message admitted first cannot be recalled from a later external request.

Reserved, admitted, sent and unknown claims have no automatic expiry or takeover. An unknown/lost response keeps its durable evidence. Sent/unknown/lost-admission consumption also lives on each episode. Deleting an aggregate message during child deletion cannot expose its surviving sibling for another send.

Explicit transport refusal clears only that attempt's consumption marker. It preserves the dispatch count. Retry requires the same message's exact full included set to remain currently due and eligible. A changed refused aggregate returns `set-changed`; do not split it or automatically reissue it as another message. This fails closed until qualifying work changes the episode or the set again permits the same aggregate. The maximum is three admissions per episode and three transport attempts per message. A child deletion cannot reset the surviving episode's cap.

An unstarted release retains its attempt and links as audit evidence. The first reservation releases its links and leaves the episode unconsumed. A retry reservation restores its preceding refused attempt count and keeps that message's ownership. Its released token stays stale. This prevents release from resetting the refusal cap. A family fence can prevent the release write; retain the claim and dispatch nothing.

## Proposed email eligibility source

The database reads existing `child_plan_states`, `child_plan_controls`, `plan_control_operations`, `plan_starts` and `card_setups`. It changes none of them. The proposed email-only whitelist is `paying`, `free_month` with a future stored first charge, or `ending` with a future stored end. It rejects a missing state, `not_started`, `payment_failed`, `paused`, `ended`, a cancelled control, an open control/start operation, or an applied pause whose mailing effect is not retired.

This is a conservative proposed seam. There is no existing authoritative scan-reminder eligibility predicate. In particular, an unretired applied pause remains blocked rather than using new SQL calendar arithmetic to infer a restart. The existing paid Restart hook retires pause effects and clears cancellation; the known resulting stored state can qualify. Root must review this email policy before activation. It creates no payment state, billing transition or automatic resume. Unknown payment state remains unknown. The seven-day first-free-month reminder and immediate paid Restart code are unchanged.

Program eligibility and unsubscribe apply only to email. They do not erase receipts, disable scanning, change Day 7 readiness, or disable a zero-scan backstop HOLD. Analytics consent is absent from these functions.

## Root email integration order

Use the existing `sendEmailOnce` public interface and `email_log` ledger. The new parent-level kind is `scan_inactivity`. Only the kind and parent/child constraints expand. Every other old kind, body/status/token/assessment/day/week/month constraint, index, grant and RPC body retains its behavior. A trigger denies direct service INSERT/UPDATE/DELETE of the new kind; only the scoped owner RPCs can write it. Old kinds remain writable as before.

Root must add the new kind to the typed log and admin email mappings after live type generation. Keep the existing assessment reminder kinds and their click rules scoped to those old messages.

The claim saves only an unsubscribe hash. Existing `tokenParent` maps this kind to reminder unsubscribe scope. Existing one-click and page unsubscribe writes of `kind='unsubscribe'` serialize through the parent fence. Use the existing brand/footer helpers, `EMAIL_FROM`, reason text, protected Scan pages entry, RFC 8058 headers and CASL footer. No mail or customer content was created here.

Root must implement this sequence:

1. Build the plain parent message and random unsubscribe token with the existing helpers. Claim with its hash and the complete episode set. Keep the message/attempt/log handle.
2. Enter the shared paced transport queue. Inside that queue, after its wait, asynchronously call admission with this message's handle. The existing `SendOptions.mayStart` is synchronous; it cannot perform this awaited RPC. Put the admission wrapper inside the paced transport, with a per-message handle. Do not create a separate pacing queue for every parent.
3. Send only after a confirmed `admitted` response and its committed transaction. A lost admission response, store error or refusal sends no request. Do not keep a database transaction open around transport pacing or a network request.
4. Stage the transport outcome in the ledger adapter. While this exact token is still current and admitted, call existing `saveEmailCopy` with `{emailLogId}`. It hides unsubscribe tokens and retains the existing Resend `email_id`/event linkage. Then call the outcome RPC. Put this finalization in the adapter's `keepCopy` phase, including on a copy failure. The public email module calls outcome methods before `keepCopy`; finalizing refusal before saving its copy would let a replacement attempt race the old copy write.
5. Skip a stale/released token's copy and finalization. An unstarted `not-due` admission already performed safe release; do not treat that as an admitted provider refusal. Unknown/lost outcomes stay claimed. Never automatically release an admitted attempt.

The test ledger exercises staged outcome/copy/finalization through actual `sendEmailOnce`, `pacedTransport`, `copyRow`, production email SQL constraints and a synthetic transport. Root retains the typed production adapter and real `saveEmailCopy`/Resend validation.

## Access and deletion

All four new tables enable RLS. Service has SELECT only. Authenticated admins can read through checked `is_admin()` policies. Parents see no raw episode/message/job records. Anon has no SELECT. Anon, authenticated and service roles have no direct INSERT/UPDATE/DELETE/TRUNCATE grants. Episode/link rows use composite child ownership and cascades. Parent ownership covers messages/attempts through their aggregate and parent FKs.

The existing family fence covers inserts and updates. The child fence covers episode writes and active link writes. Releasing a link can bypass only the child tombstone check because it creates no child fact; its parent fence still applies. Public callers cannot mutate that bit.

Deleting a child removes that child's episodes and every affected new aggregate message/link/attempt. The aggregate copy is deleted. The parent `email_log` token and send evidence remain redacted under the existing child-copy contract. Surviving episodes retain consumption/counts, so this deletion cannot resend an old sibling episode. A family Auth cascade removes all remaining new rows and email ledger/copy rows. No new bucket exists. No expiry/deletion of a photo changes episode identity or an accepted receipt.

## Checks and evidence

Falsifiers were printed before each test. A wrong deadline/anchor, duplicate send, split sibling set, stale-token outcome, lost unknown claim, deadlock, writable raw table or deletion leak fails the runner.

Dependencies were installed from the local locked npm cache with `npm ci --offline --ignore-scripts --no-audit --no-fund`. No package file changed. Node is `v22.23.1`, ICU `78.2`, tz `2026a`. Local PostgreSQL is `18.6`.

Commands:

```sh
node --check supabase/tests/workbook_scan_reminder_episodes.cjs
node --check supabase/tests/workbook_scan_reminder_episodes_empty.cjs
node supabase/tests/workbook_scan_reminder_episodes.cjs
git diff --cached --check
```

Final result: `WORKBOOK_SCAN_REMINDER_EPISODES_OK 64`, exit 0. The same final log contains exactly 64 PASS lines. Its 20 CALENDAR lines cover the 60 boundary comparisons. The finite episode backfill processed 127 books in two batches. The first recovery group separately seeded 103 historical delivery requests as 100 plus 3, then reached an empty tail. No completed ID repeated.

| Group | Passing groups |
| --- | ---: |
| Access | 1 |
| Calendar | 1 |
| Claim | 2 |
| Concurrency | 33 |
| Deletion | 2 |
| Dispatch | 3 |
| Email | 2 |
| Episodes | 7 |
| Outcomes | 5 |
| Policy | 2 |
| Recovery | 4 |
| Schema | 2 |
| Total | 64 |

The final real boundary waiter started 25,414 ms before the deadline. It acquired admission only after the database crossed that deadline. SQL installation/execution, both JavaScript syntax checks and staged whitespace checks pass. The migration catalog check preserves every pre-existing loaded function body and ACL. All ten old email kinds retain valid inserts and unchanged remaining constraints/grants.

The runner creates a disposable random `/tmp/unica475-reminders-pg-*` cluster with a private Unix socket and no TCP listener. It uses real separate PostgreSQL sessions, explicit transactions and `pg_blocking_pids` barriers. Normal statements have a 15-second timeout. Only the real calendar-boundary waiter has a 75-second timeout. Cleanup runs on success, failure, SIGINT and SIGTERM.

The calendar group has 20 binding cases and 60 before/at/after comparisons. Ten use delivery-only anchors with both override modes. Ten use later accepted scan anchors, with fractional PostgreSQL milliseconds and the actual parent/postal resolution. Cases include the forward gap, repeated clock hour, seasonal changes, Vancouver/Edmonton/Winnipeg dated rules, Chicago native mode, and Newfoundland's half-hour offset. Expected deadlines come from the actual public `scanInactivityCandidate` and family-time helpers, bundled in memory. No expected calendar algorithm is copied.

Exact artificial boundary reads use the private due predicate as the disposable database owner. Service roles cannot pass that clock. Real public claim and reconciliation also cross the same actual four-day/21-day minute boundary after a parent-lock wait. These prove fresh database time after waiting. The fixture can age a receipt that was first admitted by real production photo/calibration hooks. Only its disposable owner disables the immutable timestamp trigger for this controlled historical input; no external caller can do so. These historical timestamps are test inputs, not evidence of a production backfill admission.

The concurrency distribution covers two schedulers/two siblings; scan, unsubscribe, freeze, raw zone, pause and delivery-correction races against both claim and last admission in both lock orders; genuine S4 pending-resolution publication in both orders; both delivery/book-lock orders; an unsubscribe paused before its insert commits; and the actual calendar boundary wait.

Additional checks cover pre-migration and correction recovery, stable 100-row batches, finite episode backfill, partial/foreign sets, first/second books, missing/repeated/corrected delivery, full Day 7 with earlier gaps, completion, Extra practice, late starts, duplicates/rejected/unchanged/resolving retakes, clock/context changes, three-attempt refusal caps, safe release, stale replies, busy/unknown/lost replies, program uncertainty, all old email kinds, email-copy token hiding/provider linkage, child/family cascades, retained unsubscribe tokens, and role/RPC denial.

Earlier runs found test setup issues: a corrected audit and later a new due reminder were beyond their first bounded page, a deliberate minute wait exceeded the normal statement timeout, and deletion of the oldest child correctly required a fresh sibling calendar. Those fixtures now use complete bounded keysets or the required refresh. Audit also found and fixed release resetting refusal counts and child deletion exposing a surviving consumed episode. Final regressions cover both. No base-red result is claimed because the new schema does not exist at the base.

## Proof limits and retained root work

- Recovery: proves bounded public selectors, stable keysets and finite local completion. It passes through the approved clock/reconcile RPCs. It does not activate a scheduler or prove hosted scale/query plans.
- Calendar: proves actual shared helper deadlines, raw context comparison, millisecond alignment and fresh database admission time. It passes through the trusted service computation. It does not prove production Node/PostgreSQL runtime parity or the future typed adapter.
- Receipts/marking: proves behavior through production public photo/calibration/marking/delivery hooks. It passes through synthetic quality/calibration results, Storage metadata and readings. It does not decode bytes, recognize handwriting, call a model, publish learning events or rebuild profiles.
- Messages: proves parent aggregation, lock order, attempt binding, safe release, refusal caps and once-only unknown consumption in real local PostgreSQL sessions. It does not prove external provider delivery or recall a request already admitted.
- Email: proves public `sendEmailOnce` protocol and existing copy mapping/SQL links with a synthetic transport. It passes through the existing brand/Resend implementation without calling it. It does not validate a real QA message, live unsubscribe endpoint, footer rendering or provider event.
- Access/deletion: proves local SQL grants/RLS, current fences and FK/trigger cascades. The fixture reduces Auth, Storage, workbook/admin metadata and plan-control dependencies. It does not run Auth/PostgREST/Storage daemons, the full deletion workers, hosted PostgreSQL 17 or hosted default privileges.

Root retains independent Sol review of this exact implementation, integration of current main near merge, live migration/list/probes, generated types, typed adapters, email/server/UI integration, real QA mail and one-click unsubscribe, hosted access/deletion checks, complete release checks, push/PR/merge and any later activation. The independent reader review remains separate and its files were not edited.

No full suite, application build, browser, Chromium, generator, provider/API request, model call, real email, credential read, live migration, type generation, customer action, push, PR, merge or watch ran here. No D number was reserved. The customer workbook stays at revision 1 for Savar/Cedric's Send all comments review. No print approval exists.

The final runner removed `/tmp/unica475-reminders-pg-B5kQ0S`. A separate process/directory check returned `OWNED_CLUSTER_DIRECTORIES 0` and `OWNED_POSTGRES_PROCESSES 0`. All earlier owned runner clusters were removed. The bundle stays in memory; it creates no build output. The temporary result log was removed after its counts were recorded here. Ignored local npm dependencies remain in this prepared checkout. Root can change `HANDOFF_READY` after it consumes this result.
