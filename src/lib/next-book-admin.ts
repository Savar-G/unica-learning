// The admin's "Prepare from snapshot" on the child page (#476). It calls prepareNextBook as the admin action on the
// child's delivered book 1: the book's claim if there is one, else an admin_prepare chain. The answer is one status line
// in plain admin words. With no planner it writes nothing and says so. Times are the family's (src/lib/family-time.ts).
import "server-only";
import { familyTime, type FamilyZone } from "./family-time";
import type { NextBookPlanner, PrepareOutcome, SnapshotActor } from "./next-book-snapshot";
import type { PrepareCall } from "./next-book-step";

export interface AdminNextBookFamily {
  parentId: string;
  /** The family asked to be deleted: nothing is written for it. */
  deleting: boolean;
  /** The child's book 1, when it has a delivery receipt. */
  deliveredBook1: string | null;
  zone: FamilyZone;
}

export interface AdminNextBookDeps {
  /** nextBookPlanner() in production; tests pass a fake. */
  planner: NextBookPlanner | null;
  prepare(planner: NextBookPlanner): PrepareCall | null;
  /** The child's family, or null for an unknown child. */
  family(childId: string): Promise<AdminNextBookFamily | null>;
  now(): number;
}

export type AdminNextBookAnswer =
  | { ok: true; line: string }
  | { ok: false; error: "not-found" | "family-deleting" | "no-delivered-book" | "planner-not-ready" | "refused" | "unavailable"; line: string };

export const PLANNER_NOT_READY = "The planner is not ready yet.";
const TRY_AGAIN = "It could not be prepared. Try again later.";

/** The status line for one answer of prepareNextBook. */
export function nextBookLine(outcome: PrepareOutcome, zone: FamilyZone): string {
  switch (outcome.status) {
    case "waiting": return `Waiting for the last marks (until ${familyTime(outcome.until, zone)}).`;
    case "held": return outcome.reason === "no-accepted-scans-at-backstop" ? "On hold: no pages scanned." : "No marked pages yet.";
    case "unsupported-source-book": return "Only book 1 can be used for now.";
    case "queued": return "Next book queued.";
    case "planned": return "Next book planned. It is queued after the workbook being made now; press again then.";
    case "refused":
      switch (outcome.reason) {
        case "next-book-exists": return "This book already has a next book.";
        case "no-accepted-scans": return "On hold: no pages scanned.";
        case "missing-delivery": return "Book 1 has not been delivered yet.";
        case "family-unavailable": return "This family is being deleted.";
        case "child-unavailable": return "This child is being deleted.";
        case "source-changed": return "This book can no longer be used for the next book.";
        default: return TRY_AGAIN;
      }
  }
}

export async function prepareFromSnapshot(admin: SnapshotActor | null, childId: string, deps: AdminNextBookDeps): Promise<AdminNextBookAnswer> {
  if (!admin) return { ok: false, error: "not-found", line: "Not found." };
  // Before any read or write: no admin_prepare chain is made without a planner.
  const prepare = deps.planner ? deps.prepare(deps.planner) : null;
  if (!prepare) return { ok: false, error: "planner-not-ready", line: PLANNER_NOT_READY };
  try {
    const family = await deps.family(childId);
    if (!family) return { ok: false, error: "not-found", line: "Not found." };
    if (family.deleting) return { ok: false, error: "family-deleting", line: "This family is being deleted." };
    if (!family.deliveredBook1) return { ok: false, error: "no-delivered-book", line: "Book 1 has not been delivered yet." };
    const outcome = await prepare({ kind: "admin", workbookId: family.deliveredBook1, actor: admin }, deps.now());
    if (outcome.status === "refused" && outcome.reason === "admin-required") return { ok: false, error: "not-found", line: "Not found." };
    const line = nextBookLine(outcome, family.zone);
    return outcome.status === "refused" ? { ok: false, error: "refused", line } : { ok: true, line };
  } catch {
    return { ok: false, error: "unavailable", line: TRY_AGAIN };
  }
}
