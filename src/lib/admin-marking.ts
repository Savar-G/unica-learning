// Workbooks > Marking (D-313, D-315): the answers waiting for our team grouped by the scanned page they are on, and the
// shown scanned pages counted per book for the small bars. Pure: the page reads the team queue and the scan history.
import type { HistoryStatus } from "@/lib/scan-history";

type QueueItem = { item: string; parent: string; child: string; childName: string; book: number; page: number; question: number; photo: string | null; since: string; testFamily: boolean };

/**
 * The waiting answers, one group per scanned page (its photo), oldest wait first. An answer with no saved photo is its own
 * group, as it is marked on its own. Within a group the answers keep the queue's order (oldest first).
 */
export function teamGroups<T extends QueueItem>(items: readonly T[]) {
  const groups = new Map<string, { key: string; photo: string | null; parent: string; child: string; childName: string; book: number; page: number; since: string; testFamily: boolean; items: T[] }>();
  for (const i of items) {
    const key = i.photo ? `photo:${i.photo}` : `item:${i.item}`;
    const g = groups.get(key);
    if (g) {
      g.items.push(i);
      if (i.since < g.since) g.since = i.since;
      g.testFamily ||= i.testFamily;
    } else groups.set(key, { key, photo: i.photo, parent: i.parent, child: i.child, childName: i.childName, book: i.book, page: i.page, since: i.since, testFamily: i.testFamily, items: [i] });
  }
  return [...groups.values()].sort((a, b) => a.since < b.since ? -1 : a.since > b.since ? 1 : 0);
}

export type PageBucket = "marked" | "checking" | "waiting" | "failed" | "none";
export const PAGE_BUCKETS: { bucket: PageBucket; text: string }[] = [
  { bucket: "marked", text: "Marked" }, { bucket: "checking", text: "Our team is checking" }, { bucket: "waiting", text: "Not marked yet" },
  { bucket: "failed", text: "Could not mark" }, { bucket: "none", text: "No photo yet" },
];
const BUCKET: Record<HistoryStatus, PageBucket> = { ready: "marked", blank: "marked", unscored: "marked", review: "checking", pending: "waiting", failed: "failed", "never-scanned": "none" };

type PageRow = { childId: string; childName: string; workbookId: string; book: number; status: HistoryStatus };

/**
 * The shown pages per child's book, for the bars: how many are marked, being checked, not marked yet, could not be
 * marked, or have no photo. `uncounted`: children whose pages are listed but never counted (test families). Books keep
 * the order the list shows them in.
 */
export function pagesByBook(pages: readonly PageRow[], uncounted: ReadonlySet<string> = new Set()) {
  const books = new Map<string, { childId: string; childName: string; workbookId: string; book: number; total: number; n: Record<PageBucket, number> }>();
  for (const p of pages) {
    if (uncounted.has(p.childId)) continue;
    let b = books.get(p.workbookId);
    if (!b) books.set(p.workbookId, b = { childId: p.childId, childName: p.childName, workbookId: p.workbookId, book: p.book, total: 0, n: { marked: 0, checking: 0, waiting: 0, failed: 0, none: 0 } });
    b.total += 1;
    b.n[BUCKET[p.status]] += 1;
  }
  return [...books.values()];
}
