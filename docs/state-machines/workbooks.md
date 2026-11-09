# Inventory: implicit state machines in WORKBOOKS (read-only audit)

Repo: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/site-state-machines (branch site/state-machines, HEAD at 724f38b4).
Method: rg/sed/cat only. Nothing executed. "(unverified)" marks anything I only inferred.
Migration order note: for the same function I took the newest definition by DATE and, inside one day, by the 14-digit timestamp (see finding 8 for why filename order is not safe).
The review tab (another lead is changing it) is recorded, not judged as final.

## Top findings

1. **A second "Prepare next workbook" on a never-claimed run can make that run fail with "no stored plan" (traced, not executed).** `start_workbook_run` (supabase/migrations/20261106120000_workbook_start_resume_lock.sql:19-21) flips a queued run that is 2+ minutes old to `status='running'` with NO lease and answers `stalled`. The Mac worker then lists it as a `resume` candidate (src/lib/workbook-job-store.ts:211-222), `resume_workbook_run` sets `resumes = 1` (20261101_workbook_runner_checks.sql:28-48), and `runFrame` refuses any run with `resumes > 0` and no stored frame (src/lib/workbook-job.ts:653) and calls `fail_workbook_run`. Trigger: Mac offline for more than 2 minutes, admin presses the button again (the UI just opens the run page). The server runner has the same path. supabase/tests/workbook_start_resume.cjs:246-253 tests the flip but not what the job does afterwards.
2. **Plan-control refusals show as "the family is being deleted".** `fence_plan_workbook` (20261105234500_plan_controls.sql:274-290) is a trigger on `workbook_runs` insert and on `workbooks` -> shipped. It raises errcode 55000 with `plan_cancelled`, `plan_control_pending`, `pause_previous_book_required`, `plan_paused`. The TS stores map every 55000 to "the family is being deleted" and ignore the message: src/lib/workbook-job-store.ts:55 (start), :136 (save draft), src/lib/workbook-ship-store.ts:53 (approve) and :66 (mark shipped), src/lib/workbook-draft-store.ts:28. `rg "plan_paused" src` finds nothing. Result: an admin on a paused plan reads "It did not start: the family is being deleted" (src/components/prepare-workbook.tsx:25-26). 55000 is also used by child deletion, immutable book1 rows and delivery immutability.
3. **Run state shown to the admin is computed from the clock, not stored, and the refresh stops in the "Stopped" state.** DB status stays `running` while `runState()` (src/lib/workbook-job.ts:412-420) says "stopped" after 6 minutes without heartbeat. `RunRefresh` is mounted only for `preparing` or `waiting` (src/components/admin-workbook-runs.tsx:152, 184, 525). If the Mac worker takes the run up again, the page keeps the "Stopped" chip until a manual reload. The Stop button is shown for DB status (line 57) so "Stopped" chip and "Stop this run" button show together. The progress text says "The run stops if this reaches 6 minutes" (src/lib/workbook-run-progress.ts:117) but nothing in the DB stops the run by time; only the next start/rename/resume acts.
4. **`stale` and `failed` each hold several different causes.** `stale` = admin Stop (`stopped_by_email` set), start with too many resumes (20261106120000:29-33), old start-time stale sweep (20261031_add_workbook_runs.sql:116-121, now replaced). `failed` = job failure, 30 resumes (resume_workbook_run), and `rename_child` (20261105_child_rename_stops_runs.sql). The UI separates them only by `stopped_by_email` and the free-text `error` (admin-workbook-runs.tsx:101-103).
5. **Duplicate draft numbers and misleading approve refusals.** `start_workbook_run` numbers a run as `max(workbooks.number)+1`, but a `workbooks` row exists only after approval. Two finished drafts of one child can share a number. `workbook_drafts` has no unique (child_id, number) (20261031_add_workbook_drafts.sql). The second approval fails inside `write_workbook` with "the child already has workbook N". Approving an already approved draft again goes to the same `write_workbook` (20261104_workbook_print_contract.sql:197) and answers "the workbook id is already used" (a unique_violation text, not "already approved").
6. **Comment status is rewritten behind the TS, and the routing rule exists three times.** BEFORE UPDATE trigger `workbook_edit_call_pending` turns a comment `failed` into `pending` when its batch checkpoint says pending (20261102_workbook_edit_call_ledger.sql:55-64). Pending comments also carry an `error` string (layout path in `send_workbook_comments`), and the banner counts `pending && error` as failed (src/lib/workbook-edit-message.ts:11). Layout vs question route lives in SQL `workbook_comment_route`, TS `LAYOUT_COMMENT_PATTERN` (src/lib/workbook-comment-route.ts:11) and is recomputed in the reviewer from the page and note instead of reading stored `c.route` (src/components/workbook-comment-reviewer.tsx:74, 196). Review tab is being changed by another lead.
7. **Heartbeat clocks are mixed.** `progress()` writes `heartbeat_at` from the app clock (src/lib/workbook-job-store.ts:121). The edit and layout-edit timers write `new Date()` and compare with an app-clock cutoff (src/lib/workbook-edit-deps.ts:40, src/lib/workbook-layout-edit-deps.ts:18). Renew, resume, start, route and finish use DB `now()`. On the Mac, a clock that is wrong by minutes can make a live run look stale to start/resume/route, or the other way (unverified, no skew test found).
8. **Migration filename order is wrong for the edit/comment family.** Date-only names (`20261102_workbook_edit_recovery_checks.sql`) sort AFTER 14-digit names of the same day (`20261102155653_workbook_comment_admin_keys.sql`), although admin_keys alters a table that `20261102_workbook_comments.sql` creates and rewrites `save_workbook_comment` that recovery_checks defines. "Latest definition by filename" gives the wrong `save_workbook_comment` (legacy `request_key` instead of `client_request_key`). Whether the Supabase CLI or the repo SQL fixtures replay in that order is (unverified). Hosted order is not recorded in the files.

