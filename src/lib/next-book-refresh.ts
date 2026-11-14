// D-308 (#476) admin screens: "New marks since this draft", "Update with new marks" and "Update first?" before "Approve
// for print". Reads and writes go through the snapshot store seam (src/lib/next-book-snapshot.ts); no Next.js or React.
// A refresh writes the chain's next revision and plans it. It starts no run and does not draw pages again: redrawing
// only the pages whose plan changed is the planner owner's later step (docs/next-book-snapshot.md).
import "server-only";
import { newEvidenceSince, prepareNextBook, refreshNextBookSnapshot, type NextBookDeps, type NextBookSnapshotStore,
  type SnapshotActor } from "./next-book-snapshot";
import type { ApproveResult } from "./workbook-ship";

export type DraftNewMarks =
  /** Not a next-book draft (no snapshot chain made it). */
  | { kind: "none" }
  /** The revision the draft's pages were drawn from used every mark there is, and no later revision exists. */
  | { kind: "current"; snapshotId: string; revision: number }
  /**
   * Marks the draft's pages were not drawn from. `snapshotId`/`revision`: the drawn revision; days, pages and items: the
   * marks since it. `updated`: a later plan version "Update with new marks" wrote (the pages are not drawn again yet).
   * `unfinished`: a later revision written but not yet planned (press again to finish it). `canUpdate`: a press has work.
   */
  | { kind: "new"; snapshotId: string; revision: number; days: number[]; pages: number; items: number; line: string;
    updated: number | null; unfinished: number | null; canUpdate: boolean }
  /** The check could not be read (a revision not frozen yet, or evidence that does not compare). */
  | { kind: "unavailable" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Days 1, 8-9": consecutive days joined into a range. */
function dayList(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
    i = j;
  }
  return `${sorted.length === 1 ? "Day" : "Days"} ${parts.join(", ")}`;
}

export const newMarksLine = (days: readonly number[], pages: number) =>
  `New marks since this draft: ${dayList(days)} (${plural(pages, "page")})`;

/**
 * The run page's check: the marks of the current book the draft's pages were not drawn from. The pages come from the
 * run's snapshot revision; "Update with new marks" writes and plans later revisions but draws nothing again, so a later
 * revision still counts as marks not in this draft.
 */
export async function draftNewMarks(store: NextBookSnapshotStore, draftId: string): Promise<DraftNewMarks> {
  const drawn = await store.drawnForDraft(draftId);
  if (!drawn) return { kind: "none" };
  const latest = (await store.latestForDraft(draftId)) ?? drawn;
  const fresh = await newEvidenceSince(store, drawn.id);
  if (!fresh.ok) return { kind: "unavailable" };
  const later = latest.revision > drawn.revision ? latest : null;
  if (!later && fresh.items === 0) return { kind: "current", snapshotId: drawn.id, revision: drawn.revision };
  let canUpdate = true;
  if (later?.plan) {
    const since = await newEvidenceSince(store, later.id);
    if (!since.ok) return { kind: "unavailable" };
    canUpdate = since.items > 0;
  }
  return { kind: "new", snapshotId: drawn.id, revision: drawn.revision, days: fresh.days, pages: fresh.pages, items: fresh.items,
    line: fresh.items > 0 ? newMarksLine(fresh.days, fresh.pages) : `New marks since this draft: plan version ${later!.revision}`,
    updated: later?.plan ? later.revision : null, unfinished: later && !later.plan ? later.revision : null, canUpdate };
}

/** What the run page shows of the check (src/components/workbook-ship-actions.tsx). `ready`: the planner is wired. */
export type NewMarksView =
  | { state: "none" }
  | { state: "current"; ready: boolean }
  | { state: "unavailable"; ready: boolean }
  | { state: "new"; line: string; updated: number | null; unfinished: number | null; canUpdate: boolean; ready: boolean };

export function newMarksView(marks: DraftNewMarks, ready: boolean): NewMarksView {
  if (marks.kind === "none") return { state: "none" };
  if (marks.kind === "new") return { state: "new", line: marks.line, updated: marks.updated, unfinished: marks.unfinished, canUpdate: marks.canUpdate, ready };
  return { state: marks.kind, ready };
}

export type UpdateAnswer =
  | { ok: true; line: string }
  /** `unfinished`: the revision was written, its plan was not; a press again plans it. */
  | { ok: false; error: "not-found" | "planner-not-ready" | "refused" | "unavailable" | "unfinished"; line: string };

const PLANNER_NOT_READY = "The planner is not ready yet.";
const TRY_AGAIN = "It could not be updated. Try again later.";

function refusedLine(reason: string): string {
  switch (reason) {
    case "no-new-evidence": return "No new marks since this draft.";
    case "already-approved": return "This draft is already approved for print.";
    case "source-changed": return "Book 1 changed, so this draft can no longer be updated.";
    case "family-unavailable": return "This family is being deleted.";
    case "child-unavailable": return "This child is being deleted.";
    case "stale-revision": return "This draft was updated meanwhile. Reload the page.";
    default: return TRY_AGAIN;
  }
}

