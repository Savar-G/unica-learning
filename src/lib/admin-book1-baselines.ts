// #870 The Book 1 starting records that need the team, on /admin/next-steps: each approved Book 1 revision whose baseline
// the site could not save (a pending row, with its reason) or keeps failing to save (the repair tried it
// FAILING_TRIES times). Pure: the page's loader is src/lib/admin-book1-baselines-server.ts.

/** The repair tries (a reminders run every 15 minutes) after which a revision with no pending row is shown as failing. */
export const FAILING_TRIES = 3;

export interface Book1BaselineItem {
  draftId: string;
  revision: number;
  runId: string | null;
  parentId: string;
  childId: string;
  childName: string | null;
  /** pending: a recorded reason; failing: tried again and again with no result. */
  kind: "pending" | "failing";
  reason: string | null;
  tries: number | null;
  testFamily: boolean;
}
export interface Book1BaselineLoad { rows: Book1BaselineItem[]; unavailable: boolean; more: boolean }

/** The exact command that saves the record, run on the Mac before any page of the book is marked. */
export const book1RecoverCommand = (runId: string) => `npm run workbooks:book1-recover -- --run ${runId} --save`;

/** Plain words for a pending reason, and the next step. */
export function book1PendingText(reason: string): string {
  if (reason === "planning-capture-missing") return "This run did not keep its plan input, so the site cannot save the record. Run the recovery script on the Mac (docs/workbook-worker.md).";
  if (reason === "curriculum-version-changed") return "The curriculum changed after this book was planned. Run the recovery script on the Mac: it uses the curriculum of the book's build (docs/workbook-worker.md).";
  if (reason === "planned-on-another-build") return "The site was updated after this book was planned, so it cannot prove it copies the planned steps. Run the recovery script on the Mac: it uses the book's own build (docs/workbook-worker.md).";
  if (reason === "activity-before-boundary") return "Pages of this book were marked before the record was saved. The record cannot be saved now.";
  if (reason === "revision-changed") return "The draft has a newer version than the one approved. Approve the newest version again: the site saves its record.";
  return `The save was refused (${reason}).`;
}

/** The one line the item shows. */
export const book1ItemText = (i: Pick<Book1BaselineItem, "kind" | "reason" | "tries">) =>
  i.kind === "pending" && i.reason ? book1PendingText(i.reason)
    : `The site tried ${i.tries ?? FAILING_TRIES} times to save this record and could not. Check the run, or run the recovery script on the Mac (docs/workbook-worker.md).`;

/** The script can save an item only while its book has no activity, and never for a version that is not the approved one. */
export const book1ItemSavable = (i: Pick<Book1BaselineItem, "kind" | "reason">) => !(i.kind === "pending" && (i.reason === "activity-before-boundary" || i.reason === "revision-changed"));

/**
 * The rule of admin_book1_baseline_items (migration admin_book1_baseline_items), for readers that use the secret key and so
 * cannot call that admin-only function (the team digest): a pending record still needs the team only when its revision is
 * the draft's newest approval (the workbook_audit "workbook-approved" row with the highest id and a numeric revision) and
 * no baseline holds that draft and revision. Pending rows are immutable, so an old revision stays in them forever.
 */
export function openBook1Records<T extends { draftId: string; revision: number }>(
  pending: T[],
  approvals: { id: number; draftId: string | null; revision: unknown }[],
  baselines: { draftId: string; revision: number }[],
): T[] {
  const latest = new Map<string, { id: number; revision: number }>();
  for (const a of approvals) {
    if (a.draftId === null || typeof a.revision !== "number") continue;
    const seen = latest.get(a.draftId);
    if (!seen || a.id > seen.id) latest.set(a.draftId, { id: a.id, revision: a.revision });
  }
  const saved = new Set(baselines.map((b) => `${b.draftId}:${b.revision}`));
  return pending.filter((p) => latest.get(p.draftId)?.revision === p.revision && !saved.has(`${p.draftId}:${p.revision}`));
}
