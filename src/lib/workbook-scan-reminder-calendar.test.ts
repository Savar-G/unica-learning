import { describe, expect, it } from "vitest";
import { proposeWorkbookScanInactivity, type ScanInactivityCalendarStore, type ScanInactivityIdentity, type ScanInactivityWrite } from "@/lib/workbook-scan-reminder-calendar";
import type { ScanProgressSnapshot, ScanProgressStore } from "@/lib/workbook-scan-progress-reader";
import type { AcceptedScanReceipt } from "@/lib/workbook-scan-progress";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const scope = { parentId: id(1), childId: id(2), workbookId: id(3) };
  const deliveredAt = "2026-10-30T13:37:00.000Z";
  const snapshot: ScanProgressSnapshot = {
    book: { ...scope, number: 1, printedRevision: "a".repeat(28),
      pages: Array.from({ length: 10 }, (_, i) => ({ id: id(100 + i), number: i + 1,
        type: "practice", dayLabel: `Day ${i + 1}`, questions: [{}] })),
      manifest: { version: 1, curriculum: { key: "bc", version: "fixed" }, snapshotDay: 7,
        testWorkbook: false, levelTest: null, days: Array.from({ length: 10 }, (_, i) => ({ day: i + 1, pages: [i + 1] })) },
      delivery: { ...scope, number: 1, deliveredAt, localTime: "2026-10-30T09:37", timeZone: "America/Toronto",
        recordedAt: deliveredAt, actorId: id(4), auditId: 7 } },
    receipts: [], progressEvents: [], clockRequestPresent: false, currentCalendar: null,
    claim: null, claimCalendar: null, hold: null,
  };
  const identity: ScanInactivityIdentity = { ...scope, number: 1, printedRevision: snapshot.book.printedRevision,
    deliveryAuditId: 7, deliveredAt, deliveryTimeZone: "America/Toronto", deliveryZoneOverride: true,
    activityReceiptId: null, activityKey: id(0), anchorAt: deliveredAt, zoneMode: "delivery",
    clockContext: { version: 1, timeZone: "America/Toronto", postal: null, oldestChild: null } };
  const writes: { identity: ScanInactivityIdentity; dueAt: string; version: string }[] = [];
  let available = true;
  const progress: ScanProgressStore = { read: async () => available ? structuredClone(snapshot) : null,
    recheck: async () => available };
  const calendars: ScanInactivityCalendarStore = {
    context: async () => ({ status: "read", observedAt: "2026-11-06T18:00:00.000Z", identity: structuredClone(identity) }),
    propose: async (saved, dueAt, version) => { writes.push({ identity: saved, dueAt, version }); return "recorded"; },
  };
  const receipt = (n: number, at: string, key = id(60 + n)): AcceptedScanReceipt => ({ ...scope,
    printedRevision: snapshot.book.printedRevision, pageId: id(99 + n), id: key,
    status: "accepted", photoRevision: id(200 + n), acceptedAt: at });
  const run = () => proposeWorkbookScanInactivity(calendars, progress, scope.workbookId, "reviewed-clock-v1");
  return { scope, snapshot, identity, calendars, progress, writes, receipt, run, freeze: () => { available = false; } };
}

