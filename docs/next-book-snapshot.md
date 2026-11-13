# Next-book snapshot (#476, D-308)

When a child's first workbook has been used enough, we plan workbook 2 from what the child did. The snapshot is the
record of exactly what that plan saw. It is frozen once, so a later scan, a parent's mark change or a new profile
cannot change the draft quietly.

This slice covers book 1 to book 2 only. A source book numbered 2 or more answers `unsupported-source-book` and
queues nothing. It decides nothing about learning: no mastery threshold, repeat rule, review schedule or level. The
planner makes those decisions, behind a seam.

## Where it starts

There is one chain of snapshots per delivered workbook 1. Three paths reach it, and they all reach the same chain:

- **Day 7 scanned.** Every required Day 7 page has an accepted scan (#475 claim `day7_scanned`).
- **Backstop.** 21 local days after confirmed delivery without Day 7 (#475 claim `delivery_backstop`).
- **Admin: Prepare from snapshot.** Uses the book's claim if there is one. Otherwise it starts an `admin_prepare`
  chain, which needs a delivery receipt and at least one accepted scan.

If the backstop found no accepted scan at all, #475 records a hold instead of a claim. We then record the chain as
**held** (#628) and queue nothing. A later claim still starts the chain normally. A book with scans but no final mark
yet (every item still pending) is held too (`no-marked-scans`): nothing is written, and a later call drafts once a mark
is final.

Whichever path comes first wins. The others get the same chain and the same run back.

## What gets frozen

1. **Wait for marking, at most 30 minutes.** The claim names the accepted scans. If some of their marking jobs are
   still running, we wait. We freeze as soon as they all finish, or 30 minutes after the claim, whichever comes first.
   A missing key, the spending cap, a failed job or a deleted photo cannot hold the draft for longer.
2. **Freeze.** The freeze time is the cutoff. We store:
   - the progress snapshot and history the planner reads, with the frozen sources and history fence as proof;
   - the **ledger**: each final result in scope, by its item `(workbook, printed revision, page, item)` and version.
     The planner may use only these;
   - **pending** items: in the sample but not final yet (`pending`), or never scanned (`missing`). They stay pending.
     They never count as blank or wrong;
   - **held for later**: results outside the days in scope or after the cutoff.
   The capture (`src/lib/next-book-capture.ts`) picks no skill: the ledger holds the marks of every skill and step the
   printed Book 1 issued, on the days in scope, because the planner binds all of them. An item whose first mark is after the cutoff stays out of
   the history and the ledger (its state at the cutoff is not proved), as the planner holds it "after cutoff". Its rows
   stay in the frozen sources, and a refresh reads it as a new mark.
3. **Scope.** A Day 7 snapshot uses current-book Days 1 to 7 only. Days 8 to 10, even if scanned early, are held
   for later. A backstop or admin snapshot uses every accepted day.
4. **Plan.** The planner gets the frozen snapshot and history. It answers with the plan input, the plan, its hash,
   what it **consumed** and what it **held**. If it names anything outside the ledger, or at another version, the
   plan is refused. The plan is saved once. The same plan again is a retry; a different one is refused.
   If the planner refuses, its sentence is the chain's answer (`planner-<sentence>`). The chain stays frozen, with no
   plan and no run, and stays due, so the next step run asks the planner again.
5. **Queue one run.** The run is started through the ordinary run start (one active run per child). It is linked to
   the snapshot (`workbook_runs.snapshot_id`). If another run for the child is active, the answer is `planned`, and
   the next call admits the run. The run is always book 2: admission holds the child and its later drafts while it
   checks, so an approval of book 2 at the same moment is seen, and a run with any other number is undone.

Every step is safe to repeat. A retry, a lost answer or a restart reads back what is stored and continues from there.

## Update with new marks (D-308)

Before "Approve for print", an admin can refresh the draft when more pages were marked:

- `newEvidenceSince(snapshot)` lists marks of the current book that the draft did not use: marks made after the
  freeze, pending items marked since, parent changes, and early Days 8 to 10 that a Day 7 snapshot held for later.
  The admin page can show "New marks since this draft: Days 8-9 (n pages)".
- `refreshNextBookSnapshot(draft)` writes the next revision. It reads every marked day of the current book, at once,
  with no 30-minute wait. Pending marks stay pending. A refresh starts no new run: the planner owner redraws only the
  pages whose plan changed.
- A refresh is refused after approval for print, if the source book changed, for an older revision, and when there is
  no new mark. A refresh that started before an approval cannot freeze after it.
- Marks that arrive after approval are not used by that book. They stay for the profile and the book after next.

**The admin screens** (`src/lib/next-book-refresh.ts`, `next-book-refresh-server.ts`, `src/components/workbook-ship-actions.tsx`).
On the admin run page of a next-book draft not yet approved:

- `draftNewMarks` reads the chain's latest revision for the draft and `newEvidenceSince`. With new marks the page shows
  "New marks since this draft: Days 8-9 (2 pages)." and an "Update with new marks" button (disabled with "The planner is
  not ready yet." when no planner is wired). A read that fails shows "New marks status is unavailable."
- "Update with new marks" posts to `POST /api/admin/workbooks/runs/<id>/update-marks` (admins only, 404 for everyone
  else): `updateDraftWithNewMarks` calls `refreshNextBookSnapshot`, then `prepareNextBook({ kind: "snapshot" })` to plan
  the new revision. It starts no run. Its line: "Plan updated with the new marks (plan version n). The pages are not drawn
  again yet.", or the refusal ("No new marks since this draft.", "This draft is already approved for print.", "Book 1
  changed, so this draft can no longer be updated."). Pressing it again after a failed plan plans the same revision.
- "Approve for print" runs the same check on the server (`approveCheckingNewMarks` in the approve route). With new marks
  and no `despiteNewMarks: true` it approves nothing and answers `{ ok: false, askUpdate }` (409); the page asks "Update
  first?" with "Update with new marks", "Approve anyway" and "Cancel". A check that cannot be read does not hold the
  approval. "Approve anyway" approves through the usual `approve_workbook_draft` (its `workbook-approved` audit entry), then
  writes an `approved-with-new-marks` audit entry with the snapshot revision, days, pages and items, through the
  service-only `note_workbook_approved_with_new_marks` (migration `20261113233859_workbook_approved_with_new_marks.sql`).
  When the note cannot be written the approval stands and the route logs it.
- Not built: drawing again only the pages whose plan changed. Until the planner owner builds it, an update stores the new
  plan beside the draft and the printed pages stay those of the first plan.

## Who calls it

Two callers run `prepareNextBook`. Both use one planner resolver, `nextBookPlanner()` in `src/lib/next-book-planner.ts`.
With no planner (`null`), neither caller reads or writes anything: no claim becomes a chain, no hold row is written, no
run starts.

**Test families only, for now.** `NEXT_BOOK_REAL_FAMILIES` (`src/lib/next-book-planner.ts`) is `false`, so both callers
prepare only families in `public.test_accounts`, whatever `NEXT_BOOK_PREPARE_ENABLED` says. The worker now makes a
snapshot run from its saved `plan_input` ("The run" below); what is left before the flip is listed under "Not built yet".

While it is `false`:

- the admin button refuses any other family before any write, with "Only test families can get the next book for now.";
- the automatic step admits a family only when it is listed in `WORKBOOK_SCAN_TEST_PARENT_IDS` and still marked as a
  test; with `families`, it does not admit real families with an open plan.

The admission checks it again: both callers pass `testOnly` (`p_test_only` of `admit_next_book_run`), which refuses
with `test-families-only` unless the family is still in `public.test_accounts`. It locks that test row `FOR SHARE`
(migration `20261109195323_next_book_admit_row_lock.sql`), so a removal of the mark, by any path, waits for the
admission, and a removal that came first leaves no row to admit. A family unmarked while its plan runs gets no run. The admin page then shows "Only test families can get the next book for now."

## The run

**Routed to the runner (D-200).** `admit_next_book_run` starts the run through `start_workbook_run`, which leaves it on
the column default runner `'server'`, and the Mac worker claims only `'mac'` runs. `prepareNextBook` therefore calls
`deps.route(runId)` after each admission, and again whenever a chain that already has a run is prepared, so a route that
failed is tried again. The server wiring (`nextBookSnapshotServer`) routes with `route_workbook_run` to `workbookRunner()`,
the same runner "Prepare next workbook" uses: the Mac worker unless `WORKBOOK_RUNNER` is `server`. `route_workbook_run`
changes nothing for a run already on that runner or one being worked on. No migration: the function exists
(`20261101_workbook_mac_runner.sql`, `20261101_workbook_route_lease.sql`). With `WORKBOOK_RUNNER=server` nothing starts
the job of a next-book run on Vercel; an admin starts it from the run page.

**Made from the saved plan (#476).** A run with a `snapshot_id` makes its plan, on its first job call, only from the
snapshot's saved plan (`makeNextBookFrame` in `src/lib/workbook-job.ts`, through `WorkbookJobSource.nextBookPlan`).
The Supabase source calls `nextBookRunBook(store, snapshotId, curriculumVersion)` (`src/lib/next-book-snapshot.ts`):
`nextBookRunPlan` reads `plan_input` on the curriculum version it was made on, then the pure `planWorkbook` plans that
input again, and the result must hash to the saved `plan_hash` (as `planNextBookFromSnapshot` made it), else
`plan-mismatch`. The child is not read again for the plan: no profile refresh, no placement, no book instructions. The
frame keeps `nextBook: { snapshotId, planHash }` and then takes the same capacity steps and fingerprints as any run; a
resume uses the stored frame. A refusal (`curriculum-changed`, `curriculum-unrecorded`, `plan-mismatch`, or a snapshot
that cannot be read) fails the run with a plain error before any AI call, and nothing is planned again. A run without a
`snapshot_id` is planned as before.

## The planner

`nextBookPlanner()` wraps the planner owner's `planNextBookFromSnapshot` (`src/lib/workbook-next-book-snapshot.ts`).
For one frozen revision it passes:

- `sources`: the row's frozen `FrozenWorkbookSourcesV2`;
- `snapshot`: `id` the row id, `workbookId` the source book 1, `cutoff` the freeze time in epoch milliseconds,
  `scope` (below), and `issuedSkills`.

`issuedSkills` is `nextBookIssuedSkills(sources)`. It is a pure function of the frozen sources, which the row keeps, so
it is computed from them each time the chain plans, not stored at admission. When it is `null` (no valid Book 1 record),
the answer is "The Book 1 starting record is unavailable." and nothing is saved.

| Chain | `scope` |
|---|---|
| Revision 1 from a Day 7 claim (`day7_scanned`) | `day7` |
| Revision 1 from the backstop claim (`delivery_backstop`) | `backstop` |
| Revision 1 from the admin's "Prepare from snapshot" with no claim (`admin_prepare`) | `backstop` |
| Revision 2 or later (the D-308 refresh) | `later-book` |

The admin chain maps to `backstop` because the capture froze it over every accepted day, as for the backstop, and
`later-book` is the planner's pre-approval refresh (`docs/workbook-preview-marks.md`). A frozen scope that does not match
is refused ("The snapshot scope does not match its capture.").

The answer is stored as the planner gives it: `planHash`, `planningInput`, the plan, `held` (a printed review with no
question has a `null` key), and `consumed` with `version` (the planner's `effectiveVersion`), `firstVersion` and
`correctionIds`. `consumed` is checked against the ledger by key and version, in code and in `save_next_book_plan`.

**The plan's curriculum version (#812).** Book 2 is planned on today's curriculum, templates included (Book 1's
structure must still hold, `docs/next-book-curriculum-history.md`). The only version label inside the progress decisions
is Book 1's, so `planNextBookFromSnapshot` sets `planningInput.curriculum` to `{ key, version: curriculumVersion(key) }`
at planning time; `planHash` covers it, and `save_next_book_plan` stores it inside `plan_input` (any object), so no
migration is needed. The worker reads the plan with `nextBookRunPlan(store, snapshotId, curriculumVersion)`
(`src/lib/next-book-snapshot.ts`): it refuses `curriculum-changed` when the version it runs on differs, and
`curriculum-unrecorded` for a plan saved before this field existed. Nothing is planned again on a refusal.

The planner refuses a Book 1 record whose curriculum structure changed since, or whose version is not in the archive
(`nextBookCurriculumCompat`, `docs/next-book-curriculum-history.md`). That chain stays frozen and due until the planner
accepts it.

**The automatic step.** Its own cron route, `POST /api/next-book-prepare` (`src/app/api/next-book-prepare/route.ts`).
Supabase `pg_cron` posts to it every 15 minutes (job `next-book-prepare`, migration `20261109173906_next_book_prepare_cron.sql`), with the
reminders' Vault secrets: the URL is `reminders_url` with `/api/reminders` replaced, and `Authorization: Bearer <CRON_SECRET>`.
It is not part of `/api/reminders`: the step reads the plan gate (`childPlanAccess`), and no email sender may reach it
(`src/lib/plan-access-emails.test.ts`). The route sends no email. `?dry=1` answers at once and writes nothing. The step
has 55 seconds, inside the route's 60-second limit (`src/lib/next-book-step.ts`). It reads the due candidates in pages, oldest first by their
anchor time, through a keyset cursor (anchor time to the microsecond, kind, id): each page starts strictly after the
last, so many candidates at one identical time never hold the step on one page (#773):

- a trigger claim of a book 1 with no snapshot chain yet (anchor: the claim time);
- a live chain that is not frozen, planned or admitted yet (anchor: `prepare_from`);
- a #628 hold with no held snapshot row yet (anchor: the hold time).

Each candidate's access is checked right before its writes. Only a candidate that passes uses one of the 20 slots
(`NEXT_BOOK_STEP_LIMIT`); a skipped one never does, so older families the release leaves out cannot keep a newer one
waiting. The step keeps reading until 20 items were prepared, the candidates run out, or less than 8 seconds is left.
A waiting chain costs one cheap read and stops waiting by its freeze deadline (30 minutes), and a claim or a hold leaves
the list on its first call, so the oldest items do not block later ones for long.

One deadline covers the whole step: its time less one second. Every candidate read, access read and item races it
under one signal (#773). At the deadline the signal aborts: the database requests stop, a planner answer
that comes later is refused, and the step answers with what it did, never after its end. The step's client never
retries (`adminClient(signal, { retry: false })`): the SDK would otherwise retry a timed-out read after 1, 2 and 4
seconds, past the deadline. Every write the item already made is one atomic, re-entrant step, so the next run continues it.

A failed or cut first read ends the step for that run with no writes; the next run tries again. A failed later read
ends it with the items already prepared kept. An error on one item is counted, and the step goes on. The run's answer
adds `nextBook`: counts by outcome (`waiting`, `held`, `queued`, `refused:<reason>`, ...), never a family's details.

**The release switch `NEXT_BOOK_PREPARE_ENABLED`.** Unset or any other value: off, and the step does not run.

- `test-only`: only the parents in `WORKBOOK_SCAN_TEST_PARENT_IDS` that are still marked in `test_accounts`. The
  candidates are read for those parents only. The mark is read again right before each item.
- `families`: those, and real families whose child has an open plan (`childPlanAccess`), read again right before each item.

A malformed parent list (not UUIDs, a repeat, more than 20) turns the step off in both modes.

**The admin button "Prepare from snapshot".** On the admin child page, beside "Prepare next workbook", for the child's
delivered book 1. The page checks the planner first: with none it reads nothing for the button and shows it disabled
with "The planner is not ready yet." If its delivery read fails, it shows "Next book status is unavailable." and the rest
of the page still renders (`src/components/prepare-from-snapshot.tsx`, route `POST /api/admin/children/<id>/next-book`,
`src/lib/next-book-admin.ts`). Admins only. It refuses a family being deleted. It uses the book's claim if there is one,
else it starts an `admin_prepare` chain. Pressing it again continues where the last press stopped. It answers one status
line, with times in the family's time zone:

| Answer | Line |
|---|---|
| waiting | Waiting for the last marks (until 7:40 p.m.). |
| held, no accepted scan | On hold: no pages scanned. |
| held, no final mark | No marked pages yet. |
| unsupported source book | Only book 1 can be used for now. |
| queued | Next book queued. |
| refused, next book exists | This book already has a next book. |
| no planner | The planner is not ready yet. |
| not a test family (while `NEXT_BOOK_REAL_FAMILIES` is `false`) | Only test families can get the next book for now. |

**The admin page "Snapshot plan" (#473).** `/admin/children/<id>/snapshot-plan`, linked from "Plan the next book" on the
admin child page. It reads the child's latest snapshot row with the admin's session and writes nothing. For each skill it
lists the decision from the marks, the new steps the next book starts, the spaced reviews due and missed, the Fix it items
carried over and the marks held for a later book with their reason; held marks with no skill are counted by reason. The
row keeps the planner's input, not its plan, so the page runs the planner again on that input and shows the new steps
only when the result hashes to the saved plan hash; otherwise it says the planner has changed since the snapshot
(`src/lib/next-book-plan-view.ts`, `src/components/admin-snapshot-plan.tsx`).

## Where things are

| Piece | File |
|---|---|
| Table, column and functions | `supabase/migrations/20261109050245_next_book_snapshots.sql` (applied as version 20261109050245) |
| Contract, consumer and the three calls | `src/lib/next-book-snapshot.ts` |
| Memory store (tests) | `src/lib/next-book-snapshot-memory.ts` |
| Supabase store | `src/lib/next-book-snapshot-store.ts` |
| Server entry | `src/lib/next-book-snapshot-server.ts` |
| Planner adapter | `src/lib/next-book-planner.ts` |
| Automatic step, due readers, server wiring | `src/lib/next-book-step.ts`, `next-book-step-store.ts`, `next-book-step-memory.ts`, `next-book-step-server.ts` |
| Cron route and its job | `src/app/api/next-book-prepare/route.ts`, `supabase/migrations/20261109173906_next_book_prepare_cron.sql` |
| Admin button | `src/lib/next-book-admin.ts`, `next-book-admin-server.ts`, `next-book-button.ts`, `src/app/api/admin/children/[id]/next-book/route.ts` |
| Book 1 capture | `src/lib/next-book-capture.ts` |
| Tests | `src/lib/next-book-snapshot-flow.test.ts`, `src/lib/next-book-snapshot.test.ts`, `src/lib/next-book-step.test.ts`, `src/lib/next-book-step-store.test.ts`, `src/lib/next-book-admin.test.ts`, `src/lib/next-book-button.test.ts`, `src/lib/next-book-planner.test.ts` (the real planner) |

The database functions are service-only:

| Function | What it does |
|---|---|
| `claim_next_book_snapshot` | Revision 1 for a claim, or for the admin action. Returns the one chain. |
| `hold_next_book_snapshot` | Records the #628 held chain. A live chain wins over it. |
| `save_next_book_snapshot` | Freezes once. A later call gets the first freeze back. |
| `save_next_book_plan` | Saves the plan once. Refuses `consumed` outside the ledger. Takes the real planner's entry shapes (migration `20261109190616_next_book_plan_shape.sql`). |
| `retake_next_book_snapshot` | Writes revision n+1 for the draft. Refused after approval or a source change. |
| `admit_next_book_run` | Starts one run per chain through `start_workbook_run`. With `p_test_only` (migration `20261109192936_next_book_admit_test_only.sql`), only for a test family. |

## Not built yet

- `NEXT_BOOK_REAL_FAMILIES` is still `false`. The worker reads `plan_input` and the run is routed to the Mac worker
  (above). Before the flip: one test family's book 2 made end to end on the Mac worker from a snapshot (the run page
  shows it on the Mac, its frame has `nextBook`), drawing again the pages an "Update with new marks" changed, and
  Savar's go-ahead with `NEXT_BOOK_PREPARE_ENABLED`.
- A source book after Book 1 answers `unsupported-source-book`.
