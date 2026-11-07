# Durable workbook scan SQL for #475

HANDOFF_READY

This result is local SQL work. It does not complete #475 or authorize family release.

## Exact source and location

- Computer: `Savars-MacBook-Pro-5.local`.
- Prepared checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-b62d245e`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-b62d245e`.
- Branch: `site/workbook-scan-receipts-475`.
- Initial clean HEAD: `550fdcf1619c0e515e8ac33e2a65869d8c937af7`.
- Exact required base: `c2df67277c84adf1de0e212e0b4f279c7f9b0e47`.
- Exact SQL and test head: `3dd64181a20acaf88afd19239e0a300f326d2a9a`.
- Handoff commit: the next documentation commit. The final task reply supplies its exact SHA. It changes only this file.
- Actual implementation model: Unify Codex `gpt-6.1-sol`, high reasoning effort, also called Unify Sol high.
- Required legacy trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. This trailer does not identify the implementation model.

The ancestor check passed before the authorized fast-forward. The exact base check passed before edits. Only the prepared branch was renamed. No other checkout was created or changed. The migration prefix `20261106224500` was unused. The result adds one migration.

## Owned files

Only four new files belong to this task:

- `supabase/migrations/20261106224500_workbook_scan_receipts.sql`.
- `supabase/tests/workbook_scan_receipts.cjs`.
- `supabase/tests/workbook_scan_receipts_fixture.sql`.
- `.design/research/workbook-scan-receipts-handoff.md`.

No existing tracked file changed. The approved pure module and its tests remain unchanged.

## Durable DB contracts

`workbook_scan_receipts` stores an accepted photo revision once. It binds parent, child, numbered workbook, immutable printed revision, page, and calibration token. `photo_revision` is unique. A photo UUID is the existing photo revision identity. There is no photo FK. Photo deletion, expiry, and physical row removal cannot erase the receipt. Child, family, page, and workbook deletion use the existing identity cascades.

`capture_scan_receipt` is a new AFTER hook on photo state and calibration state/result transitions. Both hooks call `_admit_workbook_scan_receipt`. Acceptance requires a saved, active photo with durable bytes, the same shipped book and printed revision, a current ready calibration, sheet-check version at least 1, the matching calibration revision, the stored page contract identity, and a supported frozen manifest. The source object and every declared derived part must have positive size metadata and JPEG MIME metadata. The straight part is required. Paths must use the photo and the current calibration token. Missing files, stale checks, pending/refused/terminal photos, wrong scope, and absent contracts cannot admit a receipt. No Send or marking completion is required.

`workbook_scan_receipt_epoch` records installation time. Photos created before installation cannot acquire receipts through callback retries. This deliberately refuses historical admission, including old attachments that later receive another callback. A new accepted photo is required. Root must retain this conservative cutover rule or review an explicit verified migration separately.

The first accepted time remains unchanged on callback retries. Acceptance reads `clock_timestamp()` after lock waits. The production save RPC can still report `saved` inside a stale transaction after real expiry because its existing body uses `now()`. The new receipt hook refuses acceptance in that case. This task does not replace that RPC.

`workbook_scan_pending_items` records pending canonical items at acceptance of a later photo of the same page. A prior accepted receipt of that exact canonical page is required. The record retains the item row, item ID, result version, and expected contract. It copies no answer reading.

`workbook_scan_progress_events` records a pending resolution once per receipt/item. The hook captures `OLD.owner_photo` before S4 or S5 clears it. If the owner is already clear, S5 can use the retained observation's photo identity. The new observation must name that same accepted retake. The transition must be pending or parent-pending to scored or parent-checked, with the next canonical result version. Item scope and expected contract must remain unchanged. Observation mastery and teaching changes cannot establish scan progress.

Normal first-photo completion, unchanged retakes, pending word-form mismatches, newly parent-pending two-ways observations, finalized originals, and parent changes to finalized items create no progress event. A later explicit parent check can resolve a retained retake reading. A parent judgment that still refers to the earlier photo cannot establish progress for the new retake. Existing automatic publication and parent-change RPCs keep their bodies, versions, return shapes, grants, and empty search paths.