Smaller notes: `stop_workbook_run`, `mark_workbook` and `approve_workbook_draft` have no direct SQL test (only memory-store tests; mark is exercised inside plan_controls tests). The 6-minute lease is a literal in 8 SQL migration files and 6 TS places. The 10-minute "email send is uncertain" rule is in 3 places (see emails).

## Machine index

| # | Machine | Storage | Pure TS core? |
|---|---|---|---|
| M1 | Generation run | workbook_runs.status/step/lease/heartbeat | partly (workbook-job.ts has store seam + memory store; the rules are in SQL) |
| M2 | Run state shown to the admin (derived) | none (computed) | yes: runState, runProgress |
| M3 | Run runner routing | workbook_runs.runner | no |
| M4 | Mac worker heartbeat | workbook_workers | partly (workbook-worker.ts) |
| M5 | Draft and revisions | workbook_drafts, workbook_draft_revisions | no |
| M6 | Review comments | workbook_comments.status/route | partly (workbook-comment-route.ts) |
| M7 | Edit batches (question and layout) + call ledger | workbook_edits, workbook_edit_calls | partly (workbook-edit.ts) |
| M8 | Workbook lifecycle (approve/print/ship) | workbooks.status + trigger | partly (workbook-ship.ts) |
| M9 | Print contract freeze | workbooks.printed_revision etc | yes (workbook-print-contract.ts) |
| M10 | Delivery receipt and corrections | workbook_delivery_receipts/corrections | yes (workbook-delivery.ts) |
| M11 | Workbook emails (welcome/ready/dispatch) | workbook_emails.status | partly (workbook-email.ts) |
| M12 | Book 1 baseline, second tries, previews | immutable tables | yes |
| M13 | Boundary items (scan receipts, reminder episodes, restart requests) | - | not inventoried |

---

### M1. Workbook generation run ("Prepare next workbook")
- Entity / storage: `public.workbook_runs` (add_workbook_runs.sql:29-49 and later migrations). Columns: `status` check in (queued, running, done, failed, stale); `step` check in (plan, write, render, save) nullable; `attempts` (1-10) and `max_attempts` (RUN_ATTEMPTS = 2, workbook-job.ts:70); `resumes` smallint 0-30 (workbook_run_resume.sql:18); `lease` uuid, `heartbeat_at`, `started_at`, `finished_at`; `done_pages`/`total_pages`; `error`, `errors` jsonb; `draft_id`, `draft_key`; `runner` ('server'|'mac'); `ai_off` jsonb ({provider:{note,at}}, never cleared); `stopped_by_email`. Children: workbook_run_pages, workbook_run_attempts (cap 3 per slot), workbook_run_calls, workbook_run_solves, workbook_run_frames (plan stored once), workbook_run_ai_calls (call ledger, outcome started/answered/failed/unavailable), workbook_audit (actions run-started, run-resumed, run-retried, run-failed, run-stopped, run-stopped-by-admin, run-routed, draft-stored).
- States:
  - `queued`: row exists, lease null, started_at null.
  - `running`: lease set (holder) OR lease null (yielded or flipped by start). Sub-state by `step`.
  - `done`: finished_at set, `draft_id` set, step null (finish_workbook_run).
  - `failed`: finished_at set, `error` set, lease null.
  - `stale`: "ended without finishing": admin stop (stopped_by_email set) or too many resumes.
  - Not encoded: "yielded, waiting for hand-over" is `running` + lease null + heartbeat recent. "Quiet" is derived (M2).
- Transitions (who, where):
  - (none) -> queued: admin POST src/app/api/admin/children/[id]/workbook-runs/route.ts:19-44 -> `start_workbook_run` (latest: 20261106120000_workbook_start_resume_lock.sql). Unique index `workbook_runs_one_active` (add_workbook_runs.sql:49) allows one queued/running run per child.
  - queued -> running (claim): job `claim_workbook_run(p_run,p_lease,p_runner)` (20261101_workbook_runner_checks.sql, where status='queued' and runner=p_runner). The old 2-arg overload still exists (no runner check).
  - queued -> running WITHOUT lease: `start_workbook_run` when the active run has lease null and age over 2 minutes, or heartbeat/created over 360 s (line 19-21). Returns `stalled`. See finding 1.
  - running -> running (resume/takeover): `resume_workbook_run(...,p_runner)` when lease null or heartbeat older than 360 s; `resumes+1`; at `resumes >= 30` it sets `failed` (runner_checks.sql:36-39). Callers: Mac worker (candidates), resume route src/app/api/workbook-runs/[id]/resume/route.ts (CRON_SECRET), admin start route (stalled), admin "Run on the server" route.
  - running -> running (hand-over): `yield_workbook_run` (lease null) then POST resume route; `renew_workbook_run` every 30 s; `progress()` direct update of step/done/total/heartbeat (workbook-job-store.ts:120-126).
  - running -> running (retry): `retry_workbook_run` (attempts+1, only if attempts < max_attempts) from the job's catch (workbook-job.ts:622).
  - running -> failed: `fail_workbook_run` (lease), `resume_workbook_run` at 30, `rename_child` (20261105_child_rename_stops_runs.sql; ends runs it deems stopped).
  - running -> done: `finish_workbook_run` (lease; also writes revision 1 and audit in one step).
  - queued|running -> stale: `stop_workbook_run` (20261105_workbook_run_stop.sql:21; admin route src/app/api/admin/workbook-runs/[id]/stop/route.ts), `start_workbook_run` when resumes >= 30 (line 29-33).
