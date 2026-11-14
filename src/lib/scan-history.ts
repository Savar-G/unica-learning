import { markingPageView, type EffectiveMark } from "@/lib/scan-marking";

export type HistoryStatus = "never-scanned" | "pending" | "review" | "failed" | "blank" | "unscored" | "ready";
/** "review": our team is checking an answer the AI was unsure of. No label asks a parent to judge an answer (#715). */
export const HISTORY_LABELS: Record<HistoryStatus, string> = { "never-scanned": "No photo yet", pending: "Not marked yet", review: "Our team is checking", failed: "Could not mark", blank: "All answers blank", unscored: "Not scored", ready: "Results ready" };
export interface HistoryPhoto { id: string; state: string; expiresAt: string; sentAt: string | null; at: string }
export interface HistoryJob { photo: string; state: string; blocked: string | null; dispatches: number;
  /**
   * The job's own latest dispatch (#868): its clean failure (`rate-limit` for a clean 429 the database confirmed, else
   * null) and when it was settled (null while its charge is unknown). Absent from an older reader, null with no dispatch.
   */
  lastDispatch?: { cleanFailure: string | null; settledAt: string | null } | null }
/** `outcome` `deferred`: a clean 429 (#868), charge 0, kept apart from marking failures. `cleanFailure` is its flag. */
export interface HistorySpend { id: string; model: string; at: string; reserved: number; charged: number | null; outcome: string; cleanFailure?: string | null }
export interface HistoryRecord {
  id: string; childId: string; childName: string; workbookId: string; book: number; revision: string; day: string; pageNumber: number;
  marks: EffectiveMark[]; photos: HistoryPhoto[]; jobs: HistoryJob[]; spend: HistorySpend[];
}
export interface HistoryFilter { child?: string; workbook?: string; status?: "all" | "review" | "failed"; after?: string;
  /** Leave out printed pages with no photo and no marks. The parent list sets it; the progress readers need every page. */
  scannedOnly?: boolean }
export interface HistoryBudget { period: string; cap: number; reported: number; held: number; unknown: number; reserved: number }
export interface HistoryPage extends Omit<HistoryRecord, "marks" | "photos" | "jobs" | "spend"> {
  status: HistoryStatus; label: string; photo: string | null; photoAvailable: boolean; failedJob: boolean;
  counts: ReturnType<typeof markingPageView>["counts"]; right: number; blank: number; wrong: number;
}
export const completedPage = (p: HistoryPage) => ["ready", "blank", "unscored"].includes(p.status);
/**
 * How long a job deferred on a clean 429 (#868) still reads as on its way: one recovery interval (15 minutes) plus a
 * run's own time. After that, or for any other waiting job, admins see it in the failed filter.
 */
export const DEFERRAL_FRESH_MS = 20 * 60_000;
/**
 * One canonical page, irrespective of the number or lifecycle of its evidence photos. No score is inferred. `scope`:
 * a parent's history or the admins' monitor, which alone counts a job still waiting as failed (#868).
 */
export function historyPage(r: HistoryRecord, now: number, scope: "parent" | "admin" = "parent"): HistoryPage {
  const view = markingPageView(r.marks);
  const readable = (p: HistoryPhoto | undefined) => Boolean(p && p.state === "saved" && Date.parse(p.expiresAt) > now);
  // A photo that can still mark the page: readable, and sent (or already claimed by a job). A never-sent retake cannot.
  const live = (p: HistoryPhoto | undefined) => readable(p) && (p!.sentAt !== null || r.jobs.some((j) => j.photo === p!.id));
  // A job that never finished on a photo now gone (expired, deleted) can never be marked: it failed, unless a live photo
  // of the page (a sent retake) can still mark it.
  const stranded = r.jobs.some((j) => j.state !== "finished" && !live(r.photos.find((p) => p.id === j.photo))) && !r.photos.some(live);
  const couldNotMark = stranded || r.jobs.some((j) => j.blocked === "attempts") || r.photos.some((p) => p.state === "rejected");
  // A `pending` job waits for a later run (#868): everyone reads "Not marked yet". Admins also see it in the failed filter
  // unless the job's own latest dispatch is a clean 429 settled within DEFERRAL_FRESH_MS (time-outs, 5xx answers, a call
  // that never started, or a deferral no run has taken up again). A closed plan (`off`) is no failure, as before.
  const freshDeferral = (j: HistoryJob) => j.lastDispatch?.cleanFailure === "rate-limit" && j.lastDispatch.settledAt !== null
    && now - Date.parse(j.lastDispatch.settledAt) <= DEFERRAL_FRESH_MS;
  // A job on a photo that is gone is the stranded rule's (a live retake takes over the page).
  const stuck = scope === "admin" && r.jobs.some((j) => j.state !== "finished" && j.blocked === "pending" && !freshDeferral(j)
    && live(r.photos.find((p) => p.id === j.photo)));
  const failedJob = couldNotMark || stuck;
  const complete = view.completion.status === "complete";
  const blank = r.marks.filter((m) => m.observation.result === "blank").length;
  const status: HistoryStatus = complete ? view.counts.scored === 0 ? "unscored" : blank === view.counts.scored ? "blank" : "ready"
    // One rule with the results page and the team list: an answer our team is checking wins.
    : view.counts.teamChecks > 0 ? "review"
    : couldNotMark ? "failed" : r.photos.length || r.marks.length ? "pending" : "never-scanned";
  const photo = r.photos.find((p) => p.sentAt !== null) ?? r.photos.at(-1);
  return { id: r.id, childId: r.childId, childName: r.childName, workbookId: r.workbookId, book: r.book, revision: r.revision, day: r.day, pageNumber: r.pageNumber,
    // Same rule as the results page line: a page with some marks and some answers not read yet says so.
    status, label: status === "pending" && view.counts.scored > 0 ? "Some answers not marked yet" : HISTORY_LABELS[status], photo: photo?.id ?? null, photoAvailable: readable(photo), failedJob,
    counts: view.counts, right: r.marks.filter((m) => m.observation.result === "right").length, blank, wrong: r.marks.filter((m) => m.observation.result === "wrong").length };
}
/** Aggregates only the displayed, filtered canonical records. Unknown costs remain reservations. */
export function historyCosts(records: readonly HistoryRecord[], pages: readonly HistoryPage[]) {
  const accepted = pages.filter(completedPage).length;
  const spend = [...new Map(records.flatMap((r) => r.spend).map((s) => [s.id, s])).values()];
  const reported = spend.reduce((n, s) => n + (s.charged ?? 0), 0), unknown = spend.filter((s) => s.charged === null);
  const split = new Map<string, { date: string; model: string; outcome: string; reported: number; reserved: number; attempts: number }>();
  records.forEach((r) => r.spend.forEach((s) => {
    const date = s.at.slice(0, 10), outcome = s.outcome + (s.charged === null ? " / unknown cost" : "");
    const key = `${date}:${s.model}:${outcome}`, row = split.get(key) ?? { date, model: s.model, outcome, reported: 0, reserved: 0, attempts: 0 };
    row.reported += s.charged ?? 0; row.reserved += s.charged === null ? s.reserved : 0; row.attempts++; split.set(key, row);
  }));
  return { reported, reserved: unknown.reduce((n, s) => n + s.reserved, 0), unknown: unknown.length,
    logicalCalls: records.reduce((n, r) => n + r.jobs.filter((j) => j.dispatches > 0).length, 0), attempts: spend.length,
    accepted, perAccepted: accepted > 0 && !unknown.length ? reported / accepted : null, split: [...split.values()].sort((a, b) => `${a.date}:${a.model}:${a.outcome}`.localeCompare(`${b.date}:${b.model}:${b.outcome}`)) };
}
/** `admin`: the read is the admins' monitor, with dispatch data; absent or false: a parent's history. */
export interface HistoryStore { read(filter: HistoryFilter): Promise<{ pages: HistoryRecord[]; budget: HistoryBudget | null; admin?: boolean } | null> }
/** Parent and Admin use this exact reader. Keyset cursors advance even through nonmatching status pages. */
/**
 * `skipChildren`: children whose pages are left out of the list and of its counts and costs (the admin's test families,
 * while "Show test families" is off). `uncounted`: children whose pages stay on the list but out of its counts and costs
 * (the admin's test families while the switch is on: listed, never counted).
 */
