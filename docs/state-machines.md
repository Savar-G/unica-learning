# State machines

Status: Phase 1 inventory (2026-11-08). Read-only. No code changed. Owner: Lead: State Machines.

This file lists every implicit state machine in the app, the one pattern we use to make each one explicit, and the order of the work. The full notes for each area, with `file:line` evidence, are in `docs/state-machines/`:

| Area | Notes |
|---|---|
| Workbooks (runs, drafts, comments, edits, print, delivery, emails) | `docs/state-machines/workbooks.md` |
| Assessments, reports, email delivery, reminders | `docs/state-machines/assessments-email.md` |
| Scan pages, AI marking, learning events, profiles | `docs/state-machines/scans-profiles.md` |
| Money, plan access, family deletion, retention | `docs/state-machines/billing-deletion.md` |
| Desk, parent PIN, Maya calls and chat, boards | `docs/state-machines/desk-maya.md` |
| Signup, auth, small machines, repo-wide sweep of SQL checks and TS unions | `docs/state-machines/signup-sweep.md` |

The notes come from reading the code and the SQL. Claims marked "(unverified)" were not traced to the end. The bug candidates below that say "verified" were checked again by hand and against the live database (read-only).

## The pattern

One pattern for every machine. No library: the machines are small, most transitions run in SQL, and the repo already has the seam pattern. A library such as XState adds actors and a runtime that we do not need.

1. **One state list, in one place.** `export const X_STATES = [...] as const` and `type XState = (typeof X_STATES)[number]` in the module that owns the entity. Every other file imports the type. `src/lib/database.ts` `ColumnTypes` maps the column to that type, so the build catches a wrong value. Do not copy the union by hand, and do not cast rows with `allRows<RawX>` to a hand-written union (that hides drift the same way `overrideTypes` does).
2. **One transition table, next to the list.** A plain object keyed by state, then by event, that names the next state. A missing entry means "refused". Guards that need time or data (deadline passed, enough evidence) stay pure functions next to the table and take `now` from the caller. The module's use cases (`startTest`, `finishTest`, ...) ask the table before they call the store.
3. **Every screen maps every state.** Copy for each state or refusal is a `Record<XState, ...>` (or `Record<Refusal, ...>`), never a `switch` with a default. A new state then fails `npm run build` until each screen has words for it.
4. **The database enforces legal states.** A check constraint holds the state list (most tables have one). Where writes already go through an RPC, the RPC guards the move with `where state = <from>` under the row lock and returns a named refusal. We add a transition trigger only where every writer is an RPC, and only in a later, separate migration.
5. **Tests prove the table.** One test walks every state x event and compares the table's answer with what the module and the in-memory store do today. A parity test compares each state list with the database's check constraint (see item 2 below). The existing tests stay unchanged.

Example (item 3, the test attempt):

```ts
// src/lib/state-machine.ts (about 30 lines, shared)
export type Table<S extends string, E extends string> = { readonly [K in S]: Partial<Record<E, S>> };
export const next = <S extends string, E extends string>(t: Table<S, E>, from: S, event: E): S | null => t[from][event] ?? null;

// src/lib/assessment/attempt.ts
export const ATTEMPT_STATUSES = ["in_progress", "completed", "expired"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];
export const ATTEMPT_MOVES: Table<AttemptStatus, "finish" | "expire"> = {
  in_progress: { finish: "completed", expire: "expired" },
  completed: {},
  expired: {},
};
// guard stays pure: the caller passes now
export const mayExpire = (a: { status: AttemptStatus; resumeUntil: number }, answeredAll: boolean, now: number) =>
  a.status === "in_progress" && !answeredAll && now > a.resumeUntil;
```

An agent reads a machine in one place: the list, the table, the guards, and the line in this file that says which SQL functions write it.

## Ranked work list