- Where rules live: scattered. "Is the run active or stopped?" is defined separately in: `start_workbook_run` (2 min if no lease, 360 s otherwise), `route_workbook_run` and `resume_workbook_run` (lease null or 360 s), `rename_child` (queued mac run is always active; else heartbeat/created within 360 s), TS `runState` (workbook-job.ts:412), TS worker candidates (workbook-job-store.ts:211-222), memory store (workbook-job-memory.ts:67-80 re-implements start), admin-workbook-runs.tsx MacWait:226. STALE_SECONDS = 360 (workbook-job.ts:73) is passed to SQL as a parameter; the 2-minute rule is a literal in SQL and in workbook-job-memory.ts:73. TS files that touch the status string: 13 src files (rg RunStatus/runState/run.status); SQL files with workbook_runs status literals: 14 migrations.
- DB enforcement: yes, mostly. Status check constraint, partial unique index, every post-start write is `where lease = p_lease and status = 'running'` (renew, save_page, save_call, save_solves, save_frame, count_attempts, save_draft, retry, fail, finish, yield). Stop uses `for update` so stop and finish cannot both win. No check that ties status to other columns: nothing refuses `done` with `draft_id` null, `running` with `finished_at` set, `queued` with a lease, or `failed` with no error.
- Impossible / unhandled states:
  - `done` with `draft_id` null or with no workbook_draft_revisions row (no constraint; finish writes both in one tx, so only by manual edits).
  - Orphan draft: job stores the draft (save_workbook_run_draft) then fails before finish: run `failed`, a `workbook_drafts` row exists with no revision rows and `run.draft_id` null (nothing lists it) (unverified in UI).
  - `running` + lease null + heartbeat null (the flip in finding 1): `runState` -> "stopped" at 6 min; worker resumes it and the job fails.
  - `queued` with runner 'server' that nobody claims: `start` creates the row with the column default `runner='server'`, the route then calls `routeWorkbookRun(..,'mac')` as a second call (route.ts:34-36). If that second call throws (503), the row stays server-runner, queued; the Mac never takes it; nothing calls the server (the route returned 503). It would sit until a second start/stalled path (unverified).
  - A queued 'mac' run: `runState` says "waiting" forever; `start_workbook_run` says stalled after 2 minutes (disagreement, finding 1).
- Race / duplicate-transition risks: well guarded (row lock + lease compare-and-set; tests "is taken by one job call only", "never lets a call whose run was taken up by another write", workbook-job.test.ts:241, 316). Unguarded or weak points: (a) app-clock vs DB-clock heartbeats (finding 7); (b) `start` + `route` are two RPCs (see above); (c) double press of Prepare is safe (busy), but a press 2+ minutes after a queued mac run changes its state (finding 1); (d) `progress()` is a plain UPDATE guarded by lease+status in the WHERE, not an RPC (grant update (step, done_pages, total_pages, heartbeat_at)); (e) code-fingerprint rule: a run goes on only on the commit it started on (`runFrame`, workbook-job.ts:660-680): a Vercel deploy while a server run is in flight makes the next call fail with "the site's code changed".
- What the user sees: admin only; parents never see runs (no parent code reads workbook_runs; rg). Admin: chip waiting/preparing/stopped/failed/done (admin-workbook-runs.tsx:33-38) on run page (src/app/(product)/admin/workbooks/runs/[id]/page.tsx), the Workbooks list and the child page (children/[id]/page.tsx:57-61); text "Starting on the server", "Waiting for the Mac...", "Stopped by X at ..." (lines 43-54); progress text from runProgress (M2). Wrong or stale: finding 3 (stale chip, no refresh when stopped), finding 2 (wrong refusal text), the confirm text in PrepareWorkbook always says "Claude subscription" when runner is mac even if WORKBOOK_SUBSCRIPTION_PROVIDER=codex (prepare-workbook.tsx:17).
- Existing tests: src/lib/workbook-job.test.ts (1134 lines: lease, stale, stop, resume, plan frame, R404 runner), workbook-job-store.test.ts, workbook-job-profile.test.ts, workbook-worker.test.ts, admin-workbook-runs.test.ts, stop-workbook-run.test.ts, workbook-run-progress*.test.ts; SQL: supabase/tests/workbook_start_resume.cjs (start/resume/rename locks), workbook_route_lease.sql, child_rename.sql. No SQL test for `stop_workbook_run` (rg: none).
- Pure core already? Partly. `src/lib/workbook-job.ts` has types, `runState`, the job loop and a store interface; `workbook-job-memory.ts` is a second implementation of the SQL rules for tests (drift risk). The real rules are SQL functions. No single table of transitions.
- Value x risk: UX high (stuck/lying run screens, finding 1/3). DX high (active-rule in 7 places; memory store copy). AX medium (rules need 14 migrations to read; latest of start_workbook_run is one file). Risk: HIGH for in-flight work (live Mac worker, long runs; resumes depend on exact lease semantics; changing SQL needs a migration applied before code). No money, but real customer first workbook runs.

### M2. Run state shown to the admin (derived projection of M1)
- Entity / storage: none. TS `RunState` = waiting | preparing | stopped | failed | done (workbook-job.ts:410-420); `runProgress` view (workbook-run-progress.ts); `STATE` map (admin-workbook-runs.tsx:33).
- States: done/failed from status; `stale` -> stopped; queued+mac -> waiting always; queued+server -> waiting until 360 s then stopped; running -> preparing until 360 s without heartbeat, then stopped.
- Transitions: none stored; changes with the clock and with M1 writes. Rule: runState only (single function), plus the progress warnings (WARN_SECONDS = 120).
- Where rules live: runState in one function, but the same "quiet" idea is repeated in MacWait (admin-workbook-runs.tsx:227 `stopped && status==='running'`), StopButton (uses DB status, line 57), RunRefresh gating (lines 152/184/525) and the progress text (workbook-run-progress.ts).
- DB enforcement: none (and none needed).
- Impossible / unhandled: a `stopped` run that is really being resumed is shown as stopped until reload (finding 3). `done` + `stoppedBy` (race: stop lost to finish) shows done; ok.
- Race / duplicate: page polling every 5 s while preparing/waiting only (admin-run-refresh.tsx); heavy polling stalled the database once (2026-11-06, noted in repo docs).
- What the user sees: see M1. The stop button label depends on `started` = status === 'running' (stop-workbook-run.tsx).
- Existing tests: workbook-job.test.ts:606-619 (runState), workbook-run-progress.test.ts, admin-workbook-runs.test.ts.
- Pure core already? Yes (runState, runProgress are pure with `now` passed in).
- Value x risk: UX medium-high (stale chip), DX low (already pure), low risk to touch.

