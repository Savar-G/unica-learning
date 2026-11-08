import { describe, expect, it } from "vitest";
import { familyZone, type FamilyZone } from "@/lib/family-time";
import { historyPage, type HistoryRecord } from "@/lib/scan-history";
import { expectedItems, firstObservation } from "@/lib/scan-observation";
import { deliveryDeadlines, type DeliveryReceipt } from "@/lib/workbook-delivery";
import {
  scanInactivityCandidate, workbookScanProgress, type AcceptedScanReceipt, type AdmittedScanProgressEvent,
  type ScanProgressBook, type ScanProgressInput,
} from "@/lib/workbook-scan-progress";

const NOW = Date.parse("2026-11-06T18:00:00Z");
const DELIVERED = "2026-10-30T13:37:00.000Z";
function book(number = 1): ScanProgressBook {
  const workbookId = `book-${number}`;
  const pages: ScanProgressBook["pages"][number][] = [...Array.from({ length: 10 }, (_, i) => ({ number: i + 1, day: i + 1 })), { number: 70, day: 7 }]
    .map((p) => ({ id: `${workbookId}-page-${p.number}`, number: p.number, type: "practice", dayLabel: `Day ${p.day}`, questions: [{}] }));
  pages.push(...[
    { number: 99, type: "practice", dayLabel: "Extra practice" }, { number: 100, type: "cover", dayLabel: null },
    { number: 101, type: "how-plan", dayLabel: null }, { number: 102, type: "back-cover", dayLabel: null }, { number: 103, type: "blank", dayLabel: null },
  ].map((p) => ({ ...p, id: `${workbookId}-page-${p.number}`, questions: [] })));
  const delivery: DeliveryReceipt = {
    workbookId, parentId: "parent", childId: "child", number, deliveredAt: DELIVERED,
    timeZone: "America/Toronto", localTime: "2026-10-30T09:37", recordedAt: "2026-10-31T12:00:00Z", actorId: "admin", auditId: number,
  };
  return { workbookId, parentId: "parent", childId: "child", number, printedRevision: "a".repeat(28), pages, delivery,
    manifest: { version: 1, curriculum: { key: "bc", version: "frozen" }, snapshotDay: 7, testWorkbook: false, levelTest: null,
      days: Array.from({ length: 10 }, (_, i) => ({ day: i + 1, pages: i === 6 ? [7, 70] : [i + 1] })) } };
}
function receipt(b: ScanProgressBook, page: number, acceptedAt = "2026-11-01T14:00:00Z", id = `receipt-${b.number}-${page}`): AcceptedScanReceipt {
  return { id, status: "accepted", parentId: b.parentId, childId: b.childId, workbookId: b.workbookId,
    printedRevision: b.printedRevision, pageId: `${b.workbookId}-page-${page}`, photoRevision: `photo-${id}`, acceptedAt };
}
function project(b: ScanProgressBook, receipts: AcceptedScanReceipt[] = [], rest: Partial<ScanProgressInput> = {}) {
  const p = workbookScanProgress({ book: b, receipts, now: NOW, ...rest });
  if (p.status !== "available") throw new Error(`Unexpected refusal: ${p.reason}`);
  return p;
}
function inactivity(books: ScanProgressBook[], receipts: AcceptedScanReceipt[] = [], rest: Partial<Parameters<typeof scanInactivityCandidate>[0]> = {}) {
  return scanInactivityCandidate({ parentId: "parent", childId: "child", books, receipts, now: NOW, timeZone: "America/Toronto", ...rest });
}
function resolved(r: AcceptedScanReceipt): AdmittedScanProgressEvent {
  return { ...r, id: `event-${r.id}`, receiptId: r.id, reason: "pending-evidence-resolved", admittedAt: r.acceptedAt, resolvedItemIds: ["item-1"] };
}