describe("trusted scan inactivity calendars", () => {
  it("uses four local calendar days across a clock change instead of 96 elapsed hours", async () => {
    const f = fixture();
    expect(await f.run()).toBe("recorded");
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].dueAt).toBe("2026-11-03T14:37:00.000Z");
    expect(Date.parse(f.writes[0].dueAt) - Date.parse(f.identity.anchorAt)).not.toBe(96 * 3_600_000);
  });

  it("uses the current family zone for a later accepted scan, not the delivery zone", async () => {
    const f = fixture(), scan = f.receipt(1, "2026-10-31T13:37:00.000Z");
    f.snapshot.receipts = [scan];
    f.snapshot.book.delivery!.timeZone = "UTC";
    f.snapshot.book.delivery!.localTime = "2026-10-30T13:37";
    Object.assign(f.identity, { deliveryTimeZone: "UTC", activityReceiptId: scan.id, activityKey: scan.id,
      anchorAt: scan.acceptedAt, zoneMode: "family" });
    expect(await f.run()).toBe("recorded");
    expect(f.writes[0].dueAt).toBe("2026-11-04T14:37:00.000Z");
  });

  it("rejects a delivery-zone claim for activity after delivery", async () => {
    const f = fixture(), scan = f.receipt(1, "2026-10-31T13:37:00.000Z");
    f.snapshot.receipts = [scan];
    f.snapshot.book.delivery!.timeZone = "UTC";
    f.snapshot.book.delivery!.localTime = "2026-10-30T13:37";
    Object.assign(f.identity, { deliveryTimeZone: "UTC", activityReceiptId: scan.id, activityKey: scan.id,
      anchorAt: scan.acceptedAt, zoneMode: "delivery" });
    expect(await f.run()).toBe("stale");
    expect(f.writes).toHaveLength(0);
  });

  it("retains a receipt's explicit native-zone mode", async () => {
    const f = fixture();
    f.snapshot.book.delivery!.timeZone = { zone: "America/Toronto", override: false };
    f.identity.deliveryZoneOverride = false;
    expect(await f.run()).toBe("recorded");
    expect(f.writes[0].dueAt).toBe("2026-11-03T14:37:00.000Z");
  });

  it("uses the effective correction audit and refuses its old delivery identity", async () => {
    const f = fixture(), delivery = f.snapshot.book.delivery!;
    delivery.correction = { id: id(80), reason: "Correct delivery time", deliveredAt: "2026-10-31T13:37:00.000Z",
      recordedAt: "2026-11-01T18:00:00.000Z", actorId: id(4), auditId: 8, previousDeliveredAt: delivery.deliveredAt };
    delivery.originalDeliveredAt = delivery.deliveredAt;
    delivery.deliveredAt = delivery.correction.deliveredAt;
    delivery.localTime = "2026-10-31T09:37";
    expect(await f.run()).toBe("stale");
    expect(f.writes).toHaveLength(0);
    Object.assign(f.identity, { deliveryAuditId: 8, deliveredAt: delivery.deliveredAt, anchorAt: delivery.deliveredAt });
    expect(await f.run()).toBe("recorded");
    expect(f.writes[0].dueAt).toBe("2026-11-04T14:37:00.000Z");
  });

  it("does not let an unchanged retake move inactivity", async () => {
    const f = fixture(), first = f.receipt(1, "2026-10-31T13:37:00.000Z"), retake = f.receipt(1, "2026-11-02T18:00:00.000Z", id(90));
    f.snapshot.receipts = [first, retake];
    Object.assign(f.identity, { activityReceiptId: retake.id, activityKey: retake.id, anchorAt: retake.acceptedAt, zoneMode: "family" });
    expect(await f.run()).toBe("stale");
    expect(f.writes).toHaveLength(0);
  });

  it("uses the resolving retake's accepted time, not its delayed admission time", async () => {
    const f = fixture(), first = f.receipt(1, "2026-10-31T13:37:00.000Z"), retake = f.receipt(1, "2026-11-02T18:00:00.123Z", id(90));
    f.snapshot.receipts = [first, retake];
    f.snapshot.progressEvents = [{ ...retake, id: id(91), reason: "pending-evidence-resolved", receiptId: retake.id,
      admittedAt: "2026-11-06T17:00:00.000Z", resolvedItemIds: ["fixed-item"] }];
    Object.assign(f.identity, { activityReceiptId: retake.id, activityKey: retake.id, anchorAt: "2026-11-02T18:00:00.123456Z", zoneMode: "family" });
    expect(await f.run()).toBe("recorded");
    expect(f.writes[0].dueAt).toBe("2026-11-06T18:00:00.123Z");
  });

  it.each(["number", "printedRevision", "deliveryAuditId", "deliveredAt", "deliveryTimeZone", "deliveryZoneOverride", "anchorAt"] as const)
  ("rejects a changed saved identity field: %s", async (field) => {
    const f = fixture();
    Object.assign(f.identity, { [field]: typeof f.identity[field] === "number" ? 99
      : typeof f.identity[field] === "boolean" ? false : "changed" });
    expect(await f.run()).toBe("stale");
    expect(f.writes).toHaveLength(0);
  });

  it("rechecks a family fence immediately before the calendar write", async () => {
    const f = fixture();f.progress.recheck = async () => { f.freeze();return false; };
    expect(await f.run()).toBe("stale");
    expect(f.writes).toHaveLength(0);
  });

  it("does not write after the full saved page set becomes complete", async () => {
    const f = fixture();f.snapshot.receipts = f.snapshot.book.pages.map((p) => f.receipt(p.number, "2026-11-01T18:00:00.000Z"));
    expect(await f.run()).toBe("stale");
    expect(f.writes).toHaveLength(0);
  });

  it("retains a stored calendar conflict instead of replacing its deadline", async () => {
    const f = fixture();f.calendars.propose = async () => "calendar-conflict" as ScanInactivityWrite;
    expect(await f.run()).toBe("calendar-conflict");
    expect(f.writes).toHaveLength(0);
  });

  it("does not turn an unavailable or missing context into a calendar", async () => {
    const f = fixture();f.calendars.context = async () => ({ status: "unavailable" });
    expect(await f.run()).toBe("unavailable");
    f.calendars.context = async () => ({ status: "read", observedAt: "2026-11-06T18:00:00Z", identity: null });
    expect(await f.run()).toBe("none");
    expect(f.writes).toHaveLength(0);
  });
});
