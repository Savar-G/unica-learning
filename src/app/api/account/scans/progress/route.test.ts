import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanProgressSnapshot, ScanProgressStore } from "@/lib/workbook-scan-progress-reader";
import type { HistoryRecord, HistoryStore } from "@/lib/scan-history";
vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ signedIn: true, active: true, marking: true,
  parent: "00000000-0000-4000-8000-000000000001", progress: null as unknown, history: null as unknown,
  progressFactory: vi.fn(), historyFactory: vi.fn() }));
vi.mock("@/lib/scan-photo-server", () => ({
  scanSession: async () => { if (!h.signedIn) throw Error("signed_out"); return { admin: {}, parent: h.parent, active: async () => h.active }; },
  scanJson: (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } }),
}));
vi.mock("@/lib/scan-marking-server", () => ({ markingAccess: async () => h.marking }));
vi.mock("@/lib/workbook-scan-progress-store", () => ({ workbookScanProgressStore: () => { h.progressFactory(); return h.progress; } }));
vi.mock("@/lib/scan-history-reader", () => ({ scanHistoryStore: () => { h.historyFactory(); return h.history; } }));
import { GET } from "./route";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const scope = { parentId: id(1), childId: id(2), workbookId: id(3) };
const revision = "a".repeat(28);
let snapshot: ScanProgressSnapshot, store: ScanProgressStore, records: HistoryRecord[];
const request = (query = `child=${scope.childId}&workbook=${scope.workbookId}`) => new Request(`https://synthetic.invalid/api/account/scans/progress?${query}`);
beforeEach(() => {
  Object.assign(h, { signedIn: true, active: true, marking: true, parent: scope.parentId });
  h.progressFactory.mockReset(); h.historyFactory.mockReset();
  const pages = [1,2,3].map(number => ({ id: id(100+number), number, type: "practice", dayLabel: number === 3 ? "Extra practice" : "Day 7", questions: [{}] }));
  snapshot = { book: { ...scope, number: 1, printedRevision: revision, pages,
    manifest: { version: 1, curriculum: { key: "synthetic", version: "frozen" }, snapshotDay: 7, testWorkbook: false,
      days: [{ day: 7, pages: [1,2] }], levelTest: null }, delivery: null },
    receipts: [{ ...scope, id: id(201), printedRevision: revision, status: "accepted", pageId: id(101),
      photoRevision: id(301), acceptedAt: "2026-01-01T12:00:00.000Z" }], progressEvents: [],
    clockRequestPresent: false, currentCalendar: null, claim: null, claimCalendar: null, hold: null };
  store = { read: vi.fn(async selected => selected.parentId === scope.parentId && selected.childId === scope.childId
    && selected.workbookId === scope.workbookId ? structuredClone(snapshot) : null), recheck: vi.fn(async () => true) };
  records = [{ id: id(101), childId: scope.childId, childName: "Private synthetic child", workbookId: scope.workbookId,
    book: 1, revision, day: "Day 7", pageNumber: 1, marks: [], jobs: [], spend: [],
    photos: [{ id: id(301), state: "saved", at: "2026-01-01", expiresAt: "2099-01-01", sentAt: null }] }];
  const history: HistoryStore = { read: vi.fn(async filter => ({ pages: records.filter(r => !filter.after || r.id > filter.after), budget: null })) };
  h.progress = store; h.history = history;
});

