import { describe, expect, it, vi } from "vitest";
import { adminScanProgress } from "@/lib/admin-scan-progress";
import { readWorkbookScanProgress, type ScanProgressSnapshot, type ScanProgressStore } from "@/lib/workbook-scan-progress-reader";
import { EMAIL_KINDS, EMAIL_LABEL } from "@/lib/admin-dashboard";
vi.mock("server-only", () => ({}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { parentId: id(1), childId: id(2), workbookId: id(3) };
const revision = "a".repeat(28), delivered = "2026-10-01T12:00:00.000Z", deadline = "2026-10-22T12:00:00.000Z";
function fixture() {
  const book = { ...scope, number: 1, printedRevision: revision,
    pages: [1, 2, 3].map(n => ({ id: id(10 + n), number: n, type: "practice", dayLabel: n === 3 ? "Day 7" : "Day 1", questions: [{ number: 1 }] })),
    manifest: { version: 1 as const, curriculum: { key: "test", version: "1" }, snapshotDay: 7 as const, testWorkbook: false,
      days: [{ day: 1, pages: [1, 2] }, { day: 7, pages: [3] }], levelTest: null },
    delivery: { ...scope, number: 1, deliveredAt: delivered, timeZone: "America/Vancouver", auditId: 10, recordedAt: delivered, actorId: id(9), localTime: "2026-10-01T05:00" } };
  const snapshot: ScanProgressSnapshot = { book, receipts: [], progressEvents: [], clockRequestPresent: true,
    currentCalendar: { deliveryAuditId: 10, backstopAt: deadline, recordedAt: delivered, clockVersion: "1" }, claim: null, claimCalendar: null,
    hold: { deliveryAuditId: 10, heldAt: deadline, deliveredAt: delivered, backstopAt: deadline, reason: "no-accepted-scans-at-backstop" } };
  const store: ScanProgressStore = { read: async () => snapshot, recheck: async () => true };
  return { book, snapshot, store };
}
async function read(store: ScanProgressStore) {
  const result = await readWorkbookScanProgress(store, scope, Date.parse("2026-11-01T12:00:00Z"));
  if (result.status !== "available") throw new Error("progress unavailable");
  return adminScanProgress(result);
}

describe("admin scan progress", () => {
  it("shows printed day gaps, a current hold and a family-local deadline", async () => {
    const f = fixture();
    const view = await read(f.store);
    expect(view.held).toBe(true);
    expect(view.days.map(d => [d.day, d.required, d.accepted, d.gaps])).toEqual([[1, [1, 2], [], [1, 2]], [7, [3], [], [3]]]);
    expect(view.days[0].pages[0]).toMatchObject({ marking: "Marking status unavailable", review: "Review status unavailable" });
    expect(view.backstop).toContain("5:00 a.m.");
    expect(view.claim).toBeNull();
  });
  it("removes a hold after an accepted scan without inventing a trigger or marking state", async () => {
    const f = fixture();
    f.snapshot.receipts = [{ ...scope, id: id(20), printedRevision: revision, pageId: id(11), photoRevision: id(21), status: "accepted", acceptedAt: delivered }];
    const view = await read(f.store);
    expect(view.held).toBe(false);
    expect(view.days[0]).toMatchObject({ accepted: [1], gaps: [2] });
    expect(view.claim).toBeNull();
  });
  it("shows the persisted Day 7 claim time and keeps marking separate from scans", async () => {
    const f = fixture();
    f.snapshot.hold = null;
    f.snapshot.receipts = [{ ...scope, id: id(20), printedRevision: revision, pageId: id(13), photoRevision: id(21), status: "accepted", acceptedAt: delivered }];
    f.snapshot.claim = { id: id(30), reason: "day7_scanned", claimedAt: delivered, effectiveAt: delivered,
      deliveryAuditId: 10, deliveryCorrectionId: null, deliveredAt: delivered, timeZone: "America/Vancouver", zoneOverride: true,
      backstopAt: null, receiptIds: [id(20)] };
    const view = await read(f.store);
    expect(view.claim).toEqual({ reason: "day7_scanned", at: expect.stringContaining("5:00 a.m.") });
    expect(view.days[1]).toMatchObject({ accepted: [3], gaps: [] });
    expect(view.days[1].pages[0].marking).toBe("Marking status unavailable");
  });
  it("shows missing delivery separately and does not infer a deadline", async () => {
    const f = fixture();
    f.snapshot.book.delivery = null; f.snapshot.currentCalendar = null; f.snapshot.hold = null;
    const view = await read(f.store);
    expect(view).toMatchObject({ delivery: "missing", backstop: null, held: false, claim: null });
  });
  it("maps scan emails to the admin list", () => {
    expect(EMAIL_LABEL.scan_inactivity).toBe("Scan reminder");
    expect(EMAIL_KINDS.find(k => k.kind === "scan_inactivity")?.subject).toBe("Ready to scan your next page?");
  });
});