describe("frozen printed-day progress", () => {
  it("records out-of-order Days 1/7/8/10 and requires every Day 7 page despite later scans", () => {
    const b = book();
    const p = project(b, [10, 1, 8, 7].map((n) => receipt(b, n)));
    expect(p.days.map((d) => ({ day: d.day, accepted: d.acceptedPages.length, gaps: d.gaps.length }))).toEqual([
      { day: 1, accepted: 1, gaps: 0 }, { day: 2, accepted: 0, gaps: 1 }, { day: 3, accepted: 0, gaps: 1 },
      { day: 4, accepted: 0, gaps: 1 }, { day: 5, accepted: 0, gaps: 1 }, { day: 6, accepted: 0, gaps: 1 },
      { day: 7, accepted: 1, gaps: 1 }, { day: 8, accepted: 1, gaps: 0 }, { day: 9, accepted: 0, gaps: 1 }, { day: 10, accepted: 1, gaps: 0 },
    ]);
    expect(p.days[6]).toEqual({ day: 7, requiredPages: ["book-1-page-7", "book-1-page-70"], acceptedPages: ["book-1-page-7"], gaps: ["book-1-page-70"], complete: false });
    expect(p).toMatchObject({ day7Ready: false, candidate: null, acceptedPageCount: 4 });
  });

  it("allows full Day 7 with all Days 1-6 missing, including a late start", () => {
    const b = book();
    const p = project(b, [70, 7].map((n) => receipt(b, n, "2026-11-06T17:00:00Z")));
    expect(p).toMatchObject({ day7Ready: true, candidate: "day7_scanned", unfinished: true, acceptedPageCount: 2 });
    expect(p.days.slice(0, 6).map((d) => d.complete)).toEqual([false, false, false, false, false, false]);
  });

  it("completes two printed days in one sitting without deriving day labels from dates", () => {
    const b = book();
    const p = project(b, [1, 2].map((n) => receipt(b, n, "2026-11-06T17:00:00Z")));
    expect(p.days.filter((d) => d.complete).map((d) => d.day)).toEqual([1, 2]);
    expect(p.lastQualifyingScanAt).toBe("2026-11-06T17:00:00.000Z");
  });

  it("excludes family/book/revision/page mismatches and invalid receipt state or time", () => {
    const b = book(), r = receipt(b, 7);
    const changes: Partial<AcceptedScanReceipt>[] = [{ parentId: "other" }, { childId: "sibling" }, { workbookId: "other" },
      { printedRevision: "b".repeat(28) }, { pageId: "absent" }, { photoRevision: "" }, { acceptedAt: "invalid" }, { acceptedAt: "2099-01-01" }];
    const receipts = changes.map((c, i) => ({ ...r, ...c, id: `bad-${i}` }));
    // A foreign runtime state must not count, even if a transport wrongly types it as accepted.
    receipts.push({ ...r, id: "s1", status: "saved" as AcceptedScanReceipt["status"] });
    expect(project(b, receipts)).toMatchObject({ acceptedPageCount: 0, lastQualifyingScanAt: null, day7Ready: false });
  });

  it("never requires or counts empty extra pages, covers, plan pages, or padding", () => {
    const b = book();
    const p = project(b, [99, 100, 101, 102, 103].map((n) => receipt(b, n)));
    expect(p.acceptedPageCount).toBe(0);
    expect(p.days.flatMap((d) => d.requiredPages)).toHaveLength(11);
    expect(p.pages).toHaveLength(11);
  });

  it("retains a scored Extra practice scan without requiring it for a day", () => {
    const b = book();
    b.pages = b.pages.map((p) => p.number === 99 ? { ...p, questions: [{}] } : p);
    const r = receipt(b, 99, "2026-11-06T17:00:00Z");
    const p = project(b, [r]);
    expect(p).toMatchObject({ acceptedPageCount: 1, day7Ready: false, lastQualifyingScanAt: "2026-11-06T17:00:00.000Z" });
    expect(p.days.every((d) => d.acceptedPages.length === 0)).toBe(true);
    expect(p.days.flatMap((d) => d.requiredPages)).toHaveLength(11);
    expect(p.pages.find((page) => page.pageId === r.pageId)?.scanned).toBe(true);
    expect(inactivity([b], [r])).toMatchObject({ anchorAt: "2026-11-06T17:00:00.000Z", due: false });
  });

  it("does not call an accepted Extra practice page a zero-scan backstop", () => {
    const b = book();
    b.pages = b.pages.map((p) => p.number === 99 ? { ...p, questions: [{}] } : p);
    const now = Date.parse(deliveryDeadlines(b.delivery!).backstopAt);
    const r = receipt(b, 99, new Date(now - 60_000).toISOString());
    expect(project(b, [r], { now })).toMatchObject({ acceptedPageCount: 1, candidate: "delivery_backstop", holdReason: null, day7Ready: false });
  });

  it("requires the full multi-part frozen level test and permits a genuine one-page test", () => {
    const b = book();
    b.manifest.testWorkbook = true;
    b.manifest.levelTest = { day: 7, pages: [7, 70] };
    expect(project(b, [receipt(b, 7)]).day7Ready).toBe(false);
    expect(project(b, [receipt(b, 7), receipt(b, 70)]).candidate).toBe("day7_scanned");
    b.manifest.levelTest.pages = [7];
    expect(workbookScanProgress({ book: b, receipts: [receipt(b, 7)], now: NOW })).toEqual({ status: "refused", reason: "invalid-workbook" });
    b.manifest.days[6].pages = [7];
    expect(project(b, [receipt(b, 7)]).day7Ready).toBe(true);
  });

  it("refuses duplicate days/page identities, unsupported manifests, or a missing revision", () => {
    const variants = [book(), book(), book(), book(), book()];
    variants[0].manifest.days.push({ day: 7, pages: [70] });
    variants[1].pages = [...variants[1].pages, variants[1].pages[0]];
    variants[2].manifest.version = 999;
    variants[3].printedRevision = "";
    variants[4].manifest.snapshotDay = 10;
    for (const b of variants) expect(workbookScanProgress({ book: b, receipts: [], now: NOW })).toEqual({ status: "refused", reason: "invalid-workbook" });
  });

  it("deduplicates same-page receipts and excludes conflicting durable IDs in either order", () => {
    const b = book(), first = receipt(b, 1), retake = receipt(b, 1, "2026-11-05T14:00:00Z", "retake");
    expect(project(b, [first, first, retake])).toMatchObject({ acceptedPageCount: 1, lastQualifyingScanAt: "2026-11-01T14:00:00.000Z" });
    const conflict = { ...first, pageId: "book-1-page-7" };
    for (const rows of [[first, conflict], [conflict, first]]) expect(project(b, rows).acceptedPageCount).toBe(0);
  });
});

