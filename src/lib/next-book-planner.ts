// The one place the next-book planner is wired (#476). Both callers of prepareNextBook use it: the automatic step in
// the /api/next-book-prepare cron route (src/lib/next-book-step-server.ts) and the admin's "Prepare from snapshot" on
// the child page.
//
// Both resolvers return null until the planner owner wires the real planner (planNextBookFromSnapshot) and the taught
// step the snapshot samples. With either one null, neither caller reads or writes anything: no claim, no hold row, no run.
import "server-only";
import type { NextBookPlanner } from "./next-book-snapshot";
import type { NextBookSelection, NextBookServerOptions } from "./next-book-snapshot-server";

/** The planner the snapshot hands its frozen evidence to. Null: the planner is not ready yet. */
export function nextBookPlanner(): NextBookPlanner | null {
  return null;
}

/** Which taught step the snapshot's sample is for. The planner owner wires it with the planner. */
export function nextBookSelection(): NextBookSelection | null {
  return null;
}

/** Both pieces, or null when either is missing. */
export function nextBookWiring(planner = nextBookPlanner(), selection = nextBookSelection()): NextBookServerOptions | null {
  return planner && selection ? { planner, selection } : null;
}
