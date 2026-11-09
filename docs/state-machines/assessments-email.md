# Inventory: implicit state machines - ASSESSMENTS, REPORTS AND EMAIL DELIVERY

Repo: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/site-state-machines (branch site/state-machines, read only).
All paths are relative to that repo. "Verified" = I read the code or SQL named. "(unverified)" = inferred, not run.
Nothing was executed (no tests, no build). Counts come from `rg` over `src/` excluding `*.test.*` unless stated.

## Top findings

1. **Dead-end test: "complete but insufficient evidence" never closes (lying screen, child locked out).** An adaptive test whose
   evidence is insufficient reaches `adaptive.complete = true` and `sufficientEvidence = false`. `allAnswered` is then true
   (`src/lib/assessment/session.ts:377`, `allAnswered`), so the test never expires (`attempt.ts:46-48`), `startState` returns `finish`
   (`attempt.ts:88`), and `decideStart` returns `resume` forever (`attempt.ts:121+`). But `finishOnce` refuses with `incomplete`
   (`src/lib/test-attempt.ts:1121`). Status stays `in_progress`, holding the one-open-test unique index
   (`supabase/migrations/20261010_add_assessments.sql:27`). The parent sees "Finish test ... Open it to finish. The report then comes by
   email" (`src/components/account.tsx:680`); the child sees "ask your grown-up" (`src/components/test.tsx:561`); no report ever comes.
   The test file asserts this end state (`src/lib/test-attempt-blocks.test.ts:55-70`: `status` stays `in_progress`, no placement).
   I found no admin or cron path that closes such a test (unverified: searched `src/app/api/admin` and `src/lib/admin-*.ts` for writes to `assessments.status`; only `expire()` in `test-attempt-server.ts:80` writes it).
2. **Reminders compute `answeredAll` with a different rule than the test module (adaptive tests, verified).** `reminder-store.ts:188` uses
   `answered >= total`, where `total` is the number of questions drawn so far (`lengthOf` -> `testLength` -> `adaptiveQuestions(...).length`,
   `reminder-store.ts:172-181`). The core uses `allAnswered = adaptive.complete` (`session.ts`). At each "Check your answers" grid of block 1..n-1
   the reminder job sees "all answered" (state `finish`, never expires), while the start screen sees an open test that expires after 24 h.
   Result: no "continue" and no "come back" email for a child who stopped at a block grid, while the parent screen later says "Start again".
   The "continue" email also prints "answered 6 of 6 questions" for an adaptive test that is not finished (`reminder-email.ts:52`).
   No test covers adaptive in reminders (`rg adaptive src/lib/reminder*.ts src/lib/reminders.ts` finds nothing).
3. **Admin email status lies for the report email (verified).** `emailStatus(r.emailed_at, r.email_error)` (`src/lib/admin-dashboard.ts:256`, used at
   `:301-302`) treats `emailed_at` as "sent". But `emailed_at` is the claim time (`report-row-ledger.ts:10-12`, `:66`). A claimed-and-still-sending
   email and an `unknown` outcome (claim kept, error set) both show "sent". The admin query does not even select `email_id`
   (`admin-store.ts:296`, `:1010`). The same `unknown` outcome for a reminder (`email_log.status = claimed` + error) shows "pending"
   (`admin-dashboard.ts:290`). Same outcome, two labels.
4. **A finished test whose report never gets built stays "test running" for the parent forever (verified).** `testFact` in `src/lib/parent-view.ts:155-162`
   returns `running` for a completed test with no report row; the child stage becomes `test_running` ("continue_or_wait"). The report job runs only from the
   finish route's `after()` (`src/app/api/account/assessments/[id]/finish/route.ts:28`); `rg runReportJob` finds no other caller, no cron, no sweep.
   A function kill, or a refused parent email, is never retried (the report email claim is released on refusal, but nothing re-runs the job). The 3-minute end
   screen promises "We will email it to you" (`test.tsx:1093-1100`) with no worker behind the promise. The only backstop is the "Report FAILED" email to Savar
   (`report-job.ts:253`), which is skipped when `SIGNUP_NOTIFY_EMAIL` is unset.
5. **One 4-step send protocol, seven storage vocabularies (verified).** claim -> sent | refused | unknown (+ release) is implemented as: `email_log.status`
   claimed/sent/failed with unknown = "claimed + error" (3 near-identical ledgers: `reminder-store.ts:129`, `monthly-summary-email-store.ts:127`,
   `maya-weekly-email-store.ts:135`); `reports` nullable timestamps (`report-row-ledger.ts:51`); `workbook_emails.status` pending/sending/sent/failed/unknown/skipped;
   `maya_call_alerts.status` sending/sent/refused/unknown; `scan_link_emails.status` claimed/sent/failed; `plan_starts.email_state` none/pending/sent/unknown plus
   `team_alert_state`; `workbook_scan_reminder_messages.state` reserved/admitted/sent/refused/unknown/released. Each admin or UI reader re-derives "what happened".
6. **`complete_test` answers 'done' for "not in progress" (verified SQL).** `supabase/migrations/20261024_remove_extra_round_functions.sql:9-13`:
   `if not found then return 'done'`. A test that is expired (or already completed by another request) is reported as finished "now"
   (`test-attempt.ts:1127`, `finished: "now"`), then the report job logs "not a finished assessment" and exits. Narrow race (answered-all tests do not expire in
   TS), but the SQL contract cannot tell "I completed it" from "nothing happened".