### M3. Run runner routing ('server' | 'mac')
- Entity / storage: `workbook_runs.runner` (workbook_mac_runner.sql:18), default 'server'.
- States: server, mac. A run is "movable" only if queued, or running with no lease or no progress for 360 s.
- Transitions: `route_workbook_run(p_run,p_runner,p_stale_seconds)` (latest: 20261101_workbook_route_lease.sql:5; also clears lease and heartbeat on a runner change). Callers: admin start route (to 'mac' or 'server', route.ts:34-45), "Run on the server with the API" button (src/app/api/admin/workbook-runs/[id]/server/route.ts), env `WORKBOOK_RUNNER`. claim and resume check `runner = p_runner` in the same statement (runner_checks.sql).
- Where rules live: SQL function + `workbookRunner()` (src/lib/workbook-ai.ts) + `runner: place.subscription ? "mac" : "server"` (workbook-job-deps.ts) + UI text. Edits have their own `runner` (M7) with a different rule (edit layout is hard-coded 'mac').
- DB enforcement: check constraint (server|mac); move guarded by row lock.
- Impossible / unhandled: start creates 'server' first then routes; a failed second call leaves the wrong runner (M1). A Mac run moved to server cannot resume if the Vercel commit differs from the Mac's (code-fingerprint refusal) (docs/workbook-worker.md says so).
- Race: `route` and a Mac claim in the same instant: both lock the row (route is `for update`, claim is a conditional update), so one wins. Guarded.
- What the user sees: "Made on: Savar's Mac (the workbook worker)" or "The server (the API)" (admin-workbook-runs.tsx:223, 532); the "Run on the server" box only when the Mac worker is offline (MacWait).
- Existing tests: workbook-job.test.ts:855 (R404-2), supabase/tests/workbook_route_lease.sql.
- Pure core already? No.
- Value x risk: low value alone; keep with M1. Risk: medium (live runner switch).

### M4. Mac worker heartbeat and loop
- Entity / storage: `public.workbook_workers` (id text pk, seen_at, started_at, build, run_id, primary_ai check subscription|api, note) via `beat_workbook_worker` (workbook_mac_runner.sql:102). In-process state of `workbookWorker()` (workbook-worker.ts:44): `current`, `started`, `note`, `checkUpdate`.
- States (derived): online = `note !== 'stopped'` and `seen_at` within 90 s (WORKER_ONLINE_MS, workbook-worker.ts:140; admin-store.ts:838-848); making a run = `run_id` not null; idle = `run_id` null; stopped = `note='stopped'`; never run = no row. Worker loop result: `TickResult = {ran,outcome} | "idle" | "exit"` (workbook-worker.ts:35).
- Transitions: process start -> beat(started=true); tick -> take first candidate (edits first, then runs; queued, or running and quiet) -> runJob -> beat; idle -> sleep 10 s; "exit" when origin/main moved (between runs only); SIGINT/SIGTERM -> stop after current run, note 'stopped'. Triggered by: LaunchAgent com.unicalearning.workbook-worker (scripts/workbook-worker.ts). Rules: workbook-worker.ts (loop) + workbook-job-store.ts:211-222 (candidate rule) + admin-store.ts:844 (online rule).
- Where rules live: online threshold in 1 TS file; quiet threshold passed in from STALE_SECONDS; edit candidates use a separate filter (workbook-job-store.ts:216-218: queued, or heartbeat older than cutoff).
- DB enforcement: only the primary_ai check; the table keeps one row per worker id, UI reads only the newest row (`order seen_at desc limit 1`, admin-store.ts:840), so a second worker is invisible.
- Impossible / unhandled: `note='stopped'` is also written when the worker exits to pick up new code, so for a few seconds the UI shows offline while launchd restarts it. A worker that dies has `note` null and `seen_at` old: shown offline after 90 s (correct). A worker with `run_id` set but a run that was stopped by an admin keeps showing "making a workbook" until its next beat (up to 30 s).
- Race: two workers: the claim/resume RPCs decide (guarded); heartbeat writes are upserts (fine).
- What the user sees: "Mac worker online / offline" chip (admin-workbook-runs.tsx:198-203); the review tab says "Waiting for your Mac" for queued edits without reading worker state (workbook-comment-reviewer.tsx:126-130).
- Existing tests: src/lib/workbook-worker.test.ts, workbook-worker-install.test.ts, workbook-worker-provider.test.ts.
- Pure core already? Yes (workbook-worker.ts is pure with injected queue/job/clock).
- Value x risk: low value, low risk.

### M5. Draft and revisions (the thing the admin reviews)
- Entity / storage: `workbook_drafts` (one row per run, insert-only, grant select+insert to service_role) and `workbook_draft_revisions` (draft_id, revision, kind check generated|edit|redo-page; check `(revision=1) = (kind='generated') = (content is null)`). Revision = optimistic concurrency token (every RPC takes `p_revision`).
- States: revision N is "current" when it is the max revision. Revision 1 content lives in the draft row; later revisions hold full content.
- Transitions: revision 1 on `finish_workbook_run`; N+1 on `finish_workbook_edit` / `finish_workbook_layout_edit` (M7). All compare-and-set on the latest revision. No other writer.
- Where rules live: the SQL RPCs; the TS reads "latest revision" in several places (workbook-ship-store.ts:19-31, workbook-edit-store.ts load, admin-store).
- DB enforcement: pk + check; the printed lock trigger refuses inserts for printed/shipped (lock_printed_workbook).
- Impossible / unhandled: draft number is not unique per child (finding 5). A draft stored by a failed run has no revision (orphan, M1).
- Race: compare-and-set on revision in save_workbook_comment, send_workbook_comments, queue_workbook_edit, approve_workbook_draft: refusals say "reload the page". Guarded.
- What the user sees: "version N" in admin; refusal text "version X is not the current version (Y): reload the page".
- Existing tests: workbook-ship.test.ts, workbook-edit.test.ts, supabase/tests/workbook-edit-recovery.sql.
- Pure core already? No.
- Value x risk: medium; keep with M7/M8.

