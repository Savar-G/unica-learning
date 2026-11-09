// The one place the next-book planner is wired (#476). Both callers of prepareNextBook use it: the automatic step in
// the /api/next-book-prepare cron route (src/lib/next-book-step-server.ts) and the admin's "Prepare from snapshot" on
// the child page. Neither runs in production until NEXT_BOOK_PREPARE_ENABLED is set (the step) or an admin presses the
// button.
//
// The planner is the planner owner's pure planNextBookFromSnapshot (src/lib/workbook-next-book-snapshot.ts, #796). It
// reads the frozen sources of the snapshot row and binds every skill the printed Book 1 issued, so no step selection is
// wired: the capture (src/lib/next-book-capture.ts) freezes the marks of every skill in scope.
import "server-only";
import { nextBookIssuedSkills, planNextBookFromSnapshot, type NextBookSnapshot } from "./workbook-next-book-snapshot";
import type { FrozenNextBookSnapshot, NextBookPlanner } from "./next-book-snapshot";
import type { NextBookServerOptions } from "./next-book-snapshot-server";

/**
 * False until the workbook worker makes a run with a snapshot_id from its saved plan_input. Until then such a run is
 * planned with planNextWorkbook and does not use the marks, so both callers prepare test families
 * (public.test_accounts) only, whatever NEXT_BOOK_PREPARE_ENABLED says. Set it to true in the change that makes the
 * worker read plan_input.
 */
export const NEXT_BOOK_REAL_FAMILIES = false;

export const BOOK1_RECORD_UNAVAILABLE = "The Book 1 starting record is unavailable.";
export const SCOPE_MISMATCH = "The snapshot scope does not match its capture.";

/**
 * The planner's scope for one frozen revision:
 * - revision 2 or later (the D-308 refresh before "Approve for print"): `later-book`, every marked day;
 * - revision 1 from a Day 7 claim (`day7_scanned`): `day7`, Days 1-7 of the current book;
 * - revision 1 from the backstop claim (`delivery_backstop`): `backstop`, every accepted day;
 * - revision 1 from the admin's "Prepare from snapshot" with no claim (`admin_prepare`): `backstop`. The capture already
 *   froze that chain over every accepted day (scopeOf in next-book-snapshot.ts, save_next_book_snapshot's scope kind),
 *   and the planner's `later-book` is its pre-approval refresh (docs/workbook-preview-marks.md). For the planner the two
 *   differ only in the history's label: both read every printed day.
 */
export function plannerScope(f: Pick<FrozenNextBookSnapshot, "revision" | "reason">): NextBookSnapshot["scope"] {
  if (f.revision > 1) return "later-book";
  return f.reason === "day7_scanned" ? "day7" : "backstop";
}

/** The snapshot fields the planner reads, from one frozen row. Null when the Book 1 starting record is unavailable. */
export function plannerSnapshot(f: FrozenNextBookSnapshot): NextBookSnapshot | null {
  // A pure function of the frozen sources, which the row stores: computed here, not stored at admission.
  const issuedSkills = nextBookIssuedSkills(f.sources);
  if (!issuedSkills) return null;
  return { id: f.id, workbookId: f.sourceWorkbookId, cutoff: f.frozenAt, scope: plannerScope(f), issuedSkills };
}

/**
 * Our planner seam around planNextBookFromSnapshot. A refusal passes through as the planner's own plain sentence, and
 * nothing is saved. The consumed check against the ledger, by key and effective version, is prepareNextBook's (and
 * save_next_book_plan's), after this answer.
 */
export function snapshotPlanner(plan: typeof planNextBookFromSnapshot = planNextBookFromSnapshot): NextBookPlanner {
  return {
    async plan({ frozen }) {
      const snapshot = plannerSnapshot(frozen);
      if (!snapshot) return { ok: false, reason: BOOK1_RECORD_UNAVAILABLE };
      if (frozen.scope.request !== snapshot.scope) return { ok: false, reason: SCOPE_MISMATCH };
      const answer = plan({ sources: frozen.sources, snapshot });
      if (!answer.ok) return { ok: false, reason: answer.reason };
      return {
        ok: true, planHash: answer.planHash, planningInput: answer.planningInput, plan: answer.plan,
        consumed: answer.consumed.map(c => ({ key: c.key, version: c.effectiveVersion, firstVersion: c.firstVersion,
          ...(c.correctionIds ? { correctionIds: c.correctionIds } : {}) })),
        held: answer.held,
      };
    },
  };
}

/** The planner the snapshot hands its frozen evidence to. */
export function nextBookPlanner(): NextBookPlanner | null {
  return snapshotPlanner();
}

/** The callers' wiring, or null with no planner. */
export function nextBookWiring(planner = nextBookPlanner()): NextBookServerOptions | null {
  return planner ? { planner, testOnly: !NEXT_BOOK_REAL_FAMILIES } : null;
}