7. **Memory twin drifts from SQL for `lockBlock` (verified).** SQL `lock_assessment_block` returns `closed` when `adaptive.complete`, sets
   `resume_until = greatest(...)` and moves `last_answer_at` (`20261105_assessment_blocks.sql:3-24`). `test-attempt-memory.ts:307-315` checks neither the
   `complete` flag nor `greatest`, and assigns `resumeUntil` directly. The in-memory tests (the repo's model pattern) can pass where the SQL would answer differently.
8. **Report job is not single-flight (cost only, verified).** `storeReport` does read-then-AI-then-insert with no lock (`report-job.ts:158-178`). Two finish
   requests at once (double click, retry) both run the AI review and text before the unique insert picks one. Emails are safe (claims); AI spend is doubled.

Other smaller items: facts section routes have no deadline or step check (`startFacts`/`answerFact` call `parentTest` only, `test-attempt.ts:1017`, `:1049`);
unsubscribe is read at load time, not at claim time, in reminders and the weekly email (race window = one cron run, up to 60 s; `reminders.ts:179-182`,
`claim_maya_weekly` in `20261105124144_maya_chat_lock_order.sql:70`); `MAX_SEND_ATTEMPTS = 3` (`reminders.ts:14`) is duplicated as a literal `attempts < 3` in SQL
(`claim_maya_weekly`); the reminder and weekly runners have no time budget (only monthly has `inTime`), 40 + 20 sends at 600 ms gap on one
paced transport inside `maxDuration = 60` (`src/app/api/reminders/route.ts:27`), a function kill leaves claims held forever by design (unverified under load).

---

## Pattern note: how the test attempt module is built (the repo's model; may be copied)

Layers, from the inside out (all verified by reading):

1. **Pure core, no I/O, no clock.** `src/lib/assessment/*` (session.ts, attempt.ts, adaptive.ts, facts.ts, break.ts via `breakDue`, stored.ts, types.ts).
   Rules are plain functions over plain data: `attemptState`, `startState`, `decideStart`, `recordAnswer`, `startAttempt` (`attempt.ts`), and for the
   test's content `testStep`, `nextQuestion`, `allAnswered`, `lockStage1`, `lockStage2`, `stage3Due`, `openSection`, `lockAdaptiveBlock`, `submitAnswer`, `finish`.
   The caller passes `now` (epoch ms) and every stored time. The state is a discriminated union (`AttemptState`, `StartState`, `TestStep`, `FactsStep`).
   The stored state is small (status + deadline + lock records); the rest is **rebuilt from the answers** (`restoreSession`) on every request.
2. **Module = the orchestration, against one store interface.** `src/lib/test-attempt.ts` (1341 lines) holds `AttemptStore` (+ `FactsStore`, `ShownStore`,
   `ContextStore`), `Refusal` (closed union), and the use cases (`startTest`, `nextStep`, `answerQuestion`, `changeAnswer`, `doneChecking`, `startFacts`, `answerFact`,
   `finishTest`, `recordBreak`, `recordDevice`). Every operation takes one `now`. It returns domain results, never HTTP; `src/lib/test-api.ts:refusalResponse` maps them.
   No Next.js imports. Every store method documents its guard in the interface comment.
3. **Two adapters with the same guards.** Supabase: `src/lib/test-attempt-server.ts` (guards = unique index + guarded `update ... where status='in_progress'` + RPCs that
   take the row lock: `lock_stage1`, `lock_stage2`, `lock_assessment_block`, `change_answer`, `complete_test`). In-memory: `src/lib/test-attempt-memory.ts` (334 lines;
   every method `await begin()` so two calls interleave like two requests; has a `fail` map to inject `StoreError`s).
4. **Tests drive the module through the memory store** (public interface only): `test-attempt.test.ts` (97 cases), plus `test-attempt-{blocks,change,changed-consumers,check,context,routes,third-stage,timeline}.test.ts`
   (4098 lines in total across the 10 files), `assessment/{attempt,break,change,session,third-stage,adaptive,facts,stored}.test.ts` for the core, `test-review.test.ts`
   for the screen's pure leave rules, `components/test-save-failure.test.ts` for the client save loop.
5. **Routes are thin.** `src/app/api/account/assessments/**/route.ts` authenticate (`parentId`), parse, call the module with `Date.now()`, translate the result.
6. **The screen has its own small pure module** for the part that can be pure: `src/lib/test-review.ts` (`leaveDestination`, `questionButtons`).
   The rest of the screen state is still `useState`/`useRef` in `src/components/test.tsx` (see "Child's test screen" below).
7. **Known gaps in the pattern** (so a copy does not copy them): (a) status transitions exist only as guards in SQL + TS `where` clauses, there is no single transition
   table; (b) the memory twin can drift (finding 7); (c) derived views re-implement the rules (admin progress, reminders, child stage; findings 2, 4).

The same shape is used a second time for the email side: `src/lib/email-delivery.ts` (pure-ish protocol + `MailTransport` seam + `SendLedger` seam) with
`email-delivery-memory.ts`; and a third time for reminders (`reminders.ts` pure rules + `reminder-store.ts` + `ReminderStore` seam).

---

## 1. Test attempt (assessment) lifecycle

### Test attempt: status, deadline and the derived "open / expired / completed"
- Entity / storage: `public.assessments` columns `status`, `started_at`, `last_answer_at`, `resume_until`, `completed_at`, `placement`, `help`, `route`, `stage3_route`, `test` (jsonb; for adaptive tests `test->'adaptive'.{locked,complete,sufficientEvidence}`), `unreliable` read as `placement->pace->unreliable`. Child can have one open test: unique partial index.
- States: stored `status` in `in_progress | completed | expired` (check constraint, `20261010_add_assessments.sql:14`). TS derives `AttemptState = open | expired | completed` (`assessment/attempt.ts:44-49`): `in_progress` is `open` while `answeredAll || now <= resume_until`, else `expired` EVEN BEFORE the DB row says so ("lazy expiry"). `answeredAll` is not stored; it is `allAnswered(session)` computed from the answers (`test-attempt.ts:908`).
- Transitions (rule location):
  - none -> `in_progress`: "Start test" / "Start again", POST `/api/account/assessments` (`src/app/api/account/assessments/route.ts`) -> `startTest`/`startFor` (`test-attempt.ts:286`, `:309`), rule `decideStart` (`attempt.ts:121`); DB guard: unique index `assessments_one_open_per_child` + `store.create` returns "taken" on 23505 (`test-attempt-server.ts:280-295`); 3 rounds retry then `busy`.
  - `in_progress` -> `expired`: lazy, by the next request that notices (`openTest`, `test-attempt.ts:872`), or by "Start again" (`startFor` `expire`); SQL-less: `admin.from("assessments").update({status:"expired"}).eq("status","in_progress").lt("resume_until", now)` (`test-attempt-server.ts:80-84`). Nobody expires a test that no one touches (no cron); reminders read it as expired by time (`reminder-store.ts:88`).
  - `in_progress` -> `completed`: POST `/api/account/assessments/[id]/finish` -> `finishTest`/`finishOnce` (`test-attempt.ts:1107`, `:1116`) -> RPC `complete_test` (`20261024_remove_extra_round_functions.sql:9`), under row lock, compares stored answers to scored ones, returns 'done' | 'changed'.
  - deadline moves: `openAnswerWindow` (`resume_until` = now+24 h) only while `in_progress and resume_until >= now` (`test-attempt-server.ts:86-91`); `undoAnswerWindow` guarded `eq(resume_until, until)`; `recordAnswerTime` monotone (`last_answer_at < new`). `lock_stage2` (third stage) and `lock_assessment_block` also move `resume_until` in the same SQL write.
- Where rules live: core `attempt.ts` (single pure place for open/expired/completed, start/resume/finish/wait); the status string `"in_progress"` appears in 17 non-test files (`src/app/api/account/children/[id]/route.ts`, `components/admin.tsx`, `components/account-child-name.tsx`, `lib/reminder-store.ts`, `components/account.tsx`, `lib/admin-dashboard.ts`, `lib/admin-view.ts`, `lib/account.ts`, `lib/test-attempt-server.ts`, `lib/test-api.ts`, `lib/admin-demo.ts`, `lib/test-attempt-memory.ts`, `lib/assessment/attempt.ts`, `lib/assessment/anonymous-copy.ts`, `lib/admin-export-demo.ts`, `lib/track.ts`, `lib/test-attempt.ts`). `"expired"` appears in 27 non-test files. The type `AssessmentStatus` is declared twice (`assessment/attempt.ts:12` and `test-api.ts:9`).
- DB enforcement: check on status values; check `(status='completed') = (completed_at is not null and placement is not null)`; unique open-per-child index; `break_*` checks (below); transitions are NOT checked by constraint or trigger (nothing stops `completed -> in_progress` by a direct write); every writer guards in its own `where`. Row lock RPCs for lock/change/complete.
- Impossible / unhandled states: (a) complete + insufficient evidence stays `in_progress` forever (Top finding 1). (b) `complete_test` returns 'done' when the row is not `in_progress` (finding 6). (c) `recordAnswerTime` has no status guard, so it can write `last_answer_at` on a completed/expired row (harmless; `test-attempt-server.ts:94-99`). (d) A test with every answer in and a past deadline reads `open` forever (by design, "never expires"), which is what makes (a) a dead end.
- Race / duplicate-transition risks: double Start: guarded (unique index + 3-round re-read, `test-attempt.ts:309-345`). Answer vs expire at the same moment: guarded by the same `where` (`openAnswerWindow`/`expire` cannot both win, interface comment `test-attempt.ts:~160`). Two tabs answer the same place: unique `(assessment_id, position)` -> "taken" -> fresh conflict step. Finish vs change: both take the row lock; `complete_test` compares answers -> "changed" -> up to 3 rounds then `busy`. Double finish: second answers `already`; the finish route re-runs the report job every time (guarded there).
- What the user sees: parent start screen text per `StartState` in 4 places (`parent-assessment.ts:99`, `components/account.tsx:676` `startView`, `app/(product)/account/test/[childId]/page.tsx:34`, `account/start/[child]/page.tsx:69`); child screen (see section 5); admin phase (section 7). Lying screen: `finish` copy for an insufficient-evidence test (`account.tsx:680`).
- Existing tests: `assessment/attempt.test.ts`; `test-attempt.test.ts` (97 cases), `test-attempt-routes.test.ts`; `parent-view` tests for the stage rule.
- Pure core already? **Yes** (`assessment/attempt.ts`, `session.ts`, `adaptive.ts`). Missing: a single transition table; `answeredAll` is a flag the caller must remember to compute (the reminder job does not, finding 2).
- Value x risk notes: UX high (findings 1, 2); DX medium (status string in 17 files); AX high value, the core is already readable; risk of touching: HIGH (live children's tests in flight; `resume_until`/lock semantics are encoded in 6 SQL functions across 8 migrations; the latest `change_answer` is in `20261105_assessment_blocks.sql:27`, `complete_test` in `20261024_remove_extra_round_functions.sql`).

### StartState (what the start screen offers)
- Entity / storage: derived, nothing stored. `StartState = start{retake} | resume{attemptId,resumeUntil,afterBreak?} | finish{attemptId,checkGrid?} | expired{attemptId} | wait{completedAt,opensAt}` (`attempt.ts:61-79`); `afterBreak` and `checkGrid` added by the module from the read test (`test-attempt.ts:~370-380`, `startStates`).
- States / transitions: function of (attempts, now). Order: open+answeredAll -> `finish`; open -> `resume`; else 30-day wait after last completed (`RETAKE_DAYS`) unless last was `unreliable` and no other completion in the prior 30 days (`retakeNow`); else last expired -> `expired`; else `start`. Rule: `startState` (`attempt.ts:86`). Same function is used by the reminder rules (`reminders.ts:84`) and the parent view (`parent-view.ts:157` via `attemptState`).
- Where rules live: one function, but consumers are 4 independent readers of `state.kind` (`parent-assessment.ts:99`, `account.tsx:676` `startView` and `:698`, `account/test/[childId]/page.tsx:34`, `account/start/[child]/page.tsx:69,77`) + the reminder rules + child-stage `testFact`. A new kind needs edits in all.
- DB enforcement: none (derived). Impossible states: `finish` for an insufficient-evidence test never finishes (finding 1).
- Race: stale read between two screens (parent opens Continue, child already finished): the start POST re-decides under `startFor` and returns `resumed: true` for an open test; `finish` kind is an authoritative re-read. Guarded.
- User sees: see above. Wrong/stale: `wait` screen says "The report comes by email" even when the report job failed (`account.tsx:~700`).
- Tests: `assessment/attempt.test.ts`, `test-attempt.test.ts`.
- Pure core? **Yes.** Value x risk: UX medium, DX high (4 switches), low risk if only the data type is touched.

---

## 2. Section locks inside a test (route, third stage, adaptive blocks)

### Section lock records: `route`, `stage3_route`, `adaptive.locked/complete`
- Entity / storage: `assessments.route` (`up|stay|down`, nullable, "stage 1 lock record"), `assessments.stage3_route` (`up|down|none`, nullable, "stage 2 lock record", `20261105_add_third_stage.sql:9-10`), `assessments.test->'adaptive'` (`locked` integer, `complete`, `sufficientEvidence`, `blocks[]`, `pool[]`). For adaptive tests the server writes `route = 'stay'` at creation (`test-attempt-server.ts:289`, `...(test.adaptive && { route: "stay" })`) so the staged guards ("route not null = stage 1 locked") treat the adaptive test as already past stage 1.
- States (staged, legacy tests still readable): stage 1 open (route null) -> stage 1 locked (route set) -> stage 2 open -> stage 2 locked (stage3_route null -> up/down/none) -> stage 3 open (only for up/down) -> end. Adaptive: block k open (`locked = k-1`) -> block k locked (`locked = k`) -> ... -> `complete`. New tests are ALWAYS adaptive: `startFor` calls `createAdaptiveSession` only (`test-attempt.ts:~330`; `createSession` is not called by production code, `rg` shows only sample-children/maya-demo-child). So the staged branch is a legacy path that must stay for stored tests.
- Transitions: "Done checking" POST `/api/account/assessments/[id]/check` -> `doneChecking` (`test-attempt.ts:704`) -> `lockFirstStage` (`:768`, RPC `lock_stage1`, `20261018_add_stage1_lock.sql:17`), `lockSecondStage` (`:791`, RPC `lock_stage2`, `20261105_add_third_stage.sql:19`), adaptive `store.lockBlock` (RPC `lock_assessment_block`, `20261105_assessment_blocks.sql:3`). Core rules: `lockStage1`, `lockStage2`, `stage3Due`, `lockAdaptiveBlock` (`session.ts`, `adaptive.ts`). Change guards in `change_answer` (latest `20261105_assessment_blocks.sql:27`): refuses positions before stage 1 end when route set; before stage 2 end when stage3_route set; adaptive positions `< locked_length`; `complete`.
- Where rules live: scattered across 3 languages of the same rule: core (`openSection`, `changeable`, `passed`), SQL `change_answer` (4 guards), SQL `admin_test_progress`/`_for` (re-derive lengths and next prompt; `20261105_assessment_blocks.sql` last half), TS `admin-progress.ts` (re-derive phase), client `test.tsx` `show()`. `stage3Route`/`stage3_route` appears in 17 non-test files.
- DB enforcement: `lock_stage1` and `lock_stage2` and `lock_assessment_block` are compare-and-set RPCs (row lock; return stored value on retry; `changed` if answers differ; `closed` if not in progress). `stage3_route` check constraint on values. No constraint that `stage3_route` is null unless `route` is set, nor that `adaptive.locked <= blocks.length`.
- Impossible / unhandled: `stage3_route = 'none'` stops all change but the test then waits to be finished (`changeable`, `test-attempt.ts:569`); `lock_stage2` with `none` does not move the deadline, but an all-answered test never expires, so fine. Memory twin `lockBlock` drift (finding 7). SQL `lock_assessment_block` returns `closed` for a row that is not adaptive; `doneChecking` maps it to `freshConflict` (OK).
- Race: change vs lock is guarded by the same row lock; tested (`test-attempt-blocks.test.ts:33-44` "an answer change races with the lock"). Two tabs pressing Done checking: second sees `locked` greater, returns carryOn. Guarded.
- User sees: child screen `check` (grid) then break/facts/question (`test.tsx:265-318`); stage 2 -> "more" screen (D-282, `test.tsx:495`, `:584`); adaptive "insufficient" message (`test.tsx:561`).
- Tests: `test-attempt-check.test.ts`, `test-attempt-third-stage.test.ts`, `test-attempt-blocks.test.ts`, `assessment/third-stage.test.ts`, `assessment/adaptive.test.ts`, `assessment/change.test.ts`.
- Pure core already? **Yes** for the rules; the SQL guards are a second encoding.
- Value x risk: UX medium (finding 1 lives here); DX high (rule lives in core + 2 SQL functions + admin SQL + admin TS); AX medium; risk HIGH for live tests (migrations dated 20261018, 20261024, 20261105 each replaced `change_answer`; the latest definition wins).

---

## 3. Halfway break (and device context)

### Halfway break
- Entity / storage: `assessments.break_started_at`, `break_ended_at`, `break_skipped`, `break_ms` (migrations `20261016_add_test_context.sql`, `20261016_add_break_length.sql`); and, in the browser, localStorage keys `unica-test-break-state-<id>` (`{startedAt, end}`) and `unica-test-break-<id>` ("seen" flag) plus in-memory `seen`/`pending` sets (`src/components/test-break.tsx:12-64`), and the ref `breakShownAt` (`test.tsx:141`).
- States: no break (all null) -> shown (`break_started_at` set, `break_ended_at` null) -> ended (`break_ended_at`, `break_skipped` true=skipped "Keep going" / false=rested, `break_ms`). Check constraints force: end implies start; `(break_ended_at is null) = (break_skipped is null)`; `break_ms` implies end. A fourth state exists: end recorded without a start (the end arrives first): server stores `start = at - lengthMs` (`endBreak`, `test-attempt-server.ts:430-445`).
- Transitions: POST `/api/account/assessments/[id]/context` `{break: shown|rested|skipped}` -> `recordBreak` (`test-attempt.ts:1226`) -> `startBreak`/`endBreak` guarded updates (`.is("break_started_at", null)`, `.is("break_ended_at", null)`, status in progress/completed, `resume_until >= at`). Eligibility rule in the module (`pastBreak`, `breakDue`). Client decides to show the break in `test.tsx:show()` (`:265-318`): `(unfinished && number > breakAfter) || (breakDue(step) && !breakSeen(id))`.
- Where rules live: four places: core `breakDue` (`session.ts:620`), module `recordBreak`, store guards, and the client (`show`, `test-break.tsx`). The server never decides "the child must see the break"; the browser does (from localStorage) and the server only records.
- DB enforcement: check constraints above (verified) + guarded updates; no constraint ties the break to the test having reached halfway.
- Impossible / unhandled: client `seen` in localStorage with no server record (storage blocked) -> break may show again on another device; handled by `resume?.ended` (`test.tsx:~293`). A break `shown` event on a completed test is refused; an `end` after finish is allowed (by design). `break_ms` is capped at 24 h (`BREAK_MAX_MS`). Break state in 3 places (server columns, localStorage, ref) with no precedence rule except "server ended wins".
- Race: guarded by `is null` filters; "Two rounds" loop in `endBreak` for the shown/end crossing. Tested (`test-attempt-context.test.ts`, `test-context-routes.test.ts`).
- User sees: `TestBreak` screen (adaptive copy "Time for a break" vs "Halfway there", `test-break.tsx:~80`); admin phase `break` (`admin-progress.ts`).
- Tests: `test-attempt-context.test.ts` (310 lines), `test-context.test.ts`, `assessment/break.test.ts`.
- Pure core? **Partly** (`breakDue`, `test-context.ts` validators). The client logic is not pure.
- Value x risk: UX low-medium; DX medium; risk medium (analytics-only data, but `break_ended_at` feeds the admin progress view).

### Device context
- Entity: `assessments.device` jsonb, written once (`recordDevice`, `.is("device", null)`, status in progress). Not a lifecycle; a write-once flag. No findings.

---

## 4. Quick facts section

### Quick facts (timed facts section)
- Entity / storage: tables `assessment_facts` (one row per test: `started_at`, `test`) and `fact_answers` (unique by position; `at_ms`, `server_ms`, `browser_ms`). No status column.
- States: derived `FactsStep = ready | running | done` (`assessment/facts.ts:170-216`): `ready` = no row; `running` = row exists, `elapsed < FACTS_SECONDS` and a fact is left; `done` = time up or all tried. Client view union `loading|ready|running|saving|done` (`components/facts.tsx:20-26`).
- Transitions: `startFacts` (`test-attempt.ts:1017`; insert row, 23505 -> carry on with the winner), `answerFact` (`:1049`; `submitFact` throws when time is up or the fact is not next -> conflict with a fresh step), `readFacts` (`:1004`). Routes `/api/account/assessments/[id]/facts` and `/facts/answers`.
- Where rules live: core `facts.ts`; module; client `facts.tsx`; admin SQL `admin_test_progress_for` (`facts_started_at`, `facts_tried`, `facts_drawn`) and `admin-progress.ts:~100` (`factsEarly`, `factsDone`) re-derive done-ness, i.e. `FACTS_SECONDS` + "all tried" appears in the core and the admin TS.
- DB enforcement: primary key / unique index only. No guard that the test is at the halfway point, in progress beyond a status read (`parentTest` reads status but `startFacts` checks only `status === 'in_progress'`, not the deadline: `test-attempt.ts:1017-1030`). A facts answer after the 24 h deadline on a not-yet-marked test is accepted (unverified impact: only a stale tab can do it).
- Impossible: a facts section started before halfway, or twice with different `startedAt` (prevented: PK). `factsDone` is a client `useRef` (`test.tsx:137`), so a reload before the server's "done" re-asks the server (handled: the facts screen asks first).
- Race: guarded by PK and unique position (`"taken"` handling both paths); tested.
- User sees: ready/running/done screens; admin "Doing the quick facts" phase.
- Tests: `assessment/facts.test.ts`, `test-attempt.test.ts` (facts cases), `test-attempt-timeline.test.ts`.
- Pure core? **Yes.** Value x risk: low; risk low-medium.

---

## 5. Child's test screen (client flow)

### TakeTest screen state (`src/components/test.tsx`, 1111 lines)
- Entity / storage: React state: `screen: Screen` (union at `:37`: `intro | question | more | check | break | facts | insufficient | help | done`), `mode: StartMode` (`new|resume|finish|restart`), `busy`, `failure: TestError|null`, `progress`, `answered`, `viewing`, `marks`, `held`, `unsaved`, `visit`; refs: `testId`, `factsDone`, `breakShownAt`, `carry`, `saves` (promise chain), `reopen`, `failedSaves`, `leaveScreen`, `pointers`. Persisted: localStorage break keys (above), `marks` (`saveMarks`), board drafts (`saveDraft`/`clearDrafts`), `boardHidden` (sessionStorage).
- States: the 9 `Screen` names, but the real state also depends on the refs (e.g. "question screen" + `viewing` null vs number + `reopen.current` + `failedSaves` size). `ReportWait` has its own `slow` boolean and 3-minute give-up (`test.tsx:1043-1111`).
- Transitions: server-driven via `show(step)` (`:265`): `step.status` complete -> help/insufficient; check -> check; question -> break? facts? question. Client events: `start` (`:328`), `answer`, `saveChange`, `leave` (`:~400`), `doneChecking` (`:485`), `finish` (`:247`), `expire` (`:224`, 410 -> back to intro with mode `restart`), `afterFacts` (`:320`).
- Where rules live: partly in the pure `test-review.ts` (leave destinations, `questionButtons`), partly inline. The decision "which screen comes next" is split between the server's `TestStep` and client conditionals on localStorage/refs.
- DB enforcement: n/a (client). Every request is re-validated by the module.
- Impossible / unhandled: `Screen = done` is entered on `finish` success even if the report job later fails (finding 4). `expire` shows the same intro for "expired" and "restart" (by design). A save loop with a `failedSaves` set that only a child press can retry (by design, comment at `:176`).
- Race: two tabs: server's step is the truth (`show` clears `failedSaves`); `409 conflict` with a `step` makes the screen "carry on from where the server is" (`answer`, `saveChange`, `doneChecking`). Saves are serialised through `saves.current` and each request has a 45 s limit (`REQUEST_LIMIT_MS`).
- User sees: all screens; lying copy: end screen after 3 min "We will email it to you" (`:1093-1100`) regardless of job state.
- Tests: `components/test-save-failure.test.ts`, `test-review.test.ts`; no component-level tests of the screen flow (unverified: `ls src/components | rg test` shows only `test-save-failure.test.ts`).
- Pure core already? **Partly** (`test-review.ts`). Screen routing in `show()` is not.
- Value x risk: UX medium; DX high (1111-line component with ~25 hooks); risk HIGH (live children, whiteboard, break + facts + Back flows).

---

## 6. Admin view of test progress (derived duplicate)

### Admin progress phase (`question | check | break | facts | finished | closed`)
- Entity / storage: derived in `src/lib/admin-progress.ts` (`testProgress`, 200 lines) from the rows of SQL functions `admin_test_progress` / `admin_test_progress_for` (latest: `20261105_assessment_blocks.sql`, last two functions), which themselves recompute stage lengths, `third`, `form`, and next prompt from the `test` jsonb.
- States: the 6 phases + `open` boolean.
- Transitions: none (read-only); the rules mirror the child's flow: `allDone`, `legacy`, `factsDone`, break/facts ordering.
- Where rules live: duplicates of `testStep`/`attemptState` in 3 places (core, SQL x2, TS). E.g. `allDone` = `blocks.complete` / `answered >= total` (`admin-progress.ts:110`) mirrors `allAnswered`.
- DB enforcement: n/a. Impossible/unhandled: an insufficient-evidence test shows "On the last step" forever (`blocks.complete` true -> `allDone` -> never `closed`, `admin-progress.ts:133`); this is the admin view of finding 1. A test with `status = 'expired'` but answers all in shows `closed`.
- Race: poll reads a snapshot; stale by design.
- User sees: admin live view and admin assessment page.
- Tests: `admin-progress.test.ts` (18 cases).
- Pure core? **Yes**, but a copy. Value x risk: DX medium (duplicate rules), low risk.

---

## 7. Reports and the report job

### Report build (job) and report existence
- Entity / storage: `public.reports` (`20261011_add_reports.sql`): one row per assessment (`assessment_id unique`). There is NO `status` column. "Built" = the row exists. Columns `model` (jsonb), `questions`, `minutes`, plus email-send columns (next section) and `email_clicks`, `email_first_clicked_at`, `email_last_clicked_at`.
- States (inferred): not built (no row, assessment completed) -> built (row) -> parent email {unsent, claimed, sent, refused, unknown} x alert {unsent, claimed/sent, refused, unknown}. Learner profile and child profile are separate rows (section 12).
- Transitions: `runReportJob` (`src/lib/report-job.ts:104`) from `after()` in the finish route (`finish/route.ts:28`). Steps: load inputs -> `storeReport` (`:158`: read, AI review + text, `insertReport` with `ignoreDuplicates`, re-read if raced) -> `storeProfileFacts` -> `emailParent` (`:193`) -> `alertSavar` (`:244`) -> `addProfileAi` -> `rebuildChildProfileNow`. Each step wrapped (`profileStep`), any thrown error -> `alertFailure` (`:253`, no send key, one alert per failed run).
- Where rules live: one file for the job; but "is the report ready" is derived separately in: report-wait route `GET /api/account/assessments/[id]/report` (existence of row), `parent-view.ts:155-162` (`testFact`), `admin-dashboard.ts` (`reportByTest`), `parent-view` finishedTests, account/report page. `reports` + `emailed_at|alerted_at` strings appear in 5 non-test files (`admin-dashboard.ts`, `admin-store.ts`, `admin-demo.ts`, `report-row-ledger.ts`, `admin/assessments/[id]/page.tsx`).
- DB enforcement: unique `assessment_id`; check on `questions`, `minutes`, `model` size; no check relating `reports` to a completed assessment (FK only). The job's own guards: `loadReportInputs` returns null unless the assessment is finished.
- Impossible / unhandled: completed assessment with no report (job killed, or loading failed) has no recovery (finding 4). A report row whose `model` was built without AI after an AI failure is final: `storeReport` returns `existing` on every later run, so a later run never improves the AI parts (by design; unverified whether admin tooling can rebuild). Concurrent runs both call the AI (finding 8).
- Race / duplicates: report insert unique + ignoreDuplicates (guarded); emails guarded by claims; profile facts save replaces (build token compare-and-set protects the AI add: `learner-profile.ts:~28-33`); AI step is not single-flight.
- What the user sees: end screen "Building {name}'s report..." for up to 3 min then "on its way ... We will email it" (`test.tsx:1043-1111`); parent dashboard stage `test_running` while there is no report (finding 4); admin gets the alert emails.
- Existing tests: `report-job.test.ts` (43 cases, memory adapters), `report-row-ledger.test.ts`, `report-loading*.test.ts`, `report-view.test.ts`, `report-email.test.ts`.
- Pure core already? Partly: the job's seams are interfaces with memory adapters (`report-job-memory.ts`, `report-loading-memory.ts`, `report-row-ledger-memory.ts`, `learner-profile-memory.ts`); the job is an imperative script, not a state table. No pure "what is the state of this report" function.
- Value x risk: UX high (finding 4); DX medium; AX medium; risk medium (emails to real parents, AI spend; the job is idempotent so refactors are testable).

### Report emails (parent email and alert) on the report row
- Entity / storage: `reports.emailed_at` (the CLAIM time), `email_id`, `email_error`, `unsubscribe_hash` (written in the claim's own update), `alerted_at` (claim), `alert_error`. No alert id column (`report-row-ledger.ts:5-14`, `COLUMNS` at `:51-58`).
- States (parent email): unsent = all null; claimed/sending = `emailed_at` set, `email_id` null, `email_error` null; sent = `email_id` set; refused = `emailed_at` null + `email_error` (claim released); unknown = `emailed_at` set + `email_id` null + `email_error` set (claim and hash kept); stale-takeover-able = claimed, no hash, older than `STALE_CLAIM_MS` (10 min) (`reportClaimTakeOver`, `:42-49`). Alert: unsent / claimed-or-sent (indistinguishable: `sent()` only clears `alert_error`, `:85`) / refused / unknown.
- Transitions: `claim` (guarded update: parent `email_id is null and (emailed_at is null or (unsubscribe_hash is null and emailed_at < now-10min))`; alert `alerted_at is null`, `:66-80`), `sent` (unguarded write so an email that went is always recorded), `refused` and `unknown` (guarded by `eq(at, claim.claimedAt)`: a run whose claim was taken over cannot release the other's). Who: `emailParent`/`alertSavar` in the job.
- Where rules live: `report-row-ledger.ts` (claim rules), `email-delivery.ts` (protocol), `report-job.ts` (when). Readers re-derive: `admin-dashboard.ts:256,301-302` (finding 3), `record_report_email_click` SQL (`20261015_add_email_clicks.sql`, `where ... and emailed_at is not null`: counts clicks of an `unknown` email too, which is right; of a claimed one too).
- DB enforcement: `char_length` checks, `unsubscribe_hash` unique + regex. No check tying `email_id` to `emailed_at` (e.g. `email_id` set with `emailed_at` null is possible by a stray write) and none forbidding `emailed_at` null with `unsubscribe_hash` set.
- Impossible: `sent()` write lost (logged only, `write()` `:112-125`) leaves state "claimed forever" with the parent email delivered: admin shows "sent" (claim time), `parentEmailSent` false, later runs get `busy`. Safe (no double send), invisible.
- Race: two jobs: claim is a single guarded UPDATE; tested in `report-row-ledger.test.ts` (8 cases) and `email-delivery.test.ts` (30).
- User sees: parent: the email itself; admin: status chip from `emailStatus` (finding 3); admin email view reads `email_copies` + `email_events`.
- Pure core? Yes for the protocol (`email-delivery.ts`, `reportClaimTakeOver`), no for the admin derivation.
- Value x risk: UX (admin) high-ish for finding 3; DX high (7 vocabularies, see next); risk medium (sending real email; double send is the worst case and is currently guarded).

---

## 8. Email delivery protocol and ledgers

### Delivery protocol (`src/lib/email-delivery.ts`)
- Entity / storage: in-memory protocol over two seams: `MailTransport` (`send -> sent | refused | unknown`) and `SendLedger<K, H>` (`claim`, `sent`, `refused`, `unknown`, optional `keepCopy`); `ReleasableLedger` adds `release` for `sendEmailOnceInTime`.
- States / outcomes: `SendResult = sent{emailId} | refused{error} | unknown{error}`; `DeliveryOutcome` adds `busy`; `TimedDeliveryOutcome` adds `not_sent{released}`. Resend mapping: 2xx sent (id "sent" if none); 4xx except 408 refused; everything else (408, 5xx, timeout, throw) unknown (`email-resend.ts:36,72-87`).
- Transitions: `sendEmailOnce` (`:154`): claim null -> busy; else `deliverClaimed` -> `recordOutcome` (`:199`: ledger write per outcome, copy kept after, writes never throw). `sendEmailOnceInTime` (`:171`): claim, check `inTime()` before and again at `mayStart` right before the request, release when late. `pacedTransport` (`:65`): serial queue, gap measured at turn time, abort signal.
- Where rules live: one module for the protocol: good. The ledger vocabularies live in 7 places (next section). Callers of `sendEmailOnce`: `report-job.ts:211,247`, `reminders.ts:163`, `maya-weekly-email.ts:315`, `maya-call-alert.ts:84`, `workbook-email-server.ts:67`, `workbook-scan-reminder-send.ts:182`, `scan-link.ts:76`, `card-plan-alert.ts:58`; `sendEmailOnceInTime`: `monthly-summary-email.ts:296`, `workbook-email-server.ts:125`. Unguarded `sendEmail` (no send key): sign-in link (`account-server.ts:62,109`), report failure alert, contact form, family-delete code, next-step emails, plan notice (`parent-plan-server.ts:98`), `next-step-server.ts:219,247`.
- DB enforcement: depends on the ledger (below). The protocol's contract "a ledger write that fails leaves the claim held so nothing is sent twice" is documented and tested, not enforced.
- Impossible: `result.status === "sent"` with the stand-in id "sent" (Resend gave no id): stored as `email_id = "sent"`, copy stores null (`email-copies.ts:26`), so webhook events never join; `parentEmailSent` is still true.
- Race: the claim is the only guard; `unknown` is final by design ("one lost email is acceptable; two copies are not").
- User sees: nothing directly; admin sees outcome chips (finding 3).
- Tests: `email-delivery.test.ts` (30), `email-resend.test.ts`, memory adapter `email-delivery-memory.ts`.
- Pure core already? **Yes** (best-factored machine in the area). Value x risk: AX very high (a copyable model), DX medium (callers), risk: HIGH if the protocol changes (real parents' email; money-adjacent plan emails).

### Ledger inventory (same protocol, different storage)
| Ledger | Table / columns | "sent" | "unknown" | "refused" | File |
|---|---|---|---|---|---|
| reminders | `email_log.status` claimed/sent/failed, `attempts`, `error` | `sent` + `email_id` | `claimed` + `error` | `failed` (retry while `attempts < 3`) | `reminder-store.ts:129` |
| maya weekly | `email_log` (+ `week_start`, `call_ids`) | same | same | same; claim via RPC `claim_maya_weekly` (`attempts < 3` literal) | `maya-weekly-email-store.ts:135` |
| monthly summary | `email_log` (+ `summary_month`, `copy_child_ids`) | same | same | same + `release` (delete or back to failed) | `monthly-summary-email-store.ts:127` |
| report email / alert | `reports.emailed_at`/`email_id`/`email_error`, `alerted_at`/`alert_error` | `email_id` set (alert: indistinguishable) | claim kept + error | claim cleared + error | `report-row-ledger.ts` |
| workbook emails | `workbook_emails.status` pending/sending/sent/failed/unknown/skipped | `sent` | `unknown` (explicit) | `failed` | `workbook-email-server.ts:26` |
| plan start email / alert | `plan_starts.email_state` none/pending/sent/unknown, `team_alert_state` sending/sent/unknown | via RPC `note_plan_start_email_send` | `unknown` | released | `workbook-email-server.ts:74`, `card-plan-alert.ts` |
| Maya call alert | `maya_call_alerts.status` sending/sent/refused/unknown (+ derived stale `unknown` after 10 min, `shownAlert`, `maya-call.ts:131`) | `sent` | `unknown` | `refused` | `maya-call-alert-store.ts` |
| scan link emails | `scan_link_emails.status` claimed/sent/failed | `sent` | `claimed` + error | `failed` | `scan-link-store.ts` |
| scan inactivity reminders | `workbook_scan_reminder_messages.state` reserved/admitted/sent/refused/unknown/released + `_attempts` + `email_log kind='scan_inactivity'` (only SQL-owner may write, trigger `guard_workbook_scan_reminder_email`) | `sent` | `unknown` | `refused`/`released` | `workbook-scan-reminder-send.ts`, `20261107073840_workbook_scan_reminder_episodes.sql` |
The scan-reminder and workbook-email rows belong to other inventories; they are listed here only to show the delivery module's relatives. (unverified: I did not read the SQL RPC bodies of `claim_workbook_email`, `claim_plan_start_email`.)

---

## 9. Reminder emails (email_log)

### Reminder due-ness (pure rules)
- Entity / storage: none stored; computed by `dueReminders(state, now)` (`reminders.ts:179`) from `ruleReminder` (`:83`) over children, tests, and `email_log` rows.
- States / kinds: `REMINDER_KINDS = continue | come_back | start | start_followup` (`reminders.ts:17`). `continue`: start state `resume` and `now >= (lastAnswerAt ?? startedAt) + 1 h`. `come_back`: start state `expired`, within `LATE_LIMIT_MS` (7 d) of the deadline. `start`: child with no tests 24 h after creation; `start_followup`: 72 h after creation and 48 h after the first (`reminder-schedule.ts:startTurn`). One per (test, kind) or per (child, kind).
- Transitions: n/a (a derived list). Retry: a logged `failed` row with `attempts < MAX_SEND_ATTEMPTS` (3) is due again with `retry`.
- Where rules live: `reminders.ts` + `reminder-schedule.ts` (shared with the admin dashboard's "next reminder", `admin-dashboard.ts`), start-screen rules via `startState` (assessment core), and `reminder-store.ts:172-189` computing test length and `answeredAll` itself (finding 2).
- DB enforcement: unique indexes `email_log_one_per_test` (assessment_id, kind), `email_log_one_start_per_child`, `email_log_one_start_followup_per_child`; the claim of a duplicate fails 23505 -> busy.
- Impossible / unhandled: adaptive tests (finding 2). The "continue" email for an adaptive test prints a moving total.
- Race: two cron runs: guarded by the unique index; a retry takes a failed row back only once (`update ... eq(status failed).eq(attempts n).lt(attempts, 3)`, `reminder-store.ts:131-139`). Unsubscribe is read at load, not at claim (small window).
- User sees: the emails; admin "Next reminder".
- Tests: `reminders.test.ts` (40), `reminder-schedule.test.ts`, `reminder-length.test.ts`, `reminder-email.test.ts`, `app/api/reminders/route.test.ts`.
- Pure core already? **Yes** (`reminders.ts`, `reminder-schedule.ts`), with the store being the leak (finding 2).
- Value x risk: UX medium (silent drop of reminders for adaptive), DX medium; risk medium (real emails, CASL).

### email_log row lifecycle (shared by reminders, weekly Maya, monthly, unsubscribes, scan_inactivity)
- Entity / storage: `public.email_log`: `kind` (11 values in the latest check, `20261107073840_workbook_scan_reminder_episodes.sql:71-73`: continue, come_back, start, start_followup, unsubscribe, maya_daily, maya_weekly, maya_unsubscribe, monthly_summary, monthly_summary_unsubscribe, scan_inactivity), `status` (null | claimed | sent | failed), `attempts` 0..10, `sent_at`, `email_id`, `error`, `unsubscribe_hash`, and per-kind nullable columns `child_id`, `assessment_id`, `day`, `week_start`, `summary_month`, `call_ids`, `copy_child_ids`, `clicks`/`first_clicked_at`/`last_clicked_at`, `copy_redacted`.
- States: `status` null (unsubscribes only: check `(kind in (...unsubscribes)) = (status is null)`); claimed; sent (`(status='sent') = (sent_at is not null)`); failed. Unknown = claimed + error text (not a status).
- Transitions: claim (insert 'claimed' attempts 1, or update failed -> claimed attempts+1), sent, refused (-> failed), unknown (error only). Each of the 3 ledgers re-implements the three writes.
- Where rules live: constraints are re-created by hand in each migration that adds a kind (`email_log_kind_check`, `email_log_check`, `email_log_check2`, `email_log_check3` are dropped and re-added in 5 migrations: add_start_followup, add_maya_daily, add_maya_weekly, monthly_summary, scan_reminder_episodes). TS has `LogKind` (`reminders.ts:26`), `LogStatus`, and per-email `*LogEntry` types. `email_log` is referenced in 13 non-test files.
- DB enforcement: strong (checks + partial unique indexes per kind). Missing: nothing ties `status` transitions (a direct write can set `sent -> claimed`); no check that `claimed` implies `sent_at is null` besides the `sent` equivalence.
- Impossible: `status = 'claimed'` + `error` = unknown; `status = 'claimed'` older than the run budget with no error = in-flight or crashed (indistinguishable; nobody reads it); monthly: `release` deletes or reverts the row (`monthly-summary-email-store.ts:~145`).
- Race: guarded by unique index/guarded updates; monthly's claim aborts at `CLAIM_LIMIT_MS` (5 s) and gives back by its own hash.
- User sees: admin email list (`admin-dashboard.ts:290`: claimed -> "pending", failed -> "failed", sent -> "sent"; a held-forever claimed row looks "pending" forever).
- Tests: `reminders.test.ts`, `maya-weekly-email-store.test.ts` (291 lines), `monthly-summary-email-store.test.ts` (419), memory ledgers (`maya-weekly-email-memory.ts`, `monthly-summary-email-memory.ts`, `email-delivery-memory.ts`).
- Pure core? The kind/state rules are not in one TS table. Value x risk: DX high (5 migrations re-declaring the same checks), risk HIGH for SQL changes (real emails).

### Weekly Maya email and monthly summary (decision + send)
- Entity / storage: pure rules `dueWeeklyEmails` (`maya-weekly-email.ts:92`) and `dueMonthlyEmails` (`monthly-summary-email.ts:92`) over a loaded state; log rows in `email_log`.
- States: for the pair (parent, week_start Monday) / (parent, month): not due | due | claimed | sent | failed(retry < 3) | unknown. Monthly adds a send window: 07:00 on the 1st to the end of the 7th, family-local (`SEND_HOUR`, `LATE_DAYS`), and the `MONTHLY_SUMMARY_EMAIL_ENABLED` env switch re-checked in the claim (`monthly-summary-email-store.ts:~150`). Weekly coverage is by `call_ids` overlap (`claim_maya_weekly`: refuses when any claimed/sent weekly row overlaps `p_calls`).
- Transitions: `/api/reminders` run -> `runWeeklyEmails` (`:299`, `RUN_LIMIT` 20) and `runMonthlyEmails` (`:270`, `RUN_LIMIT` 20, with `time.endAt`, `ONE_SEND_MS`). Unsubscribes: separate kinds `maya_unsubscribe`, `monthly_summary_unsubscribe`.
- Where rules live: two pure modules + two stores + SQL `claim_maya_weekly` (latest `20261105124144_maya_chat_lock_order.sql:70`; the 4 migrations that replaced it are all in `supabase/migrations`). Time and zone rules come from `family-time.ts`.
- DB enforcement: unique indexes (`email_log_one_maya_weekly`, `email_log_one_monthly_summary`), Monday and first-of-month checks, claim RPC under `lock_maya_family`.
- Impossible: weekly claim `attempts < 3` literal in SQL (not tied to `MAX_SEND_ATTEMPTS`). Weekly claims check deletion/test-family/rehearsal in SQL but not unsubscribe (the TS rule does, at load time).
- Race: guarded; weekly run has no time budget (finding "smaller items").
- User sees: the emails; admin list.
- Tests: `maya-weekly-email.test.ts` (26), `maya-weekly-email-store.test.ts`, `monthly-summary-email.test.ts` (32), `monthly-summary-email-store.test.ts`.
- Pure core? **Yes** (both). Value x risk: low UX; DX medium (two near-copies); risk medium. (Maya call coverage rules belong to the Maya inventory.)

### The reminders cron run (orchestrator)
- Entity / storage: Supabase pg_cron `assessment-reminders` every 15 min via pg_net, 60 s timeout (`20261011_add_reminder_cron.sql:27`); handler `src/app/api/reminders/route.ts` (137 lines, `maxDuration = 60`); no run state is stored.
- States: n/a per run; run result is JSON counts `{due, sent, failed, busy, unknown}` + `maya`, `monthly`, `sweep`, `cards`, `scans`. A failure of one stage never hides another (try/catch per stage).
- Transitions: serial stages on one paced transport (600 ms gap): reminders (`RUN_LIMIT` 40, no deadline) -> weekly (20, no deadline) -> monthly (deadline `now + 50 s`) -> scans (`now + 55 s`); the Maya sweep and card sweep run beside them.
- Where rules live: this route (ordering/budgets), each runner.
- DB enforcement: none for run overlap (cron overlap is tolerated because every send is claimed).
- Impossible / unhandled: a function kill mid-send leaves a held claim ("unknown" by design, never resent); reminders and weekly have no budget, so the budget is implicit (sum of sends x 600 ms + 15 s limit worst case, over the 60 s limit; unverified under load). `?dry=1` counts only.
- Tests: `app/api/reminders/route.test.ts`.
- Pure core? The route is imperative; each runner is pure + store. Value x risk: low UX, medium DX; risk medium.

### Unsubscribe state (3 scopes)
- Entity / storage: rows in `email_log`: kind `unsubscribe` (reminders and emails about plans; also covers the report email's offer), `maya_unsubscribe`, `monthly_summary_unsubscribe`; one per parent (unique partial indexes). Tokens: `email_log.unsubscribe_hash` and `reports.unsubscribe_hash`.
- States: `UnsubscribeState = subscribed | unsubscribed | unknown` per (parent, scope) = presence of the unsubscribe row (`reminder-store.ts:~250-285`). Insert-only: there is no resubscribe path (`rg resubscribe` finds none).
- Transitions: POST `/api/unsubscribe?t=...` (RFC 8058 one-click, page, no-JS form) -> `unsubscribe()`; scope chosen by the token's source kind (`scopeOf`). Idempotent (23505 ignored).
- Where rules live: `reminder-store.ts` (`tokenParent`, `turnedOff`, `OFF_KIND`, `scopeOf`) + each email's `due*` function. Report email checks `store.unsubscribed` (`report-job.ts:~203`) to drop the offer and headers.
- DB enforcement: unique indexes; trigger `guard_workbook_scan_reminder_email` protects `scan_inactivity` rows.
- Impossible: a `maya_daily` token's scope is `maya` (`scopeOf`), fine. Unsubscribe is not checked at claim time in reminders/weekly (race window one run).
- Tests: `app/(product)/unsubscribe/page.test.ts`, `reminders.test.ts` (unsubscribed cases). Unsubscribe route has no test file (`ls src/app/api/unsubscribe` shows only `route.ts`).
- Pure core? No (a store function + route). Value x risk: low UX, compliance-sensitive (CASL); risk medium.

---

## 10. Delivery feedback (webhook, copies, clicks)

### Resend webhook events and email copies
- Entity / storage: `email_events` (append-only, `webhook_id` unique, `type` check delivered|delivery_delayed|bounced|complained|failed|suppressed, `20261015_add_email_events.sql`), `email_copies` (one per log row or report email, upserted per attempt, `outcome` sent/refused/unknown, `email_id`), click counters `email_log.clicks` and `reports.email_clicks` via `record_reminder_click` / `record_report_email_click`.
- States: events are not a state machine: they are a log. There is NO fold-back: a `bounced` event does not change `email_log.status` or `reports.email_id`. The admin joins events to a row in memory (`admin-dashboard.ts:262-269`, newest event by `occurred_at` wins; `deliveryOf`).
- Transitions: webhook POST `/api/resend-webhook` verifies the Svix signature (5-minute tolerance), parses a kept type, upserts on `webhook_id` (idempotent); a store error answers 500 so Resend retries (`route.ts`). Clicks: counted when a signed-in parent lands with `?reminder=` or `?src=email` (`email-clicks.ts`; 30-minute visit window in SQL).
- Where rules live: `resend-webhook.ts` (pure parse/verify), `email-copies.ts` (`copyRow`, `hideTokens`), admin joins.
- DB enforcement: unique `webhook_id`; no FK from `email_events.email_id` to a copy.
- Impossible: webhook arrives before the copy is saved (join by `email_id` finds nothing until the copy lands; the admin join then shows null); an `unknown` send whose Resend id is lost cannot be matched by webhook at all (no id).
- Race: out-of-order events: newest `occurred_at` wins (`held.at <= d.occurred_at`).
- User sees: admin email view shows copy + events.
- Tests: `resend-webhook.test.ts` (13), `email-copies.test.ts`, `email-clicks.test.ts`.
- Pure core? Yes for the webhook parser. Value x risk: low; low risk.

---

## 11. Learner profile build

### Learner profile (facts, then AI parts, compare-and-set)
- Entity / storage: `public.learner_profiles` (one per test; versioned JSON; `buildId`); module `learner-profile.ts` + `learner-profile-store.ts` + memory.
- States: none -> facts stored (`storeProfileFacts`, new `buildId`) -> facts + AI parts (`addProfileAi`, only while the stored build is still this one) or facts only (AI off, failed, timed out, nothing passed the checks, or a later build replaced it).
- Transitions: report job steps 3b and 6 (`report-job.ts:130-133`, `:140-141`); learning-card change -> `rebuildLatestProfile`. Rule: store `save` returns a new build id, `saveAi(profile, buildId)` is compare-and-set (`learner-profile.ts:~28-33`).
- Where rules live: one module (good); child-profile rebuild is a separate machine (other inventory).
- DB enforcement: store-level compare-and-set in one statement: `saveAi` is `update ... .eq("assessment_id", id).eq("profile->>buildId", buildId)` (`learner-profile-store.ts:44-48`); the build id lives inside the profile JSON, not in a column (so no DB constraint on it).
- Impossible: two concurrent report jobs each `save` facts (the later wins), the earlier's AI add fails its compare-and-set and is dropped (by design).
- Tests: `learner-profile-store.test.ts`, `learner-profile-ai.test.ts`, `assessment/profile*.test.ts`.
- Pure core? Yes (seams with memory adapter). Value x risk: low; low-medium risk.
