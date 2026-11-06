VERDICT: APPROVE

Computer: Savars-MacBook-Pro-5.local.
Model: gpt-6.1-sol, high. Usage is not exposed. One reviewer. No helpers.
App path: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-8f7f34bc.
Resolved path: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-8f7f34bc.
Branch: t3/s5-marking-corrections.
Candidate: f1635c1e57cdc96629218956aec4802bd5829017.
Base: f3133376535b3c96f4c81f62f1f8d1cc80322a23.
Initial source status: clean.
Diff: git diff f3133376535b3c96f4c81f62f1f8d1cc80322a23...HEAD.

Falsifiers recorded before bounded checks:
- Two successful writes against one canonical version, or a stale write that wins.
- Changed original reading/event/model/prompt or a duplicate effective original.
- A retake crop used for an earlier canonical reading.
- Image expiry blocks numeric changes or recovery.
- A committed publication/profile/skill failure disappears from durable recovery.
- Automatic sheet/version/lease/deadline fences weaken.
- Extra public request fields enter the command, or history loses actor/time/version/pagination/family/child restrictions.

Limits: no source edits, commits, pushes, PR comments, browser, hosted/service/provider calls, credentials, paid calls or release changes. No full suite/build repeat. Supplied gate logs are worker evidence only. This review grants no merge or family-marking approval.

Independent check results:
- Affected Vitest checks: exit 0. 12 files, 171 tests passed. Public route and UI seams cover strict fields, explicit choices, no default choice, prior parent choices, retained readings, canonical evidence-photo selection, conflict state, and existing private image delivery. These are synthetic component and route checks, not a rendered browser or real authentication check.
- Fresh S4 bootstrap: exit 0. 48 cases passed. Log: /tmp/pd458-sol-s4-before.log.
- S5 local runner: exit 0. 36 cases passed. Log: /tmp/pd458-sol-s5.log. This ran production PATCH/action/store/projection/rebuild code and production SQL through synthetic authentication and persistence transports. It covers result transitions, deleted and expired photos, simultaneous parent writes, stale versions, retained events, recovery failures, history pagination and local role/deletion restrictions.
- S4 after S5: exit 0. 48 cases passed. Log: /tmp/pd458-sol-s4-after.log. The runner checked the same inherited automatic admission and lifecycle cases. The S5 runner also confirmed identical automatic command and Send function bodies across migration application.
- Independent controlled concurrency: exit 0. Two additional cases passed. Probe: /tmp/pd458-sol-concurrent.cjs. Log: /tmp/pd458-sol-concurrent.log. Both use separate PostgreSQL connections. A real lock wait was observed before the first transaction committed. Parent-first kept the parent judgment against late automatic application. Automatic-first returned a conflict to the stale parent request, then accepted a new explicit choice at the current version. Both retained one history row and the correct reading. The fixture reused reduced local dependency tables and the existing fixture loader. It did not use hosted workers.
- Base public-route control: expected exit 1. The route at f3133376535b3c96f4c81f62f1f8d1cc80322a23 has no PATCH action. Log: /tmp/pd458-sol-old-route.log. This proves the new public action differs from the base. It does not prove that every regression test fails on base.
- Fixed diff whitespace check: exit 0.

Commands used the fixed isolated source. The fresh local database is pd457_sol458_review on /tmp/pd457-pg-s5-dSauCK. No TCP listener was requested. S4 fixture prices were reset before the after-migration run, as documented in the implementation report. No source file was changed.


Findings ledger: no blocker, should, or nit finding. No source correction is required by this local fixed-source review.