The root adapter maps a receipt to `AcceptedScanReceipt` using its snake-case columns. Convert `photo_revision` to its UUID string. Map each progress-event row to `AdmittedScanProgressEvent` with `resolvedItemIds: [item_id]`. Use `receipt_id` to join the exact receipt. Use that receipt's `accepted_at` for inactivity. `admitted_at` is the later resolution admission time. It must not replace the scan time. Each event has its own stable UUID, so separate item resolutions can remain separate projection events.

`workbook_scan_trigger_claims` has one unique `workbook_id`. It binds the numbered printed revision. It stores the reason, claim time, effective trigger time, effective delivery audit/correction identity, effective delivered time, recorded delivery zone, backstop deadline, and captured receipt IDs. The receipt rows retain the page/photo/revision identities after image removal. Capture includes all accepted receipts then visible for this book. This is an evidence identity set, not an S12 snapshot scope or a mastery policy.

`_workbook_scan_day7` validates the frozen manifest against stored page numbers, day labels, and question-bearing pages. It rejects duplicate days/pages and unsupported manifests. Every required ordinary Day 7 page is needed. A test book must have exactly the full frozen level-test set on Day 7. Earlier gaps are allowed. Extra practice is optional for Day 7. Its question-bearing valid scan is accepted work and prevents a false zero-scan hold.

`workbook_scan_backstop_holds` stores the zero-scan decision per effective delivery audit. It consumes no trigger claim. A later scan can permit Day 7 or the normal backstop. No plan advance, repeat, queue, billing action, or Restart change occurs.

New AFTER INSERT hooks on delivery receipts and delivery corrections use the same claim function. The latest correction by audit ID supplies effective delivery. Missing delivery creates no claim or delivery timer. Repeated confirmation returns its existing receipt and moves no anchor. A correction after a winning claim does not rewrite that immutable claim. The claim retains the delivery identity that was effective when it won.

## Public functions and permissions

- Service: `reconcile_workbook_scan_progress(p_books uuid[]) -> jsonb`. It accepts at most 100 non-null IDs and processes distinct IDs in sorted order. Empty input returns an empty array. Null input, null members, and larger batches raise `invalid_scan_batch`.
- Admin session: `admin_reconcile_workbook_scan_progress(p_books uuid[]) -> jsonb`. It requires a live `auth.uid()` and `is_admin()`. It calls the same bounded service implementation.
- Each result has `workbookId` and `result`. Result status is `unavailable`, `missing-delivery`, `waiting`, `hold`, or `claimed`. A claimed result contains the stored claim. A waiting/hold result supplies `backstopAt` where applicable.
- All admission, trigger, clock, manifest, and lock helpers revoke execute from public, anon, authenticated, and service roles. Only the two checked wrappers have external grants. The private controlled clock argument is not available to service or browser callers. Live callers pass null. The helper reads the database clock after locks.
- All six new tables enable RLS. Service has SELECT only. Family-owned tables have admin SELECT through RLS. Parents and anon cannot read raw facts or insert/update/delete them. The epoch table has no browser grant. New family-owned tables use both existing family and child write fences. UPDATE is also refused by an immutable-fact trigger.
- No sequence grant is needed. UUID defaults supply IDs.

## Lock order and concurrency evidence

The existing delivery functions lock family, child `FOR NO KEY UPDATE`, then book `FOR UPDATE`. Existing scan RPCs lock photo, then calibration. The new admission helper retains the scan row order. It obtains book `KEY SHARE` before the per-book advisory gate. Every claim caller uses `_lock_workbook_scan_book` and the same `workbook-scan:<book UUID>` gate. Child FK `KEY SHARE` remains compatible with delivery's child `NO KEY UPDATE` lock.

The gate serializes receipt insertion and the following required-set query. A second final receipt waits, then reads the first committed receipt. This prevents two final receipts from each missing the other. The unique claim also prevents duplicate next-book facts.

Delivery holds book UPDATE before its AFTER hook. A scan that loses that race waits at book KEY SHARE before it can own the gate. A scan that wins holds book KEY SHARE and the gate until its transaction ends. Delivery waits at the book. No helper takes photo, calibration, or canonical item row locks after the gate. These reads cannot create a reverse wait on a scan row.

