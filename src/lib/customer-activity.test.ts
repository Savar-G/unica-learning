import { describe, expect, it } from "vitest";
import { activityCursor, activityInput, activityPage, contactInput, inactivity, progressSummary, telemetryRequestAllowed } from "@/lib/customer-activity";
import { workbookScanProgress, type ScanProgressBook } from "@/lib/workbook-scan-progress";
import { expectedItems, firstObservation } from "@/lib/scan-observation";
import { historyPage } from "@/lib/scan-history";
import { familyZone } from "@/lib/family-time";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = () => ({ event: "scanner_opened", page: "scanner", request: id(1), child: id(2), book: null });
describe("private activity admission", () => {
  it("admits fixed owned-reference shapes only, with no arbitrary metadata", () => {
    expect(activityInput(input())).toEqual(input());
    for (const extra of [{ url: "/private?token=secret" }, { note: "private" }, { result: "completed" }, { actor: id(3) }, { time: Date.now() }, { metadata: {} }]) expect(activityInput({ ...input(), ...extra })).toBeNull();
    for (const v of [null, [], {}, { ...input(), event: "scan_completed" }, { ...input(), child: "other" }, { ...input(), page: "https://secret" }, { ...input(), request: "bad" }, { ...input(), book: id(4), child: null }, { ...input(), child: null }, { ...input(), event: "maya_chat_attempt", page: "desk" }]) expect(activityInput(v)).toBeNull();
  });
  it("bounds private notes and refuses client actor identity", () => {
    const note = { parent: id(1), child: null, request: id(3), note: " Contacted family " };
    expect(contactInput(note)?.note).toBe("Contacted family");
    expect(contactInput({ ...note, note: "x".repeat(2001) })).toBeNull();
    expect(contactInput({ ...note, note: " " })).toBeNull();
    expect(contactInput({ ...note, admin: id(4) })).toBeNull();
  });
  it("requires granted receiving consent and an explicit same-origin request", () => {
    const req = (origin: string | null, site = "same-origin") => new Request("https://unicalearning.com/api/account/activity", { headers: { ...(origin ? { origin } : {}), "sec-fetch-site": site } });
    expect(telemetryRequestAllowed(req("https://unicalearning.com"), "granted")).toBe(true);
    for (const choice of [undefined, "denied", "unset"]) expect(telemetryRequestAllowed(req("https://unicalearning.com"), choice)).toBe(false);
    expect(telemetryRequestAllowed(req(null), "granted")).toBe(false);
    expect(telemetryRequestAllowed(req("https://other.test"), "granted")).toBe(false);
    expect(telemetryRequestAllowed(req("https://unicalearning.com", "cross-site"), "granted")).toBe(false);
  });
  it("does not send raw paths or token routes", () => {
    expect(activityPage("/account/workbooks/" + id(1))).toBe("workbooks");
    for (const path of ["/tutor/p/SECRET", "/admin", "/auth/callback", "/account/sign-in-link/SECRET"]) expect(activityPage(path)).toBeNull();
  });
  it("keeps both timestamp and key in a stable cursor", () => {
    const cursor = `2026-11-16T12:00:00Z|activity:${id(1)}`;
    expect(activityCursor(cursor)).toEqual({ at: "2026-11-16T12:00:00Z", key: `activity:${id(1)}` });
    for (const v of ["2026-11-16T12:00:00Z", "bad|activity:x", "2026-11-16T12:00:00Z|../secret"]) expect(() => activityCursor(v)).toThrow();
  });
});
describe("observed printed progress", () => {
  function project(accepted: boolean, marked: boolean | null) {
    const book: ScanProgressBook = { parentId: id(1), childId: id(2), workbookId: id(3), number: 1, printedRevision: "a".repeat(28), delivery: null,
      pages: [{ id: id(4), number: 1, type: "practice", dayLabel: "Day 7", questions: [{}] }],
      manifest: { version: 1, curriculum: { key: "bc", version: "frozen" }, snapshotDay: 7, testWorkbook: false, days: [{ day: 7, pages: [1] }], levelTest: null } };
    const expected = expectedItems({ workbookId: book.workbookId, printedRevision: book.printedRevision, pageId: id(4), questions: [{ number: 1, package: null, teaching: null }] })[0];
    const observation = firstObservation(expected, "photo");
    if (marked) { expected.method = "unscored"; observation.method = "unscored"; observation.state = "unscored"; }
    const page = historyPage({ id: id(4), childId: id(2), childName: "Child", workbookId: id(3), book: 1, revision: book.printedRevision, day: "Day 7", pageNumber: 1,
      marks: [{ expected, observation, originalEvent: null, eventId: null, at: "2026-11-16T12:00:00Z", model: null, prompt: null }], photos: [], jobs: [], spend: [] }, Date.parse("2026-11-16T12:00:00Z"));
    const p = workbookScanProgress({ book, now: Date.parse("2026-11-16T12:00:00Z"),
      receipts: accepted ? [{ parentId: id(1), childId: id(2), workbookId: id(3), printedRevision: book.printedRevision, pageId: id(4), id: id(5), status: "accepted", photoRevision: id(6), acceptedAt: "2026-11-16T11:00:00Z" }] : [],
      ...(marked === null ? {} : { reviews: [{ parentId: id(1), page }] }) });
    if (p.status !== "available") throw new Error("fixture refused");
    return progressSummary(p);
  }
  it("keeps receipt acceptance, effective marking and unknown history separate", () => {
    expect(project(true, null)).toMatchObject({ scannedDays: 1, markedDays: null, markedPages: null });
    expect(project(true, false)).toMatchObject({ scannedDays: 1, markedDays: 0, markedPages: 0 });
    expect(project(false, true)).toMatchObject({ scannedDays: 0, markedDays: 1, markedPages: 1 });
    expect(project(true, true)).toMatchObject({ scannedDays: 1, markedDays: 1 });
  });
});
describe("meaningful-work inactivity", () => {
  const zone = familyZone({ timeZone: "America/Toronto" });
  it("uses four local days across the end of daylight saving time", () => {
    const delivered = "2026-10-30T17:00:00.000Z";
    const due = "2026-11-03T18:00:00.000Z";
    expect(inactivity(delivered, null, zone, Date.parse(due) - 1)).toMatchObject({ state: "recent", due });
    expect(inactivity(delivered, null, zone, Date.parse(due))).toMatchObject({ state: "due", due });
  });
  it("uses the dated Vancouver override", () => {
    const bc = familyZone({ timeZone: "America/Vancouver" });
    expect(inactivity("2026-10-30T17:00:00.000Z", null, bc, Date.parse("2026-11-03T17:00:00Z")).due).toBe("2026-11-03T17:00:00.000Z");
  });
  it("requires confirmed delivery, does not accept future work, and suppresses finished books", () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(inactivity(null, null, zone, now).state).toBe("unknown");
    expect(inactivity("2026-11-10T12:00:00Z", "2026-12-01T12:00:00Z", zone, now).state).toBe("unknown");
    expect(inactivity("2026-11-10T12:00:00Z", null, zone, now, true).state).toBe("finished");
  });
});