/**
 * "Update with new marks": the chain's next revision, frozen now over every marked day of the book, then planned with the
 * same planner. Re-entrant: a press after a failed plan plans the revision the last press wrote. With no planner
 * (`deps` null) nothing is read or written.
 */
export async function updateDraftWithNewMarks(draftId: string, actor: SnapshotActor, deps: NextBookDeps | null, now: number): Promise<UpdateAnswer> {
  if (!deps) return { ok: false, error: "planner-not-ready", line: PLANNER_NOT_READY };
  const refreshed = await refreshNextBookSnapshot(draftId, actor, deps, now);
  if (!refreshed.ok) {
    if (refreshed.reason === "draft-not-found" || refreshed.reason === "admin-required" || refreshed.reason === "draft-mismatch") {
      return { ok: false, error: "not-found", line: "Not found." };
    }
    const line = refusedLine(refreshed.reason);
    return { ok: false, error: line === TRY_AGAIN ? "unavailable" : "refused", line };
  }
  const planned = await prepareNextBook({ kind: "snapshot", snapshotId: refreshed.snapshotId }, deps, now);
  if (planned.status === "planned" && planned.admission === "refresh") {
    return { ok: true, line: `Plan updated with the new marks (plan version ${planned.revision}). The pages are not drawn again yet.` };
  }
  return { ok: false, error: "unfinished", line: "The new marks were saved, but the plan was not updated. Press Update with new marks again." };
}

/** The audit note of an approval made although the draft had not used every mark ("Approve anyway"). */
export interface ApprovalNote {
  draftId: string;
  actor: SnapshotActor;
  detail: { revision: number; snapshotId: string; snapshotRevision: number; newMarkDays: number[]; newMarkPages: number; newMarkItems: number }
    /** Approved anyway while the check could not be read. */
    | { revision: number; checkUnavailable: true };
}

export interface ApprovalCheckDeps {
  store: NextBookSnapshotStore;
  /** The run's draft and its snapshot (null: not a next book), or null when the run has no draft. Throws on a failed read. */
  runDraft(runId: string): Promise<{ draftId: string; snapshotId: string | null } | null>;
  /** The existing approval (approveDraft), with its own audit entry. */
  approve(): Promise<ApproveResult>;
  /** Writes the note beside the approval's audit entry. */
  note(note: ApprovalNote): Promise<void>;
}

export type CheckedApproval =
  | { status: "ask-update"; line: string }
  /** A next-book draft whose check could not be read: approved only with "Approve anyway". */
  | { status: "check-unavailable"; line: string }
  | Exclude<ApproveResult, { status: "approved" }>
  /** `noted`: only on an approval anyway; false when the note could not be written (the approval stands). */
  | { status: "approved"; workbookId: string; noted?: boolean };

export const CHECK_UNAVAILABLE = "The new marks could not be checked";

/**
 * "Approve for print" with the D-308 check: a next-book draft whose pages were not drawn from every mark is not approved
 * unless the admin chose "Approve anyway" (`despiteNewMarks`); the answer asks "Update first?" instead. The check fails
 * closed for a next-book draft: when it cannot be read, the answer is check-unavailable until "Approve anyway". An
 * approval anyway is noted in the workbook audit after it commits. A draft that is not a next book is never checked.
 */
export async function approveCheckingNewMarks(o: { runId: string; revision: number; actor: SnapshotActor; despiteNewMarks: boolean },
  deps: ApprovalCheckDeps): Promise<CheckedApproval> {
  const run = await deps.runDraft(o.runId);
  let marks: DraftNewMarks = { kind: "none" };
  if (run?.snapshotId) {
    try { marks = await draftNewMarks(deps.store, run.draftId); } catch { marks = { kind: "unavailable" }; }
    // The run has a snapshot, so a draft the chain no longer finds is not known to be current.
    if (marks.kind === "none") marks = { kind: "unavailable" };
  }
  if (!o.despiteNewMarks) {
    if (marks.kind === "new") return { status: "ask-update", line: marks.line };
    if (marks.kind === "unavailable") return { status: "check-unavailable", line: CHECK_UNAVAILABLE };
  }
  const result = await deps.approve();
  if (result.status !== "approved" || !run || (marks.kind !== "new" && marks.kind !== "unavailable")) return result;
  try {
    await deps.note({ draftId: run.draftId, actor: o.actor, detail: marks.kind === "unavailable" ? { revision: o.revision, checkUnavailable: true }
      : { revision: o.revision, snapshotId: marks.snapshotId, snapshotRevision: marks.revision, newMarkDays: marks.days, newMarkPages: marks.pages, newMarkItems: marks.items } });
    return { ...result, noted: true };
  } catch {
    return { ...result, noted: false };
  }
}