Actual PostgreSQL sessions and explicit `pg_blocking_pids` barriers proved:

- Two devices saving the final two different pages leave two receipts and one claim.
- Delivery first and receipt first both complete.
- A delivery stopped immediately before receipt insertion owns book UPDATE. The waiting scan does not own the per-book gate. A separate try-lock probe proves that the gate is free.
- Day 7 and backstop use one claim in both orders.
- Delivery correction and the final scan serialize in both orders. The winning claim retains the winning delivery identity.
- Duplicate callbacks retain the first receipt and claim.
- Parent correction and resolving publication serialize through the existing S4/S5 version path in both orders. Finalized originals and parent judgments survive.
- A family freeze that wins refuses acceptance. A freeze that loses waits for the admitted transaction. Static child tombstones refuse new facts too.

These are real local PostgreSQL connections. They are not PGlite concurrency evidence.

## Calendar behavior and material limit

The backstop is 21 local calendar days after effective confirmed delivery, at the same wall time. `_workbook_scan_wall` uses the existing `_maya_zone_at` dated rules when the receipt enables overrides. The inverse function follows `family-time.localDateTime`: sample offsets around the target, select the earlier exact fold occurrence, and binary-search the first valid second after a gap. It does not use native SQL's implicit gap/fold choice or 504 elapsed hours.

The tests bundle the actual `deliveryDeadlines` and `family-time` code in memory. SQL matches their deadlines for Chicago gap/fold and seasonal cases, Vancouver and Edmonton dated overrides, Winnipeg and Yellowknife dated overrides, and a non-hour zone. The gap probe returns `2025-03-09T08:00:00.000Z` for Chicago's missing 02:30. The fold probe chooses `2025-11-02T06:30:00.000Z` for Chicago's first 01:30.

**Root must verify runtime time-zone parity before hosted acceptance.** A separate diagnostic found a native-data difference with overrides explicitly disabled for Edmonton. From delivery `2026-10-15T12:00:00Z`, local PostgreSQL 18.6 gives `2026-11-05T12:00:00.000Z`, while this Node runtime gives `2026-11-05T13:00:00.000Z`. The test prints `NATIVE_TZDATA_PARITY` with `equal:false`. The application deliberately uses native data for `{zone, override:false}`. The SQL does the same. Dated overrides enabled for Edmonton pass. This result does not claim parity for the divergent native-data case. Current postal exceptions use the explicit Chicago object, but a stored delivery can carry another explicit false override. Compare the actual hosted PostgreSQL 17 and production Node runtimes. Do not accept a deadline mismatch silently.

## Commands and checks

All checks stated their failure conditions before execution. Each focused test prints its own `FALSIFIER` line. The final local run returned:

```text
WORKBOOK_SCAN_RECEIPTS_OK 26
PROOF receipt: production hooks/RPC admission and durable rows; synthetic image quality/Storage metadata only.
PROOF marking: production S4/S5 versions and publication; no model, learning-event publication or profile policy.
PROOF claims: actual concurrent PostgreSQL sessions and explicit barriers; reduced dependency schema, not hosted proof.
PROOF calendar: actual deliveryDeadlines/family-time compared with SQL; no hosted tzdata or scheduler activated.
LOCAL_CLUSTER_REMOVED /tmp/unica475-pg-RrlERa
```

The final source has 26 focused test groups. They cover save/ready order; S1 and quality/file refusals; wrong scope/printing; pre-install refusal; transaction-clock expiry; missing bytes after ready; callback idempotency; photo retention; full ordinary/test Day 7 sets; gaps; optional work; missing/repeated/corrected delivery; two numbered books; exact zero-scan boundary; late backstop; genuine/unchanged/policy-only retakes; S5 version races; actual concurrent claims; both delivery orders; all new family cascades; and role/RPC denial.

Commands used for bootstrap and source checks:

```sh
hostname
pwd
git branch --show-current
git status --short
git rev-parse HEAD
cat AGENTS.md
git fetch origin main
git merge-base --is-ancestor HEAD c2df67277c84adf1de0e212e0b4f279c7f9b0e47
git merge --ff-only c2df67277c84adf1de0e212e0b4f279c7f9b0e47
git branch -m site/workbook-scan-receipts-475
git rev-parse HEAD
```