Acceptance trace:
- Explicit Right/Wrong/Blank choices and no default: src/components/scan-mark-change.tsx:14 and :37. Route validation: src/app/api/account/scans/[id]/marking/route.ts:25 and src/lib/scan-marking-store.ts:129. The route uses the verified session, stored photo identity, release check and active session checks. Extra ownership or evidence fields are refused by the parser.
- Canonical version, history and ownership: supabase/migrations/20261106_scan_mark_changes.sql:43, :62, :66 and :85. The family advisory lock and canonical row lock serialize parent and automatic mutations. The expected version controls the mutation. The same transaction appends history and advances the result and marking revisions.
- Retained original evidence: the change merges only the judgment fields at migration line 71. It retains reading, regions, photo reference, model, prompt and an existing original event. A first parent result on an eligible pending item creates the single publication intent. Local transition tests compare retained data directly.
- Canonical crop and image expiry: src/lib/scan-marking-server.ts:37 and src/components/scan-mark-change.tsx:34 use the canonical evidence photo. The current lifecycle controls whether to offer the crop. Numeric changes do not depend on Storage or a live image. Actual image routes and rendered layout were not exercised here.
- One effective original and removal of unsupported causes: src/lib/scan-marking.ts:187 clears mistake and stuckStep for parent judgments. Publication retains its stable original key. Trusted expected eligibility still controls mastery and excludes Try first and unscored work.
- Durable recovery and stale saves: src/lib/scan-marking-server.ts:61, src/lib/child-profile.ts:441 and :464, src/lib/child-profile-store.ts:106, and migration line 98. The marking revision and profile build token reject stale saves. Failed skill history commits a retry flag with fallback facts. Later findings retain that flag. The existing recovery cursor includes pending publication and profile work after image expiry.
- Admin history: src/app/(product)/admin/scans/[id]/page.tsx:20 and src/lib/scan-marking-store.ts:151. The query reads pages of 100 by increasing history id. Local tests read 105 changes across pages after expiry. Actor, server time, prior record and version links remain available. Local SQL also checks direct role restrictions, update refusal, family/child fences and cascades.
- Automatic compatibility: the migration renames the existing automatic function and revokes direct service execution. The wrapper forwards automatic operations without changing their body. Independent local checks preserved all 48 S4 cases after application. Send was unchanged.

Scope and evidence limits:
- This is approval of candidate f1635c1e57cdc96629218956aec4802bd5829017 for the specified local source review only. It grants no merge or family-marking approval.
- The hosted S5 migration is still pending. Root must apply it after its installed dependencies, verify hosted restrictions and rollback probes, and regenerate database types before deployment. This reviewer made no hosted call and did not replay hosted migrations.
- The exact full repository gate and rendered browser review remain pending. The supplied lint/build logs report a worker pass. This reviewer inspected them but did not repeat lint, the full suite, or build. The 171 affected tests were run independently.
- Reduced dependency tables and synthetic auth/transport seams do not prove hosted RLS, Storage direct/signed URL denial, live sessions, actual worker credentials, real QA-family deletion, retention clocks or deployed cron recovery.
- No provider request, paid model call, real-photo recognition check, physical workbook scan, camera check or visual approval was performed. No claim about those systems follows from the passing local cases.
- S6, second tries, final dashboard, release switches and frozen future-book snapshots remain outside scope.

Final source and cleanup:
- Actual app path: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-8f7f34bc. Resolved path: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-8f7f34bc.
- Branch t3/s5-marking-corrections. HEAD f1635c1e57cdc96629218956aec4802bd5829017. Final source status clean. Fixed diff: 33 files changed, 1084 insertions, 28 deletions.
- Log-derived counts were checked again before this report: S4 before 48 PASS and 0 FAIL; S5 36 PASS and 0 FAIL; S4 after 48 PASS and 0 FAIL; independent controlled overlap 2 PASS and 0 FAIL. Vitest returned 12 files and 171 tests passed.
- pg_ctl fast stop returned exit 0. Final status returned no server running, exit 3. Process inspection found no owned test or cluster process. No browser or development server was started.
- Local logs, the disposable probe and database files remain under /tmp. Source, index, branch, credentials and external systems were not changed.
- Runtime: gpt-6.1-sol, high. Usage is not exposed. No helper or delegate was used.

VERIFIED: fixed-source local review complete; root integration and release checks remain.
