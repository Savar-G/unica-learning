import { describe, expect, it } from "vitest";
import { runWorkbookScanMaintenance, type ScanMaintenanceDependencies } from "@/lib/workbook-scan-maintenance";
import type { ScanRecoveryBook, ScanRecoveryKind } from "@/lib/workbook-scan-reminder-store";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const book = (n: number, parent = 1): ScanRecoveryBook => ({ workbookId: id(100 + n), parentId: id(parent),
  childId: id(10 + n), number: n, deliveryAuditId: 500 + n });
function setup() {
  const events: string[] = [], sends: { parent: string; episodes: readonly string[] }[] = [];
  const recorded: string[] = [];
  const batches: Record<ScanRecoveryKind, ScanRecoveryBook[]> = {
    unseeded: [book(1)], due: [], inactivity: [book(1)], "reminder-due": [book(1), book(2)] };
  let now = 0, permit = true;
  const clockBatches: string[][] = [];
  const deps: ScanMaintenanceDependencies = {
    books: async kind => { events.push(kind); return batches[kind]; },
    allowed: async parent => permit && parent === id(1),
    clocks: {
      reconcile: async ids => { clockBatches.push([...ids]); events.push("reconcile"); },
      requests: async () => [book(1), book(9, 9)].map(b => ({ workbookId: b.workbookId, deliveryAuditId: b.deliveryAuditId,
        deliveredAt: "2026-10-30T13:00:00Z", timeZone: "America/Toronto", zoneOverride: true })),
      record: async request => { recorded.push(request.workbookId); return "waiting"; },
    },
    progress: { read: async () => null, recheck: async () => true },
    calendars: { context: async () => ({ status: "read", observedAt: "2026-11-06T12:00:00Z", identity: null }),
      propose: async () => { throw new Error("No calendar is due in this fixture"); } },
    due: async parent => { events.push(`due:${parent}`); return { status: "ready", episodeIds: [id(31), id(32)], childIds: [id(11), id(12)] }; },
    send: async (parent, episodes) => { sends.push({ parent, episodes }); return { status: "sent", emailId: "fake-provider" }; },
  };
  const options = { limit: 5, clockVersion: "shared-clock-v1", time: { now: () => now, endAt: 100 } };
  return { deps, options, events, sends, recorded, clockBatches, batches,
    tick: (value: number) => { now = value; }, deny: () => { permit = false; } };
}