Read-only sources included issue #475 through the GitHub tool, the approved core/module tests/handoff, family-time, delivery/scan/marking source, and the relevant existing migrations. The two supplied local schema JSON files were read as data. No live Supabase metadata query ran.

The checkout had no dependencies. This command installed its locked packages without lifecycle scripts or package metadata edits:

```sh
npm ci --ignore-scripts --no-audit --no-fund --cache node_modules/.cache/npm
```

Focused execution and syntax commands:

```sh
/opt/homebrew/bin/psql --version
/opt/homebrew/bin/initdb --version
/opt/homebrew/bin/pg_ctl --version
/opt/homebrew/bin/pg_config --version
node --check supabase/tests/workbook_scan_receipts.cjs
node supabase/tests/workbook_scan_receipts.cjs
git diff --cached --check
```

All four PostgreSQL binaries report version 18.6. The runner creates a random `/tmp/unica475-pg-*` directory. It uses `initdb -A trust --no-locale -U fixture_owner`. It starts `pg_ctl` with a private Unix socket, port 5432, and `listen_addresses=''`. Clients set a 12-second statement timeout and a 100 ms deadlock timeout. The runner stops the server and removes the directory on success or failure. Cleanup also handles SIGINT and SIGTERM.

The runner was repeated only after changed tests, an assertion failure, or a remaining concern. Early runs found a bigint assertion type mismatch, the native time-zone difference, and an invalid test setup that tried to start two calibration jobs under the one-active-job limit. The concurrency test now completes calibration first and races the production Save callbacks. An incomplete initial JavaScript file failed its first syntax probe before the runner was finished. No candidate SQL was copied into a fake implementation to correct a test.

Final scope checks found no tracked change outside the owned paths. A process check found no owned PostgreSQL server. A directory check found no remaining `/tmp/unica475-pg-*` cluster. A text check found no em dash in the owned source files. The timestamp check found one migration with the required prefix. `SCOPED_SYNTAX_TEXT_CLUSTER_SCOPE_OK` passed. The SQL contains no `now()` call.

## Fixture limits and root work

The fixture reduces Auth, Storage, admin membership, workbook, child, audit, and profile dependency tables. It imports production scan/photo/calibration/S4/S5/delivery/correction functions and the new migration. It imports production family and child fences. It removes two duplicate dependency key declarations because the reduced tables already declare those keys. It does not change candidate SQL or existing RPC bodies. A catalog comparison proves that the migration leaves every pre-existing loaded public function definition and ACL unchanged.

The fixture does not run Supabase Auth, PostgREST, a Storage daemon, the byte decoder, image calibration, a model, or a scheduler. Synthetic objects carry Storage metadata. Synthetic ready results stand in for the existing trusted quality pipeline. The immutable published manifest and print-contract truth remain upstream contracts. Full hosted workbook print locks and deletion workers are not reconstructed. Child tombstone checks are real fence calls, but the test does not run the complete hosted child-deletion workflow. The family deletion checks use real FK cascades in the reduced schema. No provider spend, learning-event publication, or profile rebuild was needed.

Root still owns:

- Independent review of the exact SQL/test head and this handoff.
- Hosted migration application, migration-list verification, and schema/function probes on project `cdjobwsyzndtltzfpyqa`.
- Hosted PostgreSQL 17 compatibility, default privilege/RLS behavior, admin reads, complete deletion workflows, and Storage metadata checks.
- Hosted/production time-zone parity, including the explicit native-data discrepancy above.
- Generated database types and typed store adapters.
- TypeScript store/API/UI integration and progress readers.
- Inactivity episodes, aggregation, unsubscribe, reminder dispatch, and later scheduler activation.
- S12 snapshot scope/preparation/queue integration and result consumption.
- The full test/lint/build/browser gate, push, PR, and merge.

No hosted database or service access, Keychain read, credential lookup, paid call, mail, browser, workbook generation, customer Prepare action, family switch, push, PR, merge, live migration, generated-type edit, or D-number reservation occurred.

Root can change `HANDOFF_READY` to its consumed marker after integration.
