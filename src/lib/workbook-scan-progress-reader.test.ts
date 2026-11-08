import { describe, expect, it, vi } from "vitest";
import { historyPage, readScanHistory, type HistoryPage, type HistoryRecord, type HistoryStore } from "@/lib/scan-history";
import { expectedItems, firstObservation } from "@/lib/scan-observation";
import type { ScanProgressBook } from "@/lib/workbook-scan-progress";
import { readWorkbookScanProgress, type ScanProgressHistoryReader, type ScanProgressSnapshot, type ScanProgressStore } from "@/lib/workbook-scan-progress-reader";
vi.mock("server-only", () => ({}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { parentId: id(1), childId: id(2), workbookId: id(3) };
const revision = "a".repeat(28), now = Date.parse("2026-11-06T18:00:00Z");
function memory(count = 3) {
  const pages = Array.from({ length: count }, (_, n) => ({ id: id(100 + n), number: n + 1,
    type: "practice", dayLabel: n === count - 1 ? "Day 7" : "Extra practice", questions: [{}] }));
  const snapshot: ScanProgressSnapshot = {
    book: { ...scope, number: 2, printedRevision: revision, pages,
      manifest: { version: 1, curriculum: { key: "synthetic", version: "fixed" }, snapshotDay: 7,
        testWorkbook: false, days: [{ day: 7, pages: [count] }], levelTest: null }, delivery: null },
    receipts: [], progressEvents: [], clockRequestPresent: false, currentCalendar: null, claim: null, claimCalendar: null, hold: null,
  };
  let available = true;
  const store: ScanProgressStore = { read: async () => available ? structuredClone(snapshot) : null, recheck: async () => available };
  return { snapshot, store, freeze: () => { available = false; } };
}
function record(book: ScanProgressBook, n: number, terminal = false): HistoryRecord {
  const page = book.pages[n];
  const expected = expectedItems({ workbookId: book.workbookId, printedRevision: book.printedRevision, pageId: page.id,
    questions: [{ number: 1, package: null, teaching: null }] })[0];
  const observation = firstObservation(expected, "synthetic-photo");
  if (terminal) {
    expected.method = "unscored";
    observation.method = "unscored";
    observation.state = "unscored";
  }
  return { id: page.id, childId: book.childId, childName: "Synthetic private name", workbookId: book.workbookId, book: book.number,
    revision: book.printedRevision, day: page.dayLabel ?? "", pageNumber: page.number,
    marks: terminal ? [{ expected, observation, originalEvent: null, eventId: null, at: "2026-10-01T12:00:00Z", model: null, prompt: null }] : [],
    photos: [{ id: "synthetic-photo", state: "deleted", expiresAt: "2026-10-01T12:00:00Z", at: "2026-10-01T12:00:00Z", sentAt: null }], jobs: [], spend: [] };
}
const accept = (book: ScanProgressBook, n: number) => ({ ...scope, id: id(10000 + n), status: "accepted" as const,
  printedRevision: revision, pageId: book.pages[n].id, photoRevision: id(20000 + n), acceptedAt: "2026-10-03T12:00:00.000Z" });

describe("public workbook scan progress reader", () => {
  it("does not infer accepted scans from canonical completed marks or expired/deleted photos", async () => {
    const m = memory();
    const page = historyPage(record(m.snapshot.book, 2, true), now);
    const result = await readWorkbookScanProgress(m.store, scope, now, async () => ({ parentId: scope.parentId, pages: [page], after: null }));
    if (result.status !== "available") throw new Error("expected progress");
    expect(result.progress.pages[2]).toMatchObject({ scanned: false, markingStatus: "unscored", reviewReady: true });
    expect(result.progress.acceptedPageCount).toBe(0);
    expect(result.progress.day7Ready).toBe(false);
    expect(result.progress.candidate).toBeNull();
    expect(result.progress.lastQualifyingScanAt).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/Synthetic private name|synthetic-photo|readAnswerText|signed|cost|credential/);
  });

  it("preserves accepted scans when review history is absent or becomes unavailable mid-read", async () => {
    const m = memory();
    m.snapshot.receipts = [accept(m.snapshot.book, 2)];
    const page = historyPage(record(m.snapshot.book, 0, true), now);
    for (const history of [undefined, (async (_scope, after) => after ? null : { parentId: scope.parentId, pages: [page], after: page.id }) satisfies ScanProgressHistoryReader]) {
      const result = await readWorkbookScanProgress(m.store, scope, now, history);
      if (result.status !== "available") throw new Error("expected progress");
      expect(result.progress.pages[2]).toMatchObject({ scanned: true, markingStatus: null, reviewReady: null });
      expect(result.progress.pages[0].reviewReady).toBeNull();
      expect(result.progress.day7Ready).toBe(true);
      expect(result.progress.delivery.status).toBe("missing");
      expect(result.progress.candidate).toBeNull();
    }
  });

  it("paginates more than 1000 canonical HistoryPage outputs with stable cursors and no lost review states", async () => {
    const m = memory(1205), records = m.snapshot.book.pages.map((_, n) => record(m.snapshot.book, n, true));
    const source: HistoryStore = { read: async filter => ({ pages: records.filter(p => !filter.after || p.id > filter.after).slice(0, 43), budget: null }) };
    const cursors: (string | undefined)[] = [];
    const history: ScanProgressHistoryReader = async (checked, after) => {
      cursors.push(after);
      expect(checked).toEqual(scope);
      const result = await readScanHistory(source, { child: checked.childId, workbook: checked.workbookId, status: "all", after }, now, 100);
      return result && { parentId: checked.parentId, pages: result.pages, after: result.after };
    };
    const result = await readWorkbookScanProgress(m.store, scope, now, history);
    if (result.status !== "available") throw new Error("expected progress");
    expect(cursors).toHaveLength(13);
    expect(cursors[1]).toBe(records[99].id);
    expect(result.progress.pages.map(p => p.pageId)).toEqual(records.map(p => p.id));
    expect(new Set(result.progress.pages.map(p => p.pageId)).size).toBe(1205);
    expect(result.progress.pages.filter(p => p.reviewReady === true)).toHaveLength(1205);
    expect(result.progress.acceptedPageCount).toBe(0);
  });

  it.each(["childId", "workbookId", "book", "revision", "id", "pageNumber"] as const)("excludes canonical history for another %s", async field => {
    const m = memory(), page = historyPage(record(m.snapshot.book, 2, true), now);
    const wrong: HistoryPage = { ...page, [field]: typeof page[field] === "number" ? 99 : id(99) };
    const result = await readWorkbookScanProgress(m.store, scope, now, async () => ({ parentId: scope.parentId, pages: [wrong], after: null }));
    if (result.status !== "available") throw new Error("expected progress");
    expect(result.progress.pages.every(p => p.reviewReady === null)).toBe(true);
    expect(result.progress.acceptedPageCount).toBe(0);
  });

  it.each(["foreign-parent", "same-cursor", "wrong-cursor", "empty-continuation", "invalid-status", "too-large"])("rejects malformed history: %s", async kind => {
    const m = memory(), page = historyPage(record(m.snapshot.book, 2, true), now);
    const history: ScanProgressHistoryReader = async (_scope, after) => ({ parentId: kind === "foreign-parent" ? id(99) : scope.parentId,
      pages: kind === "empty-continuation" ? [] : kind === "too-large" ? Array(101).fill(page)
        : kind === "invalid-status" ? [{ ...page, status: "invented" } as unknown as HistoryPage] : [page],
      after: kind === "wrong-cursor" ? id(99) : kind === "same-cursor" ? after ?? page.id : kind === "empty-continuation" ? page.id : null });
    await expect(readWorkbookScanProgress(m.store, scope, now, history)).rejects.toThrow(/scan_progress_history_/);
  });

  it("rechecks the live family fence after canonical history finishes", async () => {
    const m = memory();
    const result = await readWorkbookScanProgress(m.store, scope, now, async () => {
      m.freeze();
      return { parentId: scope.parentId, pages: [], after: null };
    });
    expect(result).toEqual({ status: "unavailable" });
  });

  it("fails at the history request bound without returning partial review state", async () => {
    const m = memory();
    let calls = 0;
    const page = historyPage(record(m.snapshot.book, 0, true), now);
    const history: ScanProgressHistoryReader = async () => {
      const next = { ...page, id: id(50000 + calls++) };
      return { parentId: scope.parentId, pages: [next], after: next.id };
    };
    await expect(readWorkbookScanProgress(m.store, scope, now, history)).rejects.toThrow("scan_progress_history_bound");
    expect(calls).toBe(1000);
  });

  it("rejects invalid scope and clock without touching the store", async () => {
    const read = vi.fn();
    const store: ScanProgressStore = { read, recheck: async () => true };
    expect(await readWorkbookScanProgress(store, { ...scope, childId: "browser-claim" }, now)).toEqual({ status: "unavailable" });
    expect(await readWorkbookScanProgress(store, scope, NaN)).toEqual({ status: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects a substituted memory-store book and an unsupported immutable manifest", async () => {
    const m = memory();
    m.snapshot.book.childId = id(99);
    expect(await readWorkbookScanProgress(m.store, scope, now)).toEqual({ status: "unavailable" });
    m.snapshot.book.childId = scope.childId;
    m.snapshot.book.manifest.version = 99;
    expect(await readWorkbookScanProgress(m.store, scope, now)).toEqual({ status: "unavailable" });
  });
});