describe("bounded workbook scan maintenance", () => {
  it("recovers only admitted books and combines the complete current sibling set into one message", async () => {
    const f = setup();
    f.batches.unseeded.push(book(9, 9));
    const result = await runWorkbookScanMaintenance(f.deps, f.options);
    expect(f.clockBatches).toEqual([[book(1).workbookId]]);
    expect(f.recorded).toEqual([book(1).workbookId]);
    expect(f.sends).toEqual([{ parent: id(1), episodes: [id(31), id(32)] }]);
    expect(f.events).toEqual(["unseeded", "due", "reconcile", "inactivity", "reminder-due", `due:${id(1)}`]);
    expect(result).toMatchObject({ selectedBooks: 2, outOfTime: false, moreMayRemain: false,
      calendars: [{ workbookId: book(1).workbookId, status: "none" }], reminders: [{ parentId: id(1), status: "sent" }] });
    expect(result.clocks?.reconciledBooks).toBe(1);
  });

  it("uses all due siblings even when only one book fit into the selection", async () => {
    const f = setup();
    f.batches["reminder-due"] = [book(1)];
    await runWorkbookScanMaintenance(f.deps, f.options);
    expect(f.sends[0].episodes).toEqual([id(31), id(32)]);
  });

  it("leaves reminder delivery off when no send function is provided", async () => {
    const f = setup();
    delete f.deps.send;
    const result = await runWorkbookScanMaintenance(f.deps, f.options);
    expect(f.sends).toEqual([]);
    expect(result.reminders).toEqual([{ parentId: id(1), status: "delivery-off" }]);
  });

  it("rechecks a removed rollout permission before send", async () => {
    const f = setup();
    f.deps.due = async () => { f.deny(); return { status: "ready", episodeIds: [id(31)], childIds: [id(11)] }; };
    await runWorkbookScanMaintenance(f.deps, f.options);
    expect(f.sends).toEqual([]);
  });

  it("does no work after an expired budget or an already aborted signal", async () => {
    for (const mode of ["time", "signal"]) {
      const f = setup(), controller = new AbortController();
      if (mode === "time") f.tick(100); else controller.abort();
      const result = await runWorkbookScanMaintenance(f.deps, { ...f.options, signal: controller.signal });
      expect(result.outOfTime).toBe(true);
      expect(f.events).toEqual([]);
    }
  });

  it("does not start a following phase when selection exhausts the budget", async () => {
    const f = setup();
    f.deps.books = async kind => { f.events.push(kind); f.tick(100); return [book(1)]; };
    expect((await runWorkbookScanMaintenance(f.deps, f.options)).outOfTime).toBe(true);
    expect(f.events).toEqual(["unseeded"]);
    expect(f.clockBatches).toEqual([]);
  });

  it("does not dispatch after a due read is cancelled", async () => {
    const f = setup(), controller = new AbortController();
    f.deps.due = async () => { controller.abort(); return { status: "ready", episodeIds: [id(31)], childIds: [id(11)] }; };
    expect((await runWorkbookScanMaintenance(f.deps, { ...f.options, signal: controller.signal })).outOfTime).toBe(true);
    expect(f.sends).toEqual([]);
  });

  it("stops on a database failure instead of starting another family phase", async () => {
    const f = setup();
    f.deps.books = async kind => { f.events.push(kind); throw new Error("synthetic unavailable"); };
    await expect(runWorkbookScanMaintenance(f.deps, f.options)).rejects.toThrow("synthetic unavailable");
    expect(f.events).toEqual(["unseeded"]);
    expect(f.sends).toEqual([]);
  });

  it("does not let tolerant clock recovery hide a failed permission read", async () => {
    const f = setup();
    f.batches.due = [book(1)];
    let reads = 0;
    f.deps.allowed = async () => {
      if (++reads === 3) throw new Error("synthetic permission read failure");
      return true;
    };
    await expect(runWorkbookScanMaintenance(f.deps, f.options)).rejects.toThrow("synthetic permission read failure");
    expect(f.events).toEqual(["unseeded", "due", "reconcile"]);
    expect(f.recorded).toEqual([]);
    expect(f.sends).toEqual([]);
  });

  it("stops later records and phases after an uncertain clock write", async () => {
    const f = setup();
    f.batches.unseeded = [book(1), book(2)];
    f.deps.clocks.requests = async () => [book(1), book(2)].map(b => ({ workbookId: b.workbookId,
      deliveryAuditId: b.deliveryAuditId, deliveredAt: "2026-10-30T13:00:00Z", timeZone: "UTC", zoneOverride: true }));
    const attempted: string[] = [];
    f.deps.clocks.record = async request => { attempted.push(request.workbookId); throw new Error("synthetic lost write"); };
    await expect(runWorkbookScanMaintenance(f.deps, f.options)).rejects.toThrow("synthetic lost write");
    expect(attempted).toEqual([book(1).workbookId]);
    expect(f.events).toEqual(["unseeded", "due", "reconcile"]);
    expect(f.sends).toEqual([]);
  });

  it.each([0, 101, 1.5])("refuses an invalid limit %s before a read", async limit => {
    const f = setup();
    await expect(runWorkbookScanMaintenance(f.deps, { ...f.options, limit })).rejects.toThrow("scan_maintenance_options");
    expect(f.events).toEqual([]);
  });

  it("refuses duplicate, malformed and oversized book sets", async () => {
    for (const rows of [[book(1), book(1)], [{ ...book(1), parentId: "foreign" }], Array.from({ length: 6 }, (_, i) => book(i + 1))]) {
      const f = setup();
      f.deps.books = async () => rows;
      await expect(runWorkbookScanMaintenance(f.deps, f.options)).rejects.toThrow("scan_maintenance_book_shape");
      expect(f.sends).toEqual([]);
    }
  });

  it.each(["unavailable", "unsubscribed", "refresh-required", "none"])("does not send for %s", async status => {
    const f = setup();
    f.deps.due = async () => status === "none" ? { status: "ready", episodeIds: [], childIds: [] }
      : status === "refresh-required" ? { status, workbookId: id(101) }
      : { status: status as "unsubscribed" | "unavailable" };
    const result = await runWorkbookScanMaintenance(f.deps, f.options);
    expect(result.reminders[0].status).toBe(status);
    expect(f.sends).toEqual([]);
  });

  it("reports a full bounded selection without claiming all remaining work was counted", async () => {
    const f = setup();
    f.batches.unseeded = Array.from({ length: 5 }, (_, i) => book(i + 1));
    const result = await runWorkbookScanMaintenance(f.deps, f.options);
    expect(result.moreMayRemain).toBe(true);
    expect(result.selectedBooks).toBe(5);
  });
});