Value is UX x DX x AX. Risk is what a mistake would cost (money, live children's work, in-flight work of another lead). One machine per pull request, smallest and safest first. Every item keeps behaviour identical, except a bug fix that the Chief of Staff approved first.

| # | Item | Files | Risk | Proof of no change | Area owner |
|---|---|---|---|---|---|
| 1 | **Email log kinds: one list.** `LogKind` becomes an `as const` list in `reminders.ts`; `admin-dashboard.ts` `EMAIL_KINDS` becomes `Record<LogKind, ...>` and `admin-store.ts` rows use `LogKind`. Adds the missing label for `scan_inactivity` (bug B1). | `reminders.ts`, `admin-dashboard.ts`, `admin-store.ts` | Low (admin only) | existing admin tests pass unchanged; new test: a dashboard with one row of every kind renders | none (admin) |
| 2 | **Database check snapshot.** A new script `npm run db:checks` reads every check constraint from the live schema (same Keychain token as `db:types`) into a generated `src/lib/database.checks.ts`. A test compares each registered state list with it. No runtime change. | new script, generated file, one test | Low | no runtime file changes | Platform (tooling only, separate from `db:types`) |
| 3 | **Test attempt machine.** One `AttemptStatus` list (today `AttemptStatus` in `assessment/attempt.ts:12` and a copy `AssessmentStatus` in `test-api.ts:10`), `ATTEMPT_MOVES`, and the in-memory `lockBlock` made equal to the SQL `lock_assessment_block` (test store only). | `assessment/attempt.ts`, `test-api.ts`, `test-attempt-memory.ts` | Low-medium (no SQL, no route change) | state x event walk equals today's outputs; the 10 `test-attempt*.test.ts` files pass unchanged | none |
| 4 | **Desk access: one read.** One `deskAccess(cookie, parent)` replaces `readLock` and `deskGate`, with states closed / open for this parent / open for another parent. Fixes the Maya notice route (bug B9). | `desk.ts`, `proxy.ts`, 5 desk routes | Low-medium (proxy) | proxy and desk route tests unchanged; new table test | Maya / Parent Dashboard |
| 5 | **Send ledger words.** One `DeliveryState` (claimed, sent, refused, unknown) and one admin label function for the 9 send ledgers. Fixes "sent" shown for a claimed report email (bug B13). | `email-delivery.ts`, `admin-dashboard.ts`, ledger readers | Low (admin display) | ledger tests unchanged; mapping table test | Platform |
| 6 | **Report state.** Derived `reportState` (not built, built, email states) in one place for the 5 readers; then the sweep for a finished test with no report (bug B4). | `report-job.ts`, `parent-view.ts`, `child-stage.ts` | Medium | parent-view and report-job tests unchanged | Parent Dashboard |
| 7 | **Scan photo, job, item.** TS mirror of the SQL states, one "waits for the team" rule (today in 5 places), parent copy for each `blocked_reason` (bugs B5, B14). | `scan-*.ts`, scan SQL | Medium | after the AI Marking lead's MVP work | AI Marking |
| 8 | **Maya call record and end pipeline.** One "unfinished call" rule (today 3 hand copies), remove the dead `'family'` kind from TS, an admin state for calls that write no event (bug B12). | `maya-call*.ts`, `admin-maya.tsx` | Medium | after #698 and #677 merge | Maya |
| 9 | **Workbook run.** One "run is active" rule (6 copies), named stop reasons, admin run view from stored state (bugs B8, B15). | `workbook-job.ts`, run SQL | Medium-high (live runs) | blocked until the generator lead clears it | Workbook Generator |
| 10 | **Workbook lifecycle and comments.** Named refusals for the plan fence (bug B7), comment status. | workbook stores, comment SQL | Medium-high | blocked (review tab in change) | Workbook Generator, Billing |
| 11 | **Plan machines.** One "subscription is running" rule (4 copies), refusal copy as `Record` on the start and cancel screens (bugs B6, B10). | `parent-plan.ts`, `card-reconcile.ts`, `stripe.ts`, `start-plan.tsx` | High (money) | blocked until the Chief of Staff and the billing lead clear it | Parent Dashboard and Billing |
| 12 | **Sign-in link and signup.** Lock on the sign-in link rate limit, password change order in `/api/account/finish`. | `account-server.ts`, finish route | Medium | route tests | none |

## Bug candidates (for the Chief of Staff before any fix)

Status updated on 2026-11-09 from current main and, where it says so, the live database.

"Verified" means checked again by hand and, where it applies, against the live database on 2026-11-08 (read-only). None is live harm today; most are latent because the first real customer has not reached that state.

| ID | Bug | Status | Live now | Owner |
|---|---|---|---|---|
| B1 | `/admin` throws on the first `scan_inactivity` email row: `subjectFor` does `EMAIL_KINDS.find(...)!.subject` and that kind has no entry (`admin-dashboard.ts:252`, kind allowed by migration `20261107073840`). | fixed by #777 | 0 rows of that kind | none (admin) |
| B2 | A test that ends with too little evidence never closes: `finishOnce` refuses it (`test-attempt.ts:1121`), it never expires, and it holds the one-open-test slot. The parent screen promises a report. | verified (code) | 0 such tests | none |
| B3 | Reminders use `answered >= total` for adaptive tests (`reminder-store.ts:188`), not the core rule, so they can skip or misword reminders. | inventory only | - | none |
| B4 | A finished test with no report row shows "test running" for ever; the report job runs only from the finish route's `after()`, with no retry. | open; the fix is PR #817 (report retry, Dashboard lead); its migration report_retries is applied live | 0 such tests | Parent Dashboard |
| B5 | A scan marking job that used its attempts is set to `finished` with items still pending (`20261106_scan_marking_sheet_check.sql:150`); nothing picks it up again, and the parent sees "Not marked yet" for ever. | fixed by #779 (migration scan_marking_attempts_to_team); checked on the live function 2026-11-09 | 0 jobs | AI Marking |
| B6 | A Cancel that fails leaves an open `plan_control_operations` row and a card hold with no recovery path; it blocks Pause, Restart, workbook runs, deletion and retention. | fixed by PR #799 (issue #772, migration plan_cancel_recovery): an alert to the team after 10 minutes, then an admin closes the cancel; not automatic | 0 rows | Billing |
| B7 | Plan pause and plan-control refusals (errcode 55000) show as "the family is being deleted" in 5 store places (`workbook-job-store.ts:55,136`, `workbook-ship-store.ts:53,66`, `workbook-draft-store.ts:28`). | fixed by #790 (workbook-plan-refusal.ts) in all 5 store places; next-book-snapshot-store.ts still shows every plan-fence message as "try again" (item 10) | - | Generator, Billing |
| B8 | A second "Prepare next workbook" on a queued run that no one took for 2 minutes flips it to `running` and the next resume fails with "no stored plan" (`20261106120000_workbook_start_resume_lock.sql:19`, `workbook-job.ts:653`). | fixed by f4cedefd: runFrame asks hasStoredWork, so a run with no stored work plans again; checked 2026-11-09 | - | Generator |
| B9 | The Maya notice route checks the desk with `readLock`, not `deskGate`, so a stale desk cookie of another parent gives a raw 423 (`api/account/maya-notice/route.ts:16`). The open route had the same gap: another parent's cookie skipped the Maya notice. | fixed by item 4 (`deskAccess`) | - | Maya |
| B10 | The admin "Start free month" button shows "Stripe could not start the plan" for 5 other refusals, and it still shows after the plan started (`start-plan.tsx`, `admin-records.tsx:38`). | fixed by #790 and #807: start-plan.tsx has words for every refusal, and after a start the card shows "Plan started." with no button | - | Billing |
| B11 | `feedback.status` has no writer (grant is select only), so the admin always sees `new`. | verified (grants) | all rows `new` | Platform |
| B12 | The admin Maya call page says "Saved to child's record: Not yet" with "Try saving again" for ever for calls that write no event by design (`admin-maya.tsx:559`). | open (issue #766, item 8) | - | Maya |
| B13 | The admin shows a report email as "sent" from `emailed_at`, which is the claim time, so an unknown send reads as sent (`admin-dashboard.ts:256`). | fixed by #814 | - | Platform |
| B14 | "Photo is active" uses 23.5 hours in SQL and `scan-crops-store.ts`, but 24 hours in `scan-stack-server.ts` and `scanView`. | fixed: #779 made the TS side one 23.5 h rule, and migration scan_photo_save_window (item 7) made change_scan_photo save use scan_photo_is_active | - | AI Marking |
| B15 | The admin run page derives "Stopped" from the clock and does not refresh when the Mac takes the run back; the line "The run stops if this reaches 6 minutes" is not true. | mostly fixed by f4cedefd (refresh on run status, "No progress for 6 minutes", the old line removed); runState still comes from the clock, and the page hides the progress once the clock says stopped (item 9) | - | Generator |

## Inventory

Scores: U = user experience value, D = developer experience value, A = agent experience value, 1 (low) to 3 (high). "Rules live in" counts the files that compare the state strings where the notes give a count.

### Workbooks

| ID | Machine | Storage | States | Rules live in | DB guard | Main gap | U | D | A |
|---|---|---|---|---|---|---|---|---|---|
| WB1 | Generation run ("Prepare next workbook") | workbook_runs.status/step/lease/heartbeat_at | queued, running, done, failed, stale | workbook-job.ts + 14 SQL migrations; "active" rule in 7 places (13 TS files) | check + partial unique index + lease CAS | A second Prepare press can flip a queued run so it fails "no stored plan" | 3 | 3 | 2 |
| WB2 | Run state shown to admin | derived | waiting, preparing, stopped, failed, done | runState in workbook-job.ts; "quiet" idea repeated in 4 UI places | none | "Stopped" chip does not refresh when the Mac takes the run back | 2 | 1 | 1 |
| WB3 | Runner routing | workbook_runs.runner | server, mac | SQL route_workbook_run + workbook-ai.ts + job-deps (3 files) | check + row lock | Start and route are 2 calls; a failed second call leaves wrong runner | 1 | 2 | 1 |
| WB4 | Mac worker heartbeat | workbook_workers (seen_at, run_id, note) | online, offline, idle, making a run, stopped | workbook-worker.ts + job-store + admin-store (3 files) | primary_ai check only | Restart shows "offline" for a few seconds | 1 | 1 | 1 |
| WB5 | Draft and revisions | workbook_drafts, workbook_draft_revisions | revision N: generated, edit, redo-page | SQL RPCs; latest-revision read in 3 TS places | check + CAS on revision | Two finished drafts of one child can share a number | 2 | 2 | 2 |
| WB6 | Review comments | workbook_comments.status/route | pending, sent, done, failed, stale | SQL in 7 migrations + 3 TS files; route rule in 3 copies | checks; trigger rewrites status | Trigger silently turns failed into pending; banner has 3 wordings | 3 | 3 | 2 |
| WB7 | Edit batches and AI call ledger | workbook_edits.status, workbook_edit_calls | queued, running, done, failed | 6-minute lease literal in 14 places (8 SQL + 6 TS) | checks + unique active index + locks | Edit waits for the Mac for ever; no "run on server" button | 3 | 3 | 2 |
| WB8 | Workbook lifecycle | workbooks.status | draft, approved, printed, shipped | SQL approve/mark/lock trigger + workbook-ship.ts; ~15 places compare it | check + trigger + lock order | Plan-pause refusal shows as "the family is being deleted" | 2 | 2 | 2 |
| WB9 | Print contract freeze | workbooks.printed_revision, pdf_sha256, print_manifest | legacy (none), frozen, cleared | workbook-print-contract.ts + SQL | format checks + trigger | - | 1 | 1 | 1 |
| WB10 | Delivery receipt and corrections | workbook_delivery_receipts, _corrections | not delivered, delivered, corrected | 2 SQL fns + workbook-delivery.ts; derived in 3 places | immutable triggers + CAS on audit id | - | 2 | 2 | 1 |
| WB11 | Workbook emails | workbook_emails.status | pending, sending, sent, failed, unknown, skipped | claim SQL + workbook-email.ts; 10-minute rule in 3 places | check + unique + row lock + claim token | Row stays "sending" for ever if the process dies | 2 | 2 | 2 |
| WB12 | Book 1 baseline, second tries, previews | workbook_book1_baselines, _second_tries, _plan_previews | none, baseline saved, second tries, preview saved | SQL + workbook-book1-store.ts | immutability triggers + unique keys | - | 1 | 1 | 1 |
| WB13 | Boundary items (scan receipts, restart requests) | workbook_scan_*, workbook_restart_requests | pending (run_id null), consumed; scan states not traced | 2 SQL triggers; not inventoried in depth | FK + triggers | Any run insert clears the restart request, even a failed run | 1 | 1 | 1 |

### Assessments, reports and email

| ID | Machine | Storage | States | Rules live in | DB guard | Main gap | U | D | A |
|---|---|---|---|---|---|---|---|---|---|
| AS1 | Test attempt lifecycle | assessments.status, resume_until, completed_at | in_progress, completed, expired (derived: open, expired, completed) | assessment/attempt.ts; "in_progress" in 17 files, "expired" in 27; type declared 2 times | check + unique open index + row-lock RPCs; no edge check | Insufficient-evidence test never closes; child locked out | 3 | 2 | 3 |
| AS2 | StartState (start screen) | derived | start, resume, finish, expired, wait | attempt.ts startState; 4 independent readers + reminders | none | "finish" for an insufficient-evidence test never finishes | 2 | 3 | 2 |
| AS3 | Section lock records | assessments.route, stage3_route, test->adaptive | stage 1/2/3 locked, adaptive block k locked, complete | core + SQL change_answer, 3 lock fns, admin SQL; stage3_route in 17 files | CAS RPCs + check | In-memory lockBlock drifts from SQL | 2 | 3 | 2 |
| AS4 | Halfway break | assessments.break_started_at/ended_at/skipped/ms | none, shown, ended (skipped or rested) | core breakDue + module + store + client (4 places) | checks + guarded updates | Browser decides to show break from localStorage, not server | 2 | 2 | 1 |
| AS5 | Quick facts section | assessment_facts, fact_answers | ready, running, done | assessment/facts.ts + admin SQL + admin TS | PK + unique position | Facts answer after the deadline is accepted from a stale tab | 1 | 1 | 1 |
| AS6 | Child's test screen (client) | React state + localStorage | intro, question, more, check, break, facts, insufficient, help, done | test.tsx (1111 lines) + test-review.ts | n/a (client) | End screen promises an email even if the report job fails | 2 | 3 | 2 |
| AS7 | Admin progress phase | derived | question, check, break, facts, finished, closed | admin-progress.ts + 2 SQL fns copy the core | none | Insufficient-evidence test shows "last step" for ever | 1 | 2 | 1 |
| AS8 | Report build | reports row (no status column) | not built, built | report-job.ts; "ready" derived in 5 places | unique assessment_id | Finished test with no report stays "test running" for ever | 3 | 2 | 2 |
| AS9 | Report emails on report row | reports.emailed_at/email_id/email_error, alerted_at | unsent, claimed, sent, refused, unknown | report-row-ledger.ts + admin-dashboard.ts | guarded CAS update; no cross-column check | Admin shows "sent" for a claimed or unknown email | 2 | 3 | 2 |
| AS10 | Email delivery protocol | in memory over MailTransport + SendLedger seams | sent, refused, unknown, busy, not_sent | email-delivery.ts (1 file); 10 callers | depends on the ledger | Stand-in id "sent" never joins webhook events | 1 | 2 | 3 |
| AS11 | Send ledger vocabularies | 9 ledgers (email_log, reports, workbook_emails, plan_starts, maya_call_alerts, ...) | claimed, sent, failed, unknown ... (7 vocabularies) | 9 stores, each admin reader re-derives | varies per ledger | Same outcome gets different labels in admin | 2 | 3 | 2 |
| AS12 | Reminder due-ness | derived | continue, come_back, start, start_followup | reminders.ts + reminder-schedule.ts + reminder-store.ts | unique index per kind | Adaptive tests: wrong answeredAll, reminders silently dropped | 2 | 2 | 1 |
| AS13 | email_log row lifecycle | email_log.status, kind | claimed, sent, failed (unknown = claimed + error) | 3 ledgers; checks re-created in 5 migrations; 13 files | checks + partial unique indexes | Held claimed row looks "pending" for ever | 1 | 3 | 1 |
| AS14 | Weekly Maya and monthly summary email | email_log rows | not due, due, claimed, sent, failed, unknown | 2 pure modules + 2 stores + SQL claim_maya_weekly | unique indexes + claim RPC | SQL attempts < 3 literal not tied to the TS constant | 1 | 2 | 1 |
| AS15 | Reminders cron run | none stored | per-run counts only | api/reminders/route.ts + each runner | none | Reminder and weekly stages have no time budget | 1 | 2 | 1 |
| AS16 | Unsubscribe state | email_log rows, 3 kinds | subscribed, unsubscribed, unknown | reminder-store.ts + each due* function | unique indexes | Read at load not at claim; no resubscribe path | 1 | 1 | 1 |
| AS17 | Resend webhook, copies, clicks | email_events, email_copies | delivered, delivery_delayed, bounced, complained, failed, suppressed | resend-webhook.ts + admin joins | unique webhook_id | A bounce changes no ledger status | 1 | 1 | 1 |
| AS18 | Device context | assessments.device | unset, set | test-attempt.ts recordDevice (1 file) | write-once guard | - | 1 | 1 | 1 |

### Scans, marking and profiles

| ID | Machine | Storage | States | Rules live in | DB guard | Main gap | U | D | A |
|---|---|---|---|---|---|---|---|---|---|
| SC1 | Scan photo lifecycle | scan_photos.state, sent_at | reserved, processing, pending, saved, deleted, expired, rejected | SQL fns (6 migrations); "active" rule in 4 copies; state strings in ~15 files | check + unique index + advisory lock + triggers; no edge check | "Active" is 23.5 h in SQL, 24 h in 2 TS copies | 2 | 3 | 2 |
| SC2 | Family processing slot | derived (scan_active_jobs) | free, taken | SQL scan_active_jobs + TS copy familySlotFree | advisory lock | A dead process holds the slot until its lease lapses | 1 | 2 | 2 |
| SC3 | Photo check / calibration | scan_calibrations.state | running, ready, refused (+ stale sheetCheck) | SQL + 4 TS vocabularies; sheetCheck rule in 3-4 copies | check + lease token + attempt cap | Closed tab leaves "Checking" for ever | 2 | 2 | 1 |
| SC4 | Send and marking recovery | scan_photos.sent_at, scan_marking_queue_cursor | not sent, sent | SQL recover_scan_marking_oldest + 2 TS runners | guarded sent_at is null + cursor row lock | "Photos with work" list lives only in SQL; TS assumes it | 3 | 2 | 2 |
| SC5 | Marking job | scan_marking_jobs.state, blocked_reason | queued, running, extracted, finished | SQL scan_marking_command (3 wrappers) + scan-marking.ts; 4 vocabularies | checks + lease token + budget lock | 2 failed calls end job "finished" with unread items; team never sees them | 3 | 3 | 2 |
| SC6 | Marking item | scan_marking_items.observation, result_version | pending, scored, parent-pending, parent-checked, unscored | "waits for team" in 5 places, "terminal" in 2 | checks + result_version CAS; no state/result pairing | Parent sees "Not marked yet" for ever | 3 | 3 | 3 |
| SC7 | Mark publication outbox, profile freshness | scan_marking_items.original_event/event_id, scan_marking_revisions | intent pending, published; child fresh, behind, pending skill states | SQL + 6 files | guarded ack + idempotency key | "Profile pending" is encoded as revision minus 1 | 2 | 2 | 3 |
| SC8 | Marking spend hold and evaluation ledger | scan_marking_spend + evaluation tables | reserved, settled, unknown cost, deferred, resolved | SQL only; USD 50 cap in SQL and TS | checks + global advisory lock + immutability triggers | Unknown cost holds budget for ever; no production reconciliation | 1 | 1 | 2 |
| SC9 | Parent explanation lease and cache | parent_explanations | none, claimed, cached | SQL + parent-problem-explanation*.ts | PK + lease token + budget lock | Spend hold is permanent, same as SC8 | 1 | 1 | 1 |
| SC10 | Marking and scan access gate | env mode + plan state | mode off, test-only, families; open or closed (12 reasons) | scan-marking-access.ts + scan-pages-access.ts (2 files) | none (app rule only) | Plan closing mid-run: in-flight job still finishes | 1 | 1 | 1 |
| SC11 | Child profile build | child_profiles.build_token | stored build; findings stored, late, failed, off | child-profile.ts + store (3 save paths) + SQL | token CAS + unique | Marking rebuild wipes AI findings | 1 | 1 | 2 |
| SC12 | Skill state history | skill_state_history | mastered, working_on, needs_review, not_started | skill-state.ts (1 place); reason list in SQL + TS | checks + append-only trigger | - | 1 | 1 | 1 |
| SC13 | Learner profile build (also in assessments inventory) | learner_profiles.profile.buildId | absent, facts, facts + AI | learner-profile.ts + child-profile-server.ts (2 copies) | unique + JSON path CAS | Plain facts upsert is last writer wins | 1 | 1 | 1 |
| SC14 | Learning events | learning_events | none (append only) | learning-events.ts; source/result lists in SQL + TS | checks + unique key + append-only trigger | Assessment-source events have no live writer | 1 | 1 | 1 |
| SC15 | Scan progress and reminder tables (adjacent) | workbook_scan_reminder_messages/attempts | reserved, admitted, sent, refused, unknown, released | not traced | checks | Not traced | 1 | 1 | 1 |

### Money, plan access, deletion and retention

| ID | Machine | Storage | States | Rules live in | DB guard | Main gap | U | D | A |
|---|---|---|---|---|---|---|---|---|---|
| MO1 | Stored plan state | child_plan_states.kind | not_started, free_month, paying, payment_failed, ending, ended, paused | plan-state.ts + SQL save fn + memory twin; kind strings in 23 files | check + read_order CAS | Screen reads "unknown" after a successful cancel | 3 | 3 | 3 |
| MO2 | Daily plan re-read | child_plan_states.read_at | due or not due; stored, older, duplicate, no_match, unclear | plan-state.ts + SQL due_plan_reads (hand-synced kind list) | due-ness by DB clock; "may store" in TS only | Wrong "ended" row is never repaired if both writes are lost | 1 | 2 | 2 |
| MO3 | Plan gate | derived | open, ending_until_end, no_plan, ended, payment_failed, paused, unknown, read_failed | plan-access.ts (1 pure fn); 11 consumers + 1 SQL twin | none | Closed note says "Restart" but the button is not shown for "ending" | 2 | 2 | 3 |
| MO4 | Plan start record | plan_starts.state | open, started, other, refused, team_ended | card-reconcile.ts + stripe.ts + SQL + memory twin; 8 TS + 9 SQL files | checks + CAS + trigger + atomic admit | Dead state "other" still in 8 TS files; admin error text wrong | 2 | 3 | 3 |
| MO5 | Start email and team alert | plan_starts.email_state, email_send_status, team_alert_state | none, pending, sent, unknown; sending, failed | SQL + card-reconcile.ts + workbook-email-server.ts (4 files) | checks + token CAS | Team alert "sending" never times out | 1 | 2 | 1 |
| MO6 | Card update order | child_card_updates | no row, recorded + needs_repair, settled | card-reconcile.ts + SQL + memory twin | checks + CAS | - | 1 | 2 | 1 |
| MO7 | Pause and Cancel operations | plan_control_operations.state, child_plan_controls.cancelled | open, applied, refused | SQL + 5 TS files; Cancel has no seam | checks + unique open index + row lock | Failed Cancel leaves open op for ever; no recovery | 3 | 2 | 3 |
| MO8 | Paid restart request | workbook_restart_requests.run_id | pending, consumed | 2 SQL triggers | FK + triggers | Any run insert clears it, even a failed run | 2 | 1 | 1 |
| MO9 | Family card-operation hold | family_card_operations | held, not held | SQL begin/end; 8 consumers | PK only, no expiry | Orphan hold blocks family delete for ever | 2 | 1 | 2 |
| MO10 | Saved card and waitlist | card_setups.card_saved_at | no customer, customer + unsaved, saved | saved-card.ts (1 pure file) | CAS is null + unique | - | 1 | 1 | 1 |
| MO11 | Family deletion job | parents.deletion_requested_at, family_deletions | not requested, checking, deleting, keep, complete | ~12 SQL fns in 8 migrations + TS; proxy gate | checks + row locks + fence trigger on ~25 tables | Retention-frozen parent can open pages; every write is refused | 2 | 2 | 2 |
| MO12 | Self-serve family delete flow | family_delete_codes, _attempts, _holds | code none, live, expired, spent; attempts open, locked; hold live, ended | family-delete.ts (1 pure module) + SQL | CAS + DB clock (except attempts) | Lock end set by app clock, read by DB clock | 1 | 1 | 1 |
| MO13 | Child delete | child_deletions | absent, queued, leased, released, gone | SQL + child-delete.ts; hand-copied start-state list | lease token + fence trigger | Shared Stripe customer blocks delete with no clear message | 1 | 1 | 1 |
| MO14 | Retention decision | derived | delete, keep, unknown | retention.ts (1 pure fn); "LIVE" is the 4th running-plan copy | claim re-check under row lock | Stripe "former customer" and stored "ended" can disagree | 1 | 1 | 2 |
| MO15 | Parent plan screen source | derived | stored plan, live Stripe plan, adjusted plan | billing.ts + parent-plan-server.ts + plan-controls-server.ts | none | Account tab and Plan page show different plans | 3 | 2 | 2 |

### Desk, PIN, Maya and boards

| ID | Machine | Storage | States | Rules live in | DB guard | Main gap | U | D | A |
|---|---|---|---|---|---|---|---|---|---|
| DK1 | Desk lock | cookie unica_desk (device) | closed, open, latent, session_unknown (`DESK_ACCESS_STATES`); restored page | desk.ts `deskAccess` and the `DESK_GATE` table (item 4); the tutor pages still read the cookie's names with `readLock` | none (cookie only) | Fixed by item 4: the notice and open routes read `deskAccess` | 2 | 3 | 3 |
| DK2 | Proxy request gate | derived (proxy.ts) | pass, to-desk, refuse; deletion none, queued, unknown | proxy.ts inline + desk.ts + family-delete.ts | n/a (reads) | Wrong 503 or 410 on a read blip | 2 | 2 | 1 |
| DK3 | Desk page view | derived | no-workbook, awaiting-delivery, ready, null | desk.ts + tutor/page.tsx | RLS via parent session | Shipped book with no pages says "no workbook yet" | 1 | 1 | 1 |
| DK4 | Parent PIN leave check | parent_pins.failed_attempts, locked_until | no PIN, open, tries 1-4, locked | parent-pin.ts + SQL claim_pin_attempt + memory twin | row-lock claim + checks | Child can use 5 tries and lock the parent out; app clock | 2 | 2 | 2 |
| DK5 | Parent PIN reset counter and set/change | parent_pins.reset_failed_attempts, reset_locked_until | PIN set or not; reset open, locked | parent-pin.ts + 2 SQL claim fns + memory twin | upsert + conditional update | Auth rate limit can burn the parent's 5 tries | 1 | 2 | 1 |
| DK6 | Maya notice acceptance | maya_notice_acceptances | not agreed, agreed (per version) | maya-notice.ts + 4 other files (5) | PK only | Desk shows a generic error for notice_required | 1 | 1 | 1 |
| DK7 | Maya chat access gate | derived | test, open_plan, plan, closed; open, too_young | maya-chat.ts + maya-chat-server.ts + plan-access.ts | none | Stripe level is inline; unreadable Stripe gives 503 | 2 | 2 | 1 |
| DK8 | Maya call record | maya_calls.status | live, ended | maya-call.ts (1464 lines) + store + memory twin; 15 TS + 19 SQL files | checks + trigger + revision CAS; no edge guard | No DB guard on ended -> live; safety flag stored twice | 3 | 3 | 2 |
| DK9 | Call end pipeline | maya_calls.live, learning_event_id, profile_rebuilt_at, note_pending | ended no event, event written, profile rebuilt, note done | maya-call.ts afterEnd + sweep + admin-maya.tsx | 2 checks (live_until_event, note_pending) | Admin shows "Not yet" + retry for a legitimate event-less call | 2 | 2 | 1 |
| DK10 | Parent note | maya_calls.note_pending, maya_call_notes | waiting, written, done, no_name | maya-call-note.ts + maya-call.ts + sweep + SQL trigger | unique call_id + trigger | A no_name note stays pending for ever | 1 | 2 | 1 |
| DK11 | Call flag and alert ledger | maya_calls.flag, maya_call_alerts.status | flag: none, unsafe_request, safety_concern, safety_immediate; alert: sending, sent, refused, unknown | maya-call.ts + alert files; flag strings in 7 files | enum checks + unique (call, level) | Stale "sending" alert is "unknown" in TS only | 3 | 2 | 2 |
| DK12 | Abandoned-call sweep and cursors | maya_call_sweep_cursors | live due, unfinished due, cursor null or pass in progress | maya-call-sweep.ts + store; "unfinished" defined 3 times | cursor checks only | "Unfinished" hand-copied in TS, a string and an index | 2 | 3 | 1 |
| DK13 | Chat message admission and lease | maya_chat_messages (no status column) | in flight, lease expired, done | SQL (redefined in 3 migrations) + maya-chat-server.ts + client | unique (call, revision) + lock order | State derived across SQL, server and client; no SQL test | 3 | 3 | 2 |
| DK14 | Chat ink log and device outbox | maya_call_ink_events + localStorage outbox | server: saved, busy, closed, gap, not_found; device: sent, again, final, retry | board-history.ts + 230-line React hook; constants in 3 places | PK + seq range + row lock | Ink lost if chat ended over 5 minutes while offline | 2 | 3 | 3 |
| DK15 | Desk chat client flow | React state + sessionStorage | no chat, live, pending, uncertain, ended, week_used, paused | desk-chat.tsx only (hook, ~8 state pieces) | n/a (client) | One generic error shown for every refusal | 3 | 2 | 1 |
| DK16 | Voice call | maya_calls mode voice, maya_call_connections | not started, started, ended | maya-call.ts + maya-voice.ts + maya-voice-token.ts | trigger + revision CAS | - | 1 | 2 | 1 |
| DK17 | Maya minutes ledger | maya_minute_grants | no grant, open, settled | maya-minutes.ts + SQL | advisory lock + checks | Dormant: no production caller of grant | 1 | 1 | 1 |
| DK18 | Maya spend reservations | maya_spend | reserved, settled, settled uncertain; open, week_used, paused | maya-spend.ts; 10-minute TTL in TS and SQL | checks + global advisory lock | Ledger unreadable fails closed to "paused" | 2 | 1 | 2 |
| DK19 | Maya session controller | maya_calls.live jsonb (Session v4) | READY, OPEN, ASSESS, MODEL_EXAMPLE, TRY_TARGET, GUIDE_TARGET, CHECK, ... (10 main, 6 interrupts) | maya/session.ts (2463 lines) + 6 helper files | none (jsonb blob) | Not judged (PRs #698 and #677 in flight) | 3 | 3 | 3 |
| DK20 | Board history | memory + localStorage draft | pen maya or child; event kinds | board-history.ts (1 file, model pattern) | n/a (client) | Draft that fails to decode restarts the board | 1 | 1 | 1 |
| DK21 | Board tab | Web Lock or localStorage lease | holder, reader | board-tab.ts (1 file) | n/a | Frozen holder under Web Locks cannot be taken over | 1 | 1 | 1 |
| DK22 | Board session | closure in board-session.ts | opening, holder, reader | board-session.ts (1 file, endHolding) | n/a | - | 1 | 1 | 1 |
| DK23 | Board batch protocol | BoardTransport seam | accepted, shown, presented, cancelled | board-protocol.ts (847 lines) + board-speech.ts | n/a | Not examined in depth | 1 | 2 | 1 |
| DK24 | Admin chat family list and rehearsal | maya_chat_families | not listed, listed, rehearsal | SQL fn + maya-chat.ts + admin-maya-chat.ts | unique rehearsal index + lock order | - | 1 | 1 | 1 |
| DK25 | Voice worker (dormant) | worker/maya-voice | mirrors DK16 | worker/maya-voice/src (not read) | none | Not read in detail | 1 | 1 | 1 |

### Signup, auth and small machines

| ID | Machine | Storage | States | Rules live in | DB guard | Main gap | U | D | A |
|---|---|---|---|---|---|---|---|---|---|
| SU1 | Signup form with email code | React state in AccountSignup | form, code, code-proved retry, honeypot code | account.tsx (1108 lines); code-error mapping copy-pasted 2 times | none (server checks proof) | "unconfirmed" and "send_failed" show the generic error | 2 | 2 | 2 |
| SU2 | Family admission (finish + create_family) | Auth user, parents, children | created, exists, busy, unavailable, failed | finish/route.ts + SQL create_family + account.tsx | advisory lock + checks in one transaction | Two tabs: password write before the lock overwrote the winner's (fixed in item 12 by the finish claim, #815) | 1 | 1 | 1 |
| SU3 | Sign-in and first sign-in | Supabase Auth session | password, code, enter; no_match, too_many, unavailable | account.tsx + 4 other files (5) | Supabase Auth only | - | 1 | 1 | 1 |
| SU4 | Password reset | Supabase Auth recovery token | idle, busy, sent, wait, bad | account.tsx + auth/confirm route + auth-email.ts | Supabase Auth only | No test found | 1 | 1 | 1 |
| SU5 | Phone-to-laptop sign-in link | sign_in_links.used_at, expires_at | valid, used, expired, unknown (+ failed from a query flag) | sign-in-link.ts + 4 other files (5) | unique hash + one-statement CAS | Link is burned before sign-in works; hourly cap was count-then-insert (locked by `issue_sign_in_link`, item 12) | 2 | 2 | 1 |
| SU6 | Child stage and Parent home switch | derived | ended, active, first_book_coming, test_running, report_ready_bc, report_ready_waitlist, no_test | child-stage.ts (1 pure file); access predicate in 4+ files; 7 env switches | none | Any dashboard load error silently gives the old Parent home | 2 | 2 | 2 |
| SU7 | Admin funnel stage | derived (buildFamilies) | account, started, finished, card_started, card_saved, trial, paying, cancelled, waitlist | admin-dashboard.ts (reads live Stripe) | none | Admin "paying" and parent "active" can disagree | 1 | 2 | 2 |
| SU8 | Legacy booking signup | signups.status, booking_state | reserved, waitlist; pending, ready, not_started | SQL triggers + signup.ts | triggers refuse other changes | Live public route that nobody calls still creates Stripe customers | 1 | 1 | 1 |
| SU9 | Ad visit funnel and flyer scans | ad_visits, ad_visit_steps, flyer_scans | start_open, form_start, google_start, code_sent (a set) | ad-visit-steps.ts + 3 files; step names in SQL + TS | check + PK + FK | Step marked sent before the fetch resolves; lost post never retried | 1 | 1 | 1 |
| SU10 | Parent feedback | feedback.status | new, read, closed | SQL submit_feedback + feedback.ts | strong (checks, unique, locks, fences) | "read" and "closed" have no writer; status always "new" | 2 | 1 | 1 |
| SU11 | Test family and admin membership | test_accounts, admin_users (row exists) | test or not test; marked; team | 14 files query directly; 20 migrations; 4 different predicates | RLS + some triggers | The 4 predicates are not the same set | 1 | 3 | 3 |
| SU12 | Admin cards and waitlist page | card_setups + derived | not saved, saved + customer, start stuck | inline in admin-records.tsx | unique child and customer | Start button shows again after the plan already started | 2 | 1 | 1 |
| SU13 | parents.time_zone | parents.time_zone | null, set | family-time.ts (1 pure file) | CAS (is null) | - | 1 | 1 | 1 |

### Repo-wide counts

- 107 enum-like SQL check rows across 230 migrations (latest definition wins). 55 of 103 comparable checks have an exact TS union, 10 have a near twin, 38 have none.
- 96 TS string unions and as-const arrays name states, kinds or steps, plus 73 inline interface fields with 3 or more values.
- Most copied literals in non-test src files (files that use them): refused 72, failed 68, sent 54, saved 50, unavailable 42, unknown 41. In migrations: running 35, shipped 32, failed 29.
- SQL functions return 56 distinct `'status'` words, 449 times, in 48 migrations (refused alone is 181 times in 28 files). TS reads them with no shared type.
- Hand-copied enums with proven drift: `email_log.kind` has 4 copies and 2 miss `scan_inactivity` (latent admin crash). `in_progress | completed | expired` is declared 3 times. `server | mac` twice. Plan gate reasons twice. Province list in 5 tables.
- "Run is active" is spelled `queued || running` in at least 6 places. "Stale" means 5 different things in 9 files.
- Three machines already have the pure core, store seam and memory twin shape: test attempt, board history, child stage.
- Running-plan definition has 4 copies (RUNNING_PLAN, planNotOver, runningPlans, LIVE), and kind strings appear in 23 files.