export async function readScanHistory(store: HistoryStore, filter: HistoryFilter, now: number, limit = 25, skipChildren: ReadonlySet<string> = new Set(),
  uncounted: ReadonlySet<string> = new Set()) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("history_limit");
  const { scannedOnly, ...storeFilter } = filter;
  // The store pages by page UUID, which is not page order. Within one child or workbook (a few hundred pages at most) read
  // every stored page, then order and cap them here, so a 25-page list holds the first 25 pages in printed order (#920).
  // Without either scope (the Admin list across families) the stored UUID order and cursor stay as they were.
  const ordered = Boolean(filter.child || filter.workbook);
  let matches: { r: HistoryRecord; p: HistoryPage }[] = [];
  const inFilter = (p: HistoryPage) => (filter.status !== "review" || p.status === "review")
    && (filter.status !== "failed" || p.failedJob) && (!scannedOnly || p.status !== "never-scanned");
  let after = ordered ? undefined : filter.after, budget: HistoryBudget | null = null, more = false;
  for (;;) {
    const batch = await store.read({ ...storeFilter, after });
    if (!batch) return null;
    budget = batch.budget;
    const scope = batch.admin ? "admin" : "parent";
    if (!batch.pages.length) break;
    for (const r of batch.pages) {
      if (after && r.id <= after) throw new Error("history_cursor");
      after = r.id;
      if ((filter.child && r.childId !== filter.child) || (filter.workbook && r.workbookId !== filter.workbook) || skipChildren.has(r.childId)) continue;
      const p = historyPage(r, now, scope);
      if (!ordered && !inFilter(p)) continue;
      if (!ordered && matches.length === limit) { more = true; break; }
      matches.push({ r, p });
    }
    if (more) break;
  }
  if (ordered) {
    // Newest book first, then printed page, the order the list shows. The page id breaks ties and is the cursor.
    matches.sort((a, b) => a.p.childId.localeCompare(b.p.childId) || b.p.book - a.p.book || a.p.pageNumber - b.p.pageNumber || a.p.id.localeCompare(b.p.id));
    let start = 0;
    if (filter.after) { start = matches.findIndex((m) => m.p.id === filter.after) + 1; if (!start) throw new Error("history_cursor"); }
    // Find the printed cursor before mutable filters: a team mark can remove the cursor page from its old status.
    matches = matches.slice(start).filter(({ p }) => inFilter(p));
    more = matches.length > limit;
    matches.length = Math.min(matches.length, limit);
  }
  const records = matches.map((m) => m.r), pages = matches.map((m) => m.p);
  // Do not consume the first matching row of the next page.
  const countedRecords = records.filter((r) => !uncounted.has(r.childId)), countedPages = pages.filter((p) => !uncounted.has(p.childId));
  return { pages, counted: countedPages.length, counts: Object.fromEntries(Object.keys(HISTORY_LABELS).map((s) => [s, countedPages.filter((p) => p.status === s).length])),
    costs: historyCosts(countedRecords, countedPages), budget, after: more ? pages.at(-1)!.id : null };
}