describe("parent scan progress HTTP read with the real pure readers", () => {
  it("shows the frozen required set and separates accepted scans from pending marking", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const result = await response.json();
    expect(result.days).toEqual([{ day: 7, requiredPages: [1,2], acceptedPages: [1], gaps: [2], complete: false }]);
    expect(result.pages).toEqual([
      { number: 1, scanned: true, markingStatus: "pending", reviewReady: false },
      { number: 2, scanned: false, markingStatus: null, reviewReady: null },
      { number: 3, scanned: false, markingStatus: null, reviewReady: null },
    ]);
    expect(result.acceptedPageCount).toBe(1); expect(result.day7Ready).toBe(false);
    expect(result.delivery).toEqual({ status: "missing", deliveredAt: null, clockStatus: "missing-delivery", backstopAt: null });
    expect(result.trigger).toEqual({ status: "waiting" });
    expect(JSON.stringify(result)).not.toMatch(/Private synthetic|receiptIds|photoRevision|audit|cost|answer|credential|claimCalendar/);
    expect(JSON.stringify(result)).not.toContain(id(201)); expect(JSON.stringify(result)).not.toContain(id(301));
  });
  it("ignores browser parent, receipt, time and candidate values", async () => {
    const response = await GET(request(`child=${scope.childId}&workbook=${scope.workbookId}&parent=${id(99)}&now=2099-01-01&accepted=true&candidate=day7_scanned`));
    expect(response.status).toBe(200); expect(store.read).toHaveBeenCalledWith(scope);
    expect((await response.json()).day7Ready).toBe(false);
  });
  it.each(["child", "workbook"])("refuses another %s without returning a partial view", async field => {
    const query = new URLSearchParams({ child: scope.childId, workbook: scope.workbookId }); query.set(field, id(99));
    const response = await GET(request(query.toString()));
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "refused" });
  });
  it("uses the current signed-in parent rather than a service key or query parent", async () => {
    h.parent = id(99);
    expect((await GET(request())).status).toBe(404);
    expect(store.read).toHaveBeenCalledWith({ ...scope, parentId: id(99) });
  });
  it("rechecks live session and family state after the read", async () => {
    h.active = false; expect((await GET(request())).status).toBe(404); h.active = true;
    store.recheck = async () => false; expect((await GET(request())).status).toBe(404);
  });
  it("does not bypass sign-in or the scan release gate", async () => {
    h.signedIn = false;
    await expect(GET(request())).rejects.toThrow("signed_out");
    expect(h.progressFactory).not.toHaveBeenCalled(); expect(h.historyFactory).not.toHaveBeenCalled();
  });
  it("keeps accepted progress when marking is off and does not read its gated history", async () => {
    h.marking = false;
    const response = await GET(request()); expect(response.status).toBe(200);
    const data = await response.json(); expect(data.acceptedPageCount).toBe(1);
    expect(data.pages.every((p: {markingStatus: unknown}) => p.markingStatus === null)).toBe(true);
    expect(h.historyFactory).not.toHaveBeenCalled();
  });
  it("returns an unavailable response after a store error, with no private error text", async () => {
    store.read = async () => { throw Error("private synthetic database details"); };
    const response = await GET(request()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
  it.each(["", "child=bad&workbook=bad", `child=${scope.childId}`, `child=${scope.childId}&workbook=bad`])("rejects invalid scope before a service progress read: %s", async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(h.progressFactory).not.toHaveBeenCalled(); expect(h.historyFactory).not.toHaveBeenCalled();
  });
  it("shows the persisted deadline rather than replacing it with a current projection", async () => {
    snapshot.book.delivery = { ...scope, number: 1, auditId: 1, actorId: id(9), deliveredAt: "2026-01-01T12:00:00Z",
      localTime: "2026-01-01T12:00", timeZone: "UTC", recordedAt: "2026-01-01T12:00:00Z" };
    snapshot.clockRequestPresent = true;
    let response = await GET(request()), data = await response.json();
    expect(data.delivery.clockStatus).toBe("clock-required"); expect(data.delivery.backstopAt).toBeNull();
    snapshot.currentCalendar = { deliveryAuditId: 1, backstopAt: "2026-01-22T13:00:00Z", clockVersion: "stored", recordedAt: "2026-01-01T12:00:00Z" };
    response = await GET(request()); data = await response.json();
    expect(data.delivery.clockStatus).toBe("recorded"); expect(data.delivery.backstopAt).toBe("2026-01-22T13:00:00Z");
    expect(data.trigger.status).toBe("waiting"); // A due projection does not invent a persisted claim.
  });
  it("shows a persisted zero-scan HOLD without treating it as a next-book claim", async () => {
    snapshot.receipts = [];
    snapshot.hold = { deliveryAuditId: 1, deliveredAt: "2026-01-01T12:00:00Z", backstopAt: "2026-01-22T12:00:00Z",
      heldAt: "2026-01-22T12:00:00Z", reason: "no-accepted-scans-at-backstop" };
    const data = await (await GET(request())).json();
    expect(data.acceptedPageCount).toBe(0); expect(data.day7Ready).toBe(false);
    expect(data.trigger).toEqual({ status: "hold", reason: "no-accepted-scans-at-backstop" });
    expect(JSON.stringify(data)).not.toMatch(/deliveryAuditId|heldAt/);
  });
});