### M6. Review comments
- Entity / storage: `public.workbook_comments` (20261102_workbook_comments.sql): `status` check in (pending, sent, done, failed, stale); `route` check in (question, layout) (workbook_comment_routing.sql); `batch_id`; `error`; `result_note`; `before_value`/`after_value`; `revision`; keys `request_key` (legacy) and `client_request_key` (scoped to admin).
- States and encoding:
  - `pending`: saved, open. May carry `error` text ("needs reviewed page-layout changes", or the "code or model changed" reset) - a hybrid.
  - `sent`: attached to a batch (`batch_id`), working.
  - `done`: applied. For layout: "Layout changed"; for question: "Text changed - review result".
  - `failed`: could not be applied, or unchanged, or "Partly applied." (error starts with that text) - still open for resend.
  - `stale`: its page or question no longer exists on the new revision.
- Transitions:
  - (none) -> pending: `save_workbook_comment` (admin POST edit route, body.comment). Update of pending/failed/stale -> pending (re-save clears error/result_note). Delete allowed for pending/failed/stale.
  - pending|failed -> sent: `send_workbook_comments` (question route) or `queue_workbook_layout_edit` (layout, status sent if applied/partial, pending if unsupported).
  - pending|failed (layout, nothing applicable) -> failed with batch_id null: `queue_workbook_layout_edit` "layout-review" branch.
  - sent -> done|failed: `finish_workbook_edit` -> `finish_workbook_question_edit_checked`, or `finish_workbook_layout_edit`. After a question batch "done", comments whose target did not change are flipped done -> failed in the wrapper (workbook_comment_routing.sql, finish_workbook_edit end).
  - sent -> failed -> pending (rewrite): trigger `workbook_edit_call_pending` (20261102_workbook_edit_call_ledger.sql:55-64) when the batch's checkpoint says `pending`; and the finish path sets `pending` directly when p_error = "The code or model changed. Try again to start a new edit."
  - pending|failed|stale -> stale/revision bump: end of each successful finish moves all open comments to the new revision, or to `stale` when the location disappeared.
- Where rules live: SQL functions in 7 migrations (save, send, finish, trigger); TS: workbook-comment-route.ts (labels `workbookCommentStatus`, route regex, changed-check), workbook-edit-message.ts (banner), workbook-comment-reviewer.tsx (button states, `pending = pending|failed`, line 73). The route regex exists in SQL `workbook_comment_route`, TS `LAYOUT_COMMENT_PATTERN`, and is recomputed in the reviewer (lines 74, 196) instead of trusting `c.route`.
- DB enforcement: check constraints on status and route; transitions are guarded by function logic and revision compare; no check ties `batch_id` to `status='sent'` or `error` to `failed`. A before-update trigger changes status silently.
- Impossible / unhandled: `sent` with `batch_id` null; `done` with `before_value` null; `pending` with error (valid but hybrid); a `sent` comment whose batch is `failed` with no finish (worker crash) stays sent until Try again resumes the batch (R428-2); the banner "No comments could be applied" appears from two sources with two texts: SQL `finish_workbook_question_edit_checked` sets "No comments could be applied. See each comment for the reason." (workbook_comment_routing.sql:152) and TS `runWorkbookEdit` throws "No comments could be applied. The workbook is unchanged." (workbook-edit.ts:122); the banner TS line (workbook-edit-message.ts:26) is a third wording, shown only when `batch.status === 'failed' && !layouts`.
- Race / duplicate: save with a client `requestKey` is idempotent per (draft, actor, key) (unique index workbook_comments_admin_request_key); sends are serialized by `for no key update` on the draft and by `workbook_edits_active` unique index (M7). Guarded.
- What the user sees: per-comment label via `workbookCommentStatus` ("Awaiting layout review", "Needs layout work", "Partly applied - open", "Working", "Location changed", "Pending", "Needs another try"); banner via `workbookEditMessage` (only the latest batch + open layout comments of the current revision). Possibly misleading (unverified): after a successful layout-only batch, applied layout comments are `done` and excluded from the banner (`route !== "layout"` filter, line 9), so nothing says "applied", while partly applied ones are counted as "saved and open ... until the pages are re-rendered".
- Existing tests: workbook-edit-message.test.ts, workbook-comment-route.test.ts, workbook-comment-result.test.ts, workbook-comment-progress.test.ts (component), workbook-layout-edit*.test.ts, workbook-edit.test.ts; SQL: supabase/tests/workbook-comment-routing*.sql/.cjs, workbook-comment-admin-keys.sql, workbook-edit-recovery.sql.
- Pure core already? Partly (workbook-comment-route.ts, workbook-edit-message.ts are pure). The transitions themselves are SQL.
- Value x risk: UX high (review tab messages), DX high (3 copies of the route rule, 7 migrations for finish). Risk: medium; a person is changing this UI now, so avoid collisions.

### M7. Edit batches (question edits and layout edits) and the AI call ledger
- Entity / storage: `public.workbook_edits` (20261102_workbook_edit.sql): `status` check in (queued, running, done, failed); `runner` (mac|server); `lease`; `heartbeat_at` (default now()); `base_revision`; `action` check in (edit, fix-question, redo-page); `edit_kind` (question|layout, routing.sql); `layout_plan`; `frame` (build/model/solveModel/layoutPages); `checkpoints` jsonb (per page); partial unique index `workbook_edits_active (draft_id) where status in ('queued','running')`. `workbook_edit_calls` (batch, page, question, kind write|solve, attempt 1-5, request_hash, result/completed_at, check `(result is null) = (completed_at is null)`).
- States: queued, running, done, failed (stored). Derived `phase`: waiting | working | retrying | stalled | saving | done | failed (workbook-edit-progress.ts:34-41): stalled when heartbeat is older than 6 minutes; retrying when queued with a frame or checkpoints; saving when all pages checked.
- Transitions:
  - queue: `send_workbook_comments` -> `queue_workbook_edit` (refuses if workbook printed/shipped, revision differs, or an active edit exists); layout: `queue_workbook_layout_edit` (always runner 'mac'). Admin route src/app/api/admin/workbooks/runs/[id]/edit/route.ts:50-76. Resending after 6 minutes of silence returns the SAME batch (send_workbook_comments resume branch).
  - queued -> running: `claim_workbook_edit` (edit_kind='question', runner match, queued or running with heartbeat older than 6 minutes) / `claim_workbook_layout_edit`.
  - running -> queued (release/hand-over): `release_workbook_edit` (lease + heartbeat guard).
  - running -> done|failed: `finish_workbook_edit` (question, wrapper over `finish_workbook_question_edit_checked`), `finish_workbook_layout_edit`. Lease and heartbeat re-checked after taking draft then workbook then edit locks.
  - A done edit on an approved workbook moves `workbooks.status` approved -> draft, clears approved_at, pdf_path replaced (M8).
