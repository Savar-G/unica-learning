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
  /** The chain's latest revision used every mark there is. `revision` > 1: the draft was updated with new marks. */
  | { kind: "current"; snapshotId: string; revision: number }
  | { kind: "new"; snapshotId: string; revision: number; days: number[]; pages: number; items: number; line: string }
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

/** The run page's check: the marks of the current book the draft's latest snapshot revision did not use. */
export async function draftNewMarks(store: NextBookSnapshotStore, draftId: string): Promise<DraftNewMarks> {
  const latest = await store.latestForDraft(draftId);
  if (!latest) return { kind: "none" };
  const fresh = await newEvidenceSince(store, latest.id);
  if (!fresh.ok) return { kind: "unavailable" };
  if (fresh.items === 0) return { kind: "current", snapshotId: latest.id, revision: latest.revision };
  return { kind: "new", snapshotId: latest.id, revision: latest.revision, days: fresh.days, pages: fresh.pages, items: fresh.items,
    line: newMarksLine(fresh.days, fresh.pages) };
}

export type UpdateAnswer =
  | { ok: true; line: string }
  | { ok: false; error: "not-found" | "planner-not-ready" | "refused" | "unavailable"; line: string };

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
  return { ok: false, error: "unavailable", line: TRY_AGAIN };
}

/** The audit note of an approval made although the draft had not used every mark ("Approve anyway"). */
export interface ApprovalNote {
  draftId: string;
  actor: SnapshotActor;
  detail: { revision: number; snapshotId: string; snapshotRevision: number; newMarkDays: number[]; newMarkPages: number; newMarkItems: number };
}

export interface ApprovalCheckDeps {
  store: NextBookSnapshotStore;
  /** The run's draft, or null when the run has none. */
  draftOf(runId: string): Promise<string | null>;
  /** The existing approval (approveDraft), with its own audit entry. */
  approve(): Promise<ApproveResult>;
  /** Writes the note beside the approval's audit entry. */
  note(note: ApprovalNote): Promise<void>;
}

export type CheckedApproval =
  | { status: "ask-update"; line: string }
  | Exclude<ApproveResult, { status: "approved" }>
  /** `noted`: only on an approval anyway; false when the note could not be written (the approval stands). */
  | { status: "approved"; workbookId: string; noted?: boolean };

/**
 * "Approve for print" with the D-308 check: a next-book draft whose latest snapshot did not use every mark is not approved
 * unless the admin chose "Approve anyway" (`despiteNewMarks`); the answer asks "Update first?" instead. An approval
 * anyway is noted in the workbook audit after it commits. A check that cannot be read does not hold the approval.
 */
export async function approveCheckingNewMarks(o: { runId: string; revision: number; actor: SnapshotActor; despiteNewMarks: boolean },
  deps: ApprovalCheckDeps): Promise<CheckedApproval> {
  let marks: DraftNewMarks = { kind: "none" }, draftId: string | null = null;
  try {
    draftId = await deps.draftOf(o.runId);
    if (draftId) marks = await draftNewMarks(deps.store, draftId);
  } catch { marks = { kind: "unavailable" }; }
  if (marks.kind === "new" && !o.despiteNewMarks) return { status: "ask-update", line: marks.line };
  const result = await deps.approve();
  if (result.status !== "approved" || marks.kind !== "new" || !draftId) return result;
  try {
    await deps.note({ draftId, actor: o.actor, detail: { revision: o.revision, snapshotId: marks.snapshotId, snapshotRevision: marks.revision,
      newMarkDays: marks.days, newMarkPages: marks.pages, newMarkItems: marks.items } });
    return { ...result, noted: true };
  } catch {
    return { ...result, noted: false };
  }
}
