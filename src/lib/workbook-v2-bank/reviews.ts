// Reviews of the working copy (architecture spec 9.2): an approval belongs to one exact revision of a sheet, question,
// scenario or region pack. An edit makes a new revision (import-draft.ts), which needs a new approval. A freeze needs the
// latest review of the current revision of every item that is not retired to be an approval. bank_freeze_level checks
// the same rule again inside its transaction.
import type { BankStore, LevelRows, NewReview, ReviewKind, ReviewResult, ReviewRow } from "./types";
import { REVIEW_DECISIONS, REVIEW_KINDS } from "./types";

/** An item that a freeze copies, at its current revision. */
export interface LiveItem { kind: ReviewKind; key: string; revision: number }

const LABELS: Record<ReviewKind, string> = { sheet: "Sheet", question: "Question", scenario: "Scenario", region_pack: "Region pack" };
const ITEM_KEY = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
const notRetired = <T extends { status: string }>(rows: readonly T[]): T[] => rows.filter((row) => row.status !== "retired");

/** Every item of the level that is not retired, with its current revision. */
export function liveItems(rows: LevelRows): LiveItem[] {
  return [
    ...notRetired(rows.sheets).map((r) => ({ kind: "sheet" as const, key: r.sheet_id, revision: r.revision })),
    ...notRetired(rows.questions).map((r) => ({ kind: "question" as const, key: r.id, revision: r.revision })),
    ...notRetired(rows.scenarios).map((r) => ({ kind: "scenario" as const, key: r.id, revision: r.revision })),
    ...notRetired(rows.regionPacks).map((r) => ({ kind: "region_pack" as const, key: r.id, revision: r.revision })),
  ];
}

const itemKey = (kind: string, key: string) => `${kind}/${key}`;

/** The reviews of each item, the latest first. */
function reviewsByItem(reviews: readonly ReviewRow[]): Map<string, ReviewRow[]> {
  const byItem = new Map<string, ReviewRow[]>();
  for (const review of [...reviews].sort((a, b) => b.id - a.id)) {
    const key = itemKey(review.item_kind, review.item_key);
    byItem.set(key, [...(byItem.get(key) ?? []), review]);
  }
  return byItem;
}

/** The latest review of each current revision, with one index per level. */
export function latestReviewOf(reviews: readonly ReviewRow[]): (item: LiveItem) => ReviewRow | undefined {
  const byItem = reviewsByItem(reviews);
  return (item) => byItem.get(itemKey(item.kind, item.key))?.find((r) => r.revision === item.revision);
}

export function storyRegionProblem(rows: LevelRows): string | null {
  if (rows.level?.default_region !== null || !liveItems(rows).some((item) => item.kind !== "sheet")) return null;
  return `For level "${rows.level.id}", set a default region or retire its questions, scenarios and region packs before it can freeze.`;
}

/** One problem in plain words for each item that is not approved at its current revision; none when the level may freeze. */
export function approvalProblems(rows: LevelRows, reviews: readonly ReviewRow[]): string[] {
  const byItem = reviewsByItem(reviews);
  return liveItems(rows).flatMap((item) => {
    const name = `${LABELS[item.kind]} "${item.key}"`;
    const all = byItem.get(itemKey(item.kind, item.key)) ?? [];
    const latest = all.find((r) => r.revision === item.revision);
    if (latest?.decision === "approved") return [];
    if (latest) return [`${name} (revision ${item.revision}) was rejected by ${latest.reviewer}: fix it, then approve revision ${item.revision}.`];
    const older = all.find((r) => r.revision < item.revision && r.decision === "approved");
    if (older) return [`${name} was approved at revision ${older.revision} and changed to revision ${item.revision} since: approve revision ${item.revision}.`];
    return [`${name} (revision ${item.revision}) is not approved.`];
  });
}

/**
 * Records a review of one item. It refuses an item that the level does not have, a retired item, and a revision that is
 * not the current one: an approval of an old revision would never count. The store checks the same rule again under the
 * lock of the level, so an edit between this read and the write cannot make the review count for other content.
 */
export async function reviewItem(store: BankStore, review: NewReview): Promise<ReviewResult> {
  if (!(REVIEW_KINDS as readonly string[]).includes(review.item_kind)) return { ok: false, problem: `"${review.item_kind}" is not a kind of item that is reviewed.` };
  if (!(REVIEW_DECISIONS as readonly string[]).includes(review.decision)) return { ok: false, problem: `A review is "approved" or "rejected", not "${review.decision}".` };
  if (!ITEM_KEY.test(review.item_key)) return { ok: false, problem: `"${review.item_key}" is not the id of an item.` };
  const reviewer = review.reviewer.trim();
  if (reviewer.length === 0 || reviewer.length > 200) return { ok: false, problem: "A review names its reviewer, in 1 to 200 characters." };
  if (review.comment !== null && review.comment.length > 4000) return { ok: false, problem: "A comment has 4,000 characters at most." };
  const rows = await store.readLevel(review.level_id);
  if (!rows.level) return { ok: false, problem: `There is no bank level "${review.level_id}".` };
  const name = `${LABELS[review.item_kind]} "${review.item_key}"`;
  const item = liveItems(rows).find((one) => one.kind === review.item_kind && one.key === review.item_key);
  if (!item) return { ok: false, problem: `${name} is not an item of level "${review.level_id}" that is not retired.` };
  if (item.revision !== review.revision) return { ok: false, problem: `${name} is at revision ${item.revision}, not revision ${review.revision}: review the current revision.` };
  return store.addReview({ ...review, reviewer });
}
