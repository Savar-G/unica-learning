# #472 Book 1 progress baseline: implementation handoff

HANDOFF_READY

## Where

- Machine: Savars-MacBook-Pro-5.local
- Path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-edb46f91`
- Branch: `site/workbook-book1-baseline-472b` (renamed from `t3/edb46f91`)
- Base: main #701 `397e63b55a1a49a238b0200c3c04ca363495bad3`
- Started from the cancelled Codex WIP `65cd0aac38b732e52c966f5024839499d5ababdf` (fast-forward)
- Code head: `0927bed1`. This handoff file is the one commit on top of it; the final line of the sub-agent's reply names the exact head.
- Nothing was pushed. No PR, no merge, no migration applied, `database.types.ts` untouched.

## What was kept from the WIP, and what changed

- Kept: `workbook-progress-hash.ts` (the shared canonical hash, moved out of the source loader), and the capture hook in `planNextWorkbook` (a `structuredClone` of the exact `PlanInput`, taken just before `planWorkbook`).
- Changed: the job now stores `RunFrame.planning = { version: 1, input, placement }`. `placement` is the frozen placement facts the planner read: curriculum key and version, grade, the profile, report, device, earlier workbooks and run number. Without it, book 2 could not be planned from the frozen Book 1 inputs. The WIP's `planningInput` alone was not enough.
- Rewritten: `workbook-book1-baseline.ts` and `workbook-correction-journal.ts`. The WIP's hard-coded tree and blob constants are gone: the loader now reads them from Git when it loads the pin.
- Filled in: the empty migration `20261107161035_workbook_book1_baseline.sql`.

## Defects found in merged code (fixed here)

1. **Extra-practice pages broke the v1 source loader.** `validateCatalog` (it was `evaluateWorkbookProgressSources`) required `Day N` on every page with questions. A real approved-v1 book has "Extra practice" pages, which print questions with `day: null` and are in no manifest day. In the synthetic job book these are pages 83 and 84 of 84. Any such shipped book threw `invalid-source`, which very likely includes the customer's 84-page book. Fix: these "undated" pages are now fully validated, are outside every day sample, and their marks, changes, events and second tries are held (`held.undatedMarks`). Regression test: "extra practice pages (no day)".
2. **The mastery gap now has its own name.** `readWorkbookProgressHistory` used to report it as `invalid-record`. It now reports it as `mastery-gap`, an addition to `HistoryRefusal`. One merged test expectation was updated to match (`workbook-progress-history.test.ts`, "still refuses an actual selected mastery gap").

## Files

New:
- `src/lib/workbook-book1-baseline.ts`: the planning-capture proof, the baseline record (create, read, binding check) and `book2Planning`.
- `src/lib/workbook-book1-recovery.ts`: `recoverBook1PlanningInput`, the recovery verifier and its refusal contract.
- `src/lib/workbook-book1-pinned.ts`: `loadPinnedPlanningEngine(pin)`. It uses async esbuild `build` and reads every `src/` and `data/` file with `git show <pin>:<path>`, wrapping `planWorkbook` so each call is recorded. It reports the tree, the placement blob, and the Git blob id of every file it read.
- `src/lib/workbook-book1-preview.ts`: `evaluateBook1Preview`, the positive path, and `PREVIEW_ENGINE_V2`.
- `src/lib/workbook-book1-store.ts`: the SQL transport interface (`Book1BaselineSql`), the repository, the source reader, the #471 second-try seam (`secondTryLedger`) and the `captureBook1Baseline` orchestrator.
- `src/lib/workbook-correction-journal.ts`: `readBook1Corrections`, which reads the boundary and the ledger.
- `src/lib/workbook-book1.fixture.ts`: a synthetic Book 1 built by the real job with the fake AI, fake print engine and real templates.
- Tests: `src/lib/workbook-book1-preview.test.ts`, `src/lib/workbook-book1-recovery.test.ts`, `src/lib/workbook-book1-store.test.ts`.
- `supabase/migrations/20261107161035_workbook_book1_baseline.sql`.
- `supabase/tests/workbook_book1_baseline.cjs` and `supabase/tests/workbook_book1_baseline_fixture.sql`.

Changed:
- `src/lib/workbook-placement.ts`: the capture hook.
- `src/lib/workbook-job.ts`: `RunPlanningCapture`, and the frame comment.
- `src/lib/workbook-progress-source.ts`: `validateCatalog`, undated pages, v2 frozen types, overloads, the v2 load path.
- `src/lib/workbook-progress-source-store.ts`: an optional Book 1 reader, which makes the capture v2.
- `src/lib/workbook-preview-record.ts`: `createWorkbookPreviewRecordAny` and `replayWorkbookPreviewAny`. The v1 functions are unchanged.
- `src/lib/workbook-preview-store.ts` and `src/lib/workbook-preview-server.ts`: they use the `Any` replay and create.
- `src/lib/workbook-progress-history.ts`: the `mastery-gap` refusal.
- `src/lib/workbook-progress-history.test.ts`: one expectation.
- `supabase/tests/workbook_preview_sources.cjs`: an optional `--with-book1` flag.

Untouched: the `/admin/children/[id]/preview-plan` UI. No API route was added. Marking writers, results, eligibility and `scan_mark_changes` are unchanged, and so are `database.types.ts` and `AGENTS.md`.

## Proof (synthetic data, public interfaces, real plan output)

Focused Vitest, `--maxWorkers=1`, over 24 files: the new suites plus every touched or neighbouring suite (job, job-store, job-profile, placement, preview record/server/sql, print contract, ship, progress core/history/plan/source/source-store, plan steps, consistency, cover line, why, personal items, generator personal).
- Result: **692 tests passed, 0 failed**, after the one expectation update above. The new suites alone have **60 cases**: 27 positive, 33 refusal or hold.

Positive cases (27):
- The final draft revision is bound before any workbook row exists, through `approvalProblems` and `approvedWorkbook`, and nothing is written.
- Planning: the stored PlanInput equals the frame capture and its hash. Starting mastery is the explicit `{}`. Book 2 is computed from the frozen Book 1 inputs (workbook 2, in level 1, passed `{}`, no reviews), and the original PlanInput is unchanged afterwards.
- Decisions, each through a real `planWorkbook` plan:
  - A complete sample at 90% or more advances to step 2.
  - 75% to under 90% repeats with new numbers, with `priorRepeats` 0 and `repeatIncrement` 1.
  - An incomplete sample retains (unfinished).
  - Below 75% with unknown causes retains for review; no cause is guessed.
- Corrections and adjudications:
  - A version-bound second try clears its miss and leaves the score the same.
  - A parent's "Change this mark" changes the first score: it is an original adjudication.
  - Maya's correct final answer is not a second try.
- Holds:
  - Days 8 to 10 are held out of Day 7; the later scope includes them.
  - Late second tries are held (`after-cutoff`), and so are tries based on a result version newer than the cutoff (`version-after-cutoff`) and late parent changes.
  - Extra-practice marks are held.
- Records: v2 records save and replay, and v1 records still replay. The v2 loader detects a change during the read.
- Capture: saved once, then duplicate, then an exact read-back.
- Recovery and the pinned planner:
  - Exact recovery with the real de9404ee planner for 4 synthetic personas and a no-profile book.
  - The pinned bundle uses the pin's own Git blobs, not the working tree.
  - Default outputs are unchanged: for 5 cases, `planNextWorkbook` (with and without capture) gives a plan and a planner input byte-equal to main #701 (`397e63b5`), loaded from Git.

Refusal and hold cases (33):
- Records and policy: a tampered or re-encoded baseline; not Book 1; a capture that carries mastery.
- Phantom prior mastery: step 2 at 100% is refused with `history-mastery-gap`.
- #628: no marked scan gives `held`, `no-marked-scans`. A missing baseline gives the v1 unavailable outcome.
- Conflicts:
  - Owner: the child or another family's baseline.
  - R3: the approval revision is 3.
  - Frame, or another run.
  - Activity before the boundary: a mark, or a Maya call event.
  - Book: two books, or a step that was never printed.
  - Cutoff before delivery or before the boundary.
  - An incomplete ledger count, or a non-zero initial activity.
  - Second tries: on a right answer, before their version, on an unknown version, for another baseline or for another item.
  - A forged printed revision.
- Capture: a revision the admin did not review; a missing draft; a legacy frame with no recovery or no sources; a frame other than the one approval reads; transport scope or hash mismatch; an unknown SQL answer; a forged read-back hash; malformed source answers; seam input refused before any call.
- Recovery (16): no engine; another build; no build; a frame that already has a capture; run 2; earlier workbooks; no frozen profile; another revision; a profile built after the frame; an unreadable profile; another curriculum version; no frozen report; a different plan; a different personal field; capacity fields on a legacy-policy frame; another profile substituted.

Local PostgreSQL 18 (`node supabase/tests/workbook_book1_baseline.cjs`): **11 of 11 pass**, 4 positive and 7 refusal.
- Concurrency: two concurrent exact saves give one row plus a duplicate; a conflicting id or payload is refused.
- Immutability: the owner's UPDATE fails with 55000; a service DELETE or INSERT fails with 42501.
- RLS: parent reads 0 rows; admin reads 1; anon gets 42501; browser RPC gets 42501.
- Null-safe payload checks.
- Refusals at save: `revision-changed`, `rendering-differs`, `not-book1-run`, `workbook-revision-differs`, and `activity-before-boundary` (a learning event, a scan receipt or a marking row).
- A revision written while the save waits on the draft lock is seen, and the save refuses.
- A parent freeze wins over a waiting save (55000). Family and child deletion fences refuse.
- Second-try ledger: a concurrent duplicate; a conflict; 6 refusals; immutable; parent 0 rows, admin 1.
- The source read binds the approved revision, returns the whole ledger, gives `missing` for an R3 approval, and gives `stale` after a frame or revision change.
- Preview v2 saves and is a duplicate on retry, and v1 still saves. A stale baseline hash or ledger count gives unavailable. A v2 `complete` outcome with no plan, a v2 non-complete outcome with a plan, a v1 `complete` outcome, or a missing `book1` is a conflict. A bad engine fails with 23514.
- Child deletion cascades every baseline, ledger row and preview.

The merged v1 SQL suite on top of this migration (`node supabase/tests/workbook_preview_sources.cjs --with-book1`): **15 of 15 pass**. It also passes without the flag.

Scoped lint: `npx eslint` on all 19 changed `src` files exits 0. Types: `npx next typegen` then `npx tsc --noEmit` shows no error in any changed file. Remaining tsc errors are image-module declarations outside this lane (`@/assets/img/*.jpg`).

Not run, as instructed: the full suite, `npm run build`, Chromium, the browser, hosted calls, models.

## Recovery contract and limits

`recoverBook1PlanningInput(sources, engine)` returns `{ ok, input, inputHash, proof }` or `{ ok: false, reason }`.

Inputs are only:
- the stored frame (as stored) and its `created_at`;
- the run number;
- the frozen profile record the frame names (`revision`, `built_at`, value).

The report and device come from the frame's own `plan.personal.report`. Today's profile is never read. The engine must be `loadPinnedPlanningEngine(frame.versions.build)`. The verifier requires all of these:
- One `planWorkbook` call.
- A plan equal to the frame plan in every top-level field except `days` and `extraPractice`, and only on an `approved-v1` frame.
- The empty-passed first-book policy.

Refusal reasons:
- `engine-unavailable`, `build-unknown`, `build-mismatch`
- `invalid-sources`, `not-book1`, `frame-has-capture`
- `profile-not-frozen`, `profile-revision-mismatch`, `profile-after-frame`, `profile-unreadable`
- `curriculum-version-mismatch`, `frozen-report-missing`
- `planner-refused`, `planner-call-count`, `plan-mismatch`
- `mastery-policy-unproved`

Limits:
- It proves only the PlanInput and placement facts. It proves no marking history; the customer has 0 rows, so the boundary starts at capture.
- **The customer's frozen profile exists only while `child_profiles` is still revision 6.** That table keeps one current profile per child, and any rebuild (a finished test's report job, a learning-card change) overwrites it. After that, recovery refuses with `profile-revision-mismatch` and the baseline cannot be made without an approved policy. Capture soon after R2. After capture, the baseline payload holds the profile.
- The pinned bundle takes `node_modules` packages from today's install, not the pin's, and resolves import paths against today's tree. If a file that existed at the pin has since been deleted or renamed, the build throws (fail closed). It worked for de9404ee from this branch.
- The engine needs the repository's Git objects and esbuild. It is a local controller tool and never runs in a Vercel function.

## Schema contracts (migration `20261107161035_workbook_book1_baseline.sql`, not applied)

**`public.workbook_book1_baselines`**
- One immutable row per `(draft_id, draft_revision)`. The id is the request id for retry and CAS.
- FKs: parents, `children(id, parent_id)`, `workbook_runs`, `workbook_drafts`, `workbook_draft_revisions(draft_id, revision)`, all `on delete cascade`.
- Checked columns:
  - `engine = 'book1-baseline/1'`
  - `planning_kind`
  - sha256 formats
  - `payload_hash = sha256(payload)`, with payload at most 4 MB
  - `initial_activity` must be the zero object.
- The database's own `db_content_hash`, `db_rendering_hash` and `db_frame_hash` are rechecked on every source read.
- `boundary_at` is the save's `clock_timestamp()`.

**`public.workbook_second_tries`**
- An append-only ledger: `source = 'child-written-answer'`, `engine = 'workbook-second-try/1'`.
- Links to the baseline, to `scan_marking_items(id)` (cascade), to `based_on_version`, and to the page and item identity copied from the marking row.
- Unique on `(item_row_id, based_on_version, evidence_reference)`.

Both tables:
- RLS on. All grants revoked, then select only for authenticated and service_role.
- Admin read goes through `workbook_book1_access` (live admin, no freeze, no family or child deletion). Parents and anon read nothing.
- Triggers: `fence_family_write`, `fence_child_delete_write`, and an immutable-update trigger (55000). No delete grant, so rows go only by cascade.

Functions (all `security definer`, service_role execute only):

`workbook_book1_baseline_command(p_action, p_actor, p_parent, p_child, p_run, p_draft, p_request, p_payload, p_hash)`
- Lock order: parent SHARE (`assert_family_writable`), then admin SHARE, then the `scan:<parent>` advisory lock, then the run SHARE, then the draft SHARE (which waits for revision writers), then the workbook SHARE.
- Save refusals:
  - `not-book1-run`
  - `revision-changed` (not the latest revision)
  - `rendering-differs` (the revision's `pdfSha256` is not the payload's)
  - `frame-missing`
  - `workbook-revision-differs`
  - `activity-before-boundary`: any marking item, mark change, learning event, scan receipt or second try for the draft id.
- Answers: `saved`, `duplicate`, `conflict` or `unavailable`.

`workbook_book1_sources(p_parent, p_child, p_workbook)`
- Picks the baseline whose revision equals the latest `workbook-approved` audit revision.
- Answers `found` (with `boundary_at`, `initial_activity`, `count` and every ledger row in id order), `missing`, `stale` or `unavailable`.

`record_workbook_second_try(p_id, p_baseline, p_item_row, p_based_on_version, p_result, p_help, p_evidence_reference)`
- This is #471's seam. It takes the scan lock.
- The version must be the item's current version, and that result must be a resolved wrong or blank answer.
- Idempotent by id.

Saved previews:
- The `workbook_plan_previews_engine_check` constraint is widened to the v1 engine plus `workbook-preview-sources/2;progress/1;history/1;plan-preview/1;book1-baseline/1`.
- `workbook_preview_command` is replaced:
  - v1 docs keep their exact rules.
  - v2 docs allow `unavailable`, `held` or `complete`. Only `complete` carries a decision and a plan.
  - At save time, the v2 baseline must still be the live row: same id, same payload hash, same boundary, same ledger count.
- Payload checks are now null-safe (`coalesce(..., true)`).

TS transport: `Book1BaselineSql` (`command`, `sources`, `secondTry`) is separate from the generated types. Root binds it to `db.rpc` after the types are regenerated. No cast bypasses the types.

## Exact capture steps for root, after R2

Order: **R2 save → baseline capture → comment closure → (Savar) print approval.**

1. **R2 save** (existing flow, root's authority). It makes draft revision 2 with its whole rendering (`pdfSha256` and print contracts). Record `runId`, `draftId` and `revision = 2`.
2. **Before capture**, read-only:
   - The run is `done` and `number = 1`.
   - The latest revision is 2, and its rendering has a whole contract (`approvedWorkbook(draft).printedRevision` is not null).
   - `child_profiles.revision` for the child is still 6, with `built_at` at or before the frame's `created_at`.
   - There is no `scan_marking_items`, `learning_events`, `workbook_scan_receipts` or `scan_mark_changes` for `draftId`.
3. **Baseline capture**: one call to `captureBook1Baseline(deps, { id: <new uuid>, actorId: <admin id>, parentId, childId, runId, revision: 2 })`, with these deps:
   - `draft`: `workbookShipStore(service).draftForApproval` (read only).
   - `frame`: the `workbook_run_frames` row, as `{ reference: "workbook_run_frames:<runId>", createdAt: created_at, frame }`.
   - `recovery.sources`: `{ version: 1, run: { id: runId, number: 1 }, frame: { reference, createdAt, value: frame }, profile: { reference: "child_profiles:<child>:6", revision: 6, builtAt: built_at, value: profile } }`.
   - `recovery.engine`: `pin => loadPinnedPlanningEngine(pin)`. Run it from a checkout that has commit de9404ee.
   - `repository`: `book1BaselineRepository(<db.rpc binding of workbook_book1_baseline_command>)`.

   Expect `{ status: "saved" }`. Then `inputHash` equals `5bba61c37c1c4eb60ab7f0489ccbdd879aab2f9785c8d098abb080b8d4befacc` (from `recovery-proof.json`). The read-back payload equals the record.
4. **Comment closure** (the 14 comments). If closure writes any new draft revision, the R2 baseline no longer binds. The save refuses a stale revision, and the source read answers `missing` or `stale`. In that case, capture again for the new revision before print approval.
5. **Print approval and shipping** are Savar's. After approval, `workbook_book1_sources(parent, child, draftId)` must answer `found` with the same id.
6. **Second tries**: #471 records them through `record_workbook_second_try`. Until then the ledger is a verified empty list after the boundary.

## Remaining root work

- Hosted:
  - Apply the migration with Supabase MCP `apply_migration`, project `cdjobwsyzndtltzfpyqa`.
  - Verify it: `list_migrations`, grants and RLS probes, a service save, read and rollback on synthetic rows.
  - Run `npm run db:types` and commit the types.
- Wiring:
  - Bind `Book1BaselineSql` to `db.rpc` for the 3 functions.
  - Pass `book1SourceReader(sql)` into `workbookProgressSourceStore(service, ...)` in `saveAdminWorkbookPreview`. That turns the preview into v2; there is no other caller.
- `AGENTS.md`:
  - The frames row says frames never hold profile content. Frames now keep the planning capture, including the frozen profile; admins only, deleted with the family.
  - Add the two new tables and three functions to the Supabase row.
- Review and gate: the serial full gate (`npm test && npx eslint src && npm run build`), and an independent Opus high review.
- Customer: run the capture steps above after R2.
- Out of scope here:
  - #473: multi-skill and spaced-review policy.
  - #476: trigger and snapshot.
  - Book 3 and later previews. The loader refuses `not-book2-scope` until book 2's issued decisions exist.
  - Undated (extra-practice) evidence stays held: no policy reads it yet.

## Obstacles to landing today

None blocking in code. Two timing risks:
- The customer's profile revision 6 must still be current at capture.
- Comment closure must not create a new draft revision after the capture, or the capture must be repeated before approval.