describe("scan acceptance and marking remain separate", () => {
  function history(b: ScanProgressBook, terminal: boolean, state: string, expiresAt: string) {
    const expected = expectedItems({ workbookId: b.workbookId, printedRevision: b.printedRevision, pageId: "book-1-page-1", questions: [{ number: 1, package: null, teaching: null }] })[0];
    const observation = firstObservation(expected, "photo-original");
    const record: HistoryRecord = { id: expected.identity.pageId, childId: b.childId, childName: "", workbookId: b.workbookId, book: b.number,
      revision: b.printedRevision, day: "Day 1", pageNumber: 1, marks: [], jobs: [], spend: [],
      photos: [{ id: "photo-original", state, expiresAt, sentAt: null, at: DELIVERED }] };
    if (terminal) {
      expected.method = "unscored";
      observation.method = "unscored";
      observation.state = "unscored";
      record.marks = [{ expected, observation, originalEvent: null, eventId: null, at: DELIVERED, model: null, prompt: null }];
    }
    return { parentId: b.parentId, page: historyPage(record, NOW) };
  }

  it("retains accepted progress and completed history after photo deletion and expiry", () => {
    const b = book(), r = receipt(b, 1);
    for (const state of ["saved", "deleted", "expired"]) {
      const review = history(b, true, state, "2026-11-02T12:00:00Z");
      expect(review.page.photoAvailable).toBe(false);
      const p = project(b, [r], { reviews: [review] });
      expect(p.pages[0]).toMatchObject({ scanned: true, markingStatus: "unscored", reviewReady: true });
      expect(p.acceptedPageCount).toBe(1);
    }
  });

  it("does not turn stored photos or completed marks into accepted progress", () => {
    const b = book(), review = history(b, true, "saved", "2099-01-01T00:00:00Z");
    expect(project(b, [], { reviews: [review] }).pages[0]).toMatchObject({ scanned: false, reviewReady: true });
    const pending = history(b, false, "saved", "2099-01-01T00:00:00Z");
    expect(project(b, [receipt(b, 1)], { reviews: [pending] }).pages[0]).toMatchObject({ scanned: true, reviewReady: false, markingStatus: "pending" });
    expect(project(b, [], { reviews: [pending] }).acceptedPageCount).toBe(0);
  });

  it("excludes foreign marking history independently of matching receipt admission", () => {
    const b = book(), review = history(b, true, "saved", "2099-01-01T00:00:00Z");
    for (const change of [{ childId: "sibling" }, { revision: "other" }, { workbookId: "other" }, { id: "other" }, { book: 2 }]) {
      expect(project(b, [receipt(b, 1)], { reviews: [{ ...review, page: { ...review.page, ...change } }] }).pages[0]).toMatchObject({ scanned: true, reviewReady: null });
    }
    expect(project(b, [], { reviews: [{ ...review, parentId: "other" }] }).pages[0].reviewReady).toBeNull();
  });
});