- Where rules live: the 6-minute lease literal appears in SQL: edit, edit_call_ledger, edit_recovery, edit_recovery_checks, edit_legacy_frame, comment_routing, layout_review, layout_repair_contracts (8 files); TS: workbook-edit.ts:21 (EDIT_LEASE_MS), workbook-edit-store.ts:14, workbook-edit-deps.ts:40, workbook-layout-edit-deps.ts:18, workbook-edit-progress.ts:39 (+ memory store). 5-call limit: SQL (reserve_workbook_edit_call, `n>=5`) and TS `EDIT_CALL_LIMIT`. The action values 'edit' and 'fix-question' have no caller (rg: only `queue_workbook_edit` is called via send/layout with 'redo-page').
- DB enforcement: strong. Checks, partial unique index, locks, a frame comparison (build/model/solveModel) and per-call immutability. Weak: no check that `done` has `revision`, or that `failed` has `error`.
- Impossible / unhandled: edit `queued` for the Mac forever when the Mac is off (the only "Run on server" button is for generation runs, not edits; `WORKBOOK_RUNNER=server` is read only for question batches; layout batches are always 'mac'). Edit `done` where only some comments changed their target: the wrapper `finish_workbook_edit` checks that at least one changed BEFORE finishing, then flips the unchanged ones from done to failed AFTER the revision exists (workbook_comment_routing.sql, end of the wrapper), so the stored revision and the per-comment status are written in two steps (same transaction, but two rules). A batch whose heartbeat timer writes app-clock times (finding 7).
- Race / duplicate: one active batch per draft (unique index); lease+heartbeat checked in checkpoint, frame, finish; call ledger caps provider dispatches at 5 per page/question. Evidence: docs/workbook-edit-review.md R428 table. Guarded.
- What the user sees: progress panel text from `phaseText` (workbook-comment-reviewer.tsx:126-131): "Waiting for your Mac", "Applying comments", "Retrying with saved work", "The edit stopped", "Saving the new revision"; "Try again" when stalled. Banner as in M6. No parent view.
- Existing tests: workbook-edit.test.ts (383 lines, both runners), workbook-edit-progress*.test.ts, workbook-edit-deps-routing.test.ts, workbook-layout-edit*.test.ts; SQL workbook-edit-call-ledger.sql, workbook-edit-recovery.sql, workbook-comment-routing*.
- Pure core already? Partly: `runWorkbookEdit` is store-seam TS with a memory store (workbook-edit-memory.ts); the finish rules are SQL.
- Value x risk: UX high, DX high (lease literal x14), AX medium. Risk HIGH (money-adjacent: AI spend limits; live review work; another lead editing the review tab).

### M8. Workbook lifecycle: draft -> approved -> printed -> shipped
- Entity / storage: `public.workbooks.status` check in (draft, approved, printed, shipped) (add_workbooks.sql:38) with `approved_at`, `printed_at`, `shipped_at`. Row is created at approval (not at run completion).
- States and encoding: no row = still a run draft; `draft` = taken back to draft by an edit after approval (the default value is also used for one instant inside the approve transaction); `approved` (approved_at); `printed` (printed_at); `shipped` (shipped_at). "Delivered" is NOT a status: see M10.
- Transitions:
  - (run draft) -> approved: `approve_workbook_draft` (latest: 20261104_workbook_print_contract.sql:179; `write_workbook` then status approved) from POST /api/admin/workbooks/runs/[id]/approve; TS gate `approvalProblems` (src/lib/workbook-ship.ts) runs first.
  - draft -> approved: same RPC, via `apply_workbook_print_contract` (20261105_workbook_print_contract_lock.sql, only on status draft).
  - approved -> draft: `finish_workbook_edit` / `finish_workbook_layout_edit` (sets status='draft', approved_at=null; trigger `clear_printed_revision` clears printed_revision).
  - approved -> printed -> shipped: `mark_workbook(p_to)` (latest 20261102_workbook_ship_lock_order.sql / ship_row_lock; POST /api/admin/workbooks/[id]/status). Child lock, draft lock, then workbook lock (documented lock order).
  - printed/shipped are locked: trigger `lock_printed_workbook` (latest 20261105_workbook_print_contract_lock.sql) on workbooks, workbook_pages, workbook_questions, workbook_draft_revisions; status can only go printed -> shipped; edits, comments, save_workbook_rendering are refused.
  - shipped additionally needs the plan gate: `fence_plan_workbook` trigger (20261105234500_plan_controls.sql:289) can refuse with 55000 (finding 2).
