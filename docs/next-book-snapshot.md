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
   - **held for later**: results outside the days in scope, after the cutoff, or for other skills.
3. **Scope.** A Day 7 snapshot uses current-book Days 1 to 7 only. Days 8 to 10, even if scanned early, are held
   for later. A backstop or admin snapshot uses every accepted day.
4. **Plan.** The planner gets the frozen snapshot and history. It answers with the plan input, the plan, its hash,
   what it **consumed** and what it **held**. If it names anything outside the ledger, or at another version, the
   plan is refused. The plan is saved once. The same plan again is a retry; a different one is refused.
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

## Who calls it

Two callers run `prepareNextBook`. Both use one planner resolver, `nextBookPlanner()` (with `nextBookSelection()`, in
`src/lib/next-book-planner.ts`). Both return `null` until the planner owner wires them. While either is `null`, neither
caller reads or writes anything: no claim becomes a chain, no hold row is written, no run starts.

**The automatic step.** One more step of the `/api/reminders` run (every 15 minutes), after the #475 scan maintenance,
inside the same 55 seconds (`src/lib/next-book-step.ts`). One read builds the due list, oldest first by its anchor time,
at most 20 items (`NEXT_BOOK_STEP_LIMIT`):

- a trigger claim of a book 1 with no snapshot chain yet (anchor: the claim time);
- a live chain that is not frozen, planned or admitted yet (anchor: `prepare_from`);
- a #628 hold with no held snapshot row yet (anchor: the hold time).

Each item is prepared in that order. No item starts with less than 8 seconds left. A waiting chain costs one cheap read
and stops waiting by its freeze deadline (30 minutes), and a claim or a hold leaves the list on its first call, so the
oldest items do not block later ones for long. A failed or cut read ends the step for that run with no writes; the next
run tries again. An error on one item is counted, and the step goes on. The run's answer adds `nextBook`: counts by
outcome (`waiting`, `held`, `queued`, `refused:<reason>`, ...), never a family's details.

**The release switch `NEXT_BOOK_PREPARE_ENABLED`.** Unset or any other value: off, and the step does not run.

- `test-only`: only the parents in `WORKBOOK_SCAN_TEST_PARENT_IDS` that are still marked in `test_accounts`. The due list
  is read for those parents only. The mark is read again right before each item.
- `families`: those, and real families whose child has an open plan (`childPlanAccess`), read again right before each item.

A malformed parent list (not UUIDs, a repeat, more than 20) turns the step off in both modes.

**The admin button "Prepare from snapshot".** On the admin child page, beside "Prepare next workbook", for the child's
delivered book 1 (`src/components/prepare-from-snapshot.tsx`, route `POST /api/admin/children/<id>/next-book`,
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

## Where things are

| Piece | File |
|---|---|
| Table, column and functions | `supabase/migrations/20261109050245_next_book_snapshots.sql` (applied as version 20261109050245) |
| Contract, consumer and the three calls | `src/lib/next-book-snapshot.ts` |
| Memory store (tests) | `src/lib/next-book-snapshot-memory.ts` |
| Supabase store | `src/lib/next-book-snapshot-store.ts` |
| Server entry | `src/lib/next-book-snapshot-server.ts` |
| Planner resolver (null for now) | `src/lib/next-book-planner.ts` |
| Automatic step, due readers, server wiring | `src/lib/next-book-step.ts`, `next-book-step-store.ts`, `next-book-step-memory.ts`, `next-book-step-server.ts` |
| Admin button | `src/lib/next-book-admin.ts`, `next-book-admin-server.ts`, `src/app/api/admin/children/[id]/next-book/route.ts` |
| Book 1 capture | `captureBook1Progress` in `src/lib/workbook-book1-preview.ts` |
| Tests | `src/lib/next-book-snapshot-flow.test.ts`, `src/lib/next-book-snapshot.test.ts`, `src/lib/next-book-step.test.ts`, `src/lib/next-book-step-store.test.ts`, `src/lib/next-book-admin.test.ts` |

The database functions are service-only:

| Function | What it does |
|---|---|
| `claim_next_book_snapshot` | Revision 1 for a claim, or for the admin action. Returns the one chain. |
| `hold_next_book_snapshot` | Records the #628 held chain. A live chain wins over it. |
| `save_next_book_snapshot` | Freezes once. A later call gets the first freeze back. |
| `save_next_book_plan` | Saves the plan once. Refuses `consumed` outside the ledger. |
| `retake_next_book_snapshot` | Writes revision n+1 for the draft. Refused after approval or a source change. |
| `admit_next_book_run` | Starts one run per chain through `start_workbook_run`. |

## Not built yet

- The worker does not read `plan_input` yet. The planner owner adds that for runs with a `snapshot_id`.
- No real planner and no step selection are wired: `nextBookPlanner()` and `nextBookSelection()` return `null`, so both
  callers stop before any write. Until the worker reads `plan_input`, keep the switch off or `test-only`.
- The run is not routed to the Mac worker. A queued run stays on the default runner until a caller routes it.