describe("per-book delivery, inactivity, and the zero-scan hold", () => {
  it("retains pre-delivery Day 7 scans but gives no delivery candidate or timer without a receipt", () => {
    const b = book(); b.delivery = null;
    const scans = [receipt(b, 7), receipt(b, 70)];
    expect(project(b, scans)).toMatchObject({ day7Ready: true, delivery: { status: "missing" }, candidate: null, holdReason: null });
    expect(inactivity([b], scans)).toEqual({ status: "none", reason: "missing-delivery" });
    b.delivery = book().delivery;
    expect(project(b, scans).candidate).toBe("day7_scanned");
    expect(inactivity([b], scans)).toMatchObject({ status: "candidate", anchorAt: "2026-11-01T14:00:00.000Z" });
  });

  it("uses the latest numbered delivered book and ignores older scans and another child", () => {
    const first = book(), second = book(2), sibling = { ...book(3), childId: "sibling" };
    second.delivery = { ...second.delivery!, deliveredAt: "2026-11-04T14:37:00Z" };
    expect(inactivity([first])).toMatchObject({ workbookId: first.workbookId, anchorAt: DELIVERED, dueAt: deliveryDeadlines(first.delivery!).reminderAt, due: true });
    expect(inactivity([sibling, second, first], [receipt(first, 1, "2026-11-06T17:00:00Z"), receipt(sibling, 1, "2026-11-06T17:30:00Z")])).toEqual({ status: "candidate", workbookId: second.workbookId, anchorAt: "2026-11-04T14:37:00.000Z", dueAt: "2026-11-08T14:37:00.000Z", due: false });
    expect(project(first, [receipt(first, 1)]).acceptedPageCount).toBe(1);
    second.delivery = null;
    expect(inactivity([first, second])).toMatchObject({ workbookId: first.workbookId });
  });

  it("does not revive old reminders when the newer book is complete", () => {
    const first = book(), second = book(2);
    const scans = second.manifest.days.flatMap((d) => d.pages.map((n) => receipt(second, n)));
    expect(inactivity([first, second], scans)).toEqual({ status: "none", reason: "finished" });
    expect(project(first).unfinished).toBe(true);
  });

  it("uses the immutable effective delivery time, not repeated confirmation record time", () => {
    const b = book(), before = inactivity([b]);
    b.delivery = { ...b.delivery!, recordedAt: "2026-11-06T17:59:00Z" };
    expect(inactivity([b])).toEqual(before);
    b.delivery = { ...b.delivery!, originalDeliveredAt: DELIVERED, deliveredAt: "2026-11-02T14:37:00Z" };
    expect(inactivity([b])).toMatchObject({ anchorAt: "2026-11-02T14:37:00.000Z", dueAt: "2026-11-06T14:37:00.000Z" });
  });

  it("refuses foreign delivery identities and ambiguous duplicate books", () => {
    for (const change of [{ parentId: "other" }, { childId: "sibling" }, { workbookId: "other" }, { number: 2 }]) {
      const b = book(); b.delivery = { ...b.delivery!, ...change };
      expect(project(b, [receipt(b, 7), receipt(b, 70)])).toMatchObject({ delivery: { status: "invalid" }, candidate: null });
      expect(inactivity([b])).toEqual({ status: "refused", reason: "invalid-input" });
    }
    expect(inactivity([book(), book()])).toEqual({ status: "refused", reason: "ambiguous-books" });
  });

  it("ignores unchanged retakes and resets only with a matching admitted resolving event", () => {
    const b = book(), first = receipt(b, 1), retake = receipt(b, 1, "2026-11-05T14:00:00Z", "retake");
    const rows = [retake, first, first, retake];
    expect(inactivity([b], rows)).toMatchObject({ anchorAt: "2026-11-01T14:00:00.000Z", due: true });
    const event = resolved(retake);
    expect(inactivity([b], rows, { progressEvents: [event, event] })).toMatchObject({ anchorAt: "2026-11-05T14:00:00.000Z", dueAt: "2026-11-09T14:00:00.000Z", due: false });
    for (const change of [{ parentId: "other" }, { childId: "other" }, { workbookId: "other" }, { printedRevision: "other" },
      { pageId: "other" }, { receiptId: "absent" }, { resolvedItemIds: [] }, { admittedAt: "invalid" }, { admittedAt: "2099-01-01" }]) {
      expect(inactivity([b], rows, { progressEvents: [{ ...event, ...change }] })).toMatchObject({ anchorAt: "2026-11-01T14:00:00.000Z" });
    }
    expect(inactivity([b], rows, { progressEvents: [{ ...event, admittedAt: "2026-11-06T14:00:00Z" }] })).toMatchObject({ anchorAt: "2026-11-05T14:00:00.000Z" });
  });

  it("resets on a newly accepted required page but not an optional page or a sibling scan", () => {
    const b = book(), first = receipt(b, 1), optional = receipt(b, 99, "2026-11-05T14:00:00Z"), sibling = { ...receipt(b, 2, "2026-11-05T14:00:00Z"), childId: "sibling" };
    expect(inactivity([b], [first, optional, sibling])).toMatchObject({ anchorAt: "2026-11-01T14:00:00.000Z", due: true });
    expect(inactivity([b], [first, receipt(b, 2, "2026-11-05T14:00:00Z")])).toMatchObject({ anchorAt: "2026-11-05T14:00:00.000Z", due: false });
  });

  it("excludes conflicting resolving-event IDs and premature admission", () => {
    const b = book(), first = receipt(b, 1), retake = receipt(b, 1, "2026-11-05T14:00:00Z", "retake"), event = resolved(retake);
    for (const events of [[event, { ...event, resolvedItemIds: ["different-item"] }], [{ ...event, admittedAt: "2026-11-04T14:00:00Z" }]]) {
      expect(inactivity([b], [first, retake], { progressEvents: events })).toMatchObject({ anchorAt: "2026-11-01T14:00:00.000Z" });
    }
  });

  it("refuses invalid clocks and family zones without inventing a fallback timer", () => {
    expect(workbookScanProgress({ book: book(), receipts: [], now: NaN })).toEqual({ status: "refused", reason: "invalid-clock" });
    expect(inactivity([book()], [], { timeZone: "invalid" })).toEqual({ status: "refused", reason: "invalid-input" });
    expect(inactivity([book()], [], { now: Infinity })).toEqual({ status: "refused", reason: "invalid-input" });
  });

  it.each([
    ["America/Toronto", "2026-03-06T15:00:00.123Z", "2026-03-10T14:00:00.123Z"],
    ["America/Toronto", "2026-03-04T07:37:00.000Z", "2026-03-08T07:00:00.000Z"],
    ["America/Toronto", "2026-10-28T05:37:00.000Z", "2026-11-01T05:37:00.000Z"],
    ["America/Toronto", "2026-10-30T14:00:00.000Z", "2026-11-03T15:00:00.000Z"],
    ["America/Vancouver", "2026-10-30T16:00:00.000Z", "2026-11-03T16:00:00.000Z"],
    ["America/Edmonton", "2026-10-30T15:00:00.000Z", "2026-11-03T15:00:00.000Z"],
    [{ zone: "America/Chicago", override: false }, "2026-10-30T14:00:00.000Z", "2026-11-03T15:00:00.000Z"],
  ] satisfies [FamilyZone, string, string][])("is due exactly at four local days in %s", (timeZone, scanAt, dueAt) => {
    const b = book(); b.delivery = { ...b.delivery!, deliveredAt: "2026-01-01T15:00:00Z" };
    const scans = [receipt(b, 1, scanAt)];
    expect(inactivity([b], scans, { timeZone, now: Date.parse(dueAt) - 1 })).toMatchObject({ dueAt, due: false });
    expect(inactivity([b], scans, { timeZone, now: Date.parse(dueAt) })).toMatchObject({ dueAt, due: true });
  });

  it("uses an explicit family-zone override after a qualifying scan", () => {
    const b = book(); b.delivery = { ...b.delivery!, deliveredAt: "2026-01-01T15:00:00Z" };
    const timeZone = familyZone({ timeZone: "America/Toronto", postal: "V3S 1A1", province: "BC" });
    expect(inactivity([b], [receipt(b, 1, "2026-10-30T14:00:00Z")], { timeZone })).toMatchObject({ dueAt: "2026-11-03T15:00:00.000Z" });
  });

  it("uses deliveryDeadlines at the four-day and 21-day boundaries and holds book 2 with no scans", () => {
    const b = book(2), deadlines = deliveryDeadlines(b.delivery!);
    expect(inactivity([b], [], { now: Date.parse(deadlines.reminderAt) - 1 })).toMatchObject({ dueAt: deadlines.reminderAt, due: false });
    expect(inactivity([b], [], { now: Date.parse(deadlines.reminderAt) })).toMatchObject({ dueAt: deadlines.reminderAt, due: true });
    expect(project(b, [], { now: Date.parse(deadlines.backstopAt) - 1 }).holdReason).toBeNull();
    expect(project(b, [], { now: Date.parse(deadlines.backstopAt) })).toMatchObject({ candidate: null, holdReason: "no-accepted-scans-at-backstop" });
    expect(project(b, [receipt(book(), 1)], { now: Date.parse(deadlines.backstopAt) })).toMatchObject({ candidate: null, holdReason: "no-accepted-scans-at-backstop" });
    expect(project(b, [receipt(b, 10)], { now: Date.parse(deadlines.backstopAt) })).toMatchObject({ candidate: "delivery_backstop", day7Ready: false, holdReason: null });
  });
});