- Where rules live: SQL: approve, mark, lock trigger, plan trigger, queue_workbook_edit/save_workbook_comment (`v_status in ('printed','shipped')` repeated in 6 functions). TS: `isLocked` (workbook-ship.ts), `approvalProblems`, STATUS chip map (admin-workbook.tsx:19), buttons keyed on status (admin-workbook.tsx:146-150), run page "Approval" (admin-workbook-runs.tsx:481). Files comparing `.status === "shipped"`: parent-view-server.ts:76, workbook-delivery-store, admin lists, scan photo functions (SQL) (many; counted ~15 TS/SQL places by rg, unverified exact).
- DB enforcement: strong on forward moves (status check, trigger, `mark_workbook` guards `approved` -> `printed` -> `shipped`). Weak: re-approve of an approved/printed/shipped draft is not detected up front (returns unique_violation text, finding 5). No check that `shipped_at` is set iff status is shipped (the trigger keeps shipped_at unchanged once shipped).
- Impossible / unhandled: `approved` with `printed_revision` null is a legacy book by design (M9). `draft` workbook row with stored pages that differ from the latest revision until re-approval (finish updates stored pages for the edited page only). Two drafts with the same number (finding 5).
- Race: approve vs mark vs edit: lock-order fixes P2-1..P2-3 (migrations ship_child_lock, ship_lock_order, ship_row_lock, print_contract_lock). Guarded by row locks. "first shipped" detection happens under the child lock (guarded).
- What the user sees: admin chip Draft/Approved/Printed/Shipped; buttons "Approve for print", "Mark printed", "Mark shipped", note "A printed workbook cannot change."; parents see only shipped books (RLS migration workbooks_parent_shipped_only; parent-view-server.ts:75-78). The refusal text for a plan pause shows as "the family is being deleted" (finding 2).
- Existing tests: workbook-ship.test.ts (memory store), workbook-print-contract.test.ts; SQL: only through plan_controls tests and comment-routing fixtures (no dedicated approve/mark SQL test).
- Pure core already? Partly: workbook-ship.ts (approvalProblems, approvedWorkbook, markWorkbook) is pure with a store seam; the transition rules are SQL.
- Value x risk: UX medium (wrong refusal texts), DX medium, AX medium. Risk HIGH: printed books are physical; the lock is the safety.

### M9. Print contract freeze
- Entity / storage: workbooks.printed_revision (28 hex), pdf_sha256, print_manifest; workbook_pages.print_contract; workbook_questions.regions, teaching (20261104_workbook_print_contract.sql).
- States: none / legacy (printed_revision null) versus whole (printed_revision set); scan photos remember which revision they were identified against (`printContractForPhoto`: unavailable no-contract | other-revision | available).
- Transitions: captured at render; frozen at approval by `approve_workbook_draft` (+ `apply_workbook_print_contract`, only on status draft); cleared when status goes to 'draft' (trigger `clear_printed_revision`) and by `save_workbook_rendering` (new bytes end the revision); locked at printed/shipped (lock trigger now covers printed_revision, pdf_sha256, print_manifest).
- Where rules live: src/lib/workbook-print-contract.ts (printedRevision:508, printContractForPhoto:528) + SQL above + `identify_scan_photo` (copies the revision onto the photo, falls back to printed_at/approved_at text for legacy books).
- DB enforcement: format checks; "all or none" enforced by `apply_workbook_print_contract` (page and question sets must match) and the approve path; a draft with a partial contract is approved with NO revision (`approvedWorkbook` in workbook-ship.ts:128-156).
- Impossible / unhandled: a legacy photo stores a timestamp string in the `printed_revision` column of scan_photos (never equals a revision, by design). No check that `printed_revision` is null when pages lack a contract (enforced in TS `printedRevision` returning null).
- Race: guarded (row lock + trigger).
- What the user sees: nothing directly; scan marking available or not.
- Existing tests: workbook-print-contract.test.ts, workbook-print-contract-chromium.test.ts, SQL comment-routing regressions.
- Pure core already? Yes.
- Value x risk: low change value; high risk (print identity).

### M10. Delivery receipt and corrections
- Entity / storage: `workbook_delivery_receipts` (one row per workbook, immutable by trigger) and `workbook_delivery_corrections` (append-only, previous_audit_id as the version) (20261102223812, 20261102225721). `workbooks.status` stays `shipped`.
- States: not delivered (no receipt row), delivered (receipt), corrected (latest correction by `audit_id`). Effective time = latest correction else receipt. Derived in 3 places: `DeliveryStore.receipt` (workbook-delivery-store.ts), `confirmedWorkbookDelivery` (workbook-delivery-access.ts, parent view), scan clock (workbook-scan-clock.ts, `deliveryDeadlines`).
- Transitions: `confirm_workbook_delivery` (admin session via auth.uid(); idempotent on identical input; conflicts refused) and `correct_workbook_delivery` (request id idempotency, expected audit id as compare-and-set); routes /api/admin/workbooks/[id]/delivery; UI src/components/workbook-delivery.tsx. Requires status 'shipped'.
- Where rules live: SQL (2 functions) + src/lib/workbook-delivery.ts (validation, deadlines: reminder at +4 days, backstop +21 days) + parent-view derivation.
- DB enforcement: strong (immutable triggers, unique pk, check delivered_at <= recorded_at, shipped check inside the function).
- Impossible / unhandled: delivered before shipped is refused (invalid_delivery_time); a receipt without status shipped cannot exist.
- Race: row lock on child then workbook; correction CAS via expected audit; guarded.
- What the user sees: admin "Delivery confirmed" or "Confirm workbook delivered" link (admin-workbook-runs.tsx:168); parent Workbooks tab shows shippedOn/deliveredOn (parent-view.ts:259-273). The admin reason map covers frozen family etc. (workbook-delivery.tsx:13).
- Existing tests: workbook-delivery.test.ts, workbook-delivery-access.test.ts, workbook-delivery-progress-route.test.ts; SQL only inside scan tests (workbook_answers_hosted.sql, workbook_scan_receipts.cjs); no dedicated confirm/correct SQL test (rg).
- Pure core already? Yes (workbook-delivery.ts).
- Value x risk: low-medium value; risk medium (starts the first-month plan indirectly; the billing step reads the receipt).

### M11. Workbook emails (welcome, ready, dispatch, plan_start rows)
- Entity / storage: `public.workbook_emails` (20261101_add_workbook_emails.sql; kinds extended by 20261106181619_workbook_ready_emails.sql): `kind` check in (welcome, ready, dispatch, plan_start); `status` check in (pending, sending, sent, failed, unknown, skipped); `claim_token`, `claimed_at`, `attempts`; unique (card_setup_id, kind, workbook_number). Also `card_setups.workbook_welcome_enabled` and `workbook_email_checked_at`.
- States: pending (queued by trigger `queue_workbook_welcome` when card_saved_at is set), sending (claimed), sent, failed (definite provider refusal; retryable, welcome up to 3 attempts), unknown (uncertain; never retried), skipped (superseded by ready/dispatch). Derived: `sending` older than 10 minutes shows as unknown (`shownWorkbookEmailStatus`, workbook-email.ts:45).
- Transitions: card saved -> welcome pending (trigger); pending|failed -> sending: `claim_workbook_email` (locks the card row; skips welcome after ready/dispatch; marks old `sending` welcome/ready unknown after 10 minutes; skips pending welcome/ready when dispatch starts); sending -> sent|failed|unknown: `workbookEmailLedger` outcome update guarded by `claim_token` and `status='sending'` (workbook-email-server.ts:~40). Who: admin POST /api/admin/cards/[id]/workbook-email; cron `/api/workbook-emails` (pg_cron job `workbook-welcome-emails` at minutes 7, 22, 37, 52, max 2 cards checked and 2 welcomes per run).
- Where rules live: SQL claim function (10-minute interval literal) + workbook-email.ts:46 (10 minutes, display) + workbook-email-server.ts SENDING_STOPPED_MS (10 minutes, plan start claim) = 3 copies of the 10-minute rule. The kind/number key in claim, in the check constraint, and in TS `WorkbookEmailKey`. UI keys in src/components/workbook-emails.tsx:9-15, 40-44.
- DB enforcement: strong (checks, unique key, row lock, token compare). If the outcome write fails the row stays `sending` forever (claim held, by design; shown unknown after 10 minutes).
- Impossible / unhandled: `sending` forever if the process dies (shown as unknown only in UI/claim paths; a pure DB read still says sending). `skipped` welcome that was never sent but the family then gets only the ready/dispatch mail (by design). The `plan_start` kind here is legacy: newer plan starts use `plan_starts.email_*` (20261105_plan_start_holds_deletion*.sql); `planStartEmailClaim` reads both (workbook-email-server.ts:135).
- Race: guarded by the card row lock and claim token; tests R-email-server.
- What the user sees: admin panel labels Waiting to send / Sending / Email sent / "Not sent. You can retry." / "Delivery is uncertain..." / "Not needed after dispatch" (workbook-emails.tsx:9-10); parents get the mail. The mail never changes workbook status.
- Existing tests: workbook-email.test.ts, workbook-email-server.test.ts, workbook-email-worker.test.ts, workbook-email-route.test.ts, admin-workbook-emails.test.ts, components/workbook-emails.test.ts; SQL workbook_emails.sql, workbook_ready_emails.sql.
- Pure core already? Partly (workbook-email.ts builds mail and `shownWorkbookEmailStatus`; the claim rules are SQL).
- Value x risk: medium; risk HIGH (real parent mail, send-once semantics).

### M12. Book 1 baseline, second tries, saved previews
- Entity / storage: `workbook_book1_baselines` (unique (draft_id, draft_revision); `planning_kind` prospective-capture | exact-recovery; `boundary_at`; immutable trigger), `workbook_second_tries` (unique per item/version/evidence; immutable), `workbook_plan_previews` (saved previews; immutable, read/save/duplicate/conflict) (20261107161035, 20261107144016).
- States: none, baseline saved (opens the correction boundary), second tries appended, preview saved (statuses of the RPC answer: found/missing/conflict/unavailable/duplicate). No status column; lifecycle = existence.
- Transitions: `workbook_book1_baseline_command(read|save)` (scan lock, parent share), `record_workbook_second_try`, preview `read|save`. Rules in SQL + src/lib/workbook-book1-store.ts, workbook-book1-baseline.ts, workbook-preview-record.ts.
- DB enforcement: strong (immutability triggers, hashes, unique keys).
- Impossible / unhandled: none found; `55000` is used for immutability (see finding 2 on the overloaded code).
- Race: guarded under the family scan advisory lock.
- What the user sees: admin preview-plan page only.
- Existing tests: workbook-book1-store.test.ts, workbook-book1-preview.test.ts, workbook-book1-recovery.test.ts, workbook-preview-*.test.ts; SQL workbook_book1_baseline.cjs, workbook_preview_sources*.cjs.
- Pure core already? Yes.
- Value x risk: low. Do not touch.

### M13. Boundary items (not inventoried in depth; another lead may own them)
- `workbook_scan_receipts`, `workbook_scan_pending_items`, `workbook_scan_inactivity_episodes` (dispatch_count 0-3, consumed_at/consumed_token pair check), `workbook_scan_reminder_messages` (state reserved|admitted|sent|refused|unknown|released), scan clock requests (src/lib/workbook-scan-clock.ts: waiting|hold|claimed|missing-delivery|stale-delivery|calendar-conflict). They read the M10 delivery time.
- `workbook_restart_requests` (plan controls): `run_id is null` = pending; `fulfil_paid_restart_request` (20261105234500_plan_controls.sql:296) sets run_id on EVERY open request when ANY run is inserted for the child, so a run that later fails or is stopped still clears the "Paid Restart pending" note (children/[id]/page.tsx:23, 64).
- Parent-view derived delivery state `nextBook(...)` (src/lib/parent-view.ts:272) reads shipped/delivered/paused data (dashboard lead).

## Cross-cutting evidence

- Status strings per entity in TS: workbook_runs 13 files; workbooks.status ~15 places across admin lists, parent view, scan SQL; workbook_edits/comments statuses in 3 TS places each plus the SQL family.
- Hard-coded durations: STALE_SECONDS 360 (TS, passed to SQL), 2 minutes (start SQL + memory store), 6 minutes edit lease (14 places), 10 minutes email send (3 places), 90 s worker online (1), 30 s renew/heartbeat (job, edit timers), 10 s stop poll (STOP_CHECK_MS).
- Errcode 55000 is shared by: family deletion fence, child deletion fence, plan-control gates, immutable book1 rows, delivery immutability. The TS maps it to a fixed deletion message in 5 stores.
- Old function overloads kept for compatibility (claim_workbook_run 2-arg, resume_workbook_run 3-arg, save_workbook_run_ai_calls v1, use_workbook_run_attempts): a stale deploy could bypass the runner check (unverified).
